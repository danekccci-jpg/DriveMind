import React, { memo } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native'
import { MaterialCommunityIcons } from '@expo/vector-icons'
import { fonts } from '../../theme/typography'
import type { AppColors } from '../../theme/theme'
import { ROUTE_STROKE_MAIN } from './NavigationMapLayers'

function maneuverToIcon(m?: string): keyof typeof MaterialCommunityIcons.glyphMap {
  if (!m) return 'navigation-variant'
  if (m.includes('left')) {
    if (m.includes('slight')) return 'arrow-top-left'
    if (m.includes('sharp')) return 'arrow-left-bold'
    return 'arrow-left-bold'
  }
  if (m.includes('right')) {
    if (m.includes('slight')) return 'arrow-top-right'
    if (m.includes('sharp')) return 'arrow-right-bold'
    return 'arrow-right-bold'
  }
  if (m.includes('uturn')) return 'undo-variant'
  if (m.includes('roundabout')) return 'rotate-right'
  if (m.includes('merge')) return 'merge'
  if (m.includes('fork')) return 'call-split'
  if (m === 'straight') return 'arrow-up-bold'
  return 'navigation-variant'
}

function formatTimeLeft(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rm = m % 60
    return `${h}h ${rm}m`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatArrival(secondsFromNow: number): string {
  if (!Number.isFinite(secondsFromNow) || secondsFromNow < 0) return '—'
  const d = new Date(Date.now() + secondsFromNow * 1000)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

type Props = {
  maneuver?: string
  /** Pre-formatted distance line, e.g. "20 m" or "0.1 mi" */
  distanceLine: string
  streetName: string
  timeLeftSeconds: number
  c: AppColors
  /** Turn-by-turn vs stationary “at pickup” banner */
  hudVariant: 'navigation' | 'atPickup'
  onPrimary: () => void
  timeLeftLabel: string
  arrivalLabel: string
  /** Dynamic CTA label from delivery phase */
  primaryLabel: string
  primaryDisabled?: boolean
  atPickupTitle: string
  atPickupSubtitle?: string
  /** Safe-area aware top offset for the instruction card */
  topInset: number
}

function NavigationHudInner({
  maneuver,
  distanceLine,
  streetName,
  timeLeftSeconds,
  c,
  hudVariant,
  onPrimary,
  timeLeftLabel,
  arrivalLabel,
  primaryLabel,
  primaryDisabled,
  atPickupTitle,
  atPickupSubtitle,
  topInset,
}: Props) {
  const icon = maneuverToIcon(maneuver)
  const navMode = hudVariant === 'navigation'

  return (
    <>
      <View
        style={[
          styles.topCard,
          { backgroundColor: c.surface, borderColor: c.separator, top: topInset },
        ]}
      >
        {navMode ? (
          <>
            <View style={[styles.iconCircle, { backgroundColor: c.surfaceAlt }]}>
              <MaterialCommunityIcons name={icon} size={36} color={ROUTE_STROKE_MAIN} />
            </View>
            <View style={styles.topTextCol}>
              <Text style={[styles.nextDist, { color: c.text }]}>{distanceLine}</Text>
              <Text style={[styles.street, { color: c.text }]} numberOfLines={2}>
                {streetName || '—'}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View style={[styles.iconCircle, { backgroundColor: c.surfaceAlt }]}>
              <MaterialCommunityIcons name="check-decagram" size={36} color={ROUTE_STROKE_MAIN} />
            </View>
            <View style={styles.topTextCol}>
              <Text style={[styles.nextDist, { color: c.text }]}>{atPickupTitle}</Text>
              {!!atPickupSubtitle && (
                <Text style={[styles.street, { color: c.textMuted }]} numberOfLines={2}>
                  {atPickupSubtitle}
                </Text>
              )}
            </View>
          </>
        )}
      </View>

      <View
        style={[
          styles.bottomBar,
          {
            backgroundColor: c.surface,
            borderColor: c.separator,
            paddingBottom: Platform.OS === 'ios' ? 10 : 8,
          },
        ]}
      >
        <View style={styles.bottomMeta}>
          <Text style={[styles.metaLabel, { color: c.textMuted }]}>{timeLeftLabel}</Text>
          <Text style={[styles.metaValue, { color: c.text }]}>
            {navMode ? formatTimeLeft(timeLeftSeconds) : '—'}
          </Text>
        </View>
        <View style={[styles.bottomDivider, { backgroundColor: c.separator }]} />
        <View style={styles.bottomMeta}>
          <Text style={[styles.metaLabel, { color: c.textMuted }]}>{arrivalLabel}</Text>
          <Text style={[styles.metaValue, { color: c.text }]}>
            {navMode ? formatArrival(timeLeftSeconds) : '—'}
          </Text>
        </View>
        <TouchableOpacity
          style={[
            styles.finishBtn,
            { backgroundColor: ROUTE_STROKE_MAIN },
            primaryDisabled && styles.finishBtnDisabled,
          ]}
          activeOpacity={primaryDisabled ? 1 : 0.75}
          onPress={onPrimary}
          disabled={primaryDisabled}
        >
          <Text style={[styles.finishBtnText, { color: '#FFFFFF' }]}>{primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    </>
  )
}

export const NavigationHud = memo(NavigationHudInner)

const styles = StyleSheet.create({
  topCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 5,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTextCol: { flex: 1, minWidth: 0 },
  nextDist: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: fonts.bold,
    letterSpacing: -0.6,
    marginBottom: 8,
  },
  street: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bold,
    lineHeight: 20,
  },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 80,
    alignSelf: 'center',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
    elevation: 3,
  },
  bottomMeta: { flex: 1, minWidth: 0 },
  metaLabel: { fontSize: 10, fontFamily: fonts.medium, letterSpacing: 0.4, marginBottom: 2 },
  metaValue: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  bottomDivider: { width: 1, height: 32 },
  finishBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishBtnDisabled: { opacity: 0.42 },
  finishBtnText: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold },
})
