package com.guessxx.drivemind

import android.content.Context
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
import java.util.concurrent.ConcurrentLinkedDeque

// ── Premium widget design tokens ────────────────────────────────────────────
//
//  Card:    solid #121214 dark fill with a hairline #27272A border + 16dp
//           radius + soft elevation shadow.
//  Accent:  comes from the per-tier color (LEGENDARY/VERY_GOOD/etc.) — applied
//           ONLY to the primary "zł/km" text and the Accept button background.
//  IDLE:    compact micro-pill (~120dp) with a 8dp green pulsing dot + label.
//  OFFER:   expanded analytical card (~300dp) with primary rate / fare / ETA /
//           Accept & Dismiss buttons.
//
// Safe-zone: widget is clamped to the upper 55% of the screen so it never
// overlaps the Uber/Bolt Accept buttons in the lower portion of the UI.
private const val OVERLAY_SAFE_ZONE_HEIGHT_FRACTION = 0.45f
private const val CARD_CORNER_DP = 16
private const val CARD_ELEVATION_DP = 8
private const val CARD_BORDER_WIDTH_DP = 1
private const val BACKGROUND_DEBOUNCE_MS = 80L

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
    /** Accent color used for primary rate text + Accept button (per-tier neon). */
    val accentColorHex: String,
    /** Driver-app package name for `Accept & Go` deep-launch. */
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
    // ── OFFER card ──
    val offerLayout: LinearLayout,
    val tierBadge: TextView,
    val primaryRate: TextView,
    val secondaryRow: TextView,
    val buttonRow: LinearLayout,
    val dismissBtn: TextView,
    val acceptBtn: TextView,
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
 * Premium floating widget managed via [WindowManager].
 *
 * Two states: IDLE (compact pill) and OFFER (analytical card with Accept &
 * Dismiss buttons). Visibility is gated by RN AppState (foreground hides) and
 * the active shift flag.
 */
object DriveMindOverlay {

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
    @Volatile private var shiftOverlayActive = false
    @Volatile private var cachedMode = CachedMode.NONE
    @Volatile private var cachedProfit: OverlayProfitFields? = null

    @Volatile private var overlayMutationInFlight = false
    private val pendingOverlayMutations = ConcurrentLinkedDeque<() -> Unit>()
    @Volatile private var lastBackgroundAtMs = 0L

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
        runOverlayMutation {
            shiftOverlayActive = active
            if (!active) {
                cachedMode = CachedMode.NONE
                cachedProfit = null
                detachOverlayView(immediate = true)
                return@runOverlayMutation
            }
            val appCtx = context?.applicationContext ?: return@runOverlayMutation
            if (!appInForeground) {
                if (cachedMode == CachedMode.NONE) {
                    cachedMode = CachedMode.IDLE
                    cachedProfit = null
                }
                restoreCachedOverlay(appCtx)
            }
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
            val appCtx = context.applicationContext
            if (!DriveMindScraperState.isOrderParsingEnabled()) {
                if (shiftOverlayActive && Settings.canDrawOverlays(appCtx)) {
                    cachedMode = CachedMode.IDLE
                    cachedProfit = null
                    attachIdle(appCtx, useAccessibilityOverlay = false)
                }
                return@runOverlayMutation
            }
            restoreCachedOverlay(appCtx)
        }
    }

    /**
     * Called when a monitored driver/mock app gains window focus (from AccessibilityService).
     * DriveMind is no longer the foreground app — attach overlay over the driver UI.
     */
    fun onDriverAppForegrounded(serviceContext: Context) {
        runOverlayMutation {
            appInForeground = false
            val appCtx = serviceContext.applicationContext
            restoreCachedOverlay(appCtx, serviceContext)
        }
    }

    // ── Public API ───────────────────────────────────────────────────────────

    fun showProfitability(context: Context, fields: OverlayProfitFields) {
        runOverlayMutation {
            cachedMode = CachedMode.OFFER
            cachedProfit = fields
            val appCtx = context.applicationContext
            if (mayAttachApplicationOverlay(appCtx)) {
                attachOffer(appCtx, fields, useAccessibilityOverlay = false)
            } else {
                logAttachRejected(appCtx, "showProfitability")
            }
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
            if (!mayAttachApplicationOverlay(context)) return@runOverlayMutation
            attachIdle(context.applicationContext, useAccessibilityOverlay = false)
        }
    }

    /**
     * Drop the current offer card back to the IDLE pill (after Accept / Dismiss)
     * without fully removing the widget.
     */
    private fun dropOfferToIdle(appCtx: Context) {
        cachedMode = CachedMode.IDLE
        cachedProfit = null
        if (mayAttachApplicationOverlay(appCtx)) {
            attachIdle(appCtx, useAccessibilityOverlay = false)
        } else {
            detachOverlayView(immediate = true)
        }
    }

    /** Accessibility hot path — attach IDLE radar when driver app is on screen. */
    fun showRadarFromAccessibility(serviceContext: Context) {
        runOverlayMutation {
            if (!shiftOverlayActive) {
                Log.d("DriveMindOverlay", "showRadarFromAccessibility: shift inactive")
                return@runOverlayMutation
            }
            cachedMode = CachedMode.IDLE
            cachedProfit = null
            appInForeground = false
            val appCtx = serviceContext.applicationContext
            if (mayAttachApplicationOverlay(appCtx)) {
                attachIdle(appCtx, useAccessibilityOverlay = false)
            } else {
                attachIdle(serviceContext, useAccessibilityOverlay = true)
            }
        }
    }

    private fun logAttachRejected(appCtx: Context, caller: String) {
        val reasons = mutableListOf<String>()
        if (!shiftOverlayActive) reasons.add("shiftInactive")
        if (appInForeground) reasons.add("appInForeground")
        if (!Settings.canDrawOverlays(appCtx)) reasons.add("noOverlayPermission")
        Log.d(
            "DriveMindOverlay",
            "$caller: mayAttachApplicationOverlay=false (${reasons.joinToString()})",
        )
    }

    private fun mayAttachApplicationOverlay(context: Context): Boolean {
        val appCtx = context.applicationContext
        val ok = shiftOverlayActive && !appInForeground && Settings.canDrawOverlays(appCtx)
        if (!ok) logAttachRejected(appCtx, "mayAttachApplicationOverlay")
        return ok
    }

    private fun restoreCachedOverlay(appCtx: Context, accessibilityContext: Context? = null) {
        if (mayAttachApplicationOverlay(appCtx)) {
            when (cachedMode) {
                CachedMode.OFFER -> cachedProfit?.let { attachOffer(appCtx, it, useAccessibilityOverlay = false) }
                CachedMode.IDLE -> attachIdle(appCtx, useAccessibilityOverlay = false)
                CachedMode.NONE -> if (shiftOverlayActive) attachIdle(appCtx, useAccessibilityOverlay = false)
            }
            return
        }
        // Fall back to TYPE_ACCESSIBILITY_OVERLAY via AccessibilityService context.
        val svcCtx = accessibilityContext ?: return
        if (!shiftOverlayActive) return
        when (cachedMode) {
            CachedMode.OFFER -> cachedProfit?.let { attachOffer(svcCtx, it, useAccessibilityOverlay = true) }
            CachedMode.IDLE -> attachIdle(svcCtx, useAccessibilityOverlay = true)
            CachedMode.NONE -> attachIdle(svcCtx, useAccessibilityOverlay = true)
        }
    }

    // ── Attach OFFER ─────────────────────────────────────────────────────────

    private fun attachOffer(appCtx: Context, fields: OverlayProfitFields, useAccessibilityOverlay: Boolean) {
        stopDotPulse()
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return

        val existing = cardRefs
        if (existing != null && windowManager != null && usingAccessibilityOverlay == useAccessibilityOverlay) {
            applyOfferFields(existing, fields)
            wireOfferActions(appCtx, existing, fields)
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
        wireOfferActions(appCtx, refs, fields)
        switchToOfferLayout(refs)
        attachAndShow(appCtx, wm, refs, useAccessibilityOverlay)
    }

    // ── Attach IDLE ──────────────────────────────────────────────────────────

    private fun attachIdle(appCtx: Context, useAccessibilityOverlay: Boolean) {
        val canAttach = if (useAccessibilityOverlay) {
            shiftOverlayActive && !appInForeground
        } else {
            mayAttachApplicationOverlay(appCtx)
        }
        if (!canAttach) return

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
            setPadding(0, overlayDp(appCtx, 4), 0, overlayDp(appCtx, 12))
        }

        val buttonRow = LinearLayout(appCtx).apply {
            orientation = LinearLayout.HORIZONTAL
            val topGap = overlayDp(appCtx, 2)
            setPadding(0, topGap, 0, 0)
        }
        val dismissBtn = buildDismissButton(appCtx)
        val acceptBtn = buildAcceptButton(appCtx, Color.parseColor(FALLBACK_ACCENT_HEX))
        val btnGap = overlayDp(appCtx, 8)
        val dismissLp = LinearLayout.LayoutParams(0, overlayDp(appCtx, 40), 1f).apply {
            rightMargin = btnGap / 2
        }
        val acceptLp = LinearLayout.LayoutParams(0, overlayDp(appCtx, 40), 1f).apply {
            leftMargin = btnGap / 2
        }
        buttonRow.addView(dismissBtn, dismissLp)
        buttonRow.addView(acceptBtn, acceptLp)

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
        offerLayout.addView(buttonRow, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
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
            buttonRow = buttonRow,
            dismissBtn = dismissBtn,
            acceptBtn = acceptBtn,
        )
    }

    private fun buildDismissButton(appCtx: Context): TextView {
        return TextView(appCtx).apply {
            setTextColor(Color.parseColor(MUTED_TEXT_HEX))
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = false
            background = buildButtonBackground(
                appCtx = appCtx,
                fillColor = Color.TRANSPARENT,
                strokeColor = Color.parseColor(CARD_BORDER_HEX),
                strokeWidthDp = 1f,
                cornerDp = 12f,
            )
        }
    }

    private fun buildAcceptButton(appCtx: Context, accentColor: Int): TextView {
        return TextView(appCtx).apply {
            setTextColor(Color.WHITE)
            textSize = 13f
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            isClickable = true
            isFocusable = false
            background = buildButtonBackground(
                appCtx = appCtx,
                fillColor = accentColor,
                strokeColor = Color.TRANSPARENT,
                strokeWidthDp = 0f,
                cornerDp = 12f,
            )
        }
    }

    private fun buildButtonBackground(
        appCtx: Context,
        fillColor: Int,
        strokeColor: Int,
        strokeWidthDp: Float,
        cornerDp: Float,
    ): GradientDrawable {
        return GradientDrawable().apply {
            setColor(fillColor)
            cornerRadius = overlayDpF(appCtx, cornerDp)
            if (strokeWidthDp > 0f && strokeColor != Color.TRANSPARENT) {
                setStroke(overlayDp(appCtx, strokeWidthDp.toInt()).coerceAtLeast(1), strokeColor)
            }
        }
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
        refs.acceptBtn.background = buildButtonBackground(
            appCtx = refs.root.context,
            fillColor = accent,
            strokeColor = Color.TRANSPARENT,
            strokeWidthDp = 0f,
            cornerDp = 12f,
        )
        refs.acceptBtn.tag = accent
    }

    private fun wireOfferActions(
        appCtx: Context,
        refs: OverlayCardRefs,
        fields: OverlayProfitFields,
    ) {
        refs.acceptBtn.text = acceptLabel
        refs.dismissBtn.text = dismissLabel

        refs.acceptBtn.setOnClickListener {
            handleAccept(appCtx, fields)
        }
        refs.dismissBtn.setOnClickListener {
            handleDismiss(appCtx, fields)
        }
        refs.buttonRow.setOnTouchListener { _, _ -> true }
    }

    // ── Button handlers ────────────────────────────────────────────────────

    @Volatile var acceptLabel: String = "Accept & Go"
    @Volatile var dismissLabel: String = "Dismiss"

    private fun handleAccept(appCtx: Context, fields: OverlayProfitFields) {
        // Notify JS (state cleanup: remove offer from driverIngestStore, etc.).
        DriveMindReactBridge.emitMapImmediate("DriveMindOverlayAccept") { m ->
            m.putString("packageName", fields.packageName)
            m.putString("contentHash", fields.contentHash)
        }
        // Extend the accessibility scan window so the passive accept detector
        // can attribute the upcoming offer-screen → trip-screen transition.
        DriveMindScraperState.extendScanWindow(10_000L)
        // Native fast-path: launch the driver app directly without round-tripping
        // through the RN bridge — keeps Accept feeling instantaneous.
        launchDriverApp(appCtx, fields.packageName)
        runOverlayMutation { dropOfferToIdle(appCtx) }
    }

    private fun handleDismiss(appCtx: Context, fields: OverlayProfitFields) {
        DriveMindReactBridge.emitMapImmediate("DriveMindOverlayDismiss") { m ->
            m.putString("contentHash", fields.contentHash)
            m.putString("packageName", fields.packageName)
        }
        runOverlayMutation { dropOfferToIdle(appCtx) }
    }

    private fun launchDriverApp(appCtx: Context, packageName: String) {
        if (packageName.isBlank()) return
        try {
            val intent = appCtx.packageManager.getLaunchIntentForPackage(packageName) ?: return
            intent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
            )
            appCtx.startActivity(intent)
        } catch (e: Exception) {
            android.util.Log.w("DriveMindOverlay", "launchDriverApp($packageName) failed: ${e.message}")
        }
    }

    // ── Background / window setup ──────────────────────────────────────────

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

        // Root touch listener handles drag + tap-on-empty-area. Button children
        // consume their own ACTION_DOWN, so the root listener never fires for
        // touches that originate inside the Accept / Dismiss button bounds.
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
