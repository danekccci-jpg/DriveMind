import React from 'react'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

import DashboardScreen from '../screens/Dashboard'
import OrderHubScreen from '../screens/OrderHub'
import ShiftModeScreen from '../screens/ShiftMode'
import EarningsScreen from '../screens/Earnings'
import ProfileScreen from '../screens/Profile'

const Tab = createBottomTabNavigator()

const STROKE = 1.5
const S = 24 // viewBox / icon size

// ── Tab icons ─────────────────────────────────────────────────────────────────

function RideIcon({ color }: { color: string }) {
  // Steering wheel: outer ring + centre dot + 4 spokes
  return (
    <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE} />
      <Circle cx={12} cy={12} r={2.5} stroke={color} strokeWidth={STROKE} />
      {/* top spoke */}
      <Line x1={12} y1={3} x2={12} y2={9.5} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* bottom-left spoke */}
      <Line x1={12} y1={14.5} x2={4.8} y2={18.5} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* bottom-right spoke */}
      <Line x1={12} y1={14.5} x2={19.2} y2={18.5} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  )
}

function OrdersIcon({ color }: { color: string }) {
  // 3 rows: bullet circle + horizontal line
  const rows = [6, 12, 18]
  return (
    <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none">
      {rows.map((y) => (
        <React.Fragment key={y}>
          <Circle cx={4} cy={y} r={1.5} stroke={color} strokeWidth={STROKE} />
          <Line x1={8} y1={y} x2={21} y2={y} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
        </React.Fragment>
      ))}
    </Svg>
  )
}

function ShiftIcon({ color }: { color: string }) {
  // Clock: circle face + hour hand (12) + minute hand (3)
  return (
    <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={STROKE} />
      {/* hour hand pointing ~10 o'clock */}
      <Line x1={12} y1={12} x2={8.5} y2={7} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      {/* minute hand pointing ~2 o'clock */}
      <Line x1={12} y1={12} x2={17} y2={9} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </Svg>
  )
}

function EarningsIcon({ color }: { color: string }) {
  // 3 ascending bars
  return (
    <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none">
      <Rect x={3} y={14} width={4} height={7} rx={1} stroke={color} strokeWidth={STROKE} />
      <Rect x={10} y={9} width={4} height={12} rx={1} stroke={color} strokeWidth={STROKE} />
      <Rect x={17} y={4} width={4} height={17} rx={1} stroke={color} strokeWidth={STROKE} />
    </Svg>
  )
}

function ProfileIcon({ color }: { color: string }) {
  // Head circle + rounded shoulder arc
  return (
    <Svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} fill="none">
      <Circle cx={12} cy={8} r={4} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M4 20c0-4 3.6-7 8-7s8 3 8 7"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
    </Svg>
  )
}

// ── Placeholder screens for incomplete tabs ───────────────────────────────────
// These will be replaced once full screen files exist.

// ── Navigator ─────────────────────────────────────────────────────────────────
export default function AppTabs() {
  const { t } = useTranslation()

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
          backgroundColor: '#000000',
          borderTopColor: '#1A1A1A',
          borderTopWidth: 0.5,
          height: 60,
          paddingBottom: 10,
        },
        tabBarActiveTintColor: '#FFFFFF',
        tabBarInactiveTintColor: '#444444',
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
          tabBarIcon: ({ color }) => <RideIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="OrderHub"
        component={OrderHubScreen}
        options={{
          tabBarLabel: t('orders'),
          tabBarIcon: ({ color }) => <OrdersIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="ShiftMode"
        component={ShiftModeScreen}
        options={{
          tabBarLabel: t('shift'),
          tabBarIcon: ({ color }) => <ShiftIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="Earnings"
        component={EarningsScreen}
        options={{
          tabBarLabel: t('earnings'),
          tabBarIcon: ({ color }) => <EarningsIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: t('profile'),
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tab.Navigator>
  )
}
