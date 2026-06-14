package com.guessxx.drivemind

import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.ConcurrentHashMap

/**
 * Holds the React context so NotificationListenerService / AccessibilityService
 * can emit events without holding a stale Activity reference.
 *
 * High-frequency events are debounced (~250 ms) so micro UI-tree changes do not
 * flood the RN bridge.
 */
object DriveMindReactBridge {
  private const val EMIT_DEBOUNCE_MS = 250L

  @Volatile
  var reactContext: ReactApplicationContext? = null

  private val mainHandler = Handler(Looper.getMainLooper())
  private val pendingPayloads = ConcurrentHashMap<String, WritableMap?>()
  private val flushRunnables = ConcurrentHashMap<String, Runnable>()

  /** Debounced emit — coalesces bursts; only the latest payload per event name is delivered. */
  fun emit(eventName: String, params: WritableMap?, debounceMs: Long = EMIT_DEBOUNCE_MS) {
    pendingPayloads[eventName] = params
    flushRunnables[eventName]?.let { mainHandler.removeCallbacks(it) }
    val runnable = Runnable {
      flushRunnables.remove(eventName)
      val payload = pendingPayloads.remove(eventName)
      emitImmediate(eventName, payload)
    }
    flushRunnables[eventName] = runnable
    mainHandler.postDelayed(runnable, debounceMs)
  }

  /** @return true when the event was delivered to JS. */
  fun tryEmitImmediate(eventName: String, params: WritableMap?): Boolean {
    val ctx = reactContext
    if (ctx == null) {
      android.util.Log.w(TAG, "emitImmediate($eventName) dropped — reactContext is null (RN bridge not wired)")
      return false
    }
    if (!ctx.hasActiveReactInstance()) {
      android.util.Log.w(TAG, "emitImmediate($eventName) dropped — no active React instance")
      return false
    }
    return try {
      ctx
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(eventName, params)
      true
    } catch (e: Throwable) {
      android.util.Log.e(TAG, "emitImmediate($eventName) failed", e)
      false
    }
  }

  /** Low-latency path for user-initiated actions (paywall tap, etc.). */
  fun emitImmediate(eventName: String, params: WritableMap?) {
    tryEmitImmediate(eventName, params)
  }

  fun emitMap(eventName: String, debounceMs: Long = EMIT_DEBOUNCE_MS, builder: (WritableMap) -> Unit) {
    val map = Arguments.createMap()
    builder(map)
    emit(eventName, map, debounceMs)
  }

  fun emitMapImmediate(eventName: String, builder: (WritableMap) -> Unit) {
    val map = Arguments.createMap()
    builder(map)
    emitImmediate(eventName, map)
  }

  private const val TAG = "DriveMindBridge"
}
