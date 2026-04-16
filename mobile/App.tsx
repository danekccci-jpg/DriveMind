import React, { useEffect, useRef, useState } from 'react'
import { Animated, Platform, ActivityIndicator, View } from 'react-native'
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

import { useRoleStore } from './src/store/roleStore'
import { useDriverSessionStore } from './src/store/driverSessionStore'
import { useLanguageStore } from './src/store/languageStore'
import { useOrdersStore } from './src/store/ordersStore'
import { useAuthStore } from './src/store/authStore'
import { useTheme } from './src/theme/theme'
import { configureGoogleSignIn } from './src/services/googleAuth'
import LoginScreen from './src/screens/Login'
import RoleSelectionScreen from './src/screens/RoleSelection'
import OnboardingScreen from './src/screens/Onboarding'
import LanguageSelectionScreen from './src/screens/LanguageSelection'
import RootNavigator from './src/navigation/RootNavigator'
import { DriverIngestToast } from './src/components/DriverIngestToast'
import { useDriverIngestBridge } from './src/services/driverIngestBridge'
import { startLocationTracking, stopLocationTracking } from './src/services/locationTrackingService'
import i18n from './src/i18n'
import './src/i18n'

export default function App() {
  const NUCLEAR_DISABLE_GOOGLE_NATIVE_CALLS = false
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  })

  const role = useRoleStore((s) => s.role)
  const onboardingComplete = useRoleStore((s) => s.onboardingComplete)
  const setRole = useRoleStore((s) => s.setRole)
  const language = useLanguageStore((s) => s.language)
  const hasChosenLanguage = useLanguageStore((s) => s.hasChosenLanguage)
  const { colors: c, isDark } = useTheme()

  const fadeAnim = useRef(new Animated.Value(0)).current
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated || s.isLoggedIn)
  const needsNativeGoogleAuth = Platform.OS === 'android' || Platform.OS === 'ios'
  const [authHydrated, setAuthHydrated] = useState(!needsNativeGoogleAuth)

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
    const ENABLE_BACKGROUND_TRACKING = false
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

  if (!fontsLoaded) return null

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

  if (!role) {
    return (
      <SafeAreaProvider>
        <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.bg} />
        <RoleSelectionScreen onSelect={setRole} />
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
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <MainAppWithDriverIngest navTheme={navTheme} />
      </Animated.View>
    </SafeAreaProvider>
  )
}

function MainAppWithDriverIngest({ navTheme }: { navTheme: Theme }) {
  useDriverIngestBridge(true)
  return (
    <>
      <DriverIngestToast />
      <NavigationContainer theme={navTheme}>
        <RootNavigator />
      </NavigationContainer>
    </>
  )
}
