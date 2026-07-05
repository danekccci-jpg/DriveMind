import React, { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'

import type { ArchivedShift } from '../store/shiftBreadcrumbStore'
import { fonts } from '../theme/typography'
import { useTheme } from '../theme/theme'

interface ShiftRouteMapProps {
  shift: ArchivedShift
}

const ROUTE_COLOR = '#22C55E'
const PICKUP_COLOR = '#3B82F6'
const DROPOFF_COLOR = '#EF4444'

export function ShiftRouteMap({ shift }: ShiftRouteMapProps) {
  const { t } = useTranslation()
  const { isDark, colors: c } = useTheme()

  const coords = useMemo(
    () => shift.breadcrumbs.map((b) => ({ latitude: b.lat, longitude: b.lng })),
    [shift.breadcrumbs],
  )

  const region = useMemo(() => {
    if (coords.length === 0) return undefined
    return fitPolylineBounds(coords)
  }, [coords])

  if (coords.length < 2) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: isDark ? '#1A1A1D' : '#F9FAFB' }]}>
        <Feather name="map" size={32} color={c.textMuted} />
        <Text style={[styles.emptyText, { color: c.textMuted }]}>
          {t('shift_no_route_data')}
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        initialRegion={region}
        mapType="standard"
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        scrollEnabled
        zoomEnabled
        rotateEnabled={false}
      >
        <Polyline
          coordinates={coords}
          strokeColor={ROUTE_COLOR}
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
        />

        {/* Start marker */}
        <Marker
          coordinate={coords[0]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={[styles.startEndDot, { backgroundColor: ROUTE_COLOR }]}>
            <Feather name="play" size={10} color="#FFFFFF" />
          </View>
        </Marker>

        {/* End marker */}
        <Marker
          coordinate={coords[coords.length - 1]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={[styles.startEndDot, { backgroundColor: '#71717A' }]}>
            <Feather name="square" size={8} color="#FFFFFF" />
          </View>
        </Marker>

        {/* Order flags */}
        {shift.orderFlags.map((flag, i) => (
          <Marker
            key={`flag-${flag.orderId}-${i}`}
            coordinate={{ latitude: flag.lat, longitude: flag.lng }}
            anchor={{ x: 0.5, y: 1 }}
          >
            <View style={[styles.flagMarker, { backgroundColor: flag.type === 'pickup' ? PICKUP_COLOR : DROPOFF_COLOR }]}>
              <Feather
                name={flag.type === 'pickup' ? 'package' : 'check-circle'}
                size={12}
                color="#FFFFFF"
              />
            </View>
          </Marker>
        ))}
      </MapView>
    </View>
  )
}

function fitPolylineBounds(coords: Array<{ latitude: number; longitude: number }>) {
  let minLat = coords[0].latitude
  let maxLat = coords[0].latitude
  let minLng = coords[0].longitude
  let maxLng = coords[0].longitude

  for (const c of coords) {
    if (c.latitude < minLat) minLat = c.latitude
    if (c.latitude > maxLat) maxLat = c.latitude
    if (c.longitude < minLng) minLng = c.longitude
    if (c.longitude > maxLng) maxLng = c.longitude
  }

  const latDelta = Math.max(0.01, (maxLat - minLat) * 1.3)
  const lngDelta = Math.max(0.01, (maxLng - minLng) * 1.3)

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  }
}

const styles = StyleSheet.create({
  container: {
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 12,
  },
  map: {
    flex: 1,
  },
  emptyContainer: {
    height: 160,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: fonts.regular,
    textAlign: 'center',
  },
  startEndDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  flagMarker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
})
