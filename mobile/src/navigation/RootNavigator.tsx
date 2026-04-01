import React from 'react'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { useTranslation } from 'react-i18next'
import AppTabs from './AppTabs'
import NotificationsScreen from '../screens/Notifications'
import NavigationSettingsScreen from '../screens/NavigationSettings'

const Stack = createNativeStackNavigator()

export default function RootNavigator() {
  const { t } = useTranslation()
  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={AppTabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: t('notification_prefs') }}
      />
      <Stack.Screen
        name="NavigationSettings"
        component={NavigationSettingsScreen}
        options={{ title: t('nav_settings_title') }}
      />
    </Stack.Navigator>
  )
}
