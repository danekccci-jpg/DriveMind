package com.guessxx.drivemind

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import com.facebook.react.bridge.Arguments
import java.lang.ref.WeakReference
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.regex.Pattern

/**
 * Accessibility service that monitors Uber Driver, Bolt Driver, Glovo Courier, and Wolt
 * driver apps. While shift is active and a whitelisted app is foreground, the view
 * hierarchy is inspected continuously for visible offers (not only on new pushes).
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
    private var acceptanceCheckRunnable: Runnable? = null
    private var contentChangedRunnable: Runnable? = null
    private var periodicRescanRunnable: Runnable? = null
    private var shiftWatchdogRunnable: Runnable? = null
    private var foundThisWindow = false
    @Volatile private var parseInFlight = false
    private var currentPackage = ""
    private var topPackageName = ""

    // Cached last successfully scraped offer — used to attribute a subsequent
    // offer-screen-to-trip-screen UI transition as a passive Accept event.
    private data class CachedOffer(
        val data: ScrapeExtract,
        val capturedAt: Long,
        val hash: String,
    )
    @Volatile private var lastOffer: CachedOffer? = null
    @Volatile private var acceptedHash: String? = null
    // ── AccessibilityService callbacks ────────────────────────────────────────

    override fun onServiceConnected() {
        super.onServiceConnected()
        weakInstance = WeakReference(this)
        DriveMindOverlay.bindAccessibilityService(this)
        Log.d(TAG, "onServiceConnected — accessibility service bound")
        // Bootstrap: if shift is already armed when the service binds, do not wait
        // for a locale/config mutation or the 2s watchdog — scrape immediately.
        mainHandler.post {
            if (!DriveMindScraperState.isOrderParsingEnabled()) return@post
            if (!DriveMindScraperState.isShiftScanActive()) return@post
            Log.i(TAG, "onServiceConnected: shift active — proactive foreground scrape")
            scheduleShiftWatchdog()
            requestRescanFromNative()
        }
    }

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
                cancelAcceptanceCheck()
                return
            }

            val pkg = event.packageName?.toString() ?: return
            topPackageName = pkg

            if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                NotificationBrandRouter.logWindowPackage(
                    pkg,
                    gate = "overlay",
                    accepted = NotificationBrandRouter.isOverlayTargetPackage(pkg),
                )
                when {
                    NotificationBrandRouter.isOverlayTargetPackage(pkg) -> {
                        DriveMindScraperState.setDriverAppInForeground(true)
                        DriveMindOverlay.onDriverAppForegrounded(
                            this@DriveMindScraperService,
                            requestRescan = false,
                        )
                    }
                    isTransientSystemPackage(pkg) -> {
                        // Launcher / SystemUI: hide overlay instantly but keep scan state
                        // armed so we recover when the driver app returns.
                        if (isLauncherOrSystemUi(pkg)) {
                            DriveMindOverlay.onOverlayTargetLost(pkg)
                        } else {
                            Log.d(TAG, "WINDOW_STATE_CHANGED ignored (transient pkg=$pkg)")
                        }
                    }
                    else -> {
                        DriveMindScraperState.setDriverAppInForeground(false)
                        cancelPeriodicRescan()
                        DriveMindOverlay.onOverlayTargetLost(pkg)
                    }
                }
            }

            if (!NotificationBrandRouter.isOverlayTargetPackage(pkg)) {
                if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                    cancelTickLoop()
                    cancelPeriodicRescan()
                }
                return
            }

            if (!NotificationBrandRouter.isMonitoredDriverPackage(pkg)) {
                if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                    NotificationBrandRouter.logWindowPackage(pkg, gate = "scrape", accepted = false)
                }
                cancelTickLoop()
                return
            }

            currentPackage = pkg

            when (event.eventType) {
                AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                    DriveMindScraperState.extendScanWindow(60_000L)
                    foundThisWindow = false
                    scheduleAcceptanceCheck(pkg)
                    // Immediate parse — never wait for CONTENT_CHANGED or config mutation.
                    forceSynchronousScreenScrape(pkg)
                }
                AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                    DriveMindScraperState.extendScanWindow(60_000L)
                    if (!foundThisWindow) {
                        forceSynchronousScreenScrape(pkg)
                    } else {
                        requestContentChangedRescan()
                    }
                }
            }
        } catch (t: Throwable) {
            Log.e(TAG, "onAccessibilityEvent shielded crash", t)
        }
    }

    /**
     * Resolve the actual foreground driver-app package without depending on a
     * fresh accessibility event.
     *
     * The event-driven [topPackageName]/[currentPackage] fields stay empty when
     * a driver/mock app is already static on screen at shift start (no new
     * TYPE_WINDOW_STATE_CHANGED fires). We fall back to:
     *  1. [rootInActiveWindow] — the real active window root (works with
     *     canRetrieveWindowContent="true", no extra permission).
     *  2. [getWindows] — enumerates interactive windows once
     *     flagRetrieveInteractiveWindows is declared; pick the active one.
     *
     * @return a whitelisted package name, or null if no driver app is in focus.
     */
    private fun resolveForegroundDriverPackage(): String? {
        // Primary: trust the last event if it already identified a target.
        val lastSeen = topPackageName.ifEmpty { currentPackage }
        if (NotificationBrandRouter.isOverlayTargetPackage(lastSeen)) return lastSeen

        // Secondary: the real active window root (covers a static, already-on-screen app).
        try {
            val rootPkg = rootInActiveWindow?.packageName?.toString().orEmpty()
            if (NotificationBrandRouter.isOverlayTargetPackage(rootPkg)) return rootPkg
        } catch (_: Exception) {
            // rootInActiveWindow can throw if the window is being torn down — ignore.
        }

        // Tertiary: enumerate windows (requires flagRetrieveInteractiveWindows).
        try {
            for (window in windows) {
                val pkg = window.root?.packageName?.toString().orEmpty()
                if (window.isActive && NotificationBrandRouter.isOverlayTargetPackage(pkg)) {
                    return pkg
                }
            }
        } catch (_: Exception) {
            // getWindows() may be unavailable/empty on older OS builds — ignore.
        }
        return null
    }

    /**
     * Called from overlay / native module when shift arms while a driver app may
     * already be visible. Unlike the event path, this does NOT assume a fresh
     * TYPE_WINDOW_STATE_CHANGED has fired — it actively resolves the foreground
     * window so a static, already-on-screen offer card is still picked up.
     */
    fun requestRescanFromNative() {
        val pkg = resolveForegroundDriverPackage()
        if (pkg == null) {
            Log.d(TAG, "requestRescanFromNative: no whitelist foreground (lastSeen=${topPackageName.ifEmpty { currentPackage }})")
            return
        }
        topPackageName = pkg
        currentPackage = pkg
        DriveMindScraperState.setDriverAppInForeground(true)
        DriveMindOverlay.onDriverAppForegrounded(this@DriveMindScraperService, requestRescan = false)
        foundThisWindow = false
        DriveMindScraperState.extendScanWindow(60_000L)
        Log.i(TAG, "requestRescanFromNative pkg=$pkg (proactive)")
        forceSynchronousScreenScrape(pkg)
    }

    /**
     * Forced synchronous window root acquisition for [targetPackage].
     *
     * Three-tier fallback to handle both live and static (already-on-screen)
     * driver app windows:
     *  1. [rootInActiveWindow] — fastest; works when focus just shifted.
     *  2. Active [getWindows] entry — handles cases where focus is on an overlay
     *     (our own widget) rather than the underlying driver app.
     *  3. Any TYPE_APPLICATION [getWindows] entry matching [targetPackage] — the
     *     crucial fallback for static windows that never fire a content event.
     *
     * Returns null only when the driver app genuinely has no live window.
     */
    private fun forceSynchronousScreenScrape(targetPackage: String) {
        var rootNode: AccessibilityNodeInfo? = null

        // Tier 1: active window root
        try {
            val activeRoot = rootInActiveWindow
            if (activeRoot != null) {
                val pkg = activeRoot.packageName?.toString().orEmpty()
                if (pkg == targetPackage || NotificationBrandRouter.isOverlayTargetPackage(pkg)) {
                    rootNode = activeRoot
                } else {
                    recycleNode(activeRoot)
                }
            }
        } catch (_: Exception) {}

        // Tier 2: active window in window list
        if (rootNode == null) {
            try {
                for (window in windows) {
                    if (!window.isActive) continue
                    val root = window.root ?: continue
                    val pkg = root.packageName?.toString().orEmpty()
                    if (pkg == targetPackage || NotificationBrandRouter.isOverlayTargetPackage(pkg)) {
                        rootNode = root
                        break
                    }
                    recycleNode(root)
                }
            } catch (_: Exception) {}
        }

        // Tier 3: any TYPE_APPLICATION window for targetPackage (static cached screens)
        if (rootNode == null) {
            try {
                for (window in windows) {
                    if (window.type != AccessibilityWindowInfo.TYPE_APPLICATION) continue
                    val root = window.root ?: continue
                    val pkg = root.packageName?.toString().orEmpty()
                    if (pkg == targetPackage || NotificationBrandRouter.isOverlayTargetPackage(pkg)) {
                        Log.d(TAG, "forceSynchronousScreenScrape: TYPE_APPLICATION match pkg=$pkg")
                        rootNode = root
                        break
                    }
                    recycleNode(root)
                }
            } catch (_: Exception) {}
        }

        if (rootNode != null) {
            val pkg = rootNode.packageName?.toString() ?: targetPackage
            Log.i(TAG, "forceSynchronousScreenScrape: root resolved pkg=$pkg → immediate parse")
            performExplicitScrapingPass(rootNode)
        } else {
            Log.i(TAG, "forceSynchronousScreenScrape: NO window root for pkg=$targetPackage — tick scheduled")
            requestDebouncedParse(immediate = true)
        }
    }

    /**
     * Legacy helper kept for callers that need only the root node.
     * Prefer [forceSynchronousScreenScrape] for combined acquire+parse.
     */
    private fun acquireActiveWindowRoot(): AccessibilityNodeInfo? {
        try {
            val activeRoot = rootInActiveWindow
            if (activeRoot != null) {
                val pkg = activeRoot.packageName?.toString().orEmpty()
                if (NotificationBrandRouter.isOverlayTargetPackage(pkg)) return activeRoot
                recycleNode(activeRoot)
            }
        } catch (_: Exception) {}
        try {
            for (window in windows) {
                if (!window.isActive) continue
                val root = window.root ?: continue
                val pkg = root.packageName?.toString().orEmpty()
                if (NotificationBrandRouter.isOverlayTargetPackage(pkg)) return root
                recycleNode(root)
            }
        } catch (_: Exception) {}
        // Tier 3: static TYPE_APPLICATION fallback
        try {
            for (window in windows) {
                if (window.type != AccessibilityWindowInfo.TYPE_APPLICATION) continue
                val root = window.root ?: continue
                val pkg = root.packageName?.toString().orEmpty()
                if (NotificationBrandRouter.isOverlayTargetPackage(pkg)) return root
                recycleNode(root)
            }
        } catch (_: Exception) {}
        return null
    }

    /**
     * Bypass debounce/tick scheduling — parse the supplied tree immediately.
     * All failure paths log at I level so they are visible in production logcat filters.
     */
    private fun performExplicitScrapingPass(root: AccessibilityNodeInfo) {
        if (!DriveMindScraperState.shouldScan()) {
            Log.i(
                TAG,
                "performExplicitScrapingPass: shouldScan=false " +
                    "(parsing=${DriveMindScraperState.isOrderParsingEnabled()} " +
                    "shiftScan=${DriveMindScraperState.isShiftScanActive()} " +
                    "driverFg=${DriveMindScraperState.isDriverAppInForeground()})",
            )
            recycleNode(root)
            return
        }
        if (parseInFlight) {
            Log.i(TAG, "performExplicitScrapingPass: parseInFlight=true, skipping duplicate pass")
            recycleNode(root)
            return
        }
        val snapshot = try {
            buildSnapshot(root)
        } catch (e: Exception) {
            Log.i(TAG, "performExplicitScrapingPass: buildSnapshot threw — ${e.javaClass.simpleName}: ${e.message}")
            null
        } finally {
            recycleNode(root)
        }
        if (snapshot == null) return
        Log.i(TAG, "performExplicitScrapingPass: pkg=${snapshot.packageHint} texts=${snapshot.texts.size}")
        if (snapshot.texts.isEmpty()) {
            Log.i(TAG, "performExplicitScrapingPass: a11y tree EMPTY for pkg=${snapshot.packageHint}")
        }
        parseInFlight = true
        parseExecutor.execute {
            val data: ScrapeExtract?
            val parseErr: String?
            try {
                data = extractFromSnapshot(snapshot)
                parseErr = null
            } catch (e: Exception) {
                mainHandler.post {
                    parseInFlight = false
                    Log.i(TAG, "explicit pass pkg=${snapshot.packageHint} extractFromSnapshot threw: ${e.javaClass.simpleName}: ${e.message}")
                    if (!foundThisWindow) scheduleNextTick()
                }
                return@execute
            }
            mainHandler.post {
                parseInFlight = false
                if (!DriveMindScraperState.shouldScan()) {
                    Log.i(
                        TAG,
                        "explicit pass result discarded — shouldScan=false when result arrived " +
                            "(parsing=${DriveMindScraperState.isOrderParsingEnabled()} " +
                            "shiftScan=${DriveMindScraperState.isShiftScanActive()} " +
                            "driverFg=${DriveMindScraperState.isDriverAppInForeground()})",
                    )
                    return@post
                }
                if (data == null) {
                    Log.i(TAG, "explicit pass pkg=${snapshot.packageHint} texts=${snapshot.texts.size} parse=null")
                    if (!foundThisWindow) scheduleNextTick()
                    return@post
                }
                val validatorOk = OrderLayoutValidator.isValidOrderTextList(data.sourceTexts)
                if (!validatorOk || !data.isValidOrder()) {
                    Log.i(
                        TAG,
                        "explicit pass pkg=${snapshot.packageHint} texts=${snapshot.texts.size} " +
                            "price=${data.price} dist=${data.distanceKmText} eta=${data.etaMinText} " +
                            "validator=${if (validatorOk) "layout-ok" else OrderLayoutValidator.rejectReason(data.sourceTexts)} " +
                            "sample=${data.sourceTexts.take(6).joinToString(" | ")}",
                    )
                    if (!foundThisWindow) scheduleNextTick()
                    return@post
                }
                val isFirstDiscovery = !foundThisWindow
                foundThisWindow = true
                cacheLastOffer(data)
                publishScrapedOrder(data, playSound = isFirstDiscovery)
                schedulePeriodicRescan()
            }
        }
    }

    override fun onInterrupt() {
        cancelTickLoop()
        cancelDebouncedParse()
        cancelAcceptanceCheck()
    }

    override fun onDestroy() {
        cancelTickLoop()
        cancelDebouncedParse()
        cancelAcceptanceCheck()
        cancelContentChangedRescan()
        cancelPeriodicRescan()
        cancelShiftWatchdog()
        parseExecutor.shutdownNow()
        weakInstance = null
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

    private fun cancelAcceptanceCheck() {
        acceptanceCheckRunnable?.let { mainHandler.removeCallbacks(it) }
        acceptanceCheckRunnable = null
    }

    private fun cancelContentChangedRescan() {
        contentChangedRunnable?.let { mainHandler.removeCallbacks(it) }
        contentChangedRunnable = null
    }

    private fun cancelPeriodicRescan() {
        periodicRescanRunnable?.let { mainHandler.removeCallbacks(it) }
        periodicRescanRunnable = null
    }

    private fun requestContentChangedRescan() {
        if (!DriveMindScraperState.shouldScan()) return
        contentChangedRunnable?.let { mainHandler.removeCallbacks(it) }
        val r = Runnable {
            contentChangedRunnable = null
            foundThisWindow = false
            requestDebouncedParse(immediate = false)
        }
        contentChangedRunnable = r
        mainHandler.postDelayed(r, CONTENT_CHANGED_DEBOUNCE_MS)
    }

    private fun schedulePeriodicRescan() {
        cancelPeriodicRescan()
        if (!DriveMindScraperState.shouldScan()) return
        val r = Runnable {
            periodicRescanRunnable = null
            if (!DriveMindScraperState.shouldScan()) return@Runnable
            if (!DriveMindScraperState.isDriverAppInForeground()) return@Runnable
            foundThisWindow = false
            Log.d(TAG, "periodic rescan — re-reading foreground offer")
            requestDebouncedParse(immediate = true)
            schedulePeriodicRescan()
        }
        periodicRescanRunnable = r
        mainHandler.postDelayed(r, PERIODIC_RESCAN_MS)
    }

    /**
     * Shift watchdog: while a shift is armed, periodically reconcile the actual
     * foreground package against our cached state. This survives missed
     * accessibility events (app already on screen at shift start, transient
     * event loss during rapid app-switching) by actively re-arming both the
     * scraper and the overlay attachment via [requestRescanFromNative].
     */
    private fun scheduleShiftWatchdog() {
        shiftWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }
        val r = object : Runnable {
            override fun run() {
                if (!DriveMindScraperState.isShiftScanActive()) {
                    shiftWatchdogRunnable = null
                    return
                }
                if (!DriveMindScraperState.isOrderParsingEnabled()) {
                    scheduleNextWatchdogTick()
                    return
                }
                val activePkg = try {
                    rootInActiveWindow?.packageName?.toString()
                } catch (_: Exception) {
                    null
                } ?: resolveForegroundDriverPackage()

                if (activePkg != null && NotificationBrandRouter.isOverlayTargetPackage(activePkg)) {
                    topPackageName = activePkg
                    currentPackage = activePkg
                    if (!DriveMindScraperState.isDriverAppInForeground()) {
                        Log.i(TAG, "watchdog: driver app foregrounded pkg=$activePkg (reconcile)")
                        DriveMindScraperState.setDriverAppInForeground(true)
                        DriveMindOverlay.onDriverAppForegrounded(
                            this@DriveMindScraperService,
                            requestRescan = false,
                        )
                    }
                    DriveMindScraperState.extendScanWindow(60_000L)
                    // Always scrape on every tick — static screens don't fire content events
                    Log.i(TAG, "watchdog tick: scraping pkg=$activePkg foundThisWindow=$foundThisWindow")
                    forceSynchronousScreenScrape(activePkg)
                } else if (
                    activePkg != null &&
                    !isTransientSystemPackage(activePkg)
                ) {
                    // Genuine non-whitelist foreground — driver app actually left.
                    if (DriveMindScraperState.isDriverAppInForeground()) {
                        Log.d(TAG, "watchdog: driver app lost foreground (now=$activePkg)")
                        topPackageName = ""
                        currentPackage = ""
                        DriveMindScraperState.setDriverAppInForeground(false)
                        cancelTickLoop()
                        cancelPeriodicRescan()
                        DriveMindOverlay.onOverlayTargetLost(activePkg)
                    }
                }
                scheduleNextWatchdogTick()
            }
        }
        shiftWatchdogRunnable = r
        // First tick runs immediately — do not wait SHIFT_WATCHDOG_INTERVAL_MS for
        // the initial foreground scrape (fixes blindness until locale/config change).
        mainHandler.post(r)
    }

    private fun scheduleNextWatchdogTick() {
        if (!DriveMindScraperState.isShiftScanActive()) {
            shiftWatchdogRunnable = null
            return
        }
        val r = shiftWatchdogRunnable ?: return
        mainHandler.postDelayed(r, SHIFT_WATCHDOG_INTERVAL_MS)
    }

    private fun cancelShiftWatchdog() {
        shiftWatchdogRunnable?.let { mainHandler.removeCallbacks(it) }
        shiftWatchdogRunnable = null
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
        val root = acquireActiveWindowRoot()
        if (root == null) {
            scheduleNextTick()
            return
        }
        performExplicitScrapingPass(root)
    }

    private fun scheduleNextTick() {
        if (!DriveMindScraperState.shouldScan()) {
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
        publishScrapedOrder(data, playSound = true)
    }

    /**
     * Push scraped offer to JS + force an immediate overlay redraw on the main thread.
     * [forceInvalidate] bypasses waiting for layout mutations.
     */
    private fun publishScrapedOrder(data: ScrapeExtract, playSound: Boolean) {
        val map = Arguments.createMap()
        map.putString("price", data.price)
        map.putString("distanceKm", data.distanceKmText)
        map.putString("etaMin", data.etaMinText)
        map.putString("pickup", data.pickup)
        map.putString("dropoff", data.dropoff)
        map.putString("surge", data.surge)
        map.putString("packageName", data.packageHint)
        DriveMindReactBridge.emit(EVENT_ORDER_SCRAPED, map)
        mainHandler.post {
            val fields = buildOverlayFieldsFromScrape(data) ?: return@post
            DriveMindOverlay.bindAccessibilityService(this@DriveMindScraperService)
            DriveMindOverlay.updateOverlayData(
                this@DriveMindScraperService,
                fields,
                forceInvalidate = true,
            )
            Log.i(TAG, "overlay fast-path pkg=${data.packageHint} price=${data.price}")
        }
        if (playSound) {
            try { DriveMindSound.playSoftClick(applicationContext) } catch (_: Exception) { }
        }
    }

    private fun buildOverlayFieldsFromScrape(data: ScrapeExtract): OverlayProfitFields? =
        OverlayProfitBuilder.fromPriceDistanceEta(
            data.price,
            data.distanceKmText,
            data.etaMinText,
            data.packageHint,
            contentHash = buildOfferHash(data),
        )

    private fun emitOrderAccepted(cached: CachedOffer, acceptedAt: Long) {
        val data = cached.data
        val map = Arguments.createMap()
        map.putString("price", data.price)
        map.putString("distanceKm", data.distanceKmText)
        map.putString("etaMin", data.etaMinText)
        map.putString("pickup", data.pickup)
        map.putString("dropoff", data.dropoff)
        map.putString("surge", data.surge)
        map.putString("packageName", data.packageHint)
        map.putString("contentHash", cached.hash)
        map.putDouble("acceptedAt", acceptedAt.toDouble())
        DriveMindReactBridge.emitImmediate(EVENT_ORDER_ACCEPTED, map)
        android.util.Log.d(
            "DriveMindScraper",
            "onOrderAccepted emitted pkg=${data.packageHint} price=${data.price} hash=${cached.hash}",
        )
    }

    private fun cacheLastOffer(data: ScrapeExtract) {
        val hash = buildOfferHash(data)
        lastOffer = CachedOffer(data = data, capturedAt = System.currentTimeMillis(), hash = hash)
        // Allow a fresh acceptance check for a new offer with a different hash.
        if (acceptedHash != hash) acceptedHash = null
    }

    private fun buildOfferHash(data: ScrapeExtract): String {
        val pkg = data.packageHint
        val price = data.price.replace(",", ".").trim()
        val dist = data.distanceKmText.replace(",", ".").trim()
        val eta = data.etaMinText.trim()
        return "$pkg|$price|$dist|$eta"
    }

    /**
     * Schedule a one-shot transition check after a window state change.
     *
     * Heuristic for passive Accept detection (READ-ONLY — never simulates input):
     *  1. A valid offer was scraped within the last [ACCEPT_WINDOW_MS].
     *  2. After the transition, the new window does NOT contain a valid offer layout
     *     (i.e. price + currency + km/min layout is gone).
     *  3. The new window contains trip / navigation keywords (pickup, drop-off,
     *     navigate, slide-to-start, customer, etc.) in multiple languages.
     *  Otherwise the change is treated as decline / expiry and is ignored.
     */
    private fun scheduleAcceptanceCheck(pkg: String) {
        val cached = lastOffer ?: return
        if (acceptedHash == cached.hash) return
        val age = System.currentTimeMillis() - cached.capturedAt
        if (age > ACCEPT_WINDOW_MS) {
            lastOffer = null
            return
        }
        // Cached offer must belong to the SAME package as the new window —
        // otherwise an Uber-cached offer could be falsely attributed to a
        // Bolt trip screen (or vice-versa) when the driver switches apps.
        if (cached.data.packageHint.isNotEmpty() && cached.data.packageHint != pkg) {
            return
        }
        cancelAcceptanceCheck()
        val cachedHash = cached.hash
        val r = Runnable {
            acceptanceCheckRunnable = null
            runAcceptanceCheck(cached, cachedHash)
        }
        acceptanceCheckRunnable = r
        // Small delay lets the new screen settle before we snapshot it.
        mainHandler.postDelayed(r, ACCEPT_SETTLE_MS)
    }

    private fun runAcceptanceCheck(cached: CachedOffer, cachedHash: String) {
        if (acceptedHash == cachedHash) return
        if (lastOffer?.hash != cachedHash) return
        if (System.currentTimeMillis() - cached.capturedAt > ACCEPT_WINDOW_MS) {
            lastOffer = null
            return
        }
        val root = rootInActiveWindow ?: return
        val snapshot = try {
            buildSnapshot(root)
        } catch (_: Exception) {
            null
        } finally {
            recycleNode(root)
        }
        if (snapshot == null) return

        val extract = try { extractFromSnapshot(snapshot) } catch (_: Exception) { null }
        val stillOnOfferScreen = extract != null && extract.isValidOrder()
        if (stillOnOfferScreen) return

        val blob = snapshot.texts.joinToString("\n").lowercase()
        val hasTripKeyword = TRIP_KEYWORDS.any { blob.contains(it) }
        if (!hasTripKeyword) return

        acceptedHash = cachedHash
        val acceptedAt = System.currentTimeMillis()
        // Suppress re-scrape ticks on the trip screen for the remainder of this window.
        foundThisWindow = true
        // RN bridge must emit on the main/UI thread — never from parseExecutor.
        mainHandler.post {
            try {
                emitOrderAccepted(cached, acceptedAt)
            } catch (t: Throwable) {
                android.util.Log.e("DriveMindScraper", "emitOrderAccepted failed", t)
            }
        }
        // Don't re-attribute the same offer; allow a new scrape to reset.
        lastOffer = null
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
        try { root.refresh() } catch (_: Exception) { }
        walkNodes(root, root) { node ->
            node.text?.takeIf { it.isNotBlank() }?.let { line ->
                texts.add(line.toString())
                applyLabelAddressHints(line.toString(), node, root) { p, d ->
                    if (pickup.isEmpty() && p.isNotEmpty()) pickup = p
                    if (dropoff.isEmpty() && d.isNotEmpty()) dropoff = d
                }
            }
            node.contentDescription?.takeIf { it.isNotBlank() }?.let { line ->
                texts.add(line.toString())
                // KrakowMocks expose price/addresses via accessibilityLabel on Text nodes.
                extractA11yPickup(line.toString())?.let { if (pickup.isEmpty()) pickup = it }
                extractA11yDropoff(line.toString())?.let { if (dropoff.isEmpty()) dropoff = it }
            }
        }

        // Fallback: RN mocks may hide offer sheet nodes from walkNodes during async layout.
        // findAccessibilityNodeInfosByText() searches virtual descendants too.
        val hasPriceText = texts.any { t -> PRICE_CURRENCY_TOKENS.any { tok -> t.contains(tok, ignoreCase = true) } }
        val hasMetricText = texts.any { t -> METRIC_TOKENS.any { tok -> t.contains(tok, ignoreCase = true) } }
        if (!hasPriceText || !hasMetricText) {
            val countBefore = texts.size
            val searchTokens = buildList {
                if (!hasPriceText) {
                    addAll(PRICE_CURRENCY_TOKENS)
                    add("Zarobek")   // KrakowMocks uber a11y: "Zarobek z przejazdu, …"
                    add("Oferta")    // KrakowMocks bolt a11y: "Oferta przejazdu, …"
                }
                if (!hasMetricText) {
                    addAll(METRIC_TOKENS)
                    add("Przejazd")  // KrakowMocks uber tripMeta prefix
                    add("Za ")       // KrakowMocks PL pickupMeta: "Za 10 min (3.2 km)"
                }
            }
            for (token in searchTokens.distinct()) {
                try {
                    val found = root.findAccessibilityNodeInfosByText(token) ?: continue
                    for (n in found) {
                        try {
                            n.text?.takeIf { it.isNotBlank() }?.let { texts.add(it.toString()) }
                            n.contentDescription?.takeIf { it.isNotBlank() }?.let { desc ->
                                texts.add(desc.toString())
                                extractA11yPickup(desc.toString())?.let { if (pickup.isEmpty()) pickup = it }
                                extractA11yDropoff(desc.toString())?.let { if (dropoff.isEmpty()) dropoff = it }
                            }
                        } catch (_: Exception) {
                        } finally {
                            recycleNode(n)
                        }
                    }
                } catch (_: Exception) { }
            }
            val added = texts.size - countBefore
            Log.i(TAG,
                "buildSnapshot: fallback search added=$added texts (hasPriceText=$hasPriceText hasMetricText=$hasMetricText) pkg=${root.packageName}")
        }

        val pkgHint = root.packageName?.toString()?.takeIf { it.isNotEmpty() }
            ?: topPackageName.ifEmpty { currentPackage }
        return UiTextSnapshot(texts.toList(), pkgHint, pickup, dropoff)
    }

    /** KrakowMocks a11y labels: "Odbiór, Lotnisko Balice …" / "Odbiór pasażera, …" */
    private fun extractA11yPickup(line: String): String? {
        for (prefix in A11Y_PICKUP_PREFIXES) {
            if (line.startsWith(prefix, ignoreCase = true)) {
                val addr = line.substring(prefix.length).trim().trimStart(',').trim()
                if (addr.length > 3) return addr.take(120)
            }
        }
        return null
    }

    /** KrakowMocks a11y labels: "Cel, ul. …" / "Dostawa, ul. …" */
    private fun extractA11yDropoff(line: String): String? {
        for (prefix in A11Y_DROPOFF_PREFIXES) {
            if (line.startsWith(prefix, ignoreCase = true)) {
                val addr = line.substring(prefix.length).trim().trimStart(',').trim()
                if (addr.length > 3) return addr.take(120)
            }
        }
        return null
    }

    private fun applyLabelAddressHints(
        raw: String,
        node: AccessibilityNodeInfo,
        treeRoot: AccessibilityNodeInfo,
        apply: (pickup: String, dropoff: String) -> Unit,
    ) {
        if (raw.isEmpty()) return
        val label = normalizeLabel(raw)
        when {
            PICKUP_LABELS.contains(label) -> {
                val addr = findAddressAdjacent(node, treeRoot).ifEmpty { extractInlineAddress(raw, label) }
                if (addr.isNotEmpty()) apply(addr, "")
            }
            DROPOFF_LABELS.contains(label) -> {
                val addr = findAddressAdjacent(node, treeRoot).ifEmpty { extractInlineAddress(raw, label) }
                if (addr.isNotEmpty()) apply("", addr)
            }
        }
    }

    private fun extractFromSnapshot(snapshot: UiTextSnapshot): ScrapeExtract {
        val texts = snapshot.texts
        val blob = texts.joinToString("\n")
        val pkgHintEarly = snapshot.packageHint

        val price = extractPrice(texts, blob, pkgHintEarly)
        val distanceKmText = extractDistanceKmText(texts, blob)
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

        val dropoff = snapshot.dropoff.ifEmpty {
            texts.firstNotNullOfOrNull { extractA11yDropoff(it) }
                ?: addressCandidates.firstOrNull()?.take(120)
                ?: ""
        }
        val pickup = snapshot.pickup.ifEmpty {
            texts.firstNotNullOfOrNull { extractA11yPickup(it) }
                ?: addressCandidates.getOrNull(1)?.take(120)
                ?: ""
        }

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

    private fun extractDistanceKmText(texts: List<String>, blob: String): String {
        for (line in texts) {
            COMBINED_ETA_DIST_PATTERN.matcher(line).let { m ->
                if (m.find()) {
                    val km = m.group(2)?.replace(',', '.') ?: return@let
                    return "${km} km"
                }
            }
            BOLT_BULLET_META_PATTERN.matcher(line).let { m ->
                if (m.find()) {
                    val km = m.group(2)?.replace(',', '.') ?: return@let
                    return "${km} km"
                }
            }
        }
        DISTANCE_PATTERN.matcher(blob).let { m ->
            if (m.find()) return m.group(0) ?: ""
        }
        return ""
    }

    private fun extractEtaMinutesText(texts: List<String>, packageHint: String): String {
        for (line in texts) {
            COMBINED_ETA_DIST_PATTERN.matcher(line).let { m ->
                if (m.find()) {
                    val min = m.group(1) ?: return@let
                    return "$min min"
                }
            }
            BOLT_BULLET_META_PATTERN.matcher(line).let { m ->
                if (m.find()) {
                    val min = m.group(1) ?: return@let
                    return "$min min"
                }
            }
        }
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

    private fun isTransientSystemPackage(pkg: String): Boolean {
        if (pkg.isEmpty()) return true
        if (pkg == NotificationBrandRouter.PACKAGE_DRIVEMIND) return true
        return isLauncherOrSystemUi(pkg)
    }

    private fun isLauncherOrSystemUi(pkg: String): Boolean {
        if (pkg.isEmpty()) return false
        if (pkg == "com.android.systemui") return true
        if (pkg.contains("launcher", ignoreCase = true)) return true
        if (pkg.startsWith("com.android.launcher")) return true
        if (pkg.startsWith("com.google.android.apps.nexuslauncher")) return true
        if (pkg.startsWith("com.sec.android.app.launcher")) return true
        if (pkg.startsWith("com.miui.home")) return true
        return false
    }

    /** API 33+ auto-manages nodes; recycle only on older releases. */
    private fun recycleNode(node: AccessibilityNodeInfo?) {
        if (node == null) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
        try { node.recycle() } catch (_: Exception) { }
    }

    private fun walkNodes(node: AccessibilityNodeInfo?, treeRoot: AccessibilityNodeInfo, visit: (AccessibilityNodeInfo) -> Unit) {
        if (node == null) return
        try { visit(node) } catch (_: Exception) { }
        // childCount and getChild() are NOT thread-safe: the RN async render cycle
        // can mutate the tree between these two calls, causing IOOBE on API 33+
        // where getChild(i) throws instead of returning null. Guard both calls.
        val childCount = try { node.childCount } catch (_: Exception) { return }
        for (i in 0 until childCount) {
            val child = try { node.getChild(i) } catch (_: Exception) { null } ?: continue
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
                        val next = try { parent.getChild(i + 1) } catch (_: Exception) { null }
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
        private const val TAG = "DriveMindScraper"
        @Volatile private var weakInstance: WeakReference<DriveMindScraperService>? = null

        // Tokens used in fallback findAccessibilityNodeInfosByText() search
        // when the primary walkNodes() traversal misses hidden/inaccessible containers.
        internal val PRICE_CURRENCY_TOKENS = listOf("zł", "PLN", "EUR", "USD", "GBP", "₽", "₴", "€", "$", "£")
        internal val METRIC_TOKENS = listOf("km", " min", "mi ")

        fun requestRescanIfForeground() {
            weakInstance?.get()?.requestRescanFromNative()
        }

        /** Foreground whitelist package for overlay delayed-restore (no service instance needed). */
        fun resolveForegroundOverlayTarget(): String? =
            weakInstance?.get()?.resolveForegroundDriverPackage()

        /** Arm the shift watchdog — called when a shift starts. */
        fun armShiftWatchdog() {
            weakInstance?.get()?.scheduleShiftWatchdog()
        }

        /** Disarm the shift watchdog — called when a shift ends. */
        fun disarmShiftWatchdog() {
            weakInstance?.get()?.cancelShiftWatchdog()
        }

        fun cancelForegroundScan() {
            weakInstance?.get()?.let { service ->
                service.cancelTickLoop()
                service.cancelPeriodicRescan()
                service.cancelContentChangedRescan()
            }
        }

        private const val DEBOUNCE_MS = 250L
        private const val TICK_INTERVAL_MS = 500L
        private const val CONTENT_CHANGED_DEBOUNCE_MS = 400L
        private const val PERIODIC_RESCAN_MS = 4_000L
        /** Shift watchdog interval: reconciles the real foreground package with
         *  cached state so missed accessibility events don't strand the overlay. */
        private const val SHIFT_WATCHDOG_INTERVAL_MS = 2_000L
        /** Max age of a cached offer that can be attributed to an Accept. */
        private const val ACCEPT_WINDOW_MS = 90_000L
        /** Settle delay between WINDOW_STATE_CHANGED and the acceptance snapshot. */
        private const val ACCEPT_SETTLE_MS = 700L
        const val EVENT_SCRAPE = "DriveMindScrape"
        const val EVENT_ORDER_SCRAPED = "onOrderScraped"
        const val EVENT_ORDER_ACCEPTED = "onOrderAccepted"

        /**
         * Keywords that indicate the driver is on an active-trip / navigation
         * screen (post-Accept). Multi-language coverage for Uber Driver / Bolt
         * Driver in PL / EN / UK / RU.
         */
        private val TRIP_KEYWORDS: List<String> = listOf(
            // EN
            "pickup", "pick-up", "pick up", "drop off", "drop-off", "dropoff",
            "navigate", "start trip", "start ride", "end trip", "slide to",
            "swipe to start", "i've arrived", "i have arrived", "arrived",
            "go to pickup", "go to customer", "customer", "passenger",
            // PL
            "odbiór", "odbior", "odbierz", "dostawa", "dojedź", "dojedz",
            "rozpocznij", "zakończ", "zakoncz", "klient", "do klienta",
            "nawiguj", "trasa do",
            // UK
            "забрати", "висадка", "клієнт", "почати поїздку", "закінчити",
            "навігація", "пасажир",
            // RU
            "забрать", "высадка", "клиент", "начать поездку", "закончить",
            "навигация", "пассажир", "поездка началась",
        )

        const val PACKAGE_BOLT_FOOD = DriveMindNotificationService.PACKAGE_BOLT_FOOD

        /** @deprecated Use [NotificationBrandRouter.isMonitoredDriverPackage]. */
        @Deprecated("Use NotificationBrandRouter.isMonitoredDriverPackage")
        val MONITORED_PACKAGES: Set<String> = NotificationBrandRouter.PRODUCTION_PACKAGES

        /** @deprecated Use [NotificationBrandRouter.isOverlayTargetPackage]. */
        @Deprecated("Use NotificationBrandRouter.isOverlayTargetPackage")
        val OVERLAY_TARGET_PACKAGES: Set<String> = NotificationBrandRouter.PRODUCTION_PACKAGES

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
        /** e.g. "In 10 min (3.2 km)", "Za 10 min (3.2 km)", "Razem: 18 min (4.2 km)", "Trip: 18 min (12.4 km)" */
        private val COMBINED_ETA_DIST_PATTERN = Pattern.compile(
            "(?:Za\\s+|In\\s+|Razem:\\s*|Przejazd:\\s*|Trip:\\s*)?(\\d{1,3})\\s*min\\s*\\(\\s*(\\d+(?:[.,]\\d+)?)\\s*km\\s*\\)",
            Pattern.CASE_INSENSITIVE,
        )
        /** KrakowMocks Bolt driver: "12 min • 2.1 km" */
        private val BOLT_BULLET_META_PATTERN = Pattern.compile(
            "(\\d{1,3})\\s*min\\s*[•·]\\s*(\\d+(?:[.,]\\d+)?)\\s*km\\b",
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
            "доставка", "доставлення", "cel",
        )

        /** Prefixes on KrakowMocks accessibilityLabel strings for pickup addresses. */
        private val A11Y_PICKUP_PREFIXES = listOf(
            "Odbiór pasażera,",
            "Odbiór,",
            "Odbior,",
            "Pickup,",
            "Pick up,",
        )

        /** Prefixes on KrakowMocks accessibilityLabel strings for dropoff addresses. */
        private val A11Y_DROPOFF_PREFIXES = listOf(
            "Cel,",
            "Dostawa,",
            "Dropoff,",
            "Drop off,",
        )
    }
}
