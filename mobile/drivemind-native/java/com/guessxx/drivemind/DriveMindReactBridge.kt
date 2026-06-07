package com.guessxx.drivemind

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Holds the React context so NotificationListenerService / AccessibilityService
 * can emit events without holding a stale Activity reference.
 */
object DriveMindReactBridge {
  @Volatile
  var reactContext: ReactApplicationContext? = null

  fun emit(eventName: String, params: WritableMap?) {
    val ctx = reactContext ?: return
    if (!ctx.hasActiveReactInstance()) return
    ctx
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, params)
  }

  fun emitMap(eventName: String, builder: (WritableMap) -> Unit) {
    val map = Arguments.createMap()
    builder(map)
    emit(eventName, map)
  }
}
