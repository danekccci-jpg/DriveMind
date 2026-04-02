import React, { useEffect, useRef } from 'react'
import { Animated } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native'
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
import { useTheme } from './src/theme/theme'
import RoleSelectionScreen from './src/screens/RoleSelection'
import OnboardingScreen from './src/screens/Onboarding'
import LanguageSelectionScreen from './src/screens/LanguageSelection'
import RootNavigator from './src/navigation/RootNavigator'
import { startLocationTracking, stopLocationTracking } from './src/services/locationTrackingService'
import i18n from './src/i18n'
import './src/i18n'

export default function App() {
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

  useEffect(() => {
    i18n.changeLanguage(language)
  }, [language])

  useEffect(() => {
    if (!onboardingComplete) return
    const syncLocationTask = () => {
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

  return (
    <SafeAreaProvider>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={c.tabBar} />
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <NavigationContainer theme={navTheme}>
          <RootNavigator />
        </NavigationContainer>
      </Animated.View>
    </SafeAreaProvider>
  )
}
