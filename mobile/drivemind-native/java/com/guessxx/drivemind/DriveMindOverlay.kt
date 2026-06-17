package com.guessxx.drivemind

import android.content.Context
import android.content.SharedPreferences
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.ColorUtils
import androidx.dynamicanimation.animation.FloatValueHolder
import androidx.dynamicanimation.animation.SpringAnimation
import androidx.dynamicanimation.animation.SpringForce
import kotlin.math.abs
import java.lang.ref.WeakReference
import java.util.concurrent.ConcurrentLinkedDeque

// ── Premium widget design tokens ────────────────────────────────────────────
//
//  Card:    solid #121214 dark fill with a hairline #27272A border + 16dp
//           radius + soft elevation shadow.
//  Accent:  per-tier Financial Analyst color on primary "zł/km" text only.
//  IDLE:    compact micro-pill (~120dp) with a 8dp green pulsing dot + label.
//  OFFER:   expanded analytical HUD banner (~300dp) — no action buttons.
//
// Safe-zone: widget is clamped to the upper 55% of the screen so it never
// overlaps the Uber/Bolt Accept buttons in the lower portion of the UI.
private const val OVERLAY_SAFE_ZONE_HEIGHT_FRACTION = 0.45f
private const val CARD_CORNER_DP = 16
private const val CARD_ELEVATION_DP = 8
private const val CARD_BORDER_WIDTH_DP = 1
private const val BACKGROUND_DEBOUNCE_MS = 80L
private const val LAUNCHER_DETACH_DEBOUNCE_MS = 280L

private const val CARD_BG_HEX = "#121214"
private const val CARD_BORDER_HEX = "#27272A"
private const val MUTED_TEXT_HEX = "#A1A1AA"
private const val SOFT_TEXT_HEX = "#71717A"
private const val IDLE_ACCENT_HEX = "#22C55E"
private const val FALLBACK_ACCENT_HEX = "#22C55E"

data class OverlayProfitFields(
    /** Tier title pill text, e.g. "✅ Bardzo dobry". */
    val tierTitle: String,
    /** Primary high-contrast metric, e.g. "4,20 zł/km" — the headline number. */
    val primaryRateLine: String,
    /** Gross fare line, e.g. "35,00 zł". */
    val priceLine: String,
    /** ETA + distance, e.g. "12 min · 3,2 km". */
    val metricsLine: String,
    /** Accent color for primary rate text (Financial Analyst tier). */
    val accentColorHex: String,
    /** Driver-app package name (for ingest reconciliation). */
    val packageName: String,
    /** Stable hash JS uses to reconcile the offer in driverIngestStore. */
    val contentHash: String,
)

private class OverlayCardRefs(
    val root: LinearLayout,
    // ── IDLE pill ──
    val idleRow: LinearLayout,
    val idleDot: View,
    val idleLabel: TextView,
    // ── OFFER HUD banner ──
    val offerLayout: LinearLayout,
    val tierBadge: TextView,
    val primaryRate: TextView,
    val secondaryRow: TextView,
)

private fun overlayDp(ctx: Context, dp: Int): Int =
    (dp * ctx.resources.displayMetrics.density + 0.5f).toInt()

private fun overlayDpF(ctx: Context, dp: Float): Float =
    dp * ctx.resources.displayMetrics.density

private fun clampOverlayToSafeZone(
    params: WindowManager.LayoutParams,
    view: View,
    displayWidth: Int,
    displayHeight: Int,
) {
    val margin = overlayDp(view.context, 12)
    val vw = if (view.width > 0) view.width else overlayDp(view.context, 160)
    val vh = if (view.height > 0) view.height else overlayDp(view.context, 72)
    val maxY = (displayHeight * OVERLAY_SAFE_ZONE_HEIGHT_FRACTION).toInt() - vh - margin
    params.x = params.x.coerceIn(margin, (displayWidth - vw - margin).coerceAtLeast(margin))
    params.y = params.y.coerceIn(margin, maxY.coerceAtLeast(margin))
}

/**
 * Premium floating HUD managed via [WindowManager].
 *
 * Two states: IDLE (compact pill) and OFFER (analytical banner).
 * Visibility is gated by RN AppState (foreground hides) and the active shift flag.
 */
object DriveMindOverlay {

    private const val PREFS_NAME = "drivemind_overlay"
    private const val KEY_SHIFT_ACTIVE = "shift_overlay_active"

    private enum class CachedMode { NONE, IDLE, OFFER }

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    var idleLabel: String = "Online"

    @Volatile private var windowManager: WindowManager? = null
    @Volatile private var cardRefs: OverlayCardRefs? = null
    @Volatile private var layoutParams: WindowManager.LayoutParams? = null
    @Volatile private var dotPulseRunnable: Runnable? = null
    @Volatile private var dotPulsePhase = false
    @Volatile private var usingAccessibilityOverlay = false

    @Volatile private var appInForeground = true
    @Volatile private var overlayTargetInForeground = false
    @Volatile private var shiftOverlayActive = false
    @Volatile private var cachedMode = CachedMode.NONE
    @Volatile private var cachedProfit: OverlayProfitFields? = null

    @Volatile private var overlayMutationInFlight = false
    private val pendingOverlayMutations = ConcurrentLinkedDeque<() -> Unit>()
    @Volatile private var lastBackgroundAtMs = 0L
    @Volatile private var accessibilityServiceRef: WeakReference<Context>? = null
    // Deferred detach for launcher/SystemUI flashes: cancellable if a driver app
    // comes into focus before the timer fires (transient transition flash).
    private var launcherDetachRunnable: Runnable? = null

    fun bindAccessibilityService(context: Context) {
        accessibilityServiceRef = WeakReference(context)
    }

    private fun accessibilityServiceContext(): Context? = accessibilityServiceRef?.get()

    private fun overlayPrefs(ctx: Context): SharedPreferences =
        ctx.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun persistShiftActive(ctx: Context, active: Boolean) {
        overlayPrefs(ctx).edit().putBoolean(KEY_SHIFT_ACTIVE, active).apply()
    }

    private fun restoreShiftActiveFromPrefs(ctx: Context) {
        if (shiftOverlayActive) return
        if (overlayPrefs(ctx).getBoolean(KEY_SHIFT_ACTIVE, false)) {
            shiftOverlayActive = true
            Log.i("DriveMindOverlay", "restored shift active from prefs")
        }
    }

    private fun runOverlayMutation(block: () -> Unit) {
        mainHandler.post {
            if (overlayMutationInFlight) {
                pendingOverlayMutations.addLast(block)
                return@post
            }
            overlayMutationInFlight = true
            try {
                block()
            } finally {
                overlayMutationInFlight = false
                val next = synchronized(pendingOverlayMutations) {
                    pendingOverlayMutations.pollFirst()
                }
                next?.let { runOverlayMutation(it) }
            }
        }
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    fun setShiftActive(active: Boolean, context: Context? = null) {
        launcherDetachRunnable?.let { mainHandler.removeCallbacks(it) }
        launcherDetachRunnable = null
        runOverlayMutation {
            val wasActive = shiftOverlayActive
            shiftOverlayActive = active
            context?.applicationContext?.let { persistShiftActive(it, active) }
            if (!active) {
                cachedMode = CachedMode.NONE
                cachedProfit = null
                detachOverlayView(immediate = true)
                Log.i("DriveMindOverlay", "setShiftActive false")
                return@runOverlayMutation
            }
            val appCtx = context?.applicationContext
            if (appCtx == null) {
                Log.w("DriveMindOverlay", "setShiftActive true — no context")
                return@runOverlayMutation
            }
            if (cachedMode == CachedMode.NONE) {
                cachedMode = CachedMode.IDLE
                cachedProfit = null
            }
            Log.i(
                "DriveMindOverlay",
                "setShiftActive true was=$wasActive mode=$cachedMode foreground=$appInForeground",
            )
            flushCachedOverlayAttach(appCtx)
            if (overlayTargetInForeground) {
                DriveMindScraperService.requestRescanIfForeground()
            }
        }
    }

    /** RN launched a driver/mock app — wait for accessibility WINDOW_STATE_CHANGED to arm overlay. */
    fun onDriverAppLaunched(appContext: Context) {
        runOverlayMutation {
            appInForeground = false
            Log.d("DriveMindOverlay", "onDriverAppLaunched — waiting for overlay target window")
        }
    }

    fun onAppForegrounded() {
        runOverlayMutation {
            appInForeground = true
            detachOverlayView(immediate = true)
        }
    }

    fun onAppForegroundedFallback() {
        runOverlayMutation {
            if (!appInForeground) {
                appInForeground = true
                detachOverlayView(immediate = true)
            }
        }
    }

    fun onAppBackgrounded(context: Context) {
        runOverlayMutation {
            val now = System.currentTimeMillis()
            if (!appInForeground && now - lastBackgroundAtMs < BACKGROUND_DEBOUNCE_MS) return@runOverlayMutation
            lastBackgroundAtMs = now
            appInForeground = false
            if (shiftOverlayActive) {
                // Mid-shift swap to driver app: never detach — cachedMode/cachedProfit
                // survive until setShiftActive(false). Reconcile foreground after the
                // window stack settles (DriveMind often flashes in a11y during swap).
                Log.d(
                    "DriveMindOverlay",
                    "onAppBackgrounded — shift active, preserving cache (overlayTarget=$overlayTargetInForeground)",
                )
                val appCtx = context.applicationContext
                mainHandler.postDelayed({
                    val topPkg = DriveMindScraperService.resolveForegroundOverlayTarget()
                    if (topPkg != null && NotificationBrandRouter.isOverlayTargetPackage(topPkg)) {
                        overlayTargetInForeground = true
                        restoreCachedOverlay(appCtx)
                        Log.d("DriveMindOverlay", "onAppBackgrounded delayed restore top=$topPkg")
                    }
                }, 150L)
            } else {
                detachOverlayView(immediate = true)
                Log.d("DriveMindOverlay", "onAppBackgrounded — detached (no shift)")
            }
        }
    }

    /**
     * Whitelist driver/mock app left foreground (launcher, settings, etc.).
     *
     * Launcher and SystemUI: hide instantly — never linger on the home screen.
     * DriveMind flash during app swap: short debounce so overlay survives transition.
     */
    fun onOverlayTargetLost(packageName: String? = null) {
        runOverlayMutation {
            val pkg = packageName?.trim().orEmpty()
            if (shiftOverlayActive && isLauncherOrSystemUi(pkg)) {
                launcherDetachRunnable?.let { mainHandler.removeCallbacks(it) }
                launcherDetachRunnable = null
                overlayTargetInForeground = false
                hideOverlayInstant()
                Log.i("DriveMindOverlay", "onOverlayTargetLost instant hide pkg=$pkg")
                return@runOverlayMutation
            }
            if (shiftOverlayActive && pkg == NotificationBrandRouter.PACKAGE_DRIVEMIND) {
                scheduleLauncherDetachDebounce(pkg)
                return@runOverlayMutation
            }
            launcherDetachRunnable?.let { mainHandler.removeCallbacks(it) }
            launcherDetachRunnable = null
            overlayTargetInForeground = false
            hideOverlayInstant()
            Log.i("DriveMindOverlay", "onOverlayTargetLost pkg=${packageName ?: "unknown"}")
        }
    }

    /**
     * Schedule a deferred overlay detach for transient system/launcher packages.
     * If [onDriverAppForegrounded] is called before the timer fires, the detach
     * is cancelled (transition flash case). Otherwise it fires and detaches the
     * overlay (genuine home screen / settings navigation).
     */
    private fun scheduleLauncherDetachDebounce(triggerPkg: String) {
        launcherDetachRunnable?.let { mainHandler.removeCallbacks(it) }
        val r = Runnable {
            launcherDetachRunnable = null
            runOverlayMutation {
                if (!shiftOverlayActive) return@runOverlayMutation
                // Ask the scraper if a whitelist app is still in the window stack.
                val stillFg = DriveMindScraperService.resolveForegroundOverlayTarget()
                if (stillFg != null && NotificationBrandRouter.isOverlayTargetPackage(stillFg)) {
                    Log.i(
                        "DriveMindOverlay",
                        "launcher debounce: driver still in fg=$stillFg, keeping overlay (triggerPkg=$triggerPkg)",
                    )
                } else {
                    overlayTargetInForeground = false
                    hideOverlayInstant()
                    Log.i(
                        "DriveMindOverlay",
                        "launcher debounce: confirmed home/system screen, detached (triggerPkg=$triggerPkg)",
                    )
                }
            }
        }
        launcherDetachRunnable = r
        mainHandler.postDelayed(r, LAUNCHER_DETACH_DEBOUNCE_MS)
        Log.d("DriveMindOverlay", "onOverlayTargetLost: debouncing detach ${LAUNCHER_DETACH_DEBOUNCE_MS}ms for pkg=$triggerPkg")
    }

    /** Home screen / SystemUI — overlay must never linger here. */
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

    /**
     * Returns true for packages that may flash transiently during app transitions
     * (DriveMind itself during swap). These get debounce, not instant hide.
     */
    private fun isTransientSystemPackage(pkg: String): Boolean {
        if (pkg.isEmpty()) return true
        if (pkg == NotificationBrandRouter.PACKAGE_DRIVEMIND) return true
        return isLauncherOrSystemUi(pkg)
    }

    /**
     * Called when a monitored driver/mock app gains window focus (from AccessibilityService).
     * DriveMind is no longer the foreground app — attach overlay over the driver UI.
     *
     * @param requestRescan When false, skip [DriveMindScraperService.requestRescanIfForeground]
     *   because the caller ([requestRescanFromNative]) already reconciled foreground + parse.
     */
    fun onDriverAppForegrounded(serviceContext: Context, requestRescan: Boolean = true) {
        bindAccessibilityService(serviceContext)
        // Cancel any pending launcher-detach debounce — the driver app is in foreground.
        launcherDetachRunnable?.let { mainHandler.removeCallbacks(it) }
        launcherDetachRunnable = null
        runOverlayMutation {
            overlayTargetInForeground = true
            appInForeground = false
            Log.i(
                "DriveMindOverlay",
                "onDriverAppForegrounded shift=$shiftOverlayActive mode=$cachedMode rescan=$requestRescan",
            )
            flushCachedOverlayAttach(serviceContext.applicationContext, serviceContext)
            if (requestRescan) {
                DriveMindScraperService.requestRescanIfForeground()
            }
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    fun showProfitability(context: Context, fields: OverlayProfitFields) {
        updateOverlayData(context, fields, forceInvalidate = false)
    }

    /**
     * Update cached offer metrics and redraw the HUD banner.
     * When [forceInvalidate] is true, applies fields to an already-attached view
     * immediately without waiting for accessibility layout mutations.
     */
    fun updateOverlayData(
        context: Context,
        fields: OverlayProfitFields,
        forceInvalidate: Boolean = false,
    ) {
        runOverlayMutation {
            cachedMode = CachedMode.OFFER
            cachedProfit = fields
            val appCtx = context.applicationContext
            restoreShiftActiveFromPrefs(appCtx)

            if (forceInvalidate) {
                val refs = cardRefs
                val wm = windowManager
                val lp = layoutParams
                if (refs != null && wm != null && lp != null &&
                    mayShowOverlay(appCtx, usingAccessibilityOverlay)
                ) {
                    stopDotPulse()
                    applyOfferFields(refs, fields)
                    switchToOfferLayout(refs)
                    refs.root.visibility = View.VISIBLE
                    refs.root.alpha = 1f
                    refs.root.invalidate()
                    refs.root.requestLayout()
                    reclampOverlayAfterLayoutSwitch(refs)
                    try {
                        wm.updateViewLayout(refs.root, lp)
                    } catch (_: Exception) { }
                    Log.i(
                        "DriveMindOverlay",
                        "updateOverlayData forceInvalidate pkg=${fields.packageName} rate=${fields.primaryRateLine}",
                    )
                    return@runOverlayMutation
                }
            }
            flushCachedOverlayAttach(appCtx)
        }
    }

    fun hide() {
        runOverlayMutation {
            cachedMode = CachedMode.NONE
            cachedProfit = null
            detachOverlayView(immediate = true)
        }
    }

    fun showIdle(context: Context) {
        runOverlayMutation {
            cachedMode = CachedMode.IDLE
            cachedProfit = null
            flushCachedOverlayAttach(context.applicationContext)
        }
    }

    /** Accessibility hot path — attach IDLE radar when driver app is on screen. */
    fun showRadarFromAccessibility(serviceContext: Context) {
        bindAccessibilityService(serviceContext)
        runOverlayMutation {
            if (!shiftOverlayActive) {
                Log.d("DriveMindOverlay", "showRadarFromAccessibility: shift inactive")
                return@runOverlayMutation
            }
            cachedMode = CachedMode.IDLE
            cachedProfit = null
            appInForeground = false
            flushCachedOverlayAttach(serviceContext.applicationContext, serviceContext)
        }
    }

    private fun mayShowOverlay(appCtx: Context, useAccessibilityOverlay: Boolean): Boolean {
        if (!shiftOverlayActive) return false
        if (appInForeground) return false
        if (!overlayTargetInForeground) return false
        return if (useAccessibilityOverlay) {
            true
        } else {
            Settings.canDrawOverlays(appCtx.applicationContext)
        }
    }

    private fun logAttachRejected(appCtx: Context, caller: String) {
        val reasons = mutableListOf<String>()
        if (!shiftOverlayActive) reasons.add("shiftInactive")
        if (appInForeground) reasons.add("appInForeground")
        if (!overlayTargetInForeground) reasons.add("noOverlayTarget")
        if (!Settings.canDrawOverlays(appCtx)) reasons.add("noOverlayPermission")
        Log.d(
            "DriveMindOverlay",
            "$caller: attach blocked (${reasons.joinToString()})",
        )
    }

    private fun mayAttachApplicationOverlay(context: Context): Boolean {
        val appCtx = context.applicationContext
        val ok = mayShowOverlay(appCtx, useAccessibilityOverlay = false)
        if (!ok) logAttachRejected(appCtx, "mayAttachApplicationOverlay")
        return ok
    }

    /**
     * Attach cached IDLE/OFFER using APPLICATION_OVERLAY when possible, else
     * TYPE_ACCESSIBILITY_OVERLAY via the bound AccessibilityService context.
     */
    private fun flushCachedOverlayAttach(
        appCtx: Context,
        accessibilityContext: Context? = accessibilityServiceContext(),
    ) {
        restoreShiftActiveFromPrefs(appCtx)
        if (!shiftOverlayActive) {
            Log.i("DriveMindOverlay", "flushCachedOverlayAttach: shift inactive (cached mode=$cachedMode)")
            return
        }
        if (appInForeground) {
            Log.i("DriveMindOverlay", "flushCachedOverlayAttach: DriveMind in foreground")
            return
        }
        if (!overlayTargetInForeground) {
            Log.i("DriveMindOverlay", "flushCachedOverlayAttach: no whitelist app in foreground")
            return
        }
        val svcCtx = accessibilityContext
        when {
            mayAttachApplicationOverlay(appCtx) -> {
                Log.i("DriveMindOverlay", "attach APPLICATION_OVERLAY mode=$cachedMode")
                applyCachedMode(appCtx, useAccessibilityOverlay = false)
            }
            svcCtx != null -> {
                appInForeground = false
                Log.i("DriveMindOverlay", "attach ACCESSIBILITY_OVERLAY mode=$cachedMode")
                applyCachedMode(svcCtx, useAccessibilityOverlay = true)
            }
            else -> logAttachRejected(appCtx, "flushCachedOverlayAttach")
        }
    }

    private fun applyCachedMode(ctx: Context, useAccessibilityOverlay: Boolean) {
        when (cachedMode) {
            CachedMode.OFFER -> cachedProfit?.let { attachOffer(ctx, it, useAccessibilityOverlay) }
            CachedMode.IDLE -> attachIdle(ctx, useAccessibilityOverlay)
            CachedMode.NONE -> attachIdle(ctx, useAccessibilityOverlay)
        }
    }

    private fun restoreCachedOverlay(appCtx: Context, accessibilityContext: Context? = null) {
        flushCachedOverlayAttach(appCtx, accessibilityContext)
    }

    // ── Attach OFFER ─────────────────────────────────────────────────────────

    private fun attachOffer(appCtx: Context, fields: OverlayProfitFields, useAccessibilityOverlay: Boolean) {
        if (!mayShowOverlay(appCtx, useAccessibilityOverlay)) {
            Log.i(
                "DriveMindOverlay",
                "attachOffer blocked a11y=$useAccessibilityOverlay target=$overlayTargetInForeground",
            )
            return
        }
        Log.i(
            "DriveMindOverlay",
            "attachOffer a11y=$useAccessibilityOverlay pkg=${fields.packageName} rate=${fields.primaryRateLine}",
        )
        stopDotPulse()
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return

        val existing = cardRefs
        if (existing != null && windowManager != null && usingAccessibilityOverlay == useAccessibilityOverlay) {
            applyOfferFields(existing, fields)
            switchToOfferLayout(existing)
            reclampOverlayAfterLayoutSwitch(existing)
            fadeToVisible(existing.root)
            return
        }

        detachOverlayView(immediate = true)
        windowManager = wm
        usingAccessibilityOverlay = useAccessibilityOverlay
        val refs = buildCard(appCtx)
        applyOfferFields(refs, fields)
        switchToOfferLayout(refs)
        attachAndShow(appCtx, wm, refs, useAccessibilityOverlay)
    }

    // ── Attach IDLE ──────────────────────────────────────────────────────────

    private fun attachIdle(appCtx: Context, useAccessibilityOverlay: Boolean) {
        if (!mayShowOverlay(appCtx, useAccessibilityOverlay)) {
            Log.i(
                "DriveMindOverlay",
                "attachIdle blocked a11y=$useAccessibilityOverlay shift=$shiftOverlayActive " +
                    "target=$overlayTargetInForeground foreground=$appInForeground",
            )
            return
        }

        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        val label = idleLabel.ifBlank { "Online" }

        val existing = cardRefs
        if (existing != null && windowManager != null && usingAccessibilityOverlay == useAccessibilityOverlay) {
            if (existing.idleLabel.text != label) existing.idleLabel.text = label
            switchToIdleLayout(existing)
            reclampOverlayAfterLayoutSwitch(existing)
            fadeToVisible(existing.root)
            startDotPulse()
            return
        }

        detachOverlayView(immediate = true)
        windowManager = wm
        usingAccessibilityOverlay = useAccessibilityOverlay
        val refs = buildCard(appCtx)
        refs.idleLabel.text = label
        switchToIdleLayout(refs)
        attachAndShow(appCtx, wm, refs, useAccessibilityOverlay)
        startDotPulse()
    }

    private fun hideOverlayInstant() {
        stopDotPulse()
        val wm = windowManager
        val refs = cardRefs
        if (refs != null) {
            refs.root.animate().cancel()
            refs.root.visibility = View.GONE
            refs.root.alpha = 0f
            if (wm != null) {
                try { wm.removeView(refs.root) } catch (_: Exception) { }
            }
        }
        cardRefs = null
        layoutParams = null
        windowManager = null
        usingAccessibilityOverlay = false
    }

    private fun detachOverlayView(immediate: Boolean) {
        stopDotPulse()
        val wm = windowManager ?: return
        val refs = cardRefs ?: return
        refs.root.animate().cancel()
        if (immediate) {
            try { wm.removeView(refs.root) } catch (_: Exception) { }
            cardRefs = null
            layoutParams = null
            windowManager = null
            usingAccessibilityOverlay = false
            return
        }
        fadeToHidden(refs.root) {
            try { wm.removeView(refs.root) } catch (_: Exception) { }
            cardRefs = null
            layoutParams = null
            windowManager = null
            usingAccessibilityOverlay = false
        }
    }

    // ── View construction ───────────────────────────────────────────────────

    private fun buildCard(appCtx: Context): OverlayCardRefs {
        val padH = overlayDp(appCtx, 14)
        val padV = overlayDp(appCtx, 12)

        val root = LinearLayout(appCtx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padH, padV, padH, padV)
            elevation = overlayDpF(appCtx, CARD_ELEVATION_DP.toFloat())
            alpha = 0f
            visibility = View.VISIBLE
        }
        applyCardBackground(root)

        // ── IDLE subtree ──
        val idleRow = LinearLayout(appCtx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val idleDot = View(appCtx).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor(IDLE_ACCENT_HEX))
            }
        }
        val dotSize = overlayDp(appCtx, 8)
        val dotParams = LinearLayout.LayoutParams(dotSize, dotSize).apply {
            rightMargin = overlayDp(appCtx, 8)
        }
        val idleLabel = TextView(appCtx).apply {
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.04f
        }
        idleRow.addView(idleDot, dotParams)
        idleRow.addView(idleLabel, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))

        // ── OFFER subtree ──
        val offerLayout = LinearLayout(appCtx).apply {
            orientation = LinearLayout.VERTICAL
        }

        val tierBadge = TextView(appCtx).apply {
            setTextColor(Color.WHITE)
            textSize = 10f
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = 0.05f
            setPadding(
                overlayDp(appCtx, 8),
                overlayDp(appCtx, 3),
                overlayDp(appCtx, 8),
                overlayDp(appCtx, 3),
            )
        }
        applyTierBadgeBackground(tierBadge, Color.parseColor(FALLBACK_ACCENT_HEX))

        val primaryRate = TextView(appCtx).apply {
            setTextColor(Color.parseColor(FALLBACK_ACCENT_HEX))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 30f)
            typeface = Typeface.DEFAULT_BOLD
            letterSpacing = -0.01f
            setPadding(0, overlayDp(appCtx, 10), 0, 0)
        }

        val secondaryRow = TextView(appCtx).apply {
            setTextColor(Color.parseColor(MUTED_TEXT_HEX))
            textSize = 12f
            typeface = Typeface.DEFAULT
            setPadding(0, overlayDp(appCtx, 4), 0, 0)
        }

        offerLayout.addView(tierBadge, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))
        offerLayout.addView(primaryRate, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))
        offerLayout.addView(secondaryRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))

        root.addView(idleRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))
        root.addView(offerLayout, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))

        return OverlayCardRefs(
            root = root,
            idleRow = idleRow,
            idleDot = idleDot,
            idleLabel = idleLabel,
            offerLayout = offerLayout,
            tierBadge = tierBadge,
            primaryRate = primaryRate,
            secondaryRow = secondaryRow,
        )
    }

    // ── State switching ─────────────────────────────────────────────────────

    private fun switchToIdleLayout(refs: OverlayCardRefs) {
        refs.idleRow.visibility = View.VISIBLE
        refs.offerLayout.visibility = View.GONE
    }

    private fun switchToOfferLayout(refs: OverlayCardRefs) {
        refs.idleRow.visibility = View.GONE
        refs.offerLayout.visibility = View.VISIBLE
    }

    private fun reclampOverlayAfterLayoutSwitch(refs: OverlayCardRefs) {
        val wm = windowManager ?: return
        val lp = layoutParams ?: return
        refs.root.post {
            val dm = refs.root.context.resources.displayMetrics
            clampOverlayToSafeZone(lp, refs.root, dm.widthPixels, dm.heightPixels)
            try {
                wm.updateViewLayout(refs.root, lp)
            } catch (_: Exception) { }
        }
    }

    // ── Field application ──────────────────────────────────────────────────

    private fun applyOfferFields(refs: OverlayCardRefs, fields: OverlayProfitFields) {
        val tier = fields.tierTitle.trim()
        val primary = fields.primaryRateLine.trim()
        val price = fields.priceLine.trim()
        val metrics = fields.metricsLine.trim()
        val accent = parseColorSafe(fields.accentColorHex)

        if (refs.tierBadge.text != tier) refs.tierBadge.text = tier
        if (refs.primaryRate.text != primary) refs.primaryRate.text = primary
        refs.primaryRate.setTextColor(accent)

        // Secondary line — combine fare + metrics in one elegant row separated
        // by a thin bullet. Either side is omitted when empty.
        val secondary = when {
            price.isNotEmpty() && metrics.isNotEmpty() -> "$price  ·  $metrics"
            price.isNotEmpty() -> price
            else -> metrics
        }
        if (refs.secondaryRow.text != secondary) refs.secondaryRow.text = secondary

        applyTierBadgeBackground(refs.tierBadge, accent)
    }

    // ── Background / window setup ──────────────────────────────────────────

    /** Kept for RN API compatibility — buttons removed from HUD layout. */
    @Volatile var acceptLabel: String = "Accept & Go"
    @Volatile var dismissLabel: String = "Dismiss"

    private fun attachAndShow(
        appCtx: Context,
        wm: WindowManager,
        refs: OverlayCardRefs,
        useAccessibilityOverlay: Boolean,
    ) {
        val overlayType = if (useAccessibilityOverlay) {
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY
        } else {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        }

        // Focus flags rationale:
        //  • NOT_FOCUSABLE     — never steal IME / keyboard focus from driver apps.
        //  • LAYOUT_IN_SCREEN  — coords are absolute screen-space (consistent clamp).
        //  • NOT_TOUCH_MODAL   — touches outside the widget pass through to apps below.
        //  Buttons receive touches normally because we have NOT set NOT_TOUCHABLE.
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT,
        ).also {
            it.gravity = Gravity.TOP or Gravity.START
            val dm = appCtx.resources.displayMetrics
            it.x = overlayDp(appCtx, 12)
            it.y = overlayDp(appCtx, 72)
            clampOverlayToSafeZone(it, refs.root, dm.widthPixels, dm.heightPixels)
        }
        layoutParams = lp

        // Root touch listener handles drag + tap-on-empty-area to open DriveMind.
        refs.root.setOnTouchListener(
            WidgetTouchListener(wm, refs.root, lp) {
                if (!DriveMindScraperState.isOrderParsingEnabled()) {
                    DriveMindReactBridge.emitImmediate("DriveMindOpenPaywall", null)
                }
                val intent = Intent(appCtx, MainActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                            or Intent.FLAG_ACTIVITY_NEW_TASK
                            or Intent.FLAG_ACTIVITY_SINGLE_TOP,
                    )
                }
                try { appCtx.startActivity(intent) } catch (_: Exception) { }
            },
        )

        cardRefs = refs
        try {
            if (refs.root.parent != null) {
                try { wm.removeView(refs.root) } catch (_: Exception) { }
            }
            wm.addView(refs.root, lp)
            fadeToVisible(refs.root)
        } catch (_: Exception) {
            cardRefs = null
            layoutParams = null
            windowManager = null
            usingAccessibilityOverlay = false
        }
    }

    private fun applyCardBackground(view: View) {
        // Premium dark card: solid #121214 with a hairline #27272A border.
        val cacheKey = (CARD_BG_HEX + "|" + CARD_BORDER_HEX).hashCode()
        if (view.tag as? Int == cacheKey) return
        view.tag = cacheKey
        view.background = GradientDrawable().apply {
            setColor(Color.parseColor(CARD_BG_HEX))
            cornerRadius = overlayDpF(view.context, CARD_CORNER_DP.toFloat())
            setStroke(
                overlayDp(view.context, CARD_BORDER_WIDTH_DP),
                Color.parseColor(CARD_BORDER_HEX),
            )
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            view.outlineAmbientShadowColor = Color.BLACK
            view.outlineSpotShadowColor = Color.BLACK
        }
    }

    private fun applyTierBadgeBackground(view: TextView, accentColor: Int) {
        // Soft tinted pill: 18% accent fill + 60% accent border for subtle
        // tier identification without dominating the card's premium dark look.
        val fill = ColorUtils.setAlphaComponent(accentColor, (255 * 0.18f).toInt())
        val stroke = ColorUtils.setAlphaComponent(accentColor, (255 * 0.60f).toInt())
        val cacheKey = (fill xor stroke)
        if (view.tag as? Int == cacheKey) return
        view.tag = cacheKey
        view.background = GradientDrawable().apply {
            setColor(fill)
            cornerRadius = overlayDpF(view.context, 999f)
            setStroke(overlayDp(view.context, 1), stroke)
        }
        view.setTextColor(accentColor)
    }

    private fun parseColorSafe(hex: String): Int = try {
        Color.parseColor(hex.trim())
    } catch (_: Exception) {
        Color.parseColor(FALLBACK_ACCENT_HEX)
    }

    // ── Animations ─────────────────────────────────────────────────────────

    private fun fadeToVisible(view: View) {
        if (view.visibility == View.VISIBLE && view.alpha == 1f) return
        view.animate().cancel()
        view.visibility = View.VISIBLE
        view.animate()
            .alpha(1f)
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    private fun fadeToHidden(view: View, onEnd: () -> Unit) {
        view.animate().cancel()
        view.animate()
            .alpha(0f)
            .setDuration(220L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction {
                view.visibility = View.GONE
                onEnd()
            }
            .start()
    }

    /** Subtle "live" pulse for the IDLE-state green dot. */
    private fun startDotPulse() {
        mainHandler.post {
            val dot = cardRefs?.idleDot ?: return@post
            if (dotPulseRunnable != null) return@post
            dotPulsePhase = false
            val r = object : Runnable {
                override fun run() {
                    val d = cardRefs?.idleDot ?: run {
                        dotPulseRunnable = null
                        return
                    }
                    dotPulsePhase = !dotPulsePhase
                    d.animate()
                        .alpha(if (dotPulsePhase) 0.45f else 1f)
                        .setDuration(720L)
                        .setInterpolator(AccelerateDecelerateInterpolator())
                        .start()
                    mainHandler.postDelayed(this, 760L)
                }
            }
            dotPulseRunnable = r
            dot.alpha = 1f
            mainHandler.postDelayed(r, 200L)
        }
    }

    private fun stopDotPulse() {
        val r = dotPulseRunnable
        if (r != null) {
            mainHandler.removeCallbacks(r)
            dotPulseRunnable = null
        }
        cardRefs?.idleDot?.animate()?.cancel()
        cardRefs?.idleDot?.alpha = 1f
        cardRefs?.root?.animate()?.cancel()
        cardRefs?.root?.alpha = 1f
        cardRefs?.root?.visibility = View.VISIBLE
    }

    // ── Drag handler ───────────────────────────────────────────────────────

    private class WidgetTouchListener(
        private val wm: WindowManager,
        private val view: View,
        private val params: WindowManager.LayoutParams,
        private val onTap: () -> Unit,
    ) : View.OnTouchListener {

        private var initialX = 0
        private var initialY = 0
        private var touchRawX = 0f
        private var touchRawY = 0f
        private var dragging = false

        override fun onTouch(v: View, e: MotionEvent): Boolean {
            when (e.action) {
                MotionEvent.ACTION_DOWN -> {
                    initialX = params.x
                    initialY = params.y
                    touchRawX = e.rawX
                    touchRawY = e.rawY
                    dragging = false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - touchRawX).toInt()
                    val dy = (e.rawY - touchRawY).toInt()
                    if (!dragging && (abs(dx) > 10 || abs(dy) > 10)) dragging = true
                    if (dragging) {
                        params.x = initialX + dx
                        params.y = initialY + dy
                        clampOverlayToSafeZone(
                            params,
                            view,
                            view.resources.displayMetrics.widthPixels,
                            view.resources.displayMetrics.heightPixels,
                        )
                        try { wm.updateViewLayout(view, params) } catch (_: Exception) { }
                    }
                }
                MotionEvent.ACTION_UP -> {
                    if (!dragging) {
                        onTap()
                    } else {
                        snapToNearestEdge()
                    }
                }
            }
            return true
        }

        private fun snapToNearestEdge() {
            val dm = view.resources.displayMetrics
            val displayWidth = dm.widthPixels
            val displayHeight = dm.heightPixels
            val margin = 12
            val targetX = if (params.x < displayWidth / 2) margin else displayWidth - view.width - margin
            val maxY = (displayHeight * OVERLAY_SAFE_ZONE_HEIGHT_FRACTION).toInt() - view.height - margin
            val targetY = params.y.coerceIn(margin, maxY.coerceAtLeast(margin))

            val holderX = FloatValueHolder(params.x.toFloat())
            val springX = SpringAnimation(holderX).apply {
                spring = SpringForce(targetX.toFloat()).apply {
                    dampingRatio = SpringForce.DAMPING_RATIO_MEDIUM_BOUNCY
                    stiffness = SpringForce.STIFFNESS_LOW
                }
                addUpdateListener { _, value, _ ->
                    params.x = value.toInt()
                    params.y = targetY
                    clampOverlayToSafeZone(params, view, displayWidth, displayHeight)
                    try { wm.updateViewLayout(view, params) } catch (_: Exception) { cancel() }
                }
            }
            springX.start()
        }
    }
}
