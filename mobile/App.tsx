import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, ActivityIndicator, View, Dimensions, DeviceEventEmitter } from 'react-native'
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
import { useDriverSessionStore } from './src/store/driverSessionStore'
import { useLanguageStore } from './src/store/languageStore'
import { useOrdersStore } from './src/store/ordersStore'
import { useAuthStore, isGuestEmail } from './src/store/authStore'
import { useTheme } from './src/theme/theme'
import { configureGoogleSignIn } from './src/services/googleAuth'
import { isFirebaseConfigured } from './src/config/firebase'
import {
  syncCurrentUserSubscription,
  waitForFirebaseAuthUser,
} from './src/services/firebaseAuth'
import LoginScreen from './src/screens/Login'
import OnboardingScreen from './src/screens/Onboarding'
import LanguageSelectionScreen from './src/screens/LanguageSelection'
import RootNavigator, { navigationRef } from './src/navigation/RootNavigator'
import PaywallScreen from './src/screens/PaywallScreen'
import { EVENT_OPEN_PAYWALL, syncOrderParsingGate } from './src/services/subscriptionGate'
import { DriverIngestToast } from './src/components/DriverIngestToast'
import { useDriverIngestBridge } from './src/services/driverIngestBridge'
import { startLocationTracking, stopLocationTracking } from './src/services/locationTrackingService'
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
  const isPaywallBlocked = useAuthStore((s) => s.isPaywallBlocked)
  const subscriptionLoaded = useAuthStore((s) => s.subscriptionLoaded)
  const setSubscription = useAuthStore((s) => s.setSubscription)
  const setSubscriptionLoaded = useAuthStore((s) => s.setSubscriptionLoaded)
  const needsNativeGoogleAuth = Platform.OS === 'android' || Platform.OS === 'ios'
  const [authHydrated, setAuthHydrated] = useState(!needsNativeGoogleAuth)
  const isGuest = isGuestEmail(userEmail)

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

  useEffect(() => {
    if (!onboardingComplete) return
    // Emergency switch: keep background TaskManager location tracking disabled
    // while investigating AppOps MONITOR_LOCATION crashes in release builds.
    const ENABLE_BACKGROUND_TRACKING = true
    const syncLocationTask = () => {
      if (!ENABLE_BACKGROUND_TRACKING) {
        void stopLocationTracking()
        return
      }
      const nav = useOrdersStore.getState().isNavigating
      const online = useDriverSessionStore.getState().isOnline
      if (nav || online) {
        void startLocationTracking()
      } else {
        void stopLocationTracking()
      }
    }
    syncLocationTask()
    const unsubOrders = useOrdersStore.subscribe(syncLocationTask)
    const unsubDriver = useDriverSessionStore.subscribe(syncLocationTask)
    return () => {
      unsubOrders()
      unsubDriver()
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

  useEffect(() => {
    if (!needsNativeGoogleAuth || !authHydrated || !isAuthenticated) return
    if (isGuest) {
      setSubscriptionLoaded(true)
      return
    }
    if (!isFirebaseConfigured()) {
      setSubscriptionLoaded(true)
      return
    }

    let cancelled = false
    void (async () => {
      setSubscriptionLoaded(false)
      try {
        await waitForFirebaseAuthUser()
        const synced = await syncCurrentUserSubscription()
        if (cancelled) return
        if (synced) {
          setSubscription({
            firebaseUid: synced.uid,
            completedOrdersCount: synced.userRecord.completedOrdersCount,
            isSubscribed: synced.userRecord.isSubscribed,
            trialEndsAt: synced.userRecord.trialEndsAt,
            paywallMode: synced.paywallMode,
            isPaywallBlocked: synced.paywallRequired,
            isSearchBlocked: synced.searchBlocked ?? false,
          })
          syncOrderParsingGate(synced.userRecord)
        } else {
          setSubscriptionLoaded(true)
        }
      } catch {
        if (!cancelled) setSubscriptionLoaded(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    needsNativeGoogleAuth,
    authHydrated,
    isAuthenticated,
    isGuest,
    setSubscription,
    setSubscriptionLoaded,
  ])

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

  if (needsNativeGoogleAuth && isAuthenticated && !isGuest && !subscriptionLoaded) {
    return (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
          <ActivityIndicator size="large" color={c.primary} />
        </View>
      </SafeAreaProvider>
    )
  }

  if (needsNativeGoogleAuth && isAuthenticated && !isGuest && isPaywallBlocked) {
    return (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <PaywallScreen />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.tabBar} />
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <MainAppWithDriverIngest navTheme={navTheme} />
      </Animated.View>
    </SafeAreaProvider>
  )
}

function MainAppWithDriverIngest({ navTheme }: { navTheme: Theme }) {
  useDriverIngestBridge(true)

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
      </NavigationContainer>
    </>
  )
}
