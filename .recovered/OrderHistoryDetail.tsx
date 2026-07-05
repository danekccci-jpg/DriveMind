import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Feather } from '@expo/vector-icons'

import type { CompletedOrder } from '../store/ordersStore'
import { formatPln } from '../utils/formatCurrency'
import { fonts } from '../theme/typography'
import { useTheme } from '../theme/theme'

interface OrderHistoryDetailProps {
  order: CompletedOrder
  onShowMap: () => void
}

const KRAKOW_FALLBACK_LAT = 50.0614
const KRAKOW_FALLBACK_LNG = 19.9366

function isFallbackCoords(lat: number, lng: number): boolean {
  return (
    Math.abs(lat - KRAKOW_FALLBACK_LAT) < 0.001 &&
    Math.abs(lng - KRAKOW_FALLBACK_LNG) < 0.001
  )
}

export function OrderHistoryDetail({ order, onShowMap }: OrderHistoryDetailProps) {
  const { t } = useTranslation()
  const { isDark, colors: c } = useTheme()

  const hasRealCoords =
    !isFallbackCoords(order.pickupLat, order.pickupLng) ||
    !isFallbackCoords(order.dropoffLat, order.dropoffLng)

  const plnPerKm =
    order.distanceKm > 0 ? order.earnings / order.distanceKm : 0

  return (
    <View style={[styles.container, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : c.separator }]}>
      <View style={styles.addressRow}>
        <View style={[styles.dot, { backgroundColor: '#22C55E' }]} />
        <Text style={[styles.addressText, { color: c.text }]} numberOfLines={2}>
          {order.pickupAddress}
        </Text>
      </View>
      <View style={styles.addressRow}>
        <View style={[styles.dot, { backgroundColor: '#EF4444' }]} />
        <Text style={[styles.addressText, { color: c.text }]} numberOfLines={2}>
          {order.dropoffAddress}
        </Text>
      </View>

      <View style={styles.metricsGrid}>
        <MetricPill
          label={t('distance')}
          value={`${order.distanceKm.toFixed(1)} km`}
          colors={c}
          isDark={isDark}
        />
        <MetricPill
          label={t('price')}
          value={formatPln(order.earnings)}
          colors={c}
          isDark={isDark}
        />
        <MetricPill
          label="zł/km"
          value={plnPerKm.toFixed(2)}
          colors={c}
          isDark={isDark}
        />
        <MetricPill
          label={t('order_grade')}
          value={order.profitLabel || '—'}
          colors={c}
          isDark={isDark}
        />
      </View>

      {hasRealCoords && (
        <TouchableOpacity
          style={[styles.mapBtn, { backgroundColor: isDark ? 'rgba(34,197,94,0.12)' : '#F0FDF4' }]}
          onPress={onShowMap}
          activeOpacity={0.75}
        >
          <Feather name="map-pin" size={16} color="#22C55E" />
          <Text style={styles.mapBtnText}>{t('show_on_map')}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function MetricPill({
  label,
  value,
  colors: c,
  isDark,
}: {
  label: string
  value: string
  colors: any
  isDark: boolean
}) {
  return (
    <View style={[styles.pill, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F9FAFB' }]}>
      <Text style={[styles.pillLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[styles.pillValue, { color: c.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    lineHeight: 18,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  pill: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
  },
  pillLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  pillValue: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
  },
  mapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  mapBtnText: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: '#22C55E',
  },
})
