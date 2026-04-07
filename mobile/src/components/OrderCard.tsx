import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'

import PlatformIcon from './PlatformIcon'
import ProfitBadge from './ProfitBadge'
import { fonts } from '../theme/typography'
import type { AppColors } from '../theme/theme'
import type { Order } from '../store/ordersStore'
import type { ProfitLabel } from '../engine/profitEngine'

export type OrderCardPlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

export type OrderCardProps = {
  order: Order
  platformLabel: string
  profitLabel: ProfitLabel
  accent: string
  c: AppColors
  onAccept: () => void
  onSkipPress?: () => void
  /** When true: show compact navigation strip (next turn + Stop) instead of full card. */
  isNavigationActive?: boolean
  /** Next maneuver hint to display in navigation compact mode. */
  navNextTurn?: string
  /** Called when the Stop button is pressed in navigation compact mode. */
  onStop?: () => void
}

const CARD_H = 110
const TABLET_BREAKPOINT = 600
const ADDRESS_MIDDLE_W = 56

/** First line of address before comma, or trimmed; single-line street labels. */
function streetLine(full: string): string {
  const s = full?.trim() || '—'
  const i = s.indexOf(',')
  return i > 0 ? s.slice(0, i).trim() : s
}

export function OrderCard({
  order,
  platformLabel,
  profitLabel,
  accent,
  c,
  onAccept,
  onSkipPress,
  isNavigationActive = false,
  navNextTurn,
  onStop,
}: OrderCardProps) {
  const { t } = useTranslation()
  const { width } = useWindowDimensions()

  const isTablet = width >= TABLET_BREAKPOINT
  const useRowLayout = isTablet || isNavigationActive

  const pick = streetLine(order.pickupAddress || '')
  const drop = streetLine(order.dropoffAddress || '')

  if (isNavigationActive) {
    return (
      <View
        style={[
          styles.card,
          styles.cardNav,
          {
            backgroundColor: c.surface,
            borderColor: c.separator,
            borderLeftColor: accent,
          },
        ]}
      >
        <View style={styles.navRow}>
          <Feather name="navigation" size={16} color={accent} style={styles.navIcon} />
          <View style={styles.navInfo}>
            <Text style={[styles.navTurn, { color: c.text }]} numberOfLines={1} ellipsizeMode="tail">
              {navNextTurn ?? drop}
            </Text>
            <Text style={[styles.navDist, { color: c.textMuted }]} numberOfLines={1}>
              {order.distanceKm.toFixed(1)} km · {platformLabel}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.stopBtn, { borderColor: accent }]}
            activeOpacity={0.7}
            onPress={onStop}
          >
            <Text style={[styles.stopText, { color: accent }]}>{t('stop')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: c.surface,
          borderColor: c.separator,
          borderLeftColor: accent,
        },
      ]}
    >
      {/* Meta row: platform name + profit badge + price */}
      <View style={styles.metaRow}>
        <Text style={[styles.platformName, { color: c.text }]} numberOfLines={1} ellipsizeMode="tail">
          {platformLabel}
        </Text>
        <ProfitBadge label={profitLabel} compact />
        <Text style={[styles.pln, { color: c.text }]} numberOfLines={1}>
          {order.earnings.toFixed(0)} PLN
        </Text>
      </View>

      {/* Address section — row on tablet or active, column on phone */}
      {useRowLayout ? (
        <View style={[styles.addressRow, { borderTopColor: c.separator, height: CARD_H }]}>
          <View style={styles.addressColA}>
            <PlatformIcon platform={order.platform as OrderCardPlatformId} size={16} />
            <Text
              style={[styles.addressText, { color: c.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {pick}
            </Text>
          </View>

          <View style={[styles.addressMiddle, { width: ADDRESS_MIDDLE_W }]}>
            <Feather name="arrow-right" size={14} color={c.textMuted} />
            <View style={[styles.distBadge, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.distKm, { color: c.text }]} numberOfLines={1}>
                {order.distanceKm.toFixed(1)} km
              </Text>
            </View>
          </View>

          <View style={styles.addressColB}>
            <Text
              style={[styles.addressText, styles.addressTextB, { color: c.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {drop}
            </Text>
            <Feather name="map-pin" size={16} color={c.textMuted} style={styles.pinIcon} />
          </View>
        </View>
      ) : (
        <View style={[styles.addressStack, { borderTopColor: c.separator }]}>
          <View style={styles.addressStackRow}>
            <PlatformIcon platform={order.platform as OrderCardPlatformId} size={14} />
            <Text
              style={[styles.addressText, styles.addressTextStack, { color: c.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {pick}
            </Text>
            <View style={[styles.distBadgeInline, { borderColor: c.border, backgroundColor: c.surfaceAlt }]}>
              <Text style={[styles.distKm, { color: c.text }]}>{order.distanceKm.toFixed(1)} km</Text>
            </View>
          </View>
          <View style={styles.addressDivider}>
            <Feather name="chevron-down" size={12} color={c.textMuted} />
          </View>
          <View style={styles.addressStackRow}>
            <Feather name="map-pin" size={14} color={c.textMuted} />
            <Text
              style={[styles.addressText, styles.addressTextStack, { color: c.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {drop}
            </Text>
          </View>
        </View>
      )}

      {/* Buttons */}
      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.acceptBtn, { borderColor: accent }]} activeOpacity={0.7} onPress={onAccept}>
          <Text style={[styles.acceptText, { color: accent }]}>{t('accept')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipBtn}
          activeOpacity={onSkipPress ? 0.7 : 1}
          onPress={onSkipPress}
          disabled={!onSkipPress}
        >
          <Text style={[styles.skipText, { color: c.textMuted }]}>{t('skip_btn')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderLeftWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 0,
    marginBottom: 4,
    overflow: 'hidden',
  },
  cardNav: {
    paddingVertical: 4,
  },

  // Navigation compact strip
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
  },
  navIcon: { flexShrink: 0 },
  navInfo: { flex: 1, minWidth: 0 },
  navTurn: { fontSize: 13, fontFamily: fonts.semiBold, fontWeight: '600' },
  navDist: { fontSize: 11, fontFamily: fonts.regular, marginTop: 1 },
  stopBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stopText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semiBold },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    minHeight: 18,
  },
  platformName: {
    flex: 1,
    minWidth: 0,
    fontSize: 10,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  pln: { fontSize: 10, fontFamily: fonts.semiBold, fontWeight: '600', flexShrink: 0 },

  // Row layout (tablet / active state) — baseline height 110
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 4,
  },
  addressColA: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addressMiddle: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addressColB: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },

  // Stacked layout (phone, non-active)
  addressStack: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    gap: 0,
  },
  addressStackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
  },
  addressDivider: {
    paddingLeft: 14,
    paddingVertical: 1,
  },
  distBadgeInline: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginLeft: 'auto',
    flexShrink: 0,
  },

  // Shared address text
  pinIcon: { flexShrink: 0 },
  addressText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.medium,
    fontWeight: '500',
  },
  addressTextB: {
    textAlign: 'right',
  },
  addressTextStack: {
    flex: 1,
  },

  // Shared distance badge (row layout)
  distBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    maxWidth: ADDRESS_MIDDLE_W,
  },
  distKm: { fontSize: 10, fontFamily: fonts.semiBold, fontWeight: '700' },

  // Buttons
  btnRow: { flexDirection: 'row', gap: 4, paddingTop: 2, paddingBottom: 2 },
  acceptBtn: {
    flex: 1,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  acceptText: { fontSize: 10, fontWeight: '600', fontFamily: fonts.semiBold },
  skipBtn: { flex: 0.32, height: 22, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 9, fontFamily: fonts.regular },
})
