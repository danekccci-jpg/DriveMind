/**
 * Compact daily summary card shown above the filtered order list
 * when a specific date is selected in the calendar.
 */
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTranslation } from 'react-i18next'
import { fonts } from '../theme/typography'
import { useColors } from '../theme/theme'
import { formatPln } from '../utils/formatCurrency'
import type { CompletedOrder } from '../store/ordersStore'

interface DailySummaryCardProps {
  orders: CompletedOrder[]
}

export function DailySummaryCard({ orders }: DailySummaryCardProps) {
  const { t } = useTranslation()
  const c = useColors()

  if (orders.length === 0) return null

  const totalEarnings = orders.reduce((s, o) => s + o.earnings, 0)
  const totalKm = orders.reduce((s, o) => s + o.distanceKm, 0)
  const totalMin = orders.reduce((s, o) => s + o.durationMin, 0)
  const avgZlKm = totalKm > 0 ? totalEarnings / totalKm : 0
  const avgZlH = totalMin > 0 ? (totalEarnings / totalMin) * 60 : 0

  return (
    <View style={[st.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text style={[st.cardTitle, { color: c.textMuted }]}>
        {t('daily_summary', { defaultValue: 'DAILY SUMMARY' }).toUpperCase()}
      </Text>
      <View style={st.grid}>
        <Stat label={t('earnings_label')} value={formatPln(totalEarnings)} accent={c.success} c={c} />
        <Stat label={t('distance')} value={`${totalKm.toFixed(1)} km`} c={c} />
        <Stat label={t('orders_label')} value={String(orders.length)} c={c} />
        <Stat label="zł/km" value={avgZlKm.toFixed(2)} c={c} />
        <Stat label="zł/h" value={formatPln(avgZlH)} c={c} />
      </View>
    </View>
  )
}

function Stat({
  label,
  value,
  accent,
  c,
}: {
  label: string
  value: string
  accent?: string
  c: ReturnType<typeof useColors>
}) {
  return (
    <View style={[st.stat, { backgroundColor: c.surfaceAlt }]}>
      <Text style={[st.statLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[st.statValue, { color: accent ?? c.text }]}>{value}</Text>
    </View>
  )
}

const st = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    letterSpacing: 1,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stat: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 72,
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
})
