import React, { useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { Feather } from '@expo/vector-icons'

import { fonts } from '../theme/typography'
import { useTheme } from '../theme/theme'

interface OrderLocationMapProps {
  visible: boolean
  onClose: () => void
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  pickupAddress: string
  dropoffAddress: string
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window')
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.6

export function OrderLocationMap({
  visible,
  onClose,
  pickupLat,
  pickupLng,
  dropoffLat,
  dropoffLng,
  pickupAddress,
  dropoffAddress,
}: OrderLocationMapProps) {
  const { isDark, colors: c } = useTheme()

  const region = useMemo(
    () => fitToMarkers(pickupLat, pickupLng, dropoffLat, dropoffLng),
    [pickupLat, pickupLng, dropoffLat, dropoffLng],
  )

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.backdropTap} onPress={onClose} activeOpacity={1} />
        <View style={[styles.sheet, { backgroundColor: isDark ? '#1A1A1D' : '#FFFFFF' }]}>
          <View style={styles.handleRow}>
            <View style={[styles.handle, { backgroundColor: isDark ? '#3F3F46' : '#D4D4D8' }]} />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Feather name="x" size={20} color={c.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.addressContainer}>
            <View style={styles.addrRow}>
              <View style={[styles.pinDot, { backgroundColor: '#22C55E' }]} />
              <Text style={[styles.addrText, { color: c.text }]} numberOfLines={1}>
                {pickupAddress}
              </Text>
            </View>
            <View style={styles.addrRow}>
              <View style={[styles.pinDot, { backgroundColor: '#EF4444' }]} />
              <Text style={[styles.addrText, { color: c.text }]} numberOfLines={1}>
                {dropoffAddress}
              </Text>
            </View>
          </View>

          <MapView
            style={styles.map}
            initialRegion={region}
            mapType="standard"
            showsUserLocation={false}
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            <Marker
              coordinate={{ latitude: pickupLat, longitude: pickupLng }}
              title={pickupAddress}
              pinColor="#22C55E"
            />
            <Marker
              coordinate={{ latitude: dropoffLat, longitude: dropoffLng }}
              title={dropoffAddress}
              pinColor="#EF4444"
            />
          </MapView>
        </View>
      </View>
    </Modal>
  )
}

function fitToMarkers(
  pickupLat: number,
  pickupLng: number,
  dropoffLat: number,
  dropoffLng: number,
) {
  const midLat = (pickupLat + dropoffLat) / 2
  const midLng = (pickupLng + dropoffLng) / 2
  const latDelta = Math.max(0.01, Math.abs(pickupLat - dropoffLat) * 1.6)
  const lngDelta = Math.max(0.01, Math.abs(pickupLng - dropoffLng) * 1.6)
  return { latitude: midLat, longitude: midLng, latitudeDelta: latDelta, longitudeDelta: lngDelta }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropTap: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    height: SHEET_HEIGHT,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    top: 12,
    padding: 4,
  },
  addressContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 6,
  },
  addrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addrText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  map: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
})
