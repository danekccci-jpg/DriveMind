import React, { useMemo, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native'
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

const SCREEN_BG = '#F5F6FA'
const CARD = '#FFFFFF'
const DEEP_BLUE = '#1A5CFF'
const AMOUNT_GREEN = '#16A34A'

export default function EarningsScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { isDark } = useTheme()
  const totalBalance = useWalletStore((s) => s.totalBalance)
  const transactions = useWalletStore((s) => s.transactions)

  const todayEarnings = useMemo(() => selectTodayEarnings(transactions), [transactions])
  const weeklyEarnings = useMemo(() => selectWeeklyEarnings(transactions), [transactions])

  const [expandedTxId, setExpandedTxId] = useState<string | null>(null)
  const toggleTx = useCallback((id: string) => {
    setExpandedTxId((prev) => (prev === id ? null : id))
  }, [])

  const hasTransactions = transactions.length > 0

  return (
    <ScrollView
      style={[s.root, { backgroundColor: SCREEN_BG }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 16, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.screenTitle}>{t('earnings')}</Text>

      <View style={[s.balanceCard, cardShadow]}>
        <Text style={s.balanceLabel}>{t('wallet_balance_label')}</Text>
        <Text style={s.balanceAmount} numberOfLines={1} adjustsFontSizeToFit>
          {formatPln(totalBalance)}
        </Text>
      </View>

      <View style={s.statsRow}>
        <View style={[s.statCard, cardShadow]}>
          <Text style={s.statLabel}>{t('wallet_today')}</Text>
          <Text style={s.statValue}>{formatPln(todayEarnings)}</Text>
        </View>
        <View style={[s.statCard, cardShadow]}>
          <Text style={s.statLabel}>{t('wallet_this_week')}</Text>
          <Text style={s.statValue}>{formatPln(weeklyEarnings)}</Text>
        </View>
      </View>

      <Text style={s.sectionTitle}>{t('wallet_transactions')}</Text>

      {!hasTransactions ? (
        <View style={[s.emptyCard, cardShadow]}>
          <View style={s.emptyIconWrap}>
            <Feather name="inbox" size={44} color="#9CA3AF" />
          </View>
          <Text style={s.emptyTitle}>{t('wallet_empty_title')}</Text>
          <Text style={s.emptySub}>{t('wallet_empty_sub')}</Text>
        </View>
      ) : (
        <View style={[s.listCard, cardShadow, { backgroundColor: isDark ? '#121212' : CARD }]}>
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

  return (
    <View style={[s.txWrap, !isLast && s.txRowBorder]}>
      <TouchableOpacity
        style={s.txRow}
        activeOpacity={hasTrip ? 0.75 : 1}
        onPress={hasTrip ? onToggleExpand : undefined}
        disabled={!hasTrip}
      >
        <View style={s.txLeft}>
          <View style={s.txIcon}>
            <MaterialCommunityIcons
              name={tx.status === 'PENDING' ? 'clock-outline' : 'cash'}
              size={22}
              color={tx.status === 'PENDING' ? '#F59E0B' : DEEP_BLUE}
            />
          </View>
          <View style={s.txMeta}>
            <Text style={s.txOrder} numberOfLines={1}>
              {orderLabel}
            </Text>
            <Text style={s.txTime}>{time}</Text>
            {tx.status === 'PENDING' && (
              <View style={s.pendingPill}>
                <Text style={s.pendingPillText}>{t('wallet_status_pending')}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={s.txRight}>
          <Text style={[s.txAmount, tx.amount >= 0 ? s.txAmountPos : s.txAmountNeg]}>
            {tx.amount >= 0 ? '+' : ''}
            {formatPln(Math.abs(tx.amount))}
          </Text>
          {hasTrip ? (
            <MaterialCommunityIcons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color="#9CA3AF"
              style={s.txChevron}
            />
          ) : null}
        </View>
      </TouchableOpacity>
      {expanded && hasTrip ? (
        <View style={s.txTrip}>
          <RouteSummary
            lightSurface
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
    color: '#6B7280',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  balanceCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    padding: 22,
    marginBottom: 14,
  },
  balanceLabel: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: '#6B7280',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 36,
    lineHeight: 42,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  statCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 14,
    padding: 16,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#6B7280',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 17,
    fontFamily: fonts.bold,
    fontWeight: '700',
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  listCard: {
    backgroundColor: CARD,
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
    borderTopColor: '#F3F4F6',
  },
  txRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
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
    backgroundColor: '#EFF6FF',
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
    color: '#111827',
  },
  txTime: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#9CA3AF',
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
  pendingPillText: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: '#D97706',
  },
  txAmount: {
    fontSize: 15,
    fontFamily: fonts.bold,
    fontWeight: '700',
    marginLeft: 8,
  },
  txAmountPos: {
    color: AMOUNT_GREEN,
  },
  txAmountNeg: {
    color: '#DC2626',
  },
})
