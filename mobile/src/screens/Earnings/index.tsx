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
import { Feather } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import PlatformIcon from '../../components/PlatformIcon'
import { useOrdersStore, CompletedOrder } from '../../store/ordersStore'
import { MOCK_SHIFT_HISTORY } from '../../data/mockShiftHistory'
import { fonts } from '../../theme/typography'
import { useColors, type AppColors } from '../../theme/theme'

type Period = 'today' | 'week' | 'month'
type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const { width: SCREEN_W } = Dimensions.get('window')
const H_PAD = 20
const PLATFORM_LABEL: Record<string, string> = { glovo: 'Glovo', uber: 'Uber', bolt: 'Bolt', wolt: 'Wolt' }

const PEAK_RANGES: [number, number][] = [[12, 14], [18, 21]]
function isPeakHour(h: number) { return PEAK_RANGES.some(([s, e]) => h >= s && h < e) }

function periodStart(period: Period): number {
  const now = new Date()
  if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d.getTime() }
  const d = new Date(now); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d.getTime()
}

function formatGroupDate(ts: number): string {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (ts >= todayStart) return 'Today'
  if (ts >= todayStart - 86_400_000) return 'Yesterday'
  return new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function dayStart(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export default function EarningsScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()
  const { orderHistory } = useOrdersStore()
  const [period, setPeriod] = useState<Period>('today')

  const allOrders: CompletedOrder[] = useMemo(
    () => (orderHistory.length > 0 ? orderHistory : MOCK_SHIFT_HISTORY),
    [orderHistory],
  )

  const filtered = useMemo(() => {
    const start = periodStart(period)
    return allOrders.filter((o) => o.completedAt >= start)
  }, [allOrders, period])

  const total = filtered.reduce((s, o) => s + o.earnings, 0)
  const totalOrders = filtered.length
  const avgPerOrder = totalOrders > 0 ? total / totalOrders : 0
  const totalMinutes = filtered.reduce((s, o) => s + o.durationMin, 0)
  const hoursWorked = (totalMinutes / 60).toFixed(1)
  const prevTotal = total * 0.82
  const changePct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0
  const changePositive = changePct >= 0

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

  const groupedHistory = useMemo(() => {
    const groups: { date: string; dayTs: number; orders: CompletedOrder[]; dayTotal: number }[] = []
    const map: Record<number, CompletedOrder[]> = {}
    filtered.forEach((o) => { const ds = dayStart(o.completedAt); if (!map[ds]) map[ds] = []; map[ds].push(o) })
    Object.entries(map)
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .forEach(([ds, orders]) => {
        groups.push({
          date: formatGroupDate(Number(ds)),
          dayTs: Number(ds),
          orders: orders.sort((a, b) => b.completedAt - a.completedAt),
          dayTotal: orders.reduce((acc, o) => acc + o.earnings, 0),
        })
      })
    return groups
  }, [filtered])

  const hasData = totalOrders > 0
  const barW = Math.max(Math.floor((SCREEN_W - H_PAD * 2 - 32) / 24) - 2, 3)

  const brandAccent = (platform: string) => {
    const map: Record<string, string> = { glovo: c.glovo, uber: c.uber, bolt: c.bolt, wolt: c.wolt }
    return map[platform] ?? c.border
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.periodRow}>
        {(['today', 'week', 'month'] as Period[]).map((p) => {
          const active = period === p
          return (
            <TouchableOpacity
              key={p}
              style={[s.pill, { backgroundColor: active ? c.primary : 'transparent', borderColor: active ? c.primary : c.border }]}
              activeOpacity={0.7}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPeriod(p) }}
            >
              <Text style={[s.pillText, { color: active ? c.textInverse : c.secondary }]}>{t(p as string)}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <View style={[s.mainCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
        <Text style={[s.mainAmount, { color: c.text }]}>{total.toFixed(2)} PLN</Text>
        <View style={s.changeRow}>
          <Text style={[s.changePct, { color: changePositive ? c.success : c.danger }]}>
            {changePositive ? '↑' : '↓'} {Math.abs(changePct).toFixed(1)}% vs prev period
          </Text>
        </View>
        <View style={s.statsRow}>
          <StatCell label={t('orders_label')} value={String(totalOrders)} c={c} />
          <View style={[s.statDiv, { backgroundColor: c.separator }]} />
          <StatCell label={t('avg_pln_km')} value={`${avgPerOrder.toFixed(2)} PLN`} c={c} />
          <View style={[s.statDiv, { backgroundColor: c.separator }]} />
          <StatCell label={t('hours_online')} value={`${hoursWorked}h`} c={c} />
        </View>
      </View>

      {!hasData ? (
        <View style={s.emptyBlock}>
          <Feather name="package" size={48} color={c.textMuted} />
          <Text style={[s.emptyTitle, { color: c.secondary }]}>Ready for your first delivery</Text>
          <Text style={[s.emptySub, { color: c.textMuted }]}>Completed orders and earnings will appear here</Text>
        </View>
      ) : (
        <>
          <Text style={[s.section, { color: c.text }]}>Platform Breakdown</Text>
          {breakdown.map(([platform, data]) => (
            <View key={platform} style={[s.platformCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
              <View style={s.platformRow}>
                <PlatformIcon platform={platform as PlatformId} size={24} active />
                <View style={s.platformInfo}>
                  <Text style={[s.platformName, { color: c.text }]}>{PLATFORM_LABEL[platform] ?? platform}</Text>
                  <Text style={[s.platformSub, { color: c.secondary }]}>{data.orders} orders</Text>
                </View>
                <Text style={[s.platformEarnings, { color: c.text }]}>{data.earnings.toFixed(2)} PLN</Text>
              </View>
              <View style={[s.progressTrack, { backgroundColor: c.separator }]}>
                <View style={[s.progressFill, { width: `${((data.earnings / maxPlatformEarnings) * 100).toFixed(1)}%` as any, backgroundColor: brandAccent(platform) }]} />
              </View>
            </View>
          ))}

          <Text style={[s.section, { color: c.text }]}>Peak Hours</Text>
          <View style={[s.peakCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
            <View style={s.peakBars}>
              {Array.from({ length: 24 }, (_, h) => {
                const peak = isPeakHour(h)
                return (
                  <View key={h} style={s.peakCol}>
                    <View style={[s.peakLine, { width: Math.max(barW, 3), backgroundColor: peak ? c.primary : c.separator }]} />
                    {h % 6 === 0 && <Text style={[s.peakLabel, { color: c.textMuted }]}>{h}</Text>}
                  </View>
                )
              })}
            </View>
            <Text style={[s.peakHint, { color: c.textMuted }]}>Highlighted: peak demand windows</Text>
          </View>

          <Text style={[s.section, { color: c.text }]}>{t('order_history')}</Text>
          {groupedHistory.map((group) => (
            <View key={group.dayTs}>
              <View style={[s.groupHeader, { borderBottomColor: c.separator }]}>
                <Text style={[s.groupDate, { color: c.text }]}>{group.date}</Text>
                <Text style={[s.groupTotal, { color: c.secondary }]}>{group.dayTotal.toFixed(2)} PLN</Text>
              </View>
              {group.orders.map((o) => (
                <HistoryRow key={o.id} order={o} c={c} />
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  )
}

function StatCell({ label, value, c }: { label: string; value: string; c: AppColors }) {
  return (
    <View style={s.statCell}>
      <Text style={[s.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[s.statLabel, { color: c.secondary }]}>{label}</Text>
    </View>
  )
}

function HistoryRow({ order, c }: { order: CompletedOrder; c: AppColors }) {
  const time = new Date(order.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <View style={[s.historyRow, { borderBottomColor: c.separator }]}>
      <PlatformIcon platform={order.platform as PlatformId} size={24} />
      <Text style={[s.historyAddr, { color: c.secondary }]} numberOfLines={1}>{order.dropoffAddress}</Text>
      <Text style={[s.historyTime, { color: c.secondary }]}>{time}</Text>
      <Text style={[s.historyEarnings, { color: c.text }]}>{order.earnings.toFixed(2)} PLN</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: H_PAD },
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  pill: { height: 34, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 13, fontFamily: fonts.medium },
  mainCard: { borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 20 },
  mainAmount: { fontSize: 38, fontWeight: '300', fontFamily: fonts.regular, letterSpacing: 1, marginBottom: 6 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  changePct: { fontSize: 14, fontFamily: fonts.medium },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statCell: { flex: 1, alignItems: 'center' },
  statDiv: { width: 1, height: 28 },
  statValue: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold, marginBottom: 10, marginTop: 4 },
  emptyBlock: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '500', fontFamily: fonts.medium, marginTop: 16 },
  emptySub: { fontSize: 13, fontFamily: fonts.regular, marginTop: 6 },
  platformCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 8 },
  platformRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  platformInfo: { flex: 1 },
  platformName: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium },
  platformSub: { fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  platformEarnings: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 1 },
  progressTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  progressFill: { height: 2, borderRadius: 1 },
  peakCard: { borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 20 },
  peakBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 48 },
  peakCol: { alignItems: 'center' },
  peakLine: { height: 32, borderRadius: 1 },
  peakLabel: { fontSize: 9, fontFamily: fonts.regular, marginTop: 4 },
  peakHint: { fontSize: 11, fontFamily: fonts.regular, marginTop: 8 },
  groupHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, marginBottom: 4 },
  groupDate: { fontSize: 13, fontWeight: '600', fontFamily: fonts.semiBold },
  groupTotal: { fontSize: 13, fontFamily: fonts.regular },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  historyAddr: { flex: 1, fontSize: 13, fontFamily: fonts.regular },
  historyTime: { fontSize: 12, fontFamily: fonts.regular },
  historyEarnings: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold },
})
