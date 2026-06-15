import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, ActivityIndicator, View, Dimensions, DeviceEventEmitter, AppState } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, DefaultTheme, DarkTheme, type Theme } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins'

import Logo from './src/components/common/Logo'
import { SPLASH_NAVY } from './src/theme/logoAssets'

import { useRoleStore } from './src/store/roleStore'
import { useLanguageStore } from './src/store/languageStore'
import { useOrdersStore } from './src/store/ordersStore'
import { useAuthStore, isGuestEmail } from './src/store/authStore'
import { useTheme } from './src/theme/theme'
import { configureGoogleSignIn } from './src/services/googleAuth'
import { isFirebaseConfigured } from './src/config/firebase'
import { getOrCreateDeviceFingerprint } from './src/services/deviceFingerprint'
import { syncGuestOrderCountFromRemote, GUEST_ORDER_THRESHOLD } from './src/services/userFirestoreService'
import LoginScreen from './src/screens/Login'
import OnboardingScreen from './src/screens/Onboarding'
import LanguageSelectionScreen from './src/screens/LanguageSelection'
import RootNavigator, { navigationRef } from './src/navigation/RootNavigator'
import PaywallScreen from './src/screens/PaywallScreen'
import { EVENT_OPEN_PAYWALL } from './src/services/subscriptionGate'
import { SubscriptionProvider, useSubscription } from './src/context/SubscriptionContext'
import { DriverIngestToast } from './src/components/DriverIngestToast'
import { AccessibilityDisclosureHost } from './src/components/AccessibilityDisclosureHost'
import { useDriverIngestBridge } from './src/services/driverIngestBridge'
import { runPermissionColdStartAfterHydration } from './src/services/permissionColdStart'
import { startLocationTracking, stopLocationTracking } from './src/services/locationTrackingService'
import {
  checkPermissionsStatus,
  onReturnedFromSystemSettings,
} from './src/services/permissionManager'
import i18n from './src/i18n'
import './src/i18n'

const SPLASH_HOLD_MS = 720

export default function App() {
  const NUCLEAR_DISABLE_GOOGLE_NATIVE_CALLS = false
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  })
  const [splashHoldDone, setSplashHoldDone] = useState(false)

  const onboardingComplete = useRoleStore((s) => s.onboardingComplete)
  const language = useLanguageStore((s) => s.language)
  const hasChosenLanguage = useLanguageStore((s) => s.hasChosenLanguage)
  const { colors: c, isDark } = useTheme()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated || s.isLoggedIn)
  const userEmail = useAuthStore((s) => s.userEmail)
  const guestOrderCount = useAuthStore((s) => s.guestOrderCount)
  const needsNativeGoogleAuth = Platform.OS === 'android' || Platform.OS === 'ios'
  const [authHydrated, setAuthHydrated] = useState(!needsNativeGoogleAuth)
  const isGuest = isGuestEmail(userEmail)
  const isGuestBlocked = isGuest && guestOrderCount >= GUEST_ORDER_THRESHOLD

  useEffect(() => {
    if (!NUCLEAR_DISABLE_GOOGLE_NATIVE_CALLS && needsNativeGoogleAuth) {
      configureGoogleSignIn()
      const p = useAuthStore.persist.rehydrate?.()
      if (p && typeof (p as Promise<void>).finally === 'function') {
        void (p as Promise<void>).finally(() => setAuthHydrated(true))
      } else {
        setAuthHydrated(true)
      }
    } else {
      setAuthHydrated(true)
    }
  }, [needsNativeGoogleAuth, NUCLEAR_DISABLE_GOOGLE_NATIVE_CALLS])

  useEffect(() => {
    i18n.changeLanguage(language)
  }, [language])

  // Startup: audit permissions only — never auto-request or open Settings.
  useEffect(() => {
    void checkPermissionsStatus()
  }, [])

  // Returning from Settings: re-check status only — never auto-open Settings.
  const appStateRef = useRef(AppState.currentState)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current
      if (prev.match(/inactive|background/) && next === 'active') {
        onReturnedFromSystemSettings()
        void checkPermissionsStatus()
      }
      appStateRef.current = next
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (!onboardingComplete) return
    // Emergency switch: keep background TaskManager location tracking disabled
    // while investigating AppOps MONITOR_LOCATION crashes in release builds.
    const ENABLE_BACKGROUND_TRACKING = true
    let lastShouldTrack: boolean | null = null
    const syncLocationTask = () => {
      if (!ENABLE_BACKGROUND_TRACKING) {
        if (lastShouldTrack !== false) {
          lastShouldTrack = false
          void stopLocationTracking()
        }
        return
      }
      const nav = useOrdersStore.getState().isNavigating
      const inBackground = AppState.currentState !== 'active'
      // FGS only when navigating in background — avoids AppOps MONITOR_LOCATION crash on app switch.
      const shouldTrack = nav && inBackground
      if (shouldTrack === lastShouldTrack) return
      lastShouldTrack = shouldTrack
      if (shouldTrack) {
        void startLocationTracking()
      } else {
        void stopLocationTracking()
      }
    }
    syncLocationTask()
    const unsubOrders = useOrdersStore.subscribe((state, prev) => {
      if (state.isNavigating !== prev.isNavigating) syncLocationTask()
    })
    const appSub = AppState.addEventListener('change', syncLocationTask)
    return () => {
      unsubOrders()
      appSub.remove()
    }
  }, [onboardingComplete])

  useEffect(() => {
    if (onboardingComplete) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }).start()
    }
  }, [onboardingComplete])

  useEffect(() => {
    if (!fontsLoaded) return
    const id = setTimeout(() => setSplashHoldDone(true), SPLASH_HOLD_MS)
    return () => clearTimeout(id)
  }, [fontsLoaded])

  // ── Device fingerprint initialisation ─────────────────────────────────────
  // Runs once on mount. Stores the UUID in authStore (persisted), then syncs
  // the guest order count from Firestore so reinstalls don't reset the trial.
  useEffect(() => {
    void (async () => {
      const fp = await getOrCreateDeviceFingerprint()
      const store = useAuthStore.getState()
      if (store.deviceFingerprint !== fp) {
        store.setDeviceFingerprint(fp)
      }
      // If the user is currently a guest, sync their remote order count to catch
      // devices that cleared AsyncStorage (the SecureStore UUID survived, so the
      // Firestore record still has the true count).
      if (isGuestEmail(store.userEmail)) {
        await syncGuestOrderCountFromRemote()
      }
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!fontsLoaded || !splashHoldDone) {
    const splashW = Dimensions.get('window').width - 40
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View
          style={{
            flex: 1,
            backgroundColor: SPLASH_NAVY,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
        >
          {fontsLoaded ? (
            <Logo theme="dark" variant="full" size="large" maxWidth={splashW} />
          ) : (
            <ActivityIndicator color="#FFFFFF" size="large" />
          )}
        </View>
      </SafeAreaProvider>
    )
  }

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: c.tabBar,
      card: c.tabBar,
      text: c.text,
      border: c.tabBarBorder,
      primary: c.primary,
      notification: c.primary,
    },
  }

  if (!hasChosenLanguage) {
    return (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <LanguageSelectionScreen />
      </SafeAreaProvider>
    )
  }

  if (!onboardingComplete) {
    return (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <OnboardingScreen />
      </SafeAreaProvider>
    )
  }

  // Show spinner until the Zustand/AsyncStorage auth state has been rehydrated.
  // This guard must come BEFORE the authenticated render path so we never mount
  // the main navigator on stale pre-hydration state.
  if (needsNativeGoogleAuth && !authHydrated) {
    return (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </SafeAreaProvider>
    )
  }

  if (needsNativeGoogleAuth && !isAuthenticated) {
    return (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <LoginScreen />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.tabBar} />
      <SubscriptionProvider>
        <AuthenticatedAppShell
          navTheme={navTheme}
          fadeAnim={fadeAnim}
          needsNativeGoogleAuth={needsNativeGoogleAuth}
          isAuthenticated={isAuthenticated}
          isGuest={isGuest}
          isGuestBlocked={isGuestBlocked}
        />
      </SubscriptionProvider>
    </SafeAreaProvider>
  )
}

type AuthenticatedAppShellProps = {
  navTheme: Theme
  fadeAnim: Animated.Value
  needsNativeGoogleAuth: boolean
  isAuthenticated: boolean
  isGuest: boolean
  isGuestBlocked: boolean
}

function AuthenticatedAppShell({
  navTheme,
  fadeAnim,
  needsNativeGoogleAuth,
  isAuthenticated,
  isGuest,
  isGuestBlocked,
}: AuthenticatedAppShellProps) {
  const { colors: c } = useTheme()
  const { isLoading, hasAppAccess } = useSubscription()
  const firebaseEnabled = isFirebaseConfigured()

  if (
    needsNativeGoogleAuth &&
    isAuthenticated &&
    !isGuest &&
    firebaseEnabled &&
    isLoading
  ) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    )
  }

  const blocked =
    (needsNativeGoogleAuth && isAuthenticated && !isGuest && firebaseEnabled && !hasAppAccess) ||
    isGuestBlocked

  if (blocked) {
    return (
      <>
        <StatusBar style="light" backgroundColor="#121212" />
        <PaywallScreen />
      </>
    )
  }

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <MainAppWithDriverIngest navTheme={navTheme} />
    </Animated.View>
  )
}

function MainAppWithDriverIngest({ navTheme }: { navTheme: Theme }) {
  useDriverIngestBridge(true)

  useEffect(() => {
    runPermissionColdStartAfterHydration()
  }, [])

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(EVENT_OPEN_PAYWALL, () => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('Paywall' as never)
      }
    })
    return () => sub.remove()
  }, [])

  return (
    <>
      <DriverIngestToast />
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <RootNavigator />
        <AccessibilityDisclosureHost />
      </NavigationContainer>
    </>
  )
}
