package com.guessxx.drivemind

import android.app.Application
import android.content.res.Configuration
import android.util.Log

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.google.android.gms.maps.MapsInitializer
import com.google.android.gms.maps.MapsInitializer.Renderer

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ExpoReactHostFactory

/**
 * Process entry point.
 *
 * Every native subsystem we touch here is wrapped in its own try/catch so that
 * a single bad component (Maps renderer flag, package autolinking, location
 * tracking, accessibility wiring) cannot cascade into a process-level crash
 * that takes down the React Native bridge — which would silently disable the
 * GPS blue-dot, notification ingest AND the JS event emitter all at once.
 */
class MainApplication : Application(), ReactApplication {

    override val reactHost: ReactHost by lazy {
        ExpoReactHostFactory.getDefaultReactHost(
            context = applicationContext,
            packageList = safeAutolinkedPackages(),
        )
    }

    private fun safeAutolinkedPackages(): List<ReactPackage> {
        val packages = mutableListOf<ReactPackage>()
        try {
            packages.addAll(PackageList(this).packages)
        } catch (e: Throwable) {
            Log.e(TAG, "PackageList autolink failed — RN modules degraded", e)
        }
        try {
            packages.add(DriveMindPackage())
        } catch (e: Throwable) {
            Log.e(TAG, "DriveMindPackage registration failed", e)
        }
        return packages
    }

    override fun onCreate() {
        super.onCreate()

        // ── Google Maps renderer ─────────────────────────────────────────────
        // LEGACY is required for customMapStyle JSON to apply on Android (LATEST
        // ignores it). Wrapped so a Play Services mismatch doesn't kill the app.
        try {
            MapsInitializer.initialize(this, Renderer.LEGACY, null)
        } catch (e: Throwable) {
            Log.e(TAG, "MapsInitializer failed — map UI may degrade", e)
        }

        // ── React Native release level ──────────────────────────────────────
        try {
            DefaultNewArchitectureEntryPoint.releaseLevel = try {
                ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
            } catch (e: IllegalArgumentException) {
                ReleaseLevel.STABLE
            }
        } catch (e: Throwable) {
            Log.e(TAG, "ReleaseLevel resolve failed", e)
        }

        // ── React Native runtime — CRITICAL, no catch around loadReactNative.
        // If this fails, the app is dead anyway; let it crash so Crashlytics
        // captures the root cause instead of leaving a half-initialized JVM.
        loadReactNative(this)

        try {
            ApplicationLifecycleDispatcher.onApplicationCreate(this)
        } catch (e: Throwable) {
            Log.e(TAG, "Expo lifecycle dispatcher failed on create", e)
        }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        try {
            ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
        } catch (e: Throwable) {
            Log.e(TAG, "Expo lifecycle dispatcher failed on config change", e)
        }
    }

    companion object {
        private const val TAG = "DriveMindApp"
    }
}
