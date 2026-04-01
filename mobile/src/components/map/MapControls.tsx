import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { BlurView } from 'expo-blur'
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { fonts } from '../../theme/typography'
import { useNavigationSettingsStore } from '../../store/navigationSettingsStore'

const ACCENT = '#1A5CFF'
const STACK_W = 52

type Props = {
  mapRef: React.RefObject<any>
  userLocation: { latitude: number; longitude: number } | null
  smoothHeading: number
  isDark: boolean
  /** Pixels from screen bottom for the floating stack */
  bottomOffset: number
  onPerspectiveToggle: (perspective3d: boolean) => void
}

export function MapControls({
  mapRef,
  userLocation,
  smoothHeading,
  isDark,
  bottomOffset,
  onPerspectiveToggle,
}: Props) {
  const navMuted = useNavigationSettingsStore((s) => s.navMuted)
  const setNavMuted = useNavigationSettingsStore((s) => s.setNavMuted)
  const mapPerspective3d = useNavigationSettingsStore((s) => s.mapPerspective3d)
  const setMapPerspective3d = useNavigationSettingsStore((s) => s.setMapPerspective3d)

  const tint: 'light' | 'dark' = isDark ? 'dark' : 'light'
  const frostedBg = isDark ? 'rgba(28,28,30,0.88)' : 'rgba(255,255,255,0.92)'

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

  const toggleMute = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setNavMuted(!navMuted)
  }

  const toggle3d = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    const next = !mapPerspective3d
    setMapPerspective3d(next)
    onPerspectiveToggle(next)
  }

  const wrap = (children: React.ReactNode, extra: object) =>
    Platform.OS === 'ios' ? (
      <BlurView intensity={85} tint={tint} style={[styles.blurBox, extra]}>
        {children}
      </BlurView>
    ) : (
      <View style={[styles.blurBox, { backgroundColor: frostedBg }, extra]}>{children}</View>
    )

  return (
    <View style={[styles.stack, { bottom: bottomOffset }]} pointerEvents="box-none">
      {wrap(
        <TouchableOpacity style={styles.circleBtn} onPress={recenter} activeOpacity={0.75}>
          <View style={[styles.bearingCircle, { borderColor: ACCENT }]}>
            <Feather name="arrow-up" size={22} color={ACCENT} style={{ transform: [{ rotate: `${smoothHeading}deg` }] }} />
          </View>
        </TouchableOpacity>,
        {},
      )}

      {wrap(
        <>
          <TouchableOpacity style={styles.zoomHit} onPress={() => runZoom(1)} activeOpacity={0.7}>
            <Text style={styles.zoomGlyph}>+</Text>
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity style={styles.zoomHit} onPress={() => runZoom(-1)} activeOpacity={0.7}>
            <Text style={styles.zoomGlyph}>−</Text>
          </TouchableOpacity>
        </>,
        styles.zoomCol,
      )}

      {wrap(
        <>
          <TouchableOpacity style={styles.iconHit} onPress={toggleMute} activeOpacity={0.7}>
            <Feather name={navMuted ? 'volume-x' : 'volume-2'} size={20} color={ACCENT} />
          </TouchableOpacity>
          <View style={styles.vdiv} />
          <TouchableOpacity style={styles.iconHit} onPress={toggle3d} activeOpacity={0.7}>
            <Feather name={mapPerspective3d ? 'box' : 'square'} size={20} color={ACCENT} />
          </TouchableOpacity>
        </>,
        styles.rowPair,
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    right: 14,
    width: STACK_W,
    alignItems: 'center',
    gap: 10,
    zIndex: 200,
  },
  blurBox: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 8,
  },
  circleBtn: {
    width: STACK_W,
    height: STACK_W,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bearingCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  zoomCol: {
    width: STACK_W,
    paddingVertical: 4,
  },
  zoomHit: {
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomGlyph: {
    fontSize: 22,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: ACCENT,
    lineHeight: 26,
  },
  zoomDivider: {
    height: 1,
    backgroundColor: 'rgba(26,92,255,0.2)',
    marginHorizontal: 8,
  },
  rowPair: {
    flexDirection: 'row',
    width: STACK_W + 4,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 6,
  },
  iconHit: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  vdiv: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(26,92,255,0.2)',
  },
})
