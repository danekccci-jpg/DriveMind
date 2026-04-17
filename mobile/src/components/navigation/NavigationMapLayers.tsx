import React, { memo } from 'react'
import { View, StyleSheet, Animated, Image, Text } from 'react-native'
import { Marker, Polyline } from '../MapViewWeb'
import type { LatLng } from '../../navigation/navigationGeometry'
import type { Order } from '../../store/ordersStore'
import PlatformIcon from '../PlatformIcon'

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
  activeDeliveryOrders: Order[]
}

function NavigationMapLayersInner({
  trimmedPolyline,
  destCoord,
  navigationPhase,
  destPulse,
  nearDestination,
  isDark,
  activeDeliveryOrders,
}: Props) {
  const pickup      = navigationPhase === 'pickup'
  const casingColor = isDark ? ROUTE_CASING_DARK : ROUTE_CASING_LIGHT
  const glowColor   = isDark ? ROUTE_GLOW_DARK   : ROUTE_GLOW_LIGHT
  const borderColorByPlatform: Record<string, string> = {
    wolt: '#00BCFF',
    glovo: '#FFB800',
    uber: '#111827',
    bolt: '#34D186',
  }

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

      {destCoord && navigationPhase !== 'dropoff' && (
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

      {navigationPhase === 'dropoff' &&
        activeDeliveryOrders.map((order, idx) => {
          const ringColor = borderColorByPlatform[order.platform] ?? '#9CA3AF'
          const hasLogo = typeof order.RestaurantLogo === 'string' && order.RestaurantLogo.trim().length > 0
          const restaurantInitial =
            (order.restaurantName?.trim()?.slice(0, 1) || order.pickupAddress?.trim()?.slice(0, 1) || '?').toUpperCase()
          const offset = idx % 3
          const markerCoord = {
            latitude: order.dropoffLat + (offset === 0 ? 0 : offset === 1 ? 0.00014 : -0.00014),
            longitude: order.dropoffLng + (offset === 0 ? 0 : offset === 1 ? 0.00012 : -0.00012),
          }
          return (
            <Marker
              key={`delivery-${order.id}`}
              coordinate={markerCoord}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={nearDestination}
            >
              <Animated.View
                style={[
                  styles.destOuter,
                  styles.deliveryOuter,
                  {
                    borderColor: ringColor,
                    backgroundColor: isDark ? '#0B0F1A' : '#FFFFFF',
                    transform: [{ scale: nearDestination ? destPulse : 1 }],
                  },
                ]}
              >
                {hasLogo ? (
                  <Image source={{ uri: order.RestaurantLogo }} style={styles.logoCircle} />
                ) : (
                  <View style={[styles.logoFallback, { borderColor: ringColor }]}>
                    <Text style={[styles.logoFallbackText, { color: ringColor }]}>{restaurantInitial}</Text>
                  </View>
                )}
                <View style={styles.platformBadge}>
                  <PlatformIcon platform={order.platform as any} size={12} active />
                </View>
                {activeDeliveryOrders.length > 1 ? (
                  <View style={styles.markerIndexBadge}>
                    <Text style={styles.markerIndexText}>{idx + 1}</Text>
                  </View>
                ) : null}
              </Animated.View>
            </Marker>
          )
        })}
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
  deliveryOuter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    overflow: 'visible',
  },
  logoCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E5E7EB',
  },
  logoFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
  },
  logoFallbackText: {
    fontSize: 10,
    fontWeight: '700',
  },
  platformBadge: {
    position: 'absolute',
    left: -5,
    bottom: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  markerIndexBadge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  markerIndexText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
})
