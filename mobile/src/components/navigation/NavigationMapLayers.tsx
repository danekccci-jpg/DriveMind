import React, { memo } from 'react'
import { View, StyleSheet, Animated } from 'react-native'
import { Marker, Polyline } from '../MapViewWeb'
import type { LatLng } from '../../navigation/navigationGeometry'

// ── Route colours ────────────────────────────────────────────────────────────
export const ROUTE_STROKE_MAIN = '#00E5FF'
const ROUTE_GLOW_DARK  = 'rgba(0, 229, 255, 0.22)'
const ROUTE_GLOW_LIGHT = 'rgba(0, 180, 220, 0.14)'
const ROUTE_CASING_DARK  = 'rgba(5, 10, 22, 0.95)'
const ROUTE_CASING_LIGHT = 'rgba(255,255,255, 0.95)'

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
  const pickup = navigationPhase === 'pickup'
  const casingColor = isDark ? ROUTE_CASING_DARK : ROUTE_CASING_LIGHT
  const glowColor   = isDark ? ROUTE_GLOW_DARK   : ROUTE_GLOW_LIGHT

  return (
    <>
      {trimmedPolyline.length > 1 && (
        <>
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={glowColor}
            strokeWidth={22}
            zIndex={98}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={casingColor}
            strokeWidth={14}
            zIndex={99}
            lineCap="round"
            lineJoin="round"
          />
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
