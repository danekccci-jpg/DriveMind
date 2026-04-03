import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
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
}

/**
 * Slim order row: platform + profit, horizontal pickup → dropoff, single metrics line (PLN · km · min), actions.
 */
export function OrderCard({
  order,
  platformLabel,
  profitLabel,
  accent,
  c,
  onAccept,
  onSkipPress,
}: OrderCardProps) {
  const { t } = useTranslation()

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.separator, borderLeftColor: accent }]}>
      <View style={styles.cardHeader}>
        <PlatformIcon platform={order.platform as OrderCardPlatformId} size={20} />
        <Text style={[styles.cardPlatform, { color: c.text }]} numberOfLines={1}>
          {platformLabel}
        </Text>
        <View style={styles.profitWrap}>
          <ProfitBadge label={profitLabel} />
        </View>
      </View>

      <View style={styles.routeHRow}>
        <View style={styles.routeColLeft}>
          <Text style={[styles.routeLocLabel, { color: c.textMuted }]} numberOfLines={1}>
            {t('ui_pickup_loc')}
          </Text>
          <Text style={[styles.routeAddr, { color: c.text }]} numberOfLines={1}>
            {order.pickupAddress || '—'}
          </Text>
        </View>
        <View style={styles.routeCenter}>
          <Feather name="arrow-right" size={14} color={c.textMuted} />
        </View>
        <View style={styles.routeColRight}>
          <Text style={[styles.routeLocLabel, styles.routeTextRight, { color: c.textMuted }]} numberOfLines={1}>
            {t('ui_dropoff_loc')}
          </Text>
          <Text style={[styles.routeAddr, styles.routeTextRight, { color: c.text }]} numberOfLines={1}>
            {order.dropoffAddress || '—'}
          </Text>
        </View>
      </View>

      <View style={[styles.metaLine, { borderTopColor: c.separator }]}>
        <Text style={[styles.metaStrong, { color: c.text }]}>{order.earnings.toFixed(0)} PLN</Text>
        <Text style={[styles.metaSep, { color: c.textMuted }]}>·</Text>
        <Text style={[styles.metaRest, { color: c.textSecondary }]}>{order.distanceKm.toFixed(1)} km</Text>
        <Text style={[styles.metaSep, { color: c.textMuted }]}>·</Text>
        <Text style={[styles.metaRest, { color: c.textSecondary }]}>{order.durationMin} min</Text>
      </View>

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
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginBottom: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  cardPlatform: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
  },
  profitWrap: { flexShrink: 0 },
  routeHRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
    minHeight: 34,
  },
  routeColLeft: { flex: 1, minWidth: 0, flexShrink: 1, paddingRight: 4 },
  routeColRight: { flex: 1, minWidth: 0, flexShrink: 1, paddingLeft: 4, alignItems: 'flex-end' },
  routeLocLabel: {
    fontSize: 9,
    fontFamily: fonts.medium,
    letterSpacing: 0.35,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  routeAddr: { fontSize: 11, lineHeight: 13, fontFamily: fonts.medium, fontWeight: '500' },
  routeTextRight: { textAlign: 'right', alignSelf: 'stretch' },
  routeCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 2,
    flexShrink: 0,
    alignSelf: 'center',
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 4,
    paddingTop: 2,
    paddingBottom: 2,
    marginBottom: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metaStrong: { fontSize: 11, fontFamily: fonts.semiBold, fontWeight: '600' },
  metaRest: { fontSize: 11, fontFamily: fonts.medium },
  metaSep: { fontSize: 11, fontFamily: fonts.regular },
  btnRow: { flexDirection: 'row', gap: 6, marginTop: 0 },
  acceptBtn: {
    flex: 1,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  acceptText: { fontSize: 12, fontWeight: '600', fontFamily: fonts.semiBold },
  skipBtn: { flex: 0.32, height: 26, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 12, fontFamily: fonts.regular },
})
