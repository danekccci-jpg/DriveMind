import React, { memo } from 'react'
import { View, StyleSheet, Animated } from 'react-native'
import { Marker, Polyline } from '../MapViewWeb'
import type { LatLng } from '../../navigation/navigationGeometry'

// ── Route colours ────────────────────────────────────────────────────────────
//
// Neon cyan stands out against dark map roads AND against the red/orange/green
// Google Traffic overlay simultaneously.  The three-layer approach keeps the
// line crisp at all zoom levels:
//
//   1. Outer glow  — wide, very transparent — bloom effect
//   2. Casing      — 3 px wider than the core — visual separation from roads
//   3. Core        — 8 px, full opacity neon
//
export const ROUTE_STROKE_MAIN = '#00E5FF'           // neon cyan
const ROUTE_GLOW_DARK  = 'rgba(0, 229, 255, 0.22)'  // dark-theme bloom
const ROUTE_GLOW_LIGHT = 'rgba(0, 180, 220, 0.14)'  // light-theme bloom
const ROUTE_CASING_DARK  = 'rgba(5, 10, 22, 0.95)'  // near-black casing on dark
const ROUTE_CASING_LIGHT = 'rgba(255,255,255, 0.95)' // white casing on light

type Props = {
  trimmedPolyline: LatLng[]
  destCoord: LatLng | null
  navigationPhase: 'pickup' | 'dropoff' | null
  destPulse: Animated.Value
  nearDestination: boolean
  isDark: boolean
}

function NavigationMapLayersInner({
  trimmedPolyline,
  destCoord,
  navigationPhase,
  destPulse,
  nearDestination,
  isDark,
}: Props) {
  const pickup      = navigationPhase === 'pickup'
  const casingColor = isDark ? ROUTE_CASING_DARK : ROUTE_CASING_LIGHT
  const glowColor   = isDark ? ROUTE_GLOW_DARK   : ROUTE_GLOW_LIGHT

  return (
    <>
      {trimmedPolyline.length > 1 && (
        <>
          {/* Layer 1 — glow bloom */}
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={glowColor}
            strokeWidth={22}
            zIndex={98}
            lineCap="round"
            lineJoin="round"
          />
          {/* Layer 2 — dark casing separates the core from road surface */}
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={casingColor}
            strokeWidth={14}
            zIndex={99}
            lineCap="round"
            lineJoin="round"
          />
          {/* Layer 3 — neon core, strokeWidth 8 as spec'd */}
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={ROUTE_STROKE_MAIN}
            strokeWidth={8}
            zIndex={100}
            lineCap="round"
            lineJoin="round"
          />
        </>
      )}

      {destCoord && (
        <Marker
          coordinate={destCoord}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={nearDestination}
        >
          <Animated.View
            style={[
              styles.destOuter,
              {
                backgroundColor: pickup ? '#F59E0B' : '#22C55E',
                borderWidth: 2.5,
                borderColor: '#FFFFFF',
                transform: [{ scale: nearDestination ? destPulse : 1 }],
              },
            ]}
          >
            <View style={[styles.destInner, { backgroundColor: pickup ? '#FCD34D' : '#4ADE80' }]} />
          </Animated.View>
        </Marker>
      )}
    </>
  )
}

export const NavigationMapLayers = memo(NavigationMapLayersInner)

const styles = StyleSheet.create({
  destOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  destInner: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
})
