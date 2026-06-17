package com.guessxx.drivemind

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.provider.Settings.Secure
import android.view.accessibility.AccessibilityManager
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * React Native bridge module.  All @ReactMethod bodies that must touch the
 * UI/WindowManager delegate to [DriveMindOverlay] which posts work to the main
 * thread, so these methods are safe to call from any thread.
 */
class DriveMindNativeModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        // Defensive: any failure here would silently kill the entire RN module
        // (no events from notifications, scraper, or location). Swallow + log so
        // the rest of the bridge survives even if the bridge holder is in a bad
        // state on hot-reload / process restore.
        try {
            DriveMindReactBridge.reactContext = reactContext
        } catch (e: Throwable) {
            android.util.Log.e("DriveMindNative", "Bridge wiring failed", e)
        }
    }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        try {
            DriveMindReactBridge.reactContext = reactApplicationContext
        } catch (e: Throwable) {
            android.util.Log.e("DriveMindNative", "initialize: bridge wiring failed", e)
        }
    }

    // ── Sound ─────────────────────────────────────────────────────────────────

    @ReactMethod
    fun playSoftClickSound(enabled: Boolean) {
        if (enabled) DriveMindSound.playSoftClick(reactApplicationContext)
    }

    @ReactMethod
    fun setSoundEnabled(enabled: Boolean) {
        DriveMindSound.setSoundEnabled(reactApplicationContext, enabled)
    }

    @ReactMethod
    fun getSoundEnabled(promise: Promise) {
        promise.resolve(DriveMindSound.isSoundEnabled(reactApplicationContext))
    }

    // ── Scraper window ────────────────────────────────────────────────────────

    /** Call after the driver taps Accept / opens a provider app to start a 10s scan. */
    @ReactMethod
    fun triggerScraperWindow() {
        if (!DriveMindScraperState.isOrderParsingEnabled()) return
        DriveMindScraperState.extendScanWindow(10_000L)
    }

    /** When false, accessibility scraper, notification ingest, and scan windows are frozen. */
    @ReactMethod
    fun setOrderParsingEnabled(enabled: Boolean) {
        DriveMindScraperState.setOrderParsingEnabled(enabled)
        if (!enabled) DriveMindOverlay.hide()
    }

    // ── Notification buffer ───────────────────────────────────────────────────

    @ReactMethod
    fun getBufferedNotificationsJson(promise: Promise) {
        try {
            promise.resolve(NotificationBufferPrefs.readAllJson(reactApplicationContext))
        } catch (e: Exception) {
            promise.reject("E_BUFFER", e.message, e)
        }
    }

    @ReactMethod
    fun clearNotificationBuffer() {
        NotificationBufferPrefs.clear(reactApplicationContext)
    }

    @ReactMethod
    fun getRecentDiagnosticEvents(limit: Int, promise: Promise) {
        try {
            val safe = if (limit <= 0) 5 else minOf(limit, 50)
            promise.resolve(
                NotificationBufferPrefs.readRecentDiagnosticJson(reactApplicationContext, safe)
            )
        } catch (e: Exception) {
            promise.reject("E_DIAGNOSTIC", e.message, e)
        }
    }

    // ── Service status checks ─────────────────────────────────────────────────

    @ReactMethod
    fun getServiceStatuses(promise: Promise) {
        // Each sub-check is wrapped so a single failing one (e.g. PowerManager
        // on locked-down OEMs) never bubbles up and rejects the whole promise.
        // The UI must always receive a snapshot; missing booleans default to
        // `false` so the card flips to red, not green.
        val ctx = reactApplicationContext
        val map = Arguments.createMap()

        map.putBoolean("notificationListenerEnabled", safeCheck("notificationListener") {
            isNotificationListenerEnabled(ctx)
        })
        map.putBoolean("accessibilityServiceEnabled", safeCheck("accessibilityService") {
            isAccessibilityServiceEnabled(ctx)
        })
        map.putBoolean("ignoringBatteryOptimizations", safeCheck("batteryOpt") {
            isIgnoringBatteryOptimizations(ctx)
        })
        promise.resolve(map)
    }

    /**
     * Authoritative ingest readiness for JS permission onboarding.
     * Notification listener + background-capable location — avoids cold-start
     * mismatches when react-native-permissions lags behind the OS grant state.
     */
    @ReactMethod
    fun isBridgeActive(promise: Promise) {
        try {
            val ctx = reactApplicationContext
            val active = isNotificationListenerEnabled(ctx) && hasIngestLocationGranted(ctx)
            promise.resolve(active)
        } catch (e: Exception) {
            promise.reject("E_BRIDGE", e.message, e)
        }
    }

    private fun hasIngestLocationGranted(ctx: Context): Boolean {
        val fine = ContextCompat.checkSelfPermission(
            ctx,
            Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
        if (!fine) return false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return ContextCompat.checkSelfPermission(
                ctx,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION,
            ) == PackageManager.PERMISSION_GRANTED
        }
        return true
    }

    private inline fun safeCheck(label: String, block: () -> Boolean): Boolean {
        return try {
            block()
        } catch (e: Throwable) {
            android.util.Log.e("DriveMindNative", "safeCheck[$label] failed", e)
            false
        }
    }

    // ── Settings launchers ────────────────────────────────────────────────────

    @ReactMethod
    fun openNotificationListenerSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
    }

    @ReactMethod
    fun isAccessibilityServiceEnabled(promise: Promise) {
        try {
            promise.resolve(isAccessibilityServiceEnabled(reactApplicationContext))
        } catch (e: Exception) {
            promise.reject("E_A11Y", e.message, e)
        }
    }

    /**
     * Opens Android accessibility settings for DriveMind Order Reader.
     * Never uses App Info — that screen does not expose the service toggle.
     */
    @ReactMethod
    fun openAccessibilitySettings() {
        val ctx = reactApplicationContext
        val pkg = ctx.packageName
        val flags = Intent.FLAG_ACTIVITY_NEW_TASK
        val serviceClass = DriveMindScraperService::class.java.name
        val component = ComponentName(pkg, serviceClass)
        val componentFlat = "$pkg/$serviceClass"

        data class Attempt(val label: String, val intent: Intent)

        val attempts = buildList {
            add(
                Attempt(
                    "ACCESSIBILITY_DETAILS_SETTINGS",
                    Intent("android.settings.ACCESSIBILITY_DETAILS_SETTINGS").apply {
                        addFlags(flags)
                        putExtra(Intent.EXTRA_COMPONENT_NAME, component)
                    },
                ),
            )
            add(
                Attempt(
                    "ACCESSIBILITY_SETTINGS+component",
                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                        addFlags(flags)
                        putExtra(Intent.EXTRA_COMPONENT_NAME, component)
                        putExtra(":settings:fragment_args_key", componentFlat)
                        putExtra(
                            ":settings:show_fragment_args",
                            Bundle().apply { putString("component_name", componentFlat) },
                        )
                    },
                ),
            )
            add(
                Attempt(
                    "ACCESSIBILITY_SETTINGS",
                    Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply { addFlags(flags) },
                ),
            )
        }

        for ((label, intent) in attempts) {
            try {
                val resolved = intent.resolveActivity(ctx.packageManager)?.className
                if (resolved == null) {
                    Log.w("DriveMindNative", "openAccessibilitySettings: $label — resolveActivity=null")
                    continue
                }
                ctx.startActivity(intent)
                Log.i("DriveMindNative", "openAccessibilitySettings: started $label component=$componentFlat -> $resolved")
                return
            } catch (e: Exception) {
                Log.w("DriveMindNative", "openAccessibilitySettings: $label failed", e)
            }
        }

        Log.e("DriveMindNative", "openAccessibilitySettings: all accessibility intents failed for $componentFlat")
    }

    @ReactMethod
    fun openBatteryOptimizationSettings() {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactApplicationContext.startActivity(intent)
    }

    // ── Overlay / SYSTEM_ALERT_WINDOW permission ──────────────────────────────

    /** Resolves true if ACTION_MANAGE_OVERLAY_PERMISSION has been granted. */
    @ReactMethod
    fun isOverlayPermissionGranted(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(reactApplicationContext))
    }

    /** Opens the system overlay-permission page for this package. */
    @ReactMethod
    fun requestOverlayPermission() {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${reactApplicationContext.packageName}"),
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
        } catch (_: Exception) { }
    }

    // ── Usage-stats / PACKAGE_USAGE_STATS permission ──────────────────────────

    /** Resolves true if the PACKAGE_USAGE_STATS AppOp has been granted. */
    @ReactMethod
    fun isUsageAccessGranted(promise: Promise) {
        promise.resolve(checkUsageAccessGranted())
    }

    /** Opens ACTION_USAGE_ACCESS_SETTINGS. */
    @ReactMethod
    fun requestUsageAccess() {
        try {
            val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
        } catch (_: Exception) { }
    }

    // ── Interactive widget overlay ────────────────────────────────────────────

    /**
     * Show (or update) the floating interactive widget.
     *
     * @param text  Display string, e.g. "✅ VERY GOOD\n14.50 zł"
     * @param color Hex background colour, e.g. "#22C55E"
     */
    /**
     * Legacy entry — kept for JS callers that still use the simple text+color
     * surface. Maps to the new offer-card flow with an empty primary rate.
     */
    @ReactMethod
    fun showOverlay(text: String, color: String) {
        if (!Settings.canDrawOverlays(reactApplicationContext)) return
        DriveMindOverlay.showProfitability(
            reactApplicationContext,
            OverlayProfitFields(
                tierTitle = text,
                primaryRateLine = "",
                priceLine = "",
                metricsLine = "",
                accentColorHex = color,
                packageName = "",
                contentHash = "",
            ),
        )
    }

    /** Remove the floating interactive widget from the screen. */
    @ReactMethod
    fun hideOverlay() {
        DriveMindOverlay.hide()
    }

    /** Cache/show the IDLE radar pill (e.g. shift started with an empty ingest queue). */
    @ReactMethod
    fun showOverlayIdle() {
        DriveMindOverlay.showIdle(reactApplicationContext)
    }

    /**
     * Arms or disarms the overlay for the current shift.
     * When [active] is false (shift ended / permissions revoked) the widget is hidden.
     * When true, the overlay is ready to show on the next [showOverlay] / [updateOverlayProfitability] call.
     */
    @ReactMethod
    fun setOverlayShiftActive(active: Boolean) {
        Log.i("DriveMindNative", "setOverlayShiftActive($active)")
        DriveMindScraperState.setShiftScanActive(active)
        if (active) {
            DriveMindOverlay.setShiftActive(active, reactApplicationContext)
            // Watchdog survives missed accessibility events (app already on
            // screen at shift start, transient event loss during app-switching).
            DriveMindScraperService.armShiftWatchdog()
            DriveMindScraperService.requestRescanIfForeground()
        } else {
            DriveMindScraperService.disarmShiftWatchdog()
            DriveMindScraperService.cancelForegroundScan()
            DriveMindOverlay.setShiftActive(active, reactApplicationContext)
        }
    }

    /** Re-read the foreground whitelist driver app UI (shift already active). */
    @ReactMethod
    fun rescanForegroundDriverApp() {
        if (!DriveMindScraperState.isOrderParsingEnabled()) return
        DriveMindScraperService.requestRescanIfForeground()
    }

    /**
     * Mirrors React Native AppState so overlay visibility stays in sync when the
     * Activity lifecycle and JS bridge disagree (e.g. permission sheets).
     */
    @ReactMethod
    fun notifyAppLifecycleState(state: String) {
        when (state) {
            "active" -> DriveMindOverlay.onAppForegrounded()
            "background" -> DriveMindOverlay.onAppBackgrounded(reactApplicationContext)
        }
    }

    /** Open a specific app by package name for fast switching. */
    @ReactMethod
    fun openAppByPackage(packageName: String, promise: Promise) {
        try {
            if (packageName.isBlank()) {
                promise.reject("E_PACKAGE", "packageName is required")
                return
            }
            val pm = reactApplicationContext.packageManager
            val intent = pm.getLaunchIntentForPackage(packageName)
            if (intent == null) {
                promise.reject("E_NOT_FOUND", "No launch intent for package: $packageName")
                return
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
            reactApplicationContext.startActivity(intent)
            DriveMindOverlay.onDriverAppLaunched(reactApplicationContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_OPEN_APP", e.message, e)
        }
    }

    /**
     * Shows the premium profitability card overlay.
     *
     * @param tierTitle        Localized tier label, e.g. "✅ Bardzo dobry".
     * @param primaryRateLine  Headline value, e.g. "4,20 zł/km".
     * @param formattedPrice   Gross fare line, e.g. "35,00 zł".
     * @param formattedMetrics ETA + distance row, e.g. "12 min · 3,2 km".
     * @param tierColorHex     Accent color for primary rate + Accept button.
     * @param packageName      Driver-app package for `Accept & Go` deep-launch.
     * @param contentHash      Stable hash JS uses to reconcile driverIngestStore.
     */
    @ReactMethod
    fun updateOverlayProfitability(
        tierTitle: String,
        primaryRateLine: String,
        formattedPrice: String,
        formattedMetrics: String,
        tierColorHex: String,
        packageName: String,
        contentHash: String,
    ) {
        if (!Settings.canDrawOverlays(reactApplicationContext)) return
        val title = tierTitle.trim()
        val primary = primaryRateLine.trim()
        val price = formattedPrice.trim()
        val metrics = formattedMetrics.trim()
        if (title.isEmpty() && primary.isEmpty() && price.isEmpty() && metrics.isEmpty()) return
        val color = try {
            android.graphics.Color.parseColor(tierColorHex.trim())
            tierColorHex.trim()
        } catch (_: Exception) {
            "#22C55E"
        }
        DriveMindOverlay.updateOverlayData(
            reactApplicationContext,
            OverlayProfitFields(
                tierTitle = title,
                primaryRateLine = primary,
                priceLine = price,
                metricsLine = metrics,
                accentColorHex = color,
                packageName = packageName.trim(),
                contentHash = contentHash.trim(),
            ),
            forceInvalidate = true,
        )
    }

    /** Localized "Online" label for the IDLE micro-pill. */
    @ReactMethod
    fun setOverlayRadarLabel(label: String) {
        DriveMindOverlay.idleLabel = label.ifBlank { "Online" }
    }

    /** Localized labels for the Accept & Dismiss buttons on the offer card. */
    @ReactMethod
    fun setOverlayButtonLabels(acceptLabel: String, dismissLabel: String) {
        DriveMindOverlay.acceptLabel = acceptLabel.ifBlank { "Accept & Go" }
        DriveMindOverlay.dismissLabel = dismissLabel.ifBlank { "Dismiss" }
    }

    private fun checkUsageAccessGranted(): Boolean {
        val ctx = reactApplicationContext
        val ops = ctx.getSystemService(AppOpsManager::class.java) ?: return false
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                ctx.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            ops.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                android.os.Process.myUid(),
                ctx.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun isNotificationListenerEnabled(ctx: ReactApplicationContext): Boolean =
        NotificationManagerCompat.getEnabledListenerPackages(ctx).contains(ctx.packageName)

    /**
     * Runtime check via [AccessibilityManager] — the authoritative source.
     *
     * Reading `Secure.ENABLED_ACCESSIBILITY_SERVICES` returns true even when
     * accessibility is globally disabled at the system level, which is why the
     * SystemConfiguration card was showing "Enabled" while the scraper service
     * was actually dead. We now ask the AccessibilityManager for the list of
     * *active* services and verify our component ID is present. Falls back to
     * the Settings string only if the manager service is unavailable.
     */
    private fun isAccessibilityServiceEnabled(ctx: ReactApplicationContext): Boolean {
        val componentName = "${ctx.packageName}/${DriveMindScraperService::class.java.name}"
        val flattened = "${ctx.packageName}/.${DriveMindScraperService::class.java.simpleName}"

        return try {
            val am = ctx.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            if (am != null) {
                if (!am.isEnabled) return false
                val active = am.getEnabledAccessibilityServiceList(
                    AccessibilityServiceInfo.FEEDBACK_ALL_MASK,
                )
                val hit = active.any { info ->
                    val id = info.id ?: ""
                    id.contains("DriveMindScraperService", ignoreCase = true) ||
                        id.equals(componentName, ignoreCase = true) ||
                        id.equals(flattened, ignoreCase = true)
                }
                if (hit) return true
            }
            // Fallback: Settings.Secure string (older devices / locked-down OEMs).
            val raw = Secure.getString(ctx.contentResolver, Secure.ENABLED_ACCESSIBILITY_SERVICES)
                ?: return false
            raw.contains("DriveMindScraperService", ignoreCase = true)
        } catch (e: Exception) {
            android.util.Log.e("DriveMindNative", "isAccessibilityServiceEnabled failed", e)
            false
        }
    }

    private fun isIgnoringBatteryOptimizations(ctx: ReactApplicationContext): Boolean {
        val pm = ctx.getSystemService(PowerManager::class.java) ?: return false
        return pm.isIgnoringBatteryOptimizations(ctx.packageName)
    }

    companion object {
        const val NAME = "DriveMindNative"
    }
}
