import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'
import { Calendar, type DateData } from 'react-native-calendars'

import {
  useWalletStore,
  selectTodayEarnings,
  selectWeeklyEarnings,
  type WalletTransaction,
} from '../../store/walletStore'
import { useOrdersStore } from '../../store/ordersStore'
import { useShiftBreadcrumbStore } from '../../store/shiftBreadcrumbStore'
import { computeDateRangeStats } from '../../services/analyticsService'
import { formatPln } from '../../utils/formatCurrency'
import { fonts } from '../../theme/typography'
import { RouteSummary } from '../../components/RouteSummary'
import { ShiftRouteMap } from '../../components/ShiftRouteMap'
import { useTheme } from '../../theme/theme'

const LIGHT_CARD = '#FFFFFF'
const AMOUNT_GREEN = '#16A34A'
const TX_LIST_DARK = '#121212'
const TX_LIST_DARK_ALT = 'rgba(255,255,255,0.05)'

export default function EarningsScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { isDark, colors: c } = useTheme()
  const totalBalance = useWalletStore((s) => s.totalBalance)
  const transactions = useWalletStore((s) => s.transactions)
  const shiftStats = useOrdersStore((s) => s.shiftStats)
  const orderHistory = useOrdersStore((s) => s.orderHistory)
  const lastArchivedShift = useShiftBreadcrumbStore((s) => s.lastArchivedShift)
  const isShiftActive = shiftStats.startTime !== null

  const todayEarnings = useMemo(() => selectTodayEarnings(transactions), [transactions])
  const weeklyEarnings = useMemo(() => selectWeeklyEarnings(transactions), [transactions])

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)
  const toggleTx = useCallback((id: string) => {
    setExpandedTxId((prev) => (prev === id ? null : id))
  }, [])

  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [rangeEnd, setRangeEnd] = useState<string | null>(null)

  const handleDayPress = useCallback((day: DateData) => {
    if (!rangeStart || rangeEnd) {
      setRangeStart(day.dateString)
      setRangeEnd(null)
    } else {
      if (day.dateString < rangeStart) {
        setRangeEnd(rangeStart)
        setRangeStart(day.dateString)
      } else {
        setRangeEnd(day.dateString)
      }
    }
  }, [rangeStart, rangeEnd])

  const markedDates = useMemo(() => {
    if (!rangeStart) return {}
    const marks: Record<string, { startingDay?: boolean; endingDay?: boolean; color: string; textColor: string }> = {}
    if (!rangeEnd) {
      marks[rangeStart] = { startingDay: true, endingDay: true, color: c.primary, textColor: '#fff' }
      return marks
    }
    const start = new Date(rangeStart)
    const end = new Date(rangeEnd)
    const cursor = new Date(start)
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10)
      const isStart = key === rangeStart
      const isEnd = key === rangeEnd
      marks[key] = {
        ...(isStart ? { startingDay: true } : {}),
        ...(isEnd ? { endingDay: true } : {}),
        color: isStart || isEnd ? c.primary : (isDark ? 'rgba(99,102,241,0.2)' : 'rgba(99,102,241,0.12)'),
        textColor: isStart || isEnd ? '#fff' : c.text,
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return marks
  }, [rangeStart, rangeEnd, c.primary, c.text, isDark])

  const rangeStats = useMemo(() => {
    if (!rangeStart) return null
    const startMs = new Date(rangeStart).getTime()
    const endMs = rangeEnd
      ? new Date(rangeEnd).getTime() + 86_400_000 - 1
      : startMs + 86_400_000 - 1
    return computeDateRangeStats(orderHistory, startMs, endMs)
  }, [rangeStart, rangeEnd, orderHistory])

  const hasTransactions = transactions.length > 0
  const cardBg = isDark ? c.surface : LIGHT_CARD
  const [shiftTick, setShiftTick] = useState(0)
  useEffect(() => {
    if (shiftStats.startTime == null) return
    const id = setInterval(() => setShiftTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [shiftStats.startTime])
  const hoursOnline = useMemo(() => {
    if (shiftStats.startTime == null) return 0
    return Math.max(0, (Date.now() - shiftStats.startTime) / 3_600_000)
  }, [shiftStats.startTime, shiftStats.completedOrders, shiftTick])
  const plnPerHour =
    hoursOnline > 0.0167 ? shiftStats.totalEarnings / hoursOnline : 0

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.screenTitle, { color: c.textMuted }]}>{t('earnings')}</Text>

      <Text style={[s.sectionTitle, { color: c.textSecondary }]}>{t('current_shift')}</Text>
      <View style={s.shiftRow}>
        <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
          <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('earnings_label')}</Text>
          <Text style={[s.shiftValue, { color: c.text }]}>{formatPln(shiftStats.totalEarnings)}</Text>
        </View>
        <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
          <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('orders_label')}</Text>
          <Text style={[s.shiftValue, { color: c.text }]}>{String(shiftStats.completedOrders)}</Text>
        </View>
        <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
          <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('hours_online')}</Text>
          <Text style={[s.shiftValue, { color: c.text }]}>{`${hoursOnline.toFixed(1)}h`}</Text>
        </View>
      </View>
      <View style={[s.shiftRow, { marginTop: 8 }]}>
        <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
          <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('avg_pln_hour')}</Text>
          <Text style={[s.shiftValue, { color: c.text }]}>
            {plnPerHour > 0 ? formatPln(plnPerHour) : '—'}
          </Text>
        </View>
        <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
          <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('avg_pln_km')}</Text>
          <Text style={[s.shiftValue, { color: c.text }]}>
            {shiftStats.totalKm > 0
              ? (shiftStats.totalEarnings / shiftStats.totalKm).toFixed(2)
              : '—'}
          </Text>
        </View>
      </View>

      {!isShiftActive && lastArchivedShift && (
        <View style={{ marginTop: 16, marginBottom: 8 }}>
          <Text style={[s.sectionTitle, { color: c.textSecondary }]}>
            {t('last_shift_summary')}
          </Text>
          <View style={s.shiftRow}>
            <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
              <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('shift_summary_earnings')}</Text>
              <Text style={[s.shiftValue, { color: c.text }]}>{formatPln(lastArchivedShift.totalEarnings)}</Text>
            </View>
            <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
              <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('shift_summary_orders')}</Text>
              <Text style={[s.shiftValue, { color: c.text }]}>{String(lastArchivedShift.completedOrders)}</Text>
            </View>
          </View>
          <View style={[s.shiftRow, { marginTop: 8 }]}>
            <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
              <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('shift_summary_km')}</Text>
              <Text style={[s.shiftValue, { color: c.text }]}>{lastArchivedShift.totalKm.toFixed(1)}</Text>
            </View>
            <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
              <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('shift_summary_hours')}</Text>
              <Text style={[s.shiftValue, { color: c.text }]}>{lastArchivedShift.hoursActive.toFixed(1)}</Text>
            </View>
          </View>
          <View style={[s.shiftRow, { marginTop: 8 }]}>
            <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
              <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('shift_summary_pln_km')}</Text>
              <Text style={[s.shiftValue, { color: c.text }]}>
                {lastArchivedShift.totalKm > 0
                  ? (lastArchivedShift.totalEarnings / lastArchivedShift.totalKm).toFixed(2)
                  : '—'}
              </Text>
            </View>
            <View style={[s.shiftCard, cardShadow, { backgroundColor: cardBg }]}>
              <Text style={[s.shiftLabel, { color: c.textSecondary }]}>{t('shift_summary_pln_h')}</Text>
              <Text style={[s.shiftValue, { color: c.text }]}>
                {lastArchivedShift.hoursActive > 0.02
                  ? formatPln(lastArchivedShift.totalEarnings / lastArchivedShift.hoursActive)
                  : '—'}
              </Text>
            </View>
          </View>
          <ShiftRouteMap shift={lastArchivedShift} />
        </View>
      )}

      <View style={[s.balanceCard, cardShadow, { backgroundColor: cardBg }]}>
        <Text style={[s.balanceLabel, { color: c.textSecondary }]}>{t('wallet_balance_label')}</Text>
        <Text style={[s.balanceAmount, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatPln(totalBalance)}
        </Text>
      </View>

      <View style={s.statsRow}>
        <View style={[s.statCard, cardShadow, { backgroundColor: cardBg }]}>
          <Text style={[s.statLabel, { color: c.textSecondary }]}>{t('wallet_today')}</Text>
          <Text style={[s.statValue, { color: c.text }]}>{formatPln(todayEarnings)}</Text>
        </View>
        <View style={[s.statCard, cardShadow, { backgroundColor: cardBg }]}>
          <Text style={[s.statLabel, { color: c.textSecondary }]}>{t('wallet_this_week')}</Text>
          <Text style={[s.statValue, { color: c.text }]}>{formatPln(weeklyEarnings)}</Text>
        </View>
      </View>

      <Text style={[s.sectionTitle, { color: c.textSecondary }]}>{t('analytics_title')}</Text>
      <View style={[s.calendarCard, { backgroundColor: cardBg }]}>
        <Calendar
          markingType="period"
          markedDates={markedDates}
          onDayPress={handleDayPress}
          maxDate={new Date().toISOString().slice(0, 10)}
          theme={{
            backgroundColor: 'transparent',
            calendarBackground: 'transparent',
            textSectionTitleColor: c.textMuted,
            dayTextColor: c.text,
            todayTextColor: c.primary,
            monthTextColor: c.text,
            arrowColor: c.primary,
            textDisabledColor: c.textMuted,
            textDayFontFamily: fonts.regular,
            textMonthFontFamily: fonts.semiBold,
            textDayHeaderFontFamily: fonts.medium,
          }}
        />
      </View>

      {rangeStats && rangeStats.orderCount > 0 && (
        <View style={[s.analyticsCard, cardShadow, { backgroundColor: cardBg }]}>
          <View style={s.analyticsRow}>
            <View style={s.analyticItem}>
              <Text style={[s.analyticValue, { color: c.text }]}>{formatPln(rangeStats.totalEarnings)}</Text>
              <Text style={[s.analyticLabel, { color: c.textSecondary }]}>{t('analytics_total_earnings')}</Text>
            </View>
            <View style={s.analyticItem}>
              <Text style={[s.analyticValue, { color: c.text }]}>{rangeStats.totalDistanceKm.toFixed(1)} km</Text>
              <Text style={[s.analyticLabel, { color: c.textSecondary }]}>{t('analytics_total_distance')}</Text>
            </View>
          </View>
          <View style={s.analyticsRow}>
            <View style={s.analyticItem}>
              <Text style={[s.analyticValue, { color: c.text }]}>{String(rangeStats.orderCount)}</Text>
              <Text style={[s.analyticLabel, { color: c.textSecondary }]}>{t('analytics_order_count')}</Text>
            </View>
            <View style={s.analyticItem}>
              <Text style={[s.analyticValue, { color: c.text }]}>{rangeStats.plnPerKm.toFixed(2)}</Text>
              <Text style={[s.analyticLabel, { color: c.textSecondary }]}>PLN/km</Text>
            </View>
          </View>
          <View style={s.analyticsRow}>
            <View style={s.analyticItem}>
              <Text style={[s.analyticValue, { color: c.text }]}>{rangeStats.plnPerHour.toFixed(2)}</Text>
              <Text style={[s.analyticLabel, { color: c.textSecondary }]}>PLN/h</Text>
            </View>
          </View>
        </View>
      )}

      <Text style={[s.sectionTitle, { color: c.textSecondary }]}>{t('wallet_transactions')}</Text>

      {!hasTransactions ? (
        <View style={[s.emptyCard, cardShadow, { backgroundColor: isDark ? TX_LIST_DARK : cardBg }]}>
          <View style={[s.emptyIconWrap, { backgroundColor: isDark ? c.surfaceAlt : '#F3F4F6' }]}>
            <Feather name="inbox" size={44} color={c.textMuted} />
          </View>
          <Text style={[s.emptyTitle, { color: c.text }]}>{t('wallet_empty_title')}</Text>
          <Text style={[s.emptySub, { color: c.textSecondary }]}>{t('wallet_empty_sub')}</Text>
        </View>
      ) : (
        <View
          style={[
            s.listCard,
            cardShadow,
            {
              backgroundColor: isDark ? TX_LIST_DARK : LIGHT_CARD,
              borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
              borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'transparent',
            },
          ]}
        >
          {transactions.map((tx, index) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              isLast={index === transactions.length - 1}
              expanded={expandedTxId === tx.id}
              onToggleExpand={() => toggleTx(tx.id)}
            />
          ))}
        </View>
      )}
    </ScrollView>
  )
}

function TransactionRow({
  tx,
  isLast,
  expanded,
  onToggleExpand,
}: {
  tx: WalletTransaction
  isLast: boolean
  expanded: boolean
  onToggleExpand: () => void
}) {
  const { t } = useTranslation()
  const { isDark, colors: c } = useTheme()
  const time = new Date(tx.date).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const orderLabel = tx.orderId
    ? `${t('wallet_order_prefix')} ${tx.orderId.length > 12 ? tx.orderId.slice(-10) : tx.orderId}`
    : t('wallet_credit')
  const hasTrip =
    typeof tx.pickupAddress === 'string' &&
    tx.pickupAddress.trim().length > 0 &&
    typeof tx.dropoffAddress === 'string' &&
    tx.dropoffAddress.trim().length > 0
  const distKm = typeof tx.distanceKm === 'number' && Number.isFinite(tx.distanceKm) ? tx.distanceKm : 0

  const rowBg = isDark ? TX_LIST_DARK : undefined

  return (
    <View
      style={[s.txWrap, !isLast && [s.txRowBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : c.separator }]]}
    >
      <TouchableOpacity
        style={[s.txRow, rowBg != null && { backgroundColor: rowBg }]}
        activeOpacity={hasTrip ? 0.75 : 1}
        onPress={hasTrip ? onToggleExpand : undefined}
        disabled={!hasTrip}
      >
        <View style={s.txLeft}>
          <View style={[s.txIcon, { backgroundColor: isDark ? TX_LIST_DARK_ALT : '#EFF6FF' }]}>
            <MaterialCommunityIcons
              name={tx.status === 'PENDING' ? 'clock-outline' : 'cash'}
              size={22}
              color={tx.status === 'PENDING' ? '#F59E0B' : c.primary}
            />
          </View>
          <View style={s.txMeta}>
            <Text style={[s.txOrder, { color: c.text }]} numberOfLines={1}>
              {orderLabel}
            </Text>
            <Text style={[s.txTime, { color: c.textMuted }]}>{time}</Text>
            {tx.status === 'PENDING' && (
              <View style={[s.pendingPill, isDark && s.pendingPillDark]}>
                <Text style={[s.pendingPillText, isDark && s.pendingPillTextDark]}>{t('wallet_status_pending')}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={s.txRight}>
          <Text style={[s.txAmount, tx.amount >= 0 ? { color: AMOUNT_GREEN } : { color: '#DC2626' }]}>
            {tx.amount >= 0 ? '+' : ''}
            {formatPln(Math.abs(tx.amount))}
          </Text>
          {hasTrip ? (
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={c.textMuted}
              style={s.txChevron}
            />
          ) : null}
        </View>
      </TouchableOpacity>
      {expanded && hasTrip ? (
        <View
          style={[
            s.txTrip,
            { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : c.separator, backgroundColor: isDark ? TX_LIST_DARK : undefined },
          ]}
        >
          <RouteSummary
            lightSurface={!isDark}
            compact
            pickupAddress={tx.pickupAddress!}
            dropoffAddress={tx.dropoffAddress!}
            distanceKm={distKm}
          />
        </View>
      ) : null}
    </View>
  )
}

const cardShadow =
  Platform.OS === 'android'
    ? { elevation: 3 }
    : {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      }

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  screenTitle: {
    fontSize: 13,
    fontFamily: fonts.medium,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  calendarCard: {
    borderRadius: 14,
    padding: 8,
    marginBottom: 14,
  },
  analyticsCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
  },
  analyticsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  analyticItem: {
    flex: 1,
  },
  analyticValue: {
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: '700',
    marginBottom: 2,
  },
  analyticLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
  },
  shiftRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  shiftCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  shiftLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    marginBottom: 8,
  },
  shiftValue: {
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  balanceCard: {
    borderRadius: 16,
    padding: 22,
    marginBottom: 14,
  },
  balanceLabel: {
    fontSize: 13,
    fontFamily: fonts.medium,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    lineHeight: 42,
    fontFamily: fonts.bold,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    fontFamily: fonts.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  listCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  txWrap: {
    paddingHorizontal: 0,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  txRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  txChevron: { marginLeft: 4 },
  txTrip: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  txRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 12,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txMeta: {
    flex: 1,
    minWidth: 0,
  },
  txOrder: {
    fontSize: 15,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
  },
  txTime: {
    fontSize: 12,
    fontFamily: fonts.regular,
    marginTop: 2,
  },
  pendingPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#FFFBEB',
  },
  pendingPillDark: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  pendingPillText: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: '#D97706',
  },
  pendingPillTextDark: {
    color: '#FBBF24',
  },
  txAmount: {
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: '700',
    marginLeft: 8,
  },
})
