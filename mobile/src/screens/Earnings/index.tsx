import React, { useMemo, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'

import {
  useWalletStore,
  selectTodayEarnings,
  selectWeeklyEarnings,
  type WalletTransaction,
} from '../../store/walletStore'
import { formatPln } from '../../utils/formatCurrency'
import { fonts } from '../../theme/typography'
import { RouteSummary } from '../../components/RouteSummary'
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

  const todayEarnings = useMemo(() => selectTodayEarnings(transactions), [transactions])
  const weeklyEarnings = useMemo(() => selectWeeklyEarnings(transactions), [transactions])

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)
  const toggleTx = useCallback((id: string) => {
    setExpandedTxId((prev) => (prev === id ? null : id))
  }, [])

  const hasTransactions = transactions.length > 0
  const cardBg = isDark ? c.surface : LIGHT_CARD

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[s.screenTitle, { color: c.textMuted }]}>{t('earnings')}</Text>

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
