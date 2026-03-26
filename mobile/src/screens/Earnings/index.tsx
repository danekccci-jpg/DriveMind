import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import { useOrdersStore, CompletedOrder } from '../../store/ordersStore'
import { MOCK_SHIFT_HISTORY } from '../../data/mockShiftHistory'
import { fonts } from '../../theme/typography'
import { ProfitLabel } from '../../engine/profitEngine'

type Period = 'today' | 'week' | 'month'
type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const { width: SCREEN_W } = Dimensions.get('window')
const H_PAD = 16

const PLATFORM_LABEL: Record<string, string> = {
  glovo: 'Glovo',
  uber: 'Uber',
  bolt: 'Bolt',
  wolt: 'Wolt',
}

const PLATFORM_COLOR: Record<string, string> = {
  glovo: '#FFB800',
  uber: '#FFFFFF',
  bolt: '#34D186',
  wolt: '#00BCFF',
}

const PEAK_RANGES: [number, number][] = [[12, 14], [18, 21]]

function isPeakHour(h: number) {
  return PEAK_RANGES.some(([s, e]) => h >= s && h < e)
}

function periodStart(period: Period): number {
  const now = new Date()
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }
  if (period === 'week') {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
  const d = new Date(now)
  d.setDate(d.getDate() - 29)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function formatGroupDate(ts: number): string {
  const now = new Date()
  const d = new Date(ts)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterdayStart = todayStart - 86_400_000
  if (ts >= todayStart) return 'Today'
  if (ts >= yesterdayStart) return 'Yesterday'
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function dayStart(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export default function EarningsScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { orderHistory } = useOrdersStore()

  const [period, setPeriod] = useState<Period>('today')

  // Use mock history when no real orders exist
  const allOrders: CompletedOrder[] = useMemo(
    () => (orderHistory.length > 0 ? orderHistory : MOCK_SHIFT_HISTORY),
    [orderHistory],
  )

  const filtered = useMemo(() => {
    const start = periodStart(period)
    return allOrders.filter((o) => o.completedAt >= start)
  }, [allOrders, period])

  // ── Summary ──────────────────────────────────────────────────────────────
  const total = filtered.reduce((s, o) => s + o.earnings, 0)
  const totalOrders = filtered.length
  const avgPerOrder = totalOrders > 0 ? total / totalOrders : 0
  const totalMinutes = filtered.reduce((s, o) => s + o.durationMin, 0)
  const hoursWorked = (totalMinutes / 60).toFixed(1)

  // Fake "previous period" for change %
  const prevTotal = total * 0.82
  const changePct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0
  const changePositive = changePct >= 0

  // ── Platform breakdown ────────────────────────────────────────────────────
  const breakdown = useMemo(() => {
    const map: Record<string, { earnings: number; orders: number }> = {}
    filtered.forEach((o) => {
      if (!map[o.platform]) map[o.platform] = { earnings: 0, orders: 0 }
      map[o.platform].earnings += o.earnings
      map[o.platform].orders += 1
    })
    return Object.entries(map).sort((a, b) => b[1].earnings - a[1].earnings)
  }, [filtered])

  const maxPlatformEarnings = breakdown.length > 0 ? breakdown[0][1].earnings : 1

  // ── Peak hours visualization ──────────────────────────────────────────────
  // 24 bars, each hour 0-23
  const barW = Math.floor((SCREEN_W - H_PAD * 2 - 32) / 24) - 2

  // ── Order history grouped by day ─────────────────────────────────────────
  const groupedHistory = useMemo(() => {
    const groups: { date: string; dayTs: number; orders: CompletedOrder[]; dayTotal: number }[] = []
    const map: Record<number, CompletedOrder[]> = {}
    filtered.forEach((o) => {
      const ds = dayStart(o.completedAt)
      if (!map[ds]) map[ds] = []
      map[ds].push(o)
    })
    Object.entries(map)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .forEach(([ds, orders]) => {
        groups.push({
          date: formatGroupDate(Number(ds)),
          dayTs: Number(ds),
          orders: orders.sort((a, b) => b.completedAt - a.completedAt),
          dayTotal: orders.reduce((s, o) => s + o.earnings, 0),
        })
      })
    return groups
  }, [filtered])

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Period pills ── */}
      <View style={s.periodRow}>
        {(['today', 'week', 'month'] as Period[]).map((p) => {
          const active = period === p
          return (
            <TouchableOpacity
              key={p}
              style={[s.periodPill, active ? s.periodPillActive : s.periodPillInactive]}
              activeOpacity={0.7}
              onPress={() => setPeriod(p)}
            >
              <Text style={[s.periodPillText, active ? s.periodPillTextActive : s.periodPillTextInactive]}>
                {t(p as string)}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Main earnings card ── */}
      <View style={s.mainCard}>
        <Text style={s.mainAmount}>{total.toFixed(2)} PLN</Text>
        <View style={s.changeRow}>
          <Text style={[s.changeArrow, changePositive ? s.changeGreen : s.changeRed]}>
            {changePositive ? '↑' : '↓'}
          </Text>
          <Text style={[s.changePct, changePositive ? s.changeGreen : s.changeRed]}>
            {Math.abs(changePct).toFixed(1)}% vs prev period
          </Text>
        </View>

        <View style={s.mainStatsRow}>
          <MainStat label={t('orders_label')} value={String(totalOrders)} />
          <View style={s.mainStatDiv} />
          <MainStat label={t('avg_pln_km')} value={`${avgPerOrder.toFixed(2)} PLN`} />
          <View style={s.mainStatDiv} />
          <MainStat label={t('hours_online')} value={`${hoursWorked}h`} />
        </View>
      </View>

      {/* ── Platform breakdown ── */}
      <SectionHeader title="Platform Breakdown" />
      {breakdown.length === 0 ? (
        <Text style={s.emptyText}>{t('no_orders_yet')}</Text>
      ) : (
        breakdown.map(([platform, data]) => (
          <View key={platform} style={s.platformCard}>
            <View style={s.platformCardRow}>
              <PlatformIcon platform={platform as PlatformId} size={36} />
              <View style={s.platformInfo}>
                <Text style={s.platformName}>{PLATFORM_LABEL[platform] ?? platform}</Text>
                <Text style={s.platformOrders}>{data.orders} orders</Text>
              </View>
              <Text style={s.platformEarnings}>{data.earnings.toFixed(2)} PLN</Text>
            </View>
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressFill,
                  {
                    width: `${((data.earnings / maxPlatformEarnings) * 100).toFixed(1)}%` as any,
                    backgroundColor: PLATFORM_COLOR[platform] ?? '#FFFFFF',
                  },
                ]}
              />
            </View>
          </View>
        ))
      )}

      {/* ── Peak hours ── */}
      <SectionHeader title="Peak Hours" />
      <View style={s.peakCard}>
        <View style={s.peakBars}>
          {Array.from({ length: 24 }, (_, h) => {
            const peak = isPeakHour(h)
            return (
              <View key={h} style={s.peakBarCol}>
                <View
                  style={[
                    s.peakBar,
                    { width: Math.max(barW, 4), backgroundColor: peak ? '#FFFFFF' : '#2A2A2A' },
                  ]}
                />
                {h % 6 === 0 && <Text style={s.peakHourLabel}>{h}</Text>}
              </View>
            )
          })}
        </View>
        <Text style={s.peakHint}>Highlighted: peak demand windows</Text>
      </View>

      {/* ── Order history ── */}
      <SectionHeader title={t('order_history')} />
      {groupedHistory.length === 0 ? (
        <Text style={s.emptyText}>{t('no_orders_yet')}</Text>
      ) : (
        groupedHistory.map((group) => (
          <View key={group.dayTs}>
            <View style={s.groupHeader}>
              <Text style={s.groupDate}>{group.date}</Text>
              <Text style={s.groupTotal}>{group.dayTotal.toFixed(2)} PLN</Text>
            </View>
            {group.orders.map((o) => (
              <HistoryRow key={o.id} order={o} />
            ))}
          </View>
        ))
      )}
    </ScrollView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return <Text style={s.sectionHeader}>{title}</Text>
}

function MainStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.mainStat}>
      <Text style={s.mainStatValue}>{value}</Text>
      <Text style={s.mainStatLabel}>{label}</Text>
    </View>
  )
}

function HistoryRow({ order }: { order: CompletedOrder }) {
  const time = new Date(order.completedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <View style={s.historyRow}>
      <PlatformIcon platform={order.platform as PlatformId} size={28} />
      <Text style={s.historyAddr} numberOfLines={1}>{order.dropoffAddress}</Text>
      <Text style={s.historyTime}>{time}</Text>
      <Text style={s.historyEarnings}>{order.earnings.toFixed(2)} PLN</Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  content: { paddingHorizontal: H_PAD },

  // Period pills
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodPill: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodPillActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  periodPillInactive: { backgroundColor: 'transparent', borderColor: '#2A2A2A' },
  periodPillText: { fontSize: 13, fontFamily: fonts.medium },
  periodPillTextActive: { color: '#000000' },
  periodPillTextInactive: { color: '#888888' },

  // Main card
  mainCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  mainAmount: { fontSize: 40, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF', marginBottom: 6 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  changeArrow: { fontSize: 14, fontFamily: fonts.medium },
  changePct: { fontSize: 14, fontFamily: fonts.medium },
  changeGreen: { color: '#22C55E' },
  changeRed: { color: '#EF4444' },
  mainStatsRow: { flexDirection: 'row', alignItems: 'center' },
  mainStat: { flex: 1, alignItems: 'center' },
  mainStatDiv: { width: 1, height: 28, backgroundColor: '#2A2A2A' },
  mainStatValue: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },
  mainStatLabel: { fontSize: 11, fontFamily: fonts.regular, color: '#888888', marginTop: 2 },

  // Section header
  sectionHeader: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
    marginTop: 4,
  },

  // Platform cards
  platformCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  platformCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  platformInfo: { flex: 1 },
  platformName: { fontSize: 15, fontWeight: '500', fontFamily: fonts.medium, color: '#FFFFFF' },
  platformOrders: { fontSize: 12, fontFamily: fonts.regular, color: '#888888', marginTop: 1 },
  platformEarnings: { fontSize: 15, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF' },
  progressTrack: { height: 2, backgroundColor: '#1A1A1A', borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: 2, borderRadius: 1 },

  // Peak hours
  peakCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  peakBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 48 },
  peakBarCol: { alignItems: 'center' },
  peakBar: { height: 32, borderRadius: 2 },
  peakHourLabel: { fontSize: 9, fontFamily: fonts.regular, color: '#444444', marginTop: 4 },
  peakHint: { fontSize: 11, fontFamily: fonts.regular, color: '#444444', marginTop: 8 },

  // History
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
    marginBottom: 4,
  },
  groupDate: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },
  groupTotal: { fontSize: 13, fontFamily: fonts.regular, color: '#888888' },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  historyAddr: { flex: 1, fontSize: 13, fontFamily: fonts.regular, color: '#888888' },
  historyTime: { fontSize: 12, fontFamily: fonts.regular, color: '#888888' },
  historyEarnings: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },

  emptyText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#444444',
    marginBottom: 16,
  },
})
