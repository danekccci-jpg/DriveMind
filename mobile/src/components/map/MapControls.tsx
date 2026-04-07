import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { fonts } from '../../theme/typography'
import { useNavigationSettingsStore } from '../../store/navigationSettingsStore'

const BTN = 44
const GAP = 8
const BG = 'rgba(0,0,0,0.6)'
const ICON = '#FFFFFF'

type Props = {
  mapRef: React.RefObject<any>
  userLocation: { latitude: number; longitude: number } | null
  smoothHeading: number
  isDark: boolean
  /** Distance from screen bottom to the bottom edge of this stack (keeps controls above the sheet / order card). */
  bottomOffset: number
  onPerspectiveToggle: (perspective3d: boolean) => void
}

/**
 * Bottom-right stack: zoom +, zoom −, 2D/3D toggle, compass — stays above the order sheet via `bottomOffset`.
 */
export function MapControls({
  mapRef,
  userLocation,
  smoothHeading,
  isDark,
  bottomOffset,
  onPerspectiveToggle,
}: Props) {
  const mapPerspective3d = useNavigationSettingsStore((s) => s.mapPerspective3d)
  const setMapPerspective3d = useNavigationSettingsStore((s) => s.setMapPerspective3d)

  const tint: 'light' | 'dark' = isDark ? 'dark' : 'light'

  const runZoom = (delta: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const m = mapRef.current
    if (!m?.getCamera) return
    void m.getCamera().then((cam: { zoom?: number; center?: unknown; heading?: number; pitch?: number }) => {
      const z = cam.zoom ?? 17
      const next = Math.max(12, Math.min(20, z + delta))
      m.animateCamera({ ...cam, zoom: next }, { duration: 280 })
    })
  }

  const recenter = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const m = mapRef.current
    if (!m || !userLocation) return
    m.animateCamera(
      {
        center: { latitude: userLocation.latitude, longitude: userLocation.longitude },
        pitch: mapPerspective3d ? 60 : 0,
        heading: smoothHeading,
        zoom: 17.5,
      },
      { duration: 500 },
    )
  }

  const toggle3d = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const next = !mapPerspective3d
    setMapPerspective3d(next)
    onPerspectiveToggle(next)
  }

  const circle = (child: React.ReactNode) =>
    Platform.OS === 'ios' ? (
      <BlurView intensity={48} tint={tint} style={styles.blurCircle}>
        <View style={styles.circleBlurInner}>{child}</View>
      </BlurView>
    ) : (
      <View style={styles.circleSolid}>{child}</View>
    )

  return (
    <View style={[styles.stack, { bottom: bottomOffset }]} pointerEvents="box-none">
      {circle(
        <TouchableOpacity style={styles.hit} onPress={() => runZoom(1)} activeOpacity={0.75}>
          <Feather name="plus" size={22} color={ICON} />
        </TouchableOpacity>,
      )}
      {circle(
        <TouchableOpacity style={styles.hit} onPress={() => runZoom(-1)} activeOpacity={0.75}>
          <Feather name="minus" size={22} color={ICON} />
        </TouchableOpacity>,
      )}
      {circle(
        <TouchableOpacity style={styles.hit} onPress={toggle3d} activeOpacity={0.75}>
          <Text style={styles.dim3d}>{mapPerspective3d ? '2D' : '3D'}</Text>
        </TouchableOpacity>,
      )}
      {circle(
        <TouchableOpacity style={styles.hit} onPress={recenter} activeOpacity={0.75}>
          <Feather
            name="arrow-up"
            size={22}
            color={ICON}
            style={{ transform: [{ rotate: `${smoothHeading}deg` }] }}
          />
        </TouchableOpacity>,
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: GAP,
    zIndex: 260,
    elevation: 12,
  },
  blurCircle: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    overflow: 'hidden',
  },
  circleSolid: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBlurInner: {
    width: BTN,
    height: BTN,
    borderRadius: BTN / 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hit: {
    width: BTN,
    height: BTN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim3d: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    fontWeight: '700',
    color: ICON,
    letterSpacing: 0.4,
  },
})
