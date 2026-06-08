package com.guessxx.drivemind

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
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

/** Keep widget out of bottom ~45% where accept buttons / address fields live. */
private const val OVERLAY_SAFE_ZONE_HEIGHT_FRACTION = 0.45f
private const val CARD_CORNER_DP = 20
private const val CARD_ELEVATION_DP = 4
private const val CARD_MAX_WIDTH_DP = 280
private const val BACKGROUND_DEBOUNCE_MS = 80L

data class OverlayProfitFields(
    val tierTitle: String,
    val priceLine: String,
    val metricsLine: String,
    val colorHex: String,
)

private class OverlayCardRefs(
    val root: LinearLayout,
    val tierBadge: TextView,
    val priceLine: TextView,
    val metricsLine: TextView,
)

private fun overlayDp(ctx: Context, dp: Int): Int =
    (dp * ctx.resources.displayMetrics.density + 0.5f).toInt()

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
 * Manages a single floating interactive widget using [WindowManager].
 *
 * Profitability mode: structured card (tier badge, price, metrics).
 * Radar mode: compact scanning chip with localized label.
 */
object DriveMindOverlay {

    private enum class CachedMode { NONE, RADAR, PROFIT }

    private val mainHandler = Handler(Looper.getMainLooper())
    private const val RADAR_COLOR = "#1A5CFF"

    @Volatile
    var radarLabel: String = "Radar"

    @Volatile private var windowManager: WindowManager? = null
    @Volatile private var cardRefs: OverlayCardRefs? = null
    @Volatile private var layoutParams: WindowManager.LayoutParams? = null
    @Volatile private var radarPulseRunnable: Runnable? = null
    @Volatile private var radarPulsePhase = false
    @Volatile private var usingAccessibilityOverlay = false

    /** True while DriveMind is visible (RN AppState active). */
    @Volatile private var appInForeground = true
    @Volatile private var shiftOverlayActive = false
    @Volatile private var cachedMode = CachedMode.NONE
    @Volatile private var cachedProfit: OverlayProfitFields? = null

    @Volatile private var overlayMutationInFlight = false
    private var pendingOverlayMutation: (() -> Unit)? = null
    @Volatile private var lastBackgroundAtMs = 0L

    private fun runOverlayMutation(block: () -> Unit) {
        mainHandler.post {
            if (overlayMutationInFlight) {
                pendingOverlayMutation = block
                return@post
            }
            overlayMutationInFlight = true
            try {
                block()
            } finally {
                overlayMutationInFlight = false
                pendingOverlayMutation?.let { next ->
                    pendingOverlayMutation = null
                    runOverlayMutation(next)
                }
            }
        }
    }

    fun setShiftActive(active: Boolean) {
        runOverlayMutation {
            shiftOverlayActive = active
            if (!active) {
                cachedMode = CachedMode.NONE
                cachedProfit = null
                detachOverlayView(immediate = true)
            }
        }
    }

    /** Primary path: RN AppState `active`. */
    fun onAppForegrounded() {
        runOverlayMutation {
            appInForeground = true
            detachOverlayView(immediate = true)
        }
    }

    /** Fallback when Activity resumes before RN AppState catches up. */
    fun onAppForegroundedFallback() {
        runOverlayMutation {
            if (!appInForeground) {
                appInForeground = true
                detachOverlayView(immediate = true)
            }
        }
    }

    /** Primary path: RN AppState `background`. */
    fun onAppBackgrounded(context: Context) {
        runOverlayMutation {
            val now = System.currentTimeMillis()
            if (!appInForeground && now - lastBackgroundAtMs < BACKGROUND_DEBOUNCE_MS) return@runOverlayMutation
            lastBackgroundAtMs = now
            appInForeground = false
            val appCtx = context.applicationContext
            if (!DriveMindScraperState.isOrderParsingEnabled()) {
                if (shiftOverlayActive && Settings.canDrawOverlays(appCtx)) {
                    cachedMode = CachedMode.RADAR
                    cachedProfit = null
                    attachRadar(appCtx, useAccessibilityOverlay = false)
                }
                return@runOverlayMutation
            }
            restoreCachedOverlay(appCtx)
        }
    }

    fun showProfitability(context: Context, fields: OverlayProfitFields) {
        runOverlayMutation {
            cachedMode = CachedMode.PROFIT
            cachedProfit = fields
            if (!mayAttachApplicationOverlay(context)) return@runOverlayMutation
            attachProfitability(context.applicationContext, fields)
        }
    }

    fun show(context: Context, text: String, colorHex: String) {
        showProfitability(
            context,
            OverlayProfitFields(
                tierTitle = text,
                priceLine = "",
                metricsLine = "",
                colorHex = colorHex,
            ),
        )
    }

    fun hide() {
        runOverlayMutation {
            cachedMode = CachedMode.NONE
            cachedProfit = null
            detachOverlayView(immediate = true)
        }
    }

    fun showRadar(context: Context) {
        runOverlayMutation {
            cachedMode = CachedMode.RADAR
            cachedProfit = null
            if (!mayAttachApplicationOverlay(context)) return@runOverlayMutation
            attachRadar(context.applicationContext, useAccessibilityOverlay = false)
        }
    }

    /**
     * Accessibility hot path — only updates cache; WM attach is owned by [onAppBackgrounded].
     * Kept for API compatibility; does not add views from the A11y thread loop.
     */
    fun showRadarFromAccessibility(@Suppress("UNUSED_PARAMETER") serviceContext: Context) {
        mainHandler.post {
            if (!shiftOverlayActive || appInForeground) return@post
            cachedMode = CachedMode.RADAR
            cachedProfit = null
        }
    }

    private fun mayAttachApplicationOverlay(context: Context): Boolean {
        val appCtx = context.applicationContext
        return shiftOverlayActive && !appInForeground && Settings.canDrawOverlays(appCtx)
    }

    private fun restoreCachedOverlay(appCtx: Context) {
        if (!mayAttachApplicationOverlay(appCtx)) return
        when (cachedMode) {
            CachedMode.PROFIT -> cachedProfit?.let { attachProfitability(appCtx, it) }
            CachedMode.RADAR -> attachRadar(appCtx, useAccessibilityOverlay = false)
            CachedMode.NONE -> { }
        }
    }

    private fun attachProfitability(appCtx: Context, fields: OverlayProfitFields) {
        stopRadarPulse()
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        val bgColor = parseColorSafe(fields.colorHex)

        val existing = cardRefs
        if (existing != null && windowManager != null) {
            applyProfitFields(existing, fields, bgColor)
            setProfitLayoutVisible(existing, profitVisible = true)
            fadeToVisible(existing.root)
            return
        }

        detachOverlayView(immediate = true)
        windowManager = wm
        usingAccessibilityOverlay = false
        val refs = buildCard(appCtx, bgColor)
        applyProfitFields(refs, fields, bgColor)
        setProfitLayoutVisible(refs, profitVisible = true)
        attachAndShow(appCtx, wm, refs, useAccessibilityOverlay = false)
    }

    private fun attachRadar(appCtx: Context, useAccessibilityOverlay: Boolean) {
        val canAttach = if (useAccessibilityOverlay) {
            shiftOverlayActive && !appInForeground
        } else {
            mayAttachApplicationOverlay(appCtx)
        }
        if (!canAttach) return

        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as? WindowManager ?: return
        val label = radarLabel.ifBlank { "Radar" }
        val bgColor = parseColorSafe(RADAR_COLOR)

        val existing = cardRefs
        if (existing != null && windowManager != null && usingAccessibilityOverlay == useAccessibilityOverlay) {
            existing.tierBadge.text = label
            applyCardBackground(existing.root, bgColor)
            applyTierBadgeBackground(existing.tierBadge, bgColor)
            setProfitLayoutVisible(existing, profitVisible = false)
            fadeToVisible(existing.root)
            startRadarPulse()
            return
        }

        detachOverlayView(immediate = true)
        windowManager = wm
        usingAccessibilityOverlay = useAccessibilityOverlay
        val refs = buildCard(appCtx, bgColor)
        refs.tierBadge.text = label
        setProfitLayoutVisible(refs, profitVisible = false)
        attachAndShow(appCtx, wm, refs, useAccessibilityOverlay)
        startRadarPulse()
    }

    private fun detachOverlayView(immediate: Boolean) {
        stopRadarPulse()
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

    private fun buildCard(appCtx: Context, bgColor: Int): OverlayCardRefs {
        val padH = overlayDp(appCtx, 14)
        val padV = overlayDp(appCtx, 12)
        val innerMaxWidth = overlayDp(appCtx, CARD_MAX_WIDTH_DP) - padH * 2

        val root = LinearLayout(appCtx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padH, padV, padH, padV)
            elevation = CARD_ELEVATION_DP.toFloat()
            alpha = 0f
            visibility = View.VISIBLE
        }
        applyCardBackground(root, bgColor)

        val tierBadge = TextView(appCtx).apply {
            setTextColor(Color.WHITE)
            textSize = 12f
            typeface = Typeface.DEFAULT_BOLD
            setPadding(overlayDp(appCtx, 8), overlayDp(appCtx, 4), overlayDp(appCtx, 8), overlayDp(appCtx, 4))
        }
        applyTierBadgeBackground(tierBadge, bgColor)

        val priceLine = TextView(appCtx).apply {
            setTextColor(Color.WHITE)
            textSize = 18f
            typeface = Typeface.DEFAULT_BOLD
            maxWidth = innerMaxWidth
            val top = overlayDp(appCtx, 6)
            setPadding(0, top, 0, 0)
        }

        val metricsLine = TextView(appCtx).apply {
            setTextColor(ColorUtils.setAlphaComponent(Color.WHITE, (255 * 0.85f).toInt()))
            textSize = 11f
            typeface = Typeface.DEFAULT
            maxWidth = innerMaxWidth
            val top = overlayDp(appCtx, 4)
            setPadding(0, top, 0, 0)
            maxLines = 2
        }

        root.addView(tierBadge, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))
        root.addView(priceLine, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))
        root.addView(metricsLine, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ))

        return OverlayCardRefs(root, tierBadge, priceLine, metricsLine)
    }

    private fun applyProfitFields(refs: OverlayCardRefs, fields: OverlayProfitFields, bgColor: Int) {
        refs.tierBadge.text = fields.tierTitle.trim()
        refs.priceLine.text = fields.priceLine.trim()
        refs.metricsLine.text = fields.metricsLine.trim()
        applyCardBackground(refs.root, bgColor)
        applyTierBadgeBackground(refs.tierBadge, bgColor)
    }

    private fun setProfitLayoutVisible(refs: OverlayCardRefs, profitVisible: Boolean) {
        refs.priceLine.visibility = if (profitVisible && refs.priceLine.text.isNotBlank()) View.VISIBLE else View.GONE
        refs.metricsLine.visibility = if (profitVisible && refs.metricsLine.text.isNotBlank()) View.VISIBLE else View.GONE
    }

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

    private fun applyCardBackground(view: View, color: Int) {
        view.background = GradientDrawable().apply {
            setColor(color)
            cornerRadius = overlayDp(view.context, CARD_CORNER_DP).toFloat()
        }
    }

    private fun applyTierBadgeBackground(view: TextView, cardColor: Int) {
        val darker = ColorUtils.blendARGB(cardColor, Color.BLACK, 0.22f)
        view.background = GradientDrawable().apply {
            setColor(darker)
            cornerRadius = overlayDp(view.context, 8).toFloat()
        }
    }

    private fun parseColorSafe(hex: String): Int = try {
        Color.parseColor(hex.trim())
    } catch (_: Exception) {
        Color.parseColor("#1A5CFF")
    }

    private fun fadeToVisible(view: View) {
        view.animate().cancel()
        view.visibility = View.VISIBLE
        view.animate()
            .alpha(1f)
            .setDuration(300L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    private fun fadeToHidden(view: View, onEnd: () -> Unit) {
        view.animate().cancel()
        view.animate()
            .alpha(0f)
            .setDuration(300L)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .withEndAction {
                view.visibility = View.GONE
                onEnd()
            }
            .start()
    }

    private fun startRadarPulse() {
        mainHandler.post {
            val view = cardRefs?.root ?: return@post
            if (radarPulseRunnable != null) return@post
            radarPulsePhase = false
            val r = object : Runnable {
                override fun run() {
                    val v = cardRefs?.root ?: run {
                        radarPulseRunnable = null
                        return
                    }
                    radarPulsePhase = !radarPulsePhase
                    v.animate()
                        .alpha(if (radarPulsePhase) 0.76f else 1f)
                        .setDuration(640L)
                        .start()
                    mainHandler.postDelayed(this, 680L)
                }
            }
            radarPulseRunnable = r
            view.alpha = 1f
            mainHandler.postDelayed(r, 200L)
        }
    }

    private fun stopRadarPulse() {
        val r = radarPulseRunnable
        if (r != null) {
            mainHandler.removeCallbacks(r)
            radarPulseRunnable = null
        }
        cardRefs?.root?.animate()?.cancel()
        cardRefs?.root?.alpha = 1f
        cardRefs?.root?.visibility = View.VISIBLE
    }

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
