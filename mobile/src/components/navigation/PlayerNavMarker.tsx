import React, { useEffect, useRef } from 'react'
import { View, StyleSheet, Animated, Platform } from 'react-native'
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import type { MarkerStyleId } from '../../store/navigationSettingsStore'

const BRAND = '#1A5CFF'

type Props = {
  styleId: MarkerStyleId
  headingDeg: number
  size?: number
}

function PulsarRing() {
  const breathe = useRef(new Animated.Value(0)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2000, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [breathe])
  const ringScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.65] })
  const ringOpacity = breathe.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.38, 0.2, 0] })
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pulsar,
        {
          width: 56,
          height: 56,
          borderRadius: 28,
          borderColor: BRAND,
          opacity: ringOpacity,
          transform: [{ scale: ringScale }],
        },
      ]}
    />
  )
}

function ClassicArrow({ headingDeg, size }: { headingDeg: number; size: number }) {
  return (
    <View style={[styles.arrowLayer, { width: size, height: size, transform: [{ rotate: `${headingDeg}deg` }] }]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Path
          fill={BRAND}
          stroke="#FFFFFF"
          strokeWidth={Platform.OS === 'ios' ? 1.25 : 1}
          strokeLinejoin="round"
          strokeLinecap="round"
          d="M20 4 L34 30 Q20 24 20 24 Q20 24 6 30 Z"
        />
        <Path fill="rgba(255,255,255,0.22)" d="M20 10 L28 28 Q20 22 12 28 Z" />
      </Svg>
    </View>
  )
}

function Arrow3D({ headingDeg, size }: { headingDeg: number; size: number }) {
  return (
    <View style={[styles.arrowLayer, { width: size, height: size, transform: [{ rotate: `${headingDeg}deg` }] }]}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <Defs>
          <LinearGradient id="a3d" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#4B7CFF" />
            <Stop offset="50%" stopColor={BRAND} />
            <Stop offset="100%" stopColor="#0A3A99" />
          </LinearGradient>
        </Defs>
        <Path fill="#0A2860" d="M20 6 L36 32 L20 26 L4 32 Z" opacity={0.85} />
        <Path
          fill="url(#a3d)"
          stroke="#FFFFFF"
          strokeWidth={1.2}
          strokeLinejoin="round"
          d="M20 3 L33 31 L20 25 L7 31 Z"
        />
        <Path fill="rgba(255,255,255,0.45)" d="M20 8 L26 26 L20 22 L14 26 Z" />
      </Svg>
    </View>
  )
}

function CarTop({ headingDeg, size }: { headingDeg: number; size: number }) {
  return (
    <View style={[styles.arrowLayer, { width: size, height: size, transform: [{ rotate: `${headingDeg}deg` }] }]}>
      <View style={[styles.carCircle, { width: size + 4, height: size + 4, borderRadius: (size + 4) / 2 }]}>
        <MaterialCommunityIcons name="car" size={size * 0.62} color={BRAND} />
      </View>
    </View>
  )
}

export function PlayerNavMarker({ styleId, headingDeg, size = 48 }: Props) {
  const box = size + 28
  return (
    <View style={[styles.wrap, { width: box, height: box }]}>
      <PulsarRing />
      {styleId === 'classic' && <ClassicArrow headingDeg={headingDeg} size={size} />}
      {styleId === 'arrow3d' && <Arrow3D headingDeg={headingDeg} size={size} />}
      {styleId === 'car' && <CarTop headingDeg={headingDeg} size={size} />}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  pulsar: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  arrowLayer: { alignItems: 'center', justifyContent: 'center' },
  carCircle: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: BRAND,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
})
