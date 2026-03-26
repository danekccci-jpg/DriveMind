import React, { useEffect } from 'react'
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
import { useThemeStore } from './src/store/themeStore'
import OnboardingScreen from './src/screens/Onboarding'
import AppTabs from './src/navigation/AppTabs'
import './src/i18n'

const NAV_DARK_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#000000',
    card: '#000000',
    text: '#FFFFFF',
    border: '#1A1A1A',
    primary: '#FFFFFF',
    notification: '#FFFFFF',
  },
}

const NAV_LIGHT_THEME = {
  ...DefaultTheme,
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  })

  const onboardingComplete = useRoleStore((s) => s.onboardingComplete)
  const theme = useThemeStore((s) => s.theme)

  if (!fontsLoaded) return null

  if (!onboardingComplete) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" backgroundColor="#000000" />
        <OnboardingScreen />
      </SafeAreaProvider>
    )
  }

  return (
    <SafeAreaProvider>
      <StatusBar
        style={theme === 'dark' ? 'light' : 'dark'}
        backgroundColor="#000000"
      />
      <NavigationContainer theme={theme === 'dark' ? NAV_DARK_THEME : NAV_LIGHT_THEME}>
        <AppTabs />
      </NavigationContainer>
    </SafeAreaProvider>
  )
}
