import React from 'react'
import { createStackNavigator, CardStyleInterpolators } from '@react-navigation/stack'
import { useTranslation } from 'react-i18next'
import AppTabs from './AppTabs'
import NotificationsScreen from '../screens/Notifications'
import NavigationSettingsScreen from '../screens/NavigationSettings'
import PermissionsScreen from '../screens/Settings/PermissionsScreen'

const Stack = createStackNavigator()

export default function RootNavigator() {
  const { t } = useTranslation()
  const fadeThroughInterpolator = CardStyleInterpolators.forFadeFromBottomAndroid
  return (
    <Stack.Navigator
      screenOptions={{
        cardStyleInterpolator: (props: any) => {
          const fade = fadeThroughInterpolator(props)
          const { current } = props
          return {
            cardStyle: {
              ...fade.cardStyle,
              opacity: current.progress,
              transform: [
                {
                  scale: current.progress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.98, 1],
                  }),
                },
              ],
            },
          }
        },
      }}
    >
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
      <Stack.Screen
        name="Permissions"
        component={PermissionsScreen}
        options={{ title: t('perm_screen_title') }}
      />
    </Stack.Navigator>
  )
}
