# DriveMind native services — keep for release minify (R8)
# Source of truth: merged into android/app/proguard-rules.pro by withDriveMindNative on prebuild.
#
# NOTE: android.enableMinifyInReleaseBuilds is currently set to FALSE by the config plugin
# (withDriveMindNative → patchGradleProperties).  These rules are kept comprehensive so the
# flag can be flipped to TRUE once all Expo-native reflection issues are validated.

# ── DriveMind package (all classes, fields, methods) ─────────────────────────
-keep class com.guessxx.drivemind.** { *; }
-keepclassmembers class com.guessxx.drivemind.** { *; }
-keepnames class com.guessxx.drivemind.**

# Individual critical services (belt-and-suspenders; covered by wildcard above)
-keep class com.guessxx.drivemind.DriveMindScraperService { *; }
-keep class com.guessxx.drivemind.DriveMindNotificationService { *; }
-keep class com.guessxx.drivemind.DriveMindNativeModule { *; }
-keep class com.guessxx.drivemind.DriveMindPackage { *; }
-keep class com.guessxx.drivemind.DriveMindOverlay { *; }
-keep class com.guessxx.drivemind.DriveMindReactBridge { *; }
-keep class com.guessxx.drivemind.DriveMindScraperState { *; }
-keep class com.guessxx.drivemind.MainActivity { *; }

# ── Android system service components ────────────────────────────────────────
-keep public class * extends android.accessibilityservice.AccessibilityService
-keep public class * extends android.app.Service
-keep public class * extends android.service.notification.NotificationListenerService

# ── React Native bridge reflection ───────────────────────────────────────────
# RN calls getNativeModule()/getPackages() reflectively; keep all ReactPackage impls.
-keep class * implements com.facebook.react.ReactPackage { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * extends com.facebook.react.bridge.ReactContextBaseJavaModule {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# ── Kotlin metadata (required for Kotlin reflection / coroutines) ─────────────
-keepattributes *Annotation*, Signature, InnerClasses, EnclosingMethod
-keep class kotlin.Metadata { *; }
-keep class kotlin.** { *; }
-dontwarn kotlin.**

# ── Overlay spring animation ──────────────────────────────────────────────────
-keep class androidx.dynamicanimation.** { *; }

# ── Firebase / Firestore (when R8 full mode is re-enabled) ───────────────────
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
