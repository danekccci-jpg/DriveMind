import React, { memo } from 'react'
import { View, StyleSheet, Animated } from 'react-native'
import { Marker, Polyline } from '../MapViewWeb'
import type { LatLng } from '../../navigation/navigationGeometry'

/** Brand blue — main stroke + soft glow layer */
export const ROUTE_STROKE_MAIN = '#1A5CFF'
const ROUTE_GLOW = 'rgba(26, 92, 255, 0.1)'

type Props = {
  trimmedPolyline: LatLng[]
  destCoord: LatLng | null
  navigationPhase: 'pickup' | 'dropoff' | null
  destPulse: Animated.Value
  nearDestination: boolean
}

function NavigationMapLayersInner({
  trimmedPolyline,
  destCoord,
  navigationPhase,
  destPulse,
  nearDestination,
}: Props) {
  const pickup = navigationPhase === 'pickup'
  return (
    <>
      {trimmedPolyline.length > 1 && (
        <>
          <Polyline
            coordinates={trimmedPolyline}
            strokeColor={ROUTE_GLOW}
            strokeWidth={10}
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
