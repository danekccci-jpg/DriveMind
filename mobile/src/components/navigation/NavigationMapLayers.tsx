import React, { memo } from 'react'
import { View, StyleSheet, Animated } from 'react-native'
import { Marker, Polyline } from '../MapViewWeb'
import type { LatLng } from '../../navigation/navigationGeometry'

/** High-contrast route colors tuned for dark map styling. */
export const ROUTE_STROKE_MAIN = '#5CC8FF'
const ROUTE_GLOW_DARK = 'rgba(92, 200, 255, 0.38)'
const ROUTE_GLOW_LIGHT = 'rgba(26, 92, 255, 0.16)'
const ROUTE_CASING_DARK = 'rgba(10, 14, 28, 0.96)'
const ROUTE_CASING_LIGHT = 'rgba(255, 255, 255, 0.96)'

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
  const glowColor = isDark ? ROUTE_GLOW_DARK : ROUTE_GLOW_LIGHT
  return (
    <>
      {trimmedPolyline.length > 1 && (
        <>
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={glowColor}
            strokeWidth={20}
            zIndex={98}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={casingColor}
            strokeWidth={13}
            zIndex={99}
            lineCap="round"
            lineJoin="round"
          />
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={ROUTE_STROKE_MAIN}
            strokeWidth={9}
            zIndex={100}
            lineCap="round"
            lineJoin="round"
          />
        </>
      )}
      {destCoord && (
        <Marker coordinate={destCoord} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={nearDestination}>
          <Animated.View
            style={[
              styles.destOuter,
              {
                backgroundColor: pickup ? '#F59E0B' : '#22C55E',
                borderWidth: 2,
                borderColor: '#FFFFFF',
                transform: [{ scale: nearDestination ? destPulse : 1 }],
              },
            ]}
          >
            <View style={[styles.destInner, { backgroundColor: pickup ? '#FBBF24' : '#4ADE80' }]} />
          </Animated.View>
        </Marker>
      )}
    </>
  )
}

export const NavigationMapLayers = memo(NavigationMapLayersInner)

const styles = StyleSheet.create({
  destOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  destInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
