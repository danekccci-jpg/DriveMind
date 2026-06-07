package com.guessxx.drivemind

import android.app.Notification
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.facebook.react.bridge.Arguments

/**
 * Listens for Uber Driver / Bolt Driver notifications. Buffers to SharedPreferences
 * when offline; emits to JS when online. Also extends the scraper window on each post.
 */
class DriveMindNotificationService : NotificationListenerService() {

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (!DriveMindScraperState.isOrderParsingEnabled()) return
    val pkg = sbn.packageName ?: return
    if (pkg !in ALLOWED_PACKAGES) return

    val extras = sbn.notification.extras
    val title = listOfNotNull(
      extras?.getCharSequence(Notification.EXTRA_TITLE),
      extras?.getCharSequence("android.title"),
    ).firstOrNull()?.toString() ?: ""

    val text = listOfNotNull(
      extras?.getCharSequence(Notification.EXTRA_TEXT),
      extras?.getCharSequence(Notification.EXTRA_BIG_TEXT),
      extras?.getCharSequence("android.text"),
    ).firstOrNull()?.toString() ?: ""

    val blob = listOf(title, text).filter { it.isNotBlank() }.joinToString("\n")
    if (!OrderLayoutValidator.isValidOrderBlob(blob)) return

    val timestamp = sbn.postTime
    DriveMindScraperState.extendScanWindow(10_000L)
    NotificationBufferPrefs.appendDiagnostic(applicationContext, title, text, timestamp, pkg)

    if (isNetworkAvailable()) {
      emitNotification(title, text, timestamp, pkg)
      DriveMindSound.playSoftClick(applicationContext)
    } else {
      NotificationBufferPrefs.append(applicationContext, title, text, timestamp, pkg)
    }
  }

  private fun isNetworkAvailable(): Boolean {
    val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
    val network = cm.activeNetwork ?: return false
    val caps = cm.getNetworkCapabilities(network) ?: return false
    return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
  }

  private fun emitNotification(title: String, text: String, timestamp: Long, packageName: String) {
    val map = Arguments.createMap()
    map.putString("title", title)
    map.putString("text", text)
    map.putDouble("timestamp", timestamp.toDouble())
    map.putString("packageName", packageName)
    DriveMindReactBridge.emit(EVENT_NOTIFICATION, map)
  }

  companion object {
    const val PACKAGE_UBER = "com.ubercab.driver"
    const val PACKAGE_BOLT = "com.bolt.driver"
    const val PACKAGE_BOLT_FOOD = "com.bolt.delivery"
    const val EVENT_NOTIFICATION = "DriveMindNotification"

    /** Hard drop anything else — no buffer, no diagnostic, no emit. */
    val ALLOWED_PACKAGES: Set<String> = setOf(
      PACKAGE_UBER,
      PACKAGE_BOLT,
      PACKAGE_BOLT_FOOD,
    )
  }
}
