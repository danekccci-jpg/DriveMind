import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import DashboardScreen from '../screens/Dashboard'
import OrderHubScreen from '../screens/OrderHub'
import ShiftModeScreen from '../screens/ShiftMode'
import EarningsScreen from '../screens/Earnings'
import ProfileScreen from '../screens/Profile'
import { useColors } from '../theme/theme'
import { useDriverIngestStore, selectAvailableIngestCount } from '../store/driverIngestStore'

const Tab = createBottomTabNavigator()

export default function AppTabs() {
  const { t } = useTranslation()
  const c = useColors()
  const insets = useSafeAreaInsets()
  const ordersBadge = useDriverIngestStore(selectAvailableIngestCount)

  return (
    <Tab.Navigator
      screenListeners={{
        tabPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        },
      }}
      screenOptions={{
        headerShown: false,
        // Icons only — hide the text label on every tab
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.tabBarBorder,
          borderTopWidth: 0.5,
          // Fixed content height above the safe-area inset so the bar adapts
          // to gesture bars, home indicators and Android edge-to-edge mode
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom,
        },
        // Vertically center the icon inside each tab button
        tabBarIconStyle: {
          marginTop: 'auto',
          marginBottom: 'auto',
        },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarAccessibilityLabel: t('ride'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="navigation" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OrderHub"
        component={OrderHubScreen}
        options={{
          tabBarAccessibilityLabel: t('orders'),
          tabBarBadge: ordersBadge > 0 ? ordersBadge : undefined,
          tabBarIcon: ({ color, size }) => (
            <Feather name="list" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="ShiftMode"
        component={ShiftModeScreen}
        options={{
          tabBarAccessibilityLabel: t('shift'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="clock" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          tabBarAccessibilityLabel: t('earnings'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="bar-chart-2" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarAccessibilityLabel: t('profile'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
