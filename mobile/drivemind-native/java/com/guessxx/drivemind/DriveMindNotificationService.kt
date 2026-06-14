package com.guessxx.drivemind

import android.app.Notification
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import com.facebook.react.bridge.Arguments

/**
 * Listens for driver/delivery notifications from whitelisted posting apps.
 *
 * Ingest contract
 * ───────────────
 * Any notification the user sees in the shade from a whitelisted package
 * (com.ubercab.driver, com.bolt.driver, com.bolt.delivery, glovo, wolt, mocks)
 * is emitted to React Native for OrderHub — even when price/km/min are missing.
 * Overlay / profitability still require a strong layout downstream in JS.
 *
 * Thread contract
 * ───────────────
 * All access to sbn / notification / extras happens synchronously on the OS
 * binder thread at the very top of onNotificationPosted, before ANY deferred
 * work.  The mainHandler.post lambda receives ONLY pre-captured String/Long
 * primitives — it never touches any Parcel-backed object.
 */
class DriveMindNotificationService : NotificationListenerService() {

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "NotificationListener connected — DriveMind can read system notifications")
        // Notifications already sitting in the shade before the listener was enabled
        // do not fire onNotificationPosted — replay them now.
        try {
            val active = activeNotifications
            if (active == null || active.isEmpty()) {
                Log.d(TAG, "No active shade notifications to replay on connect")
                return
            }
            Log.i(TAG, "Replaying ${active.size} active shade notification(s) on connect")
            for (sbn in active) {
                dispatchPosted(sbn)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Replay on connect failed", e)
        }
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "NotificationListener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        dispatchPosted(sbn)
    }

    private fun dispatchPosted(sbn: StatusBarNotification?) {
        try {
            val notification = sbn?.notification ?: return
            val extras = notification.extras ?: return
            val rawPkg = sbn.packageName ?: ""
            val postTime = sbn.postTime

            val content = extractNotificationContent(extras)
            processWhitelistedNotification(rawPkg, postTime, content)
        } catch (e: Exception) {
            Log.e(TAG, "Shielded crash in dispatchPosted", e)
        }
    }

    /**
     * Pull every text surface Android might use so InboxStyle / BigText / sub-text
     * layouts still route when EXTRA_TITLE / EXTRA_TEXT are empty.
     */
    private fun extractNotificationContent(extras: Bundle): NotificationBrandRouter.NotificationContent {
        fun extractString(key: String): String =
            (extras.getString(key)
                ?: extras.getCharSequence(key)?.toString()
                ?: "").trim()

        val title = extractString(Notification.EXTRA_TITLE)
            .ifBlank { extractString("android.title") }
        val text = extractString(Notification.EXTRA_TEXT)
            .ifBlank { extractString("android.text") }
        val bigText = extractString(Notification.EXTRA_BIG_TEXT)
            .ifBlank { extractString("android.bigText") }
        val subText = extractString(Notification.EXTRA_SUB_TEXT)
        val infoText = extractString(Notification.EXTRA_INFO_TEXT)
        val summaryText = extractString("android.summaryText")

        val lineParts = mutableListOf<String>()
        extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { seq ->
            val line = seq?.toString()?.trim().orEmpty()
            if (line.isNotEmpty()) lineParts.add(line)
        }
        extras.getCharSequenceArray("android.messages")?.forEach { seq ->
            val line = seq?.toString()?.trim().orEmpty()
            if (line.isNotEmpty()) lineParts.add(line)
        }

        val mergedBigText = when {
            bigText.isNotBlank() -> bigText
            lineParts.isNotEmpty() -> lineParts.joinToString("\n")
            else -> ""
        }

        val allParts = listOf(title, text, mergedBigText, subText, infoText, summaryText) + lineParts
        val fullContentLower = allParts.filter { it.isNotBlank() }.joinToString(" ").lowercase()

        return NotificationBrandRouter.NotificationContent(
            title = title.ifBlank { lineParts.firstOrNull().orEmpty() },
            text = text.ifBlank { subText }.ifBlank { infoText },
            bigText = mergedBigText,
            fullContentLower = fullContentLower,
        )
    }

    private fun processWhitelistedNotification(
        rawPkg: String,
        postTime: Long,
        content: NotificationBrandRouter.NotificationContent,
    ) {
        val rawTitle = content.title
        val rawText = content.text
        val rawBigText = content.bigText

        Log.d(
            TAG,
            "onNotificationPosted pkg=$rawPkg " +
                "title=${rawTitle.take(60)} text=${rawText.take(80)}",
        )

        val route = NotificationBrandRouter.resolveRoute(rawPkg, content)
        if (route == null) {
            Log.d(
                TAG,
                "Skipped — not on whitelist: pkg=$rawPkg " +
                    "content=${content.fullContentLower.take(120)}",
            )
            return
        }

        val routedPackage = route.canonicalPackage
        val blob = listOf(rawTitle, rawText, rawBigText)
            .filter { it.isNotBlank() }.joinToString("\n")
        val layoutValid = OrderLayoutValidator.isValidOrderBlob(blob)
        if (!layoutValid) {
            Log.d(
                TAG,
                "Whitelist matched, layout weak — still emitting for OrderHub: $blob",
            )
        }

        Log.d(
            TAG,
            "Interceptors caught push. pkg=$rawPkg routed=$routedPackage brand=${route.brand} " +
                "title=$rawTitle text=$rawText",
        )

        val fields = NotificationOrderExtractor.parse(rawTitle, rawText, rawBigText)

        DriveMindScraperState.extendScanWindow(10_000L)
        NotificationBufferPrefs.appendDiagnostic(
            applicationContext, rawTitle, rawText, postTime, routedPackage,
        )

        val priceSnapshot = fields.price.takeIf { it.isNotBlank() } ?: "0"
        val distanceSnapshot = fields.distanceKm.takeIf { it.isNotBlank() } ?: "0"
        val etaSnapshot = fields.etaMin.takeIf { it.isNotBlank() } ?: "0"
        val pickupSnapshot = fields.pickup.takeIf { it.isNotBlank() } ?: "Unknown"
        val dropoffSnapshot = fields.dropoff.takeIf { it.isNotBlank() } ?: "Unknown"
        val brandKey = route.brand
        val brandLabel = when (brandKey) {
            "uber" -> "Uber"
            "bolt" -> "Bolt"
            "bolt_food" -> "Bolt Food"
            "glovo" -> "Glovo"
            "wolt" -> "Wolt"
            else -> brandKey.replaceFirstChar { c ->
                if (c.isLowerCase()) c.titlecase() else c.toString()
            }
        }

        Log.e(
            TAG,
            "Route success: Brand=$brandLabel, Price=$priceSnapshot, " +
                "DistanceKm=$distanceSnapshot, EtaMin=$etaSnapshot",
        )

        mainHandler.post {
            try {
                val map = Arguments.createMap()
                map.putString("title", rawTitle)
                map.putString("text", if (rawText.isNotBlank()) rawText else rawBigText)
                map.putDouble("timestamp", postTime.toDouble())
                map.putString("packageName", routedPackage)
                map.putString("sourcePackage", rawPkg)
                map.putString("brand", brandKey)
                map.putString("price", priceSnapshot)
                map.putString("distanceKm", distanceSnapshot)
                map.putString("etaMin", etaSnapshot)
                map.putString("pickup", pickupSnapshot)
                map.putString("dropoff", dropoffSnapshot)
                val delivered = DriveMindReactBridge.tryEmitImmediate(EVENT_NOTIFICATION, map)
                if (!delivered) {
                    Log.w(TAG, "RN bridge inactive — buffering notification for foreground sync")
                    NotificationBufferPrefs.append(
                        applicationContext,
                        rawTitle,
                        if (rawText.isNotBlank()) rawText else rawBigText,
                        postTime,
                        routedPackage,
                        rawPkg,
                    )
                }
            } catch (inner: Exception) {
                Log.e(TAG, "Error building RN map", inner)
            }
        }

        DriveMindSound.playSoftClick(applicationContext)
    }

    companion object {
        private const val TAG = "DriveMindScraper"

        const val PACKAGE_UBER = NotificationBrandRouter.PACKAGE_UBER
        const val PACKAGE_BOLT = NotificationBrandRouter.PACKAGE_BOLT
        const val PACKAGE_BOLT_MTAKSO = NotificationBrandRouter.PACKAGE_BOLT_MTAKSO
        const val PACKAGE_BOLT_FOOD = NotificationBrandRouter.PACKAGE_BOLT_FOOD
        const val EVENT_NOTIFICATION = "DriveMindNotification"

        /** @deprecated Use [NotificationBrandRouter.PRODUCTION_PACKAGES]; kept for scraper refs. */
        val ALLOWED_PACKAGES: Set<String> = NotificationBrandRouter.PRODUCTION_PACKAGES
    }
}
