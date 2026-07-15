# =============================================================================
# DriveMind – ProGuard / R8 Keep Rules (stable + Play-optimized)
# =============================================================================
# Strategy:
#   - minifyEnabled + proguard-android-optimize.txt  → bytecode optimization
#   - R8 standard mode (fullMode=false)              → safe for RN reflection
#   - Comprehensive keeps for JNI / bridge / services
#   - No class repackaging directive          → breaks manifest + JNI lookups
#
# Copied to android/app/proguard-rules.pro by withDriveMindNative on prebuild.
# =============================================================================

# R8 metadata for reflection / Kotlin / Firebase
-keepattributes Signature, InnerClasses, EnclosingMethod,
    RuntimeVisibleAnnotations, RuntimeInvisibleAnnotations, AnnotationDefault,
    *Annotation*, Exceptions, SourceFile, LineNumberTable

# Full-mode-safe: preserve no-args constructors on reflection-accessed classes
-keepclassmembers class * {
    public <init>();
}


# ---------------------------------------------------------------------------
# React Native (official ReactAndroid/proguard-rules.pro)
# ---------------------------------------------------------------------------
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keep @com.facebook.proguard.annotations.DoNotStripAny class * { *; }

-keep @com.facebook.jni.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.jni.annotations.DoNotStrip *;
}
-keep @com.facebook.jni.annotations.DoNotStripAny class * { *; }

-keep class * implements com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * implements com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class * { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

-dontwarn com.facebook.react.**
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }
-keep,includedescriptorclasses class com.facebook.react.turbomodule.core.** { *; }
-keep,includedescriptorclasses class com.facebook.react.internal.turbomodule.core.** { *; }
-keep class com.facebook.react.** { *; }

-keepclassmembers class * {
    @com.facebook.react.bridge.ReactMethod *;
}
-keep public class * implements com.facebook.react.ReactPackage { *; }
-keep public class * implements com.facebook.react.bridge.NativeModule { *; }

# Hermes JNI
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }


# ---------------------------------------------------------------------------
# Expo Modules Core (consumer rules + safety net)
# ---------------------------------------------------------------------------
-keep class expo.modules.** { *; }
-keep @expo.modules.core.interfaces.DoNotStrip class *
-keepclassmembers class * {
  @expo.modules.core.interfaces.DoNotStrip *;
}
-keep class * implements expo.modules.kotlin.records.Record { *; }
-keep class * extends expo.modules.kotlin.sharedobjects.SharedObject
-keep enum * implements expo.modules.kotlin.types.Enumerable { *; }
-keepnames class kotlin.Pair
-keep,allowoptimization,allowobfuscation class * extends expo.modules.kotlin.modules.Module {
  public <init>();
  public expo.modules.kotlin.modules.ModuleDefinitionData definition();
}
-keepclassmembers class * implements expo.modules.kotlin.views.ExpoView {
  public <init>(android.content.Context);
  public <init>(android.content.Context, expo.modules.kotlin.AppContext);
}
-keep interface expo.modules.kotlin.services.Service
-keep class * implements expo.modules.kotlin.services.Service { <init>(...); }

# Expo TaskManager (background tasks)
-keep class expo.modules.taskManager.** { *; }

# expo-av: optional KeepAwakeManager removed in SDK 55
-dontwarn expo.modules.core.interfaces.services.KeepAwakeManager


# ---------------------------------------------------------------------------
# Software Mansion (Reanimated, Worklets, Gesture Handler, Screens)
# ---------------------------------------------------------------------------
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }


# ---------------------------------------------------------------------------
# Other native modules
# ---------------------------------------------------------------------------
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.horcrux.svg.** { *; }
-keep class com.reactnativecommunity.asyncstorage.** { *; }
-keep class com.reactnativecommunity.netinfo.** { *; }
-keep class com.reactnativecommunity.rnpermissions.** { *; }
-keep class com.reactnativegooglesignin.** { *; }
-keep class com.dooboolab.rniap.** { *; }
-keep class com.iaptic.** { *; }
-keep class com.mkuczera.** { *; }
-keep class com.google.android.gms.maps.** { *; }


# ---------------------------------------------------------------------------
# Firebase / Google Play Services
# ---------------------------------------------------------------------------
-keep class com.google.firebase.** { *; }
-dontwarn com.google.android.gms.**


# ---------------------------------------------------------------------------
# DriveMind app — manifest-registered components (names must survive R8)
# ---------------------------------------------------------------------------
-keep class com.guessxx.drivemind.MainActivity { *; }
-keep class com.guessxx.drivemind.MainApplication { *; }
-keep class com.guessxx.drivemind.DriveMindScraperService { *; }
-keep class com.guessxx.drivemind.DriveMindNotificationService { *; }
-keep class com.guessxx.drivemind.DriveMindNativeModule { *; }
-keep class com.guessxx.drivemind.DriveMindPackage { *; }
-keep class com.guessxx.drivemind.** { *; }


# ---------------------------------------------------------------------------
# OkHttp / Okio
# ---------------------------------------------------------------------------
-dontwarn okhttp3.**
-dontwarn okio.**


# ---------------------------------------------------------------------------
# Android / Java standard keeps
# ---------------------------------------------------------------------------
-keepclassmembers class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator CREATOR;
}
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Fresco (React Native images)
-keep public class com.facebook.imageutils.** { public *; }

# Yoga layout engine
-keep,allowobfuscation @interface com.facebook.yoga.annotations.DoNotStrip
-keep @com.facebook.yoga.annotations.DoNotStrip class *
-keepclassmembers class * { @com.facebook.yoga.annotations.DoNotStrip *; }
