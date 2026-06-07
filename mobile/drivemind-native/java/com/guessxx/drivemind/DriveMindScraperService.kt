package com.guessxx.drivemind

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.facebook.react.bridge.Arguments
import java.util.regex.Pattern

/**
 * Accessibility service that monitors Uber Driver, Bolt Driver, Glovo Courier, and Wolt
 * driver apps.  When one of these apps enters the foreground a 10-second scan window
 * opens (500 ms ticks) and the view hierarchy is inspected for order data.
 *
 * STRICTLY READ-ONLY — this service never performs clicks, gestures, or any form
 * of automated input inside the monitored applications.
 *
 * Emits [EVENT_ORDER_SCRAPED] for the JS profitability pipeline (single source of truth).
 */
class DriveMindScraperService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private var tickRunnable: Runnable? = null
    private var foundThisWindow = false
    private var currentPackage = ""
    private var topPackageName = ""

    // ── AccessibilityService callbacks ────────────────────────────────────────

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (!DriveMindScraperState.isOrderParsingEnabled()) {
            cancelTickLoop()
            return
        }
        val pkg = event.packageName?.toString() ?: return
        topPackageName = pkg

        if (pkg !in OVERLAY_TARGET_PACKAGES) {
            cancelTickLoop()
            // Overlay visibility is owned by DriveMind app foreground/background lifecycle.
            return
        }

        showOverlay()

        if (pkg !in MONITORED_PACKAGES) {
            cancelTickLoop()
            return
        }

        currentPackage = pkg

        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED,
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED,
            -> {
                DriveMindScraperState.extendScanWindow(10_000L)
                foundThisWindow = false
                scheduleTicks()
            }
        }
    }

    override fun onInterrupt() {
        cancelTickLoop()
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
    }

    private fun cancelTickLoop() {
        tickRunnable?.let { handler.removeCallbacks(it) }
        tickRunnable = null
    }

    private fun showOverlay() {
        if (!DriveMindScraperState.shouldScan()) return
        DriveMindOverlay.showRadar(applicationContext)
    }

    // ── Tick loop ─────────────────────────────────────────────────────────────

    private fun scheduleTicks() {
        tickRunnable?.let { handler.removeCallbacks(it) }
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

                val root = rootInActiveWindow
                val data: ScrapeExtract? = if (root != null) {
                    try {
                        extractFromNode(root)
                    } catch (_: Exception) {
                        null
                    } finally {
                        try { root.recycle() } catch (_: Exception) { }
                    }
                } else {
                    null
                }

                if (data != null && data.isValidOrder()) {
                    foundThisWindow = true
                    emitOrderScraped(data)
                    try { DriveMindSound.playSoftClick(applicationContext) } catch (_: Exception) { }
                    tickRunnable = null
                    return
                }
                handler.postDelayed(this, 500)
            }
        }
        tickRunnable = r
        handler.post(r)
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

    // ── Node tree extraction ──────────────────────────────────────────────────

    private fun extractFromNode(root: AccessibilityNodeInfo): ScrapeExtract {
        val texts = mutableListOf<String>()
        collectTexts(root, texts)
        val blob = texts.joinToString("\n")
        val pkgHintEarly = root.packageName?.toString()?.takeIf { it.isNotEmpty() }
            ?: topPackageName.ifEmpty { currentPackage }

        val price = extractPrice(texts, blob, pkgHintEarly)
        val distanceKmText = DISTANCE_PATTERN.matcher(blob).let { m ->
            if (m.find()) m.group(0) ?: "" else ""
        }
        val etaMinText = extractEtaMinutesText(texts, pkgHintEarly)
        val surge = SURGE_PATTERN.matcher(blob).let { m ->
            if (m.find()) m.group(0) ?: "" else ""
        }

        val labeled = extractLabeledAddresses(root)
        val addressCandidates = texts
            .map { it.trim() }
            .filter { line ->
                line.length > 5 &&
                    !NUMERIC_UNIT_RE.matcher(line).matches() &&
                    !isKnownLabel(line)
            }
            .sortedByDescending { it.length }

        val dropoff = labeled.second.ifEmpty { addressCandidates.firstOrNull()?.take(120) ?: "" }
        val pickup  = labeled.first.ifEmpty { addressCandidates.getOrNull(1)?.take(120) ?: "" }

        return ScrapeExtract(
            price = price,
            distanceKmText = distanceKmText,
            etaMinText = etaMinText,
            pickup = pickup,
            dropoff = dropoff,
            surge = surge,
            packageHint = pkgHintEarly,
            sourceTexts = texts.toList(),
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

    /** Depth-first walk; recycles every child node to avoid a11y connection leaks. */
    private fun collectTexts(node: AccessibilityNodeInfo?, out: MutableList<String>) {
        if (node == null) return
        node.text?.takeIf { it.isNotBlank() }?.let { out.add(it.toString()) }
        node.contentDescription?.takeIf { it.isNotBlank() }?.let { out.add(it.toString()) }
        val childCount = node.childCount
        for (i in 0 until childCount) {
            val child = node.getChild(i) ?: continue
            try {
                collectTexts(child, out)
            } finally {
                try { child.recycle() } catch (_: Exception) { }
            }
        }
    }

    private fun extractLabeledAddresses(root: AccessibilityNodeInfo): Pair<String, String> {
        var pickup = ""
        var dropoff = ""
        walkNodes(root) { node ->
            val raw = node.text?.toString()?.trim().orEmpty()
            if (raw.isEmpty()) return@walkNodes
            val label = normalizeLabel(raw)
            when {
                PICKUP_LABELS.contains(label) && pickup.isEmpty() -> {
                    pickup = findAddressAdjacent(node).ifEmpty { extractInlineAddress(raw, label) }
                }
                DROPOFF_LABELS.contains(label) && dropoff.isEmpty() -> {
                    dropoff = findAddressAdjacent(node).ifEmpty { extractInlineAddress(raw, label) }
                }
            }
        }
        return pickup to dropoff
    }

    private fun walkNodes(node: AccessibilityNodeInfo?, visit: (AccessibilityNodeInfo) -> Unit) {
        if (node == null) return
        visit(node)
        val childCount = node.childCount
        for (i in 0 until childCount) {
            val child = node.getChild(i) ?: continue
            try {
                walkNodes(child, visit)
            } finally {
                try { child.recycle() } catch (_: Exception) { }
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

    private fun findAddressAdjacent(labelNode: AccessibilityNodeInfo): String {
        val parent = labelNode.parent ?: return ""
        try {
            val childCount = parent.childCount
            for (i in 0 until childCount) {
                val child = parent.getChild(i) ?: continue
                try {
                    if (child == labelNode) {
                        val next = parent.getChild(i + 1)
                        if (next != null) {
                            try {
                                val candidate = nodeTextOrDesc(next)
                                if (looksLikeAddress(candidate)) return candidate.take(120)
                            } finally {
                                try { next.recycle() } catch (_: Exception) { }
                            }
                        }
                        continue
                    }
                    val candidate = nodeTextOrDesc(child)
                    if (looksLikeAddress(candidate) && !isKnownLabel(candidate)) {
                        return candidate.take(120)
                    }
                } finally {
                    try { child.recycle() } catch (_: Exception) { }
                }
            }
        } finally {
            try { parent.recycle() } catch (_: Exception) { }
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
        /** Legacy event name — kept for reference; no longer emitted from this service. */
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
