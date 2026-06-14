package com.guessxx.drivemind

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.regex.Pattern

/**
 * Accessibility service that monitors Uber Driver, Bolt Driver, Glovo Courier, and Wolt
 * driver apps. When a whitelisted app is foreground, a 10-second scan window opens
 * (500 ms ticks) and the view hierarchy is inspected for order data.
 *
 * STRICTLY READ-ONLY — this service never performs clicks, gestures, or any form
 * of automated input inside the monitored applications.
 *
 * Emits [EVENT_ORDER_SCRAPED] for the JS profitability pipeline (single source of truth).
 */
class DriveMindScraperService : AccessibilityService() {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val parseExecutor: ExecutorService = Executors.newSingleThreadExecutor { r ->
        Thread(r, "DriveMind-A11yParse").apply { isDaemon = true }
    }

    private var tickRunnable: Runnable? = null
    private var debouncedParseRunnable: Runnable? = null
    private var foundThisWindow = false
    private var parseInFlight = false
    private var currentPackage = ""
    private var topPackageName = ""
    // ── AccessibilityService callbacks ────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // The AccessibilityService runs in a system-bound process; any uncaught
        // exception here will cause AOSP to silently disable the service and
        // strand DriveMind in a state where the SystemConfiguration card shows
        // "Enabled" while we receive no events. Shield every event.
        try {
            if (event == null) return
            if (!DriveMindScraperState.isOrderParsingEnabled()) {
                cancelTickLoop()
                cancelDebouncedParse()
                return
            }

            val pkg = event.packageName?.toString() ?: return
            topPackageName = pkg

            if (pkg !in OVERLAY_TARGET_PACKAGES) {
                cancelTickLoop()
                return
            }

            // Lazy scraping: full tree analysis only for whitelisted driver apps.
            if (pkg !in MONITORED_PACKAGES) {
                cancelTickLoop()
                return
            }

            currentPackage = pkg

            when (event.eventType) {
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                    DriveMindScraperState.extendScanWindow(10_000L)
                    foundThisWindow = false
                    requestDebouncedParse(immediate = true)
                }
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                    DriveMindScraperState.extendScanWindow(10_000L)
                    if (!foundThisWindow) {
                        requestDebouncedParse(immediate = false)
                    }
                }
            }
        } catch (t: Throwable) {
            android.util.Log.e("DriveMindScraper", "onAccessibilityEvent shielded crash", t)
        }
    }

    override fun onInterrupt() {
        cancelTickLoop()
        cancelDebouncedParse()
    }

    override fun onDestroy() {
        cancelTickLoop()
        cancelDebouncedParse()
        parseExecutor.shutdownNow()
        super.onDestroy()
    }

    private fun cancelTickLoop() {
        tickRunnable?.let { mainHandler.removeCallbacks(it) }
        tickRunnable = null
        parseInFlight = false
    }

    private fun cancelDebouncedParse() {
        debouncedParseRunnable?.let { mainHandler.removeCallbacks(it) }
        debouncedParseRunnable = null
    }

    private fun requestDebouncedParse(immediate: Boolean) {
        if (!DriveMindScraperState.shouldScan()) return
        debouncedParseRunnable?.let { mainHandler.removeCallbacks(it) }
        val r = Runnable {
            debouncedParseRunnable = null
            scheduleTicks()
        }
        debouncedParseRunnable = r
        mainHandler.postDelayed(r, if (immediate) 0L else DEBOUNCE_MS)
    }

    // ── Tick loop ─────────────────────────────────────────────────────────────

    private fun scheduleTicks() {
        if (parseInFlight) return
        tickRunnable?.let { mainHandler.removeCallbacks(it) }
        val r = object : Runnable {
            override fun run() {
                if (!DriveMindScraperState.shouldScan()) {
                    tickRunnable = null
                    return
                }
                if (foundThisWindow) {
                    tickRunnable = null
                    return
                }
                runParseTick()
            }
        }
        tickRunnable = r
        mainHandler.post(r)
    }

    /** Snapshot UI text on the main thread; parse strings on a background executor. */
    private fun runParseTick() {
        if (parseInFlight || foundThisWindow) return
        val root = rootInActiveWindow
        if (root == null) {
            scheduleNextTick()
            return
        }

        val snapshot = try {
            buildSnapshot(root)
        } catch (_: Exception) {
            null
        } finally {
            recycleNode(root)
        }

        if (snapshot == null) {
            scheduleNextTick()
            return
        }

        parseInFlight = true
        parseExecutor.execute {
            val data = try {
                extractFromSnapshot(snapshot)
            } catch (_: Exception) {
                null
            }
            mainHandler.post {
                parseInFlight = false
                if (!DriveMindScraperState.shouldScan() || foundThisWindow) return@post
                if (data != null && data.isValidOrder()) {
                    foundThisWindow = true
                    emitOrderScraped(data)
                    try { DriveMindSound.playSoftClick(applicationContext) } catch (_: Exception) { }
                    tickRunnable = null
                    return@post
                }
                scheduleNextTick()
            }
        }
    }

    private fun scheduleNextTick() {
        if (!DriveMindScraperState.shouldScan() || foundThisWindow) {
            tickRunnable = null
            return
        }
        val r = Runnable {
            tickRunnable = null
            runParseTick()
        }
        tickRunnable = r
        mainHandler.postDelayed(r, TICK_INTERVAL_MS)
    }

    // ── Event emitters ────────────────────────────────────────────────────────

    private fun emitOrderScraped(data: ScrapeExtract) {
        val map = Arguments.createMap()
        map.putString("price", data.price)
        map.putString("distanceKm", data.distanceKmText)
        map.putString("etaMin", data.etaMinText)
        map.putString("pickup", data.pickup)
        map.putString("dropoff", data.dropoff)
        map.putString("surge", data.surge)
        map.putString("packageName", data.packageHint)
        DriveMindReactBridge.emit(EVENT_ORDER_SCRAPED, map)
    }

    // ── Data model ────────────────────────────────────────────────────────────

    private data class UiTextSnapshot(
        val texts: List<String>,
        val packageHint: String,
        val pickup: String,
        val dropoff: String,
    )

    data class ScrapeExtract(
        val price: String,
        val distanceKmText: String,
        val etaMinText: String,
        val pickup: String,
        val dropoff: String,
        val surge: String,
        val packageHint: String,
        val sourceTexts: List<String>,
    ) {
        fun isValidOrder(): Boolean {
            if (!OrderLayoutValidator.isValidOrderTextList(sourceTexts)) return false
            if (price.isEmpty()) return false
            return distanceKmText.isNotEmpty() || etaMinText.isNotEmpty()
        }
    }

    // ── Snapshot + extraction ─────────────────────────────────────────────────

    private fun buildSnapshot(root: AccessibilityNodeInfo): UiTextSnapshot {
        val texts = mutableListOf<String>()
        var pickup = ""
        var dropoff = ""
        walkNodes(root, root) { node ->
            node.text?.takeIf { it.isNotBlank() }?.let { texts.add(it.toString()) }
            node.contentDescription?.takeIf { it.isNotBlank() }?.let { texts.add(it.toString()) }
            val raw = node.text?.toString()?.trim().orEmpty()
            if (raw.isNotEmpty()) {
                val label = normalizeLabel(raw)
                when {
                    PICKUP_LABELS.contains(label) && pickup.isEmpty() -> {
                        pickup = findAddressAdjacent(node, root).ifEmpty { extractInlineAddress(raw, label) }
                    }
                    DROPOFF_LABELS.contains(label) && dropoff.isEmpty() -> {
                        dropoff = findAddressAdjacent(node, root).ifEmpty { extractInlineAddress(raw, label) }
                    }
                }
            }
        }
        val pkgHint = root.packageName?.toString()?.takeIf { it.isNotEmpty() }
            ?: topPackageName.ifEmpty { currentPackage }
        return UiTextSnapshot(texts.toList(), pkgHint, pickup, dropoff)
    }

    private fun extractFromSnapshot(snapshot: UiTextSnapshot): ScrapeExtract {
        val texts = snapshot.texts
        val blob = texts.joinToString("\n")
        val pkgHintEarly = snapshot.packageHint

        val price = extractPrice(texts, blob, pkgHintEarly)
        val distanceKmText = DISTANCE_PATTERN.matcher(blob).let { m ->
            if (m.find()) m.group(0) ?: "" else ""
        }
        val etaMinText = extractEtaMinutesText(texts, pkgHintEarly)
        val surge = SURGE_PATTERN.matcher(blob).let { m ->
            if (m.find()) m.group(0) ?: "" else ""
        }

        val addressCandidates = texts
            .map { it.trim() }
            .filter { line ->
                line.length > 5 &&
                    !NUMERIC_UNIT_RE.matcher(line).matches() &&
                    !isKnownLabel(line)
            }
            .sortedByDescending { it.length }

        val dropoff = snapshot.dropoff.ifEmpty { addressCandidates.firstOrNull()?.take(120) ?: "" }
        val pickup = snapshot.pickup.ifEmpty { addressCandidates.getOrNull(1)?.take(120) ?: "" }

        return ScrapeExtract(
            price = price,
            distanceKmText = distanceKmText,
            etaMinText = etaMinText,
            pickup = pickup,
            dropoff = dropoff,
            surge = surge,
            packageHint = pkgHintEarly,
            sourceTexts = texts,
        )
    }

    private fun extractEtaMinutesText(texts: List<String>, packageHint: String): String {
        val mins = mutableListOf<Int>()
        for (line in texts) {
            val m = ETA_PATTERN.matcher(line)
            while (m.find()) {
                m.group(1)?.toIntOrNull()?.let { v ->
                    if (v in 1..180) mins.add(v)
                }
            }
        }
        if (mins.isEmpty()) return ""
        val isBolt = packageHint.contains("bolt", ignoreCase = true)
        val value = when {
            isBolt && mins.size == 2 -> mins.sum()
            isBolt -> mins.maxOrNull() ?: mins.first()
            else -> mins.first()
        }
        return "$value min"
    }

    private fun extractPrice(texts: List<String>, blob: String, packageHint: String): String {
        if (packageHint.contains("bolt.delivery", ignoreCase = true)) {
            for (line in texts) {
                if (!line.contains("zł", ignoreCase = true) && !line.contains("PLN", ignoreCase = true)) continue
                val m = PRICE_PATTERN.matcher(line)
                if (m.find()) return m.group(0) ?: ""
            }
        }
        return PRICE_PATTERN.matcher(blob).let { m ->
            if (m.find()) m.group(0) ?: "" else ""
        }
    }

    /** API 33+ auto-manages nodes; recycle only on older releases. */
    private fun recycleNode(node: AccessibilityNodeInfo?) {
        if (node == null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
        try { node.recycle() } catch (_: Exception) { }
    }

    private fun walkNodes(node: AccessibilityNodeInfo?, treeRoot: AccessibilityNodeInfo, visit: (AccessibilityNodeInfo) -> Unit) {
        if (node == null) return
        visit(node)
        val childCount = node.childCount
        for (i in 0 until childCount) {
            val child = node.getChild(i) ?: continue
            try {
                walkNodes(child, treeRoot, visit)
            } finally {
                if (child !== treeRoot) recycleNode(child)
            }
        }
    }

    private fun normalizeLabel(raw: String): String {
        return raw.lowercase().trim().trimEnd(':').trim()
    }

    private fun isKnownLabel(line: String): Boolean {
        val label = normalizeLabel(line)
        return PICKUP_LABELS.contains(label) || DROPOFF_LABELS.contains(label)
    }

    private fun extractInlineAddress(raw: String, label: String): String {
        val cleaned = raw
            .replace(label, "", ignoreCase = true)
            .replace(":", " ")
            .trim()
        return if (looksLikeAddress(cleaned)) cleaned.take(120) else ""
    }

    private fun findAddressAdjacent(labelNode: AccessibilityNodeInfo, treeRoot: AccessibilityNodeInfo): String {
        val parent = labelNode.parent ?: return ""
        val recycleParent = parent !== treeRoot && parent !== labelNode
        try {
            val childCount = parent.childCount
            for (i in 0 until childCount) {
                val child = parent.getChild(i) ?: continue
                val recycleChild = child !== treeRoot && child !== labelNode
                try {
                    if (child == labelNode) {
                        val next = parent.getChild(i + 1)
                        if (next != null) {
                            val recycleNext = next !== treeRoot
                            try {
                                val candidate = nodeTextOrDesc(next)
                                if (looksLikeAddress(candidate)) return candidate.take(120)
                            } finally {
                                if (recycleNext) recycleNode(next)
                            }
                        }
                        continue
                    }
                    val candidate = nodeTextOrDesc(child)
                    if (looksLikeAddress(candidate) && !isKnownLabel(candidate)) {
                        return candidate.take(120)
                    }
                } finally {
                    if (recycleChild) recycleNode(child)
                }
            }
        } finally {
            if (recycleParent) recycleNode(parent)
        }
        return ""
    }

    private fun nodeTextOrDesc(node: AccessibilityNodeInfo): String {
        return node.text?.toString()?.trim().orEmpty()
            .ifEmpty { node.contentDescription?.toString()?.trim().orEmpty() }
    }

    private fun looksLikeAddress(value: String): Boolean {
        val line = value.trim()
        if (line.length <= 5) return false
        if (NUMERIC_UNIT_RE.matcher(line).matches()) return false
        if (isKnownLabel(line)) return false
        if (PRICE_PATTERN.matcher(line).find()) return false
        if (DISTANCE_PATTERN.matcher(line).find() && line.length < 12) return false
        if (ETA_PATTERN.matcher(line).find() && line.length < 12) return false
        return true
    }

    companion object {
        private const val DEBOUNCE_MS = 250L
        private const val TICK_INTERVAL_MS = 500L
        const val EVENT_SCRAPE = "DriveMindScrape"
        const val EVENT_ORDER_SCRAPED = "onOrderScraped"

        const val PACKAGE_BOLT_FOOD = DriveMindNotificationService.PACKAGE_BOLT_FOOD
        const val PACKAGE_GLOVO = "com.glovoapp.courier"
        const val PACKAGE_WOLT  = "com.wolt.handler"

        val MONITORED_PACKAGES: Set<String> = setOf(
            DriveMindNotificationService.PACKAGE_UBER,
            DriveMindNotificationService.PACKAGE_BOLT,
            PACKAGE_BOLT_FOOD,
            PACKAGE_GLOVO,
            PACKAGE_WOLT,
        )

        val OVERLAY_TARGET_PACKAGES: Set<String> = setOf(
            DriveMindNotificationService.PACKAGE_UBER,
            DriveMindNotificationService.PACKAGE_BOLT,
            PACKAGE_BOLT_FOOD,
            PACKAGE_GLOVO,
            PACKAGE_WOLT,
        )

        private val PRICE_PATTERN = Pattern.compile(
            "(\\d+[.,]\\d{1,2})\\s*(PLN|zł|ZL|EUR|€|\\$|USD)",
            Pattern.CASE_INSENSITIVE,
        )
        private val DISTANCE_PATTERN = Pattern.compile(
            "(\\d+(?:[.,]\\d+)?)\\s*(?:km|км)\\b",
            Pattern.CASE_INSENSITIVE,
        )
        private val ETA_PATTERN = Pattern.compile(
            "(\\d{1,3})\\s*(?:min(?:utes?)?|мин|хв)\\b",
            Pattern.CASE_INSENSITIVE,
        )
        private val SURGE_PATTERN = Pattern.compile(
            "([×x]\\s*\\d+[.,]?\\d*)|(surge\\s*[×x]?\\s*\\d+[.,]?\\d*)|(\\d+[.,]\\d+\\s*x)",
            Pattern.CASE_INSENSITIVE,
        )
        private val NUMERIC_UNIT_RE = Pattern.compile(
            "[\\d.,]+\\s*(PLN|zł|km|км|min|мин|хв|EUR|€|\\$|USD|x|×).*",
            Pattern.CASE_INSENSITIVE,
        )

        private val PICKUP_LABELS = setOf(
            "odbiór", "odbior", "pickup", "pick up", "отримання", "получение",
        )

        private val DROPOFF_LABELS = setOf(
            "dostawa", "dostarczenie", "delivery", "dropoff", "drop off",
            "доставка", "доставлення",
        )
    }
}
