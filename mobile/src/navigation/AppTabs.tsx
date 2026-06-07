import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Feather } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

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
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.tabBarBorder,
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'Poppins_400Regular',
          marginTop: -2,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: t('ride'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="navigation" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="OrderHub"
        component={OrderHubScreen}
        options={{
          tabBarLabel: t('orders'),
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
          tabBarLabel: t('shift'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="clock" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          tabBarLabel: t('earnings'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="bar-chart-2" size={size ?? 22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('profile'),
          tabBarIcon: ({ color, size }) => (
            <Feather name="user" size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}
