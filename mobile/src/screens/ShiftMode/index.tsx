import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import { useOrdersStore, CompletedOrder } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { fonts } from '../../theme/typography'
import { useColors, type AppColors } from '../../theme/theme'
import { ProfitLabel } from '../../engine/profitEngine'
import { requestShiftAccessibilityDisclosure } from '../../services/accessibilityDisclosure'
import { syncOrderParsingGate } from '../../services/subscriptionGate'
import { useDriverSessionStore } from '../../store/driverSessionStore'

type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']
const PLATFORM_LABEL: Record<string, string> = { glovo: 'Glovo', uber: 'Uber', bolt: 'Bolt', wolt: 'Wolt' }

function useShiftTimer(startTime: number | null): string {
  const [elapsed, setElapsed] = useState(startTime ? Date.now() - startTime : 0)
  useEffect(() => {
    if (!startTime) { setElapsed(0); return }
    const id = setInterval(() => setElapsed(Date.now() - startTime), 1000)
    return () => clearInterval(id)
  }, [startTime])
  const totalSeconds = Math.floor(elapsed / 1000)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const sec = totalSeconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export default function ShiftModeScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()
  const role = useRoleStore((st) => st.role) ?? 'courier'
  const { shiftStats, orderHistory, dailyGoal, setDailyGoal, startShiftManually, endShiftManually } = useOrdersStore()
  const setIsDriverOnline = useDriverSessionStore((s) => s.setIsOnline)
  const setAccessibilityConsentGiven = useDriverSessionStore((s) => s.setAccessibilityConsentGiven)

  const [shiftStarting, setShiftStarting] = useState(false)

  const platforms = role === 'taxi' ? TAXI_PLATFORMS : COURIER_PLATFORMS
  const isActive = shiftStats.startTime !== null
  const timer = useShiftTimer(shiftStats.startTime)

  const [activePlatforms, setActivePlatforms] = useState<Record<string, boolean>>(
    Object.fromEntries(platforms.map((p) => [p, true])),
  )
  const [autoMode, setAutoMode] = useState(false)

  const togglePlatform = (p: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setActivePlatforms((prev) => ({ ...prev, [p]: !prev[p] }))
  }

  const shiftOrders: CompletedOrder[] = useMemo(() => {
    return orderHistory.filter((o) => shiftStats.startTime && o.completedAt >= shiftStats.startTime)
  }, [orderHistory, shiftStats.startTime])

  const avgRate = shiftStats.totalKm > 0 ? (shiftStats.totalEarnings / shiftStats.totalKm).toFixed(2) : '—'

  const bestPlatform = useMemo(() => {
    if (shiftOrders.length === 0) return '—'
    const totals: Record<string, number> = {}
    shiftOrders.forEach((o) => { totals[o.platform] = (totals[o.platform] ?? 0) + o.earnings })
    const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]
    return best ? PLATFORM_LABEL[best[0]] ?? best[0] : '—'
  }, [shiftOrders])

  const ordersToGoal = Math.max(0, Math.ceil((dailyGoal - shiftStats.totalEarnings) / 20))
  const estMinutes = ordersToGoal * 18

  const handleToggleShift = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (isActive) {
      endShiftManually()
      setIsDriverOnline(false)
      syncOrderParsingGate()
      return
    }

    setShiftStarting(true)
    try {
      const canProceed =
        Platform.OS !== 'android' ? true : await requestShiftAccessibilityDisclosure()
      if (!canProceed) {
        setIsDriverOnline(false)
        return
      }
      setAccessibilityConsentGiven(true)
      startShiftManually()
      setIsDriverOnline(true)
      syncOrderParsingGate()
    } finally {
      setShiftStarting(false)
    }
  }, [
    isActive,
    endShiftManually,
    startShiftManually,
    setIsDriverOnline,
    setAccessibilityConsentGiven,
  ])

  return (
    <ScrollView
      style={[s.root, { backgroundColor: c.bg }]}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: 32 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[s.card, { backgroundColor: c.surface, borderColor: c.separator }]}>
        <View style={s.timerTopRow}>
          <View style={[s.statusPill, { backgroundColor: isActive ? c.successDim : c.surfaceAlt }]}>
            <Text style={[s.statusText, { color: isActive ? c.success : c.textMuted }]}>
              {isActive ? '● ACTIVE' : '○ INACTIVE'}
            </Text>
          </View>
          <Text style={[s.timerEarnings, { color: c.text }]}>{shiftStats.totalEarnings.toFixed(2)} PLN</Text>
        </View>
        <Text style={[s.timer, { color: c.text }]}>{timer}</Text>
        <TouchableOpacity
          style={[s.shiftBtn, isActive ? { borderColor: c.danger, backgroundColor: 'transparent' } : { borderColor: c.primary, backgroundColor: c.primary }]}
          activeOpacity={0.85}
          disabled={shiftStarting}
          onPress={() => {
            void handleToggleShift()
          }}
        >
          <Text style={[s.shiftBtnText, { color: isActive ? c.danger : c.textInverse }]}>
            {isActive ? 'End Shift' : 'Start Shift'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[s.sectionLabel, { color: c.textMuted }]}>{t('active_platforms').toUpperCase()}</Text>
      <Text style={[s.sectionHint, { color: c.textSecondary }]}>{t('only_active_receive')}</Text>

      {platforms.map((p) => (
        <View key={p} style={[s.platformRow, { backgroundColor: c.surface, borderColor: c.separator }]}>
          <PlatformIcon platform={p} size={32} active={activePlatforms[p] ?? true} />
          <Text style={[s.platformName, { color: c.text }]}>{PLATFORM_LABEL[p]}</Text>
          <Switch
            value={activePlatforms[p] ?? true}
            onValueChange={() => togglePlatform(p)}
            trackColor={{ false: c.border, true: c.primary }}
            thumbColor={activePlatforms[p] ? c.textInverse : c.secondary}
          />
        </View>
      ))}

      <View style={[s.card, s.autoCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
        <View style={s.autoLeft}>
          <Text style={[s.autoTitle, { color: c.text }]}>{t('auto_mode')}</Text>
          <Text style={[s.autoDesc, { color: c.textSecondary }]}>{t('auto_mode_desc')}</Text>
        </View>
        <Switch
          value={autoMode}
          onValueChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAutoMode(v) }}
          trackColor={{ false: c.border, true: c.primary }}
          thumbColor={autoMode ? c.textInverse : c.secondary}
        />
      </View>

      <View style={s.statsRow}>
        <StatCard label={t('orders_this_shift')} value={String(shiftStats.completedOrders)} c={c} />
        <StatCard label={t('avg_pln_km')} value={`${avgRate}`} c={c} />
        <StatCard label={t('best_platform')} value={bestPlatform} c={c} />
      </View>

      <Text style={[s.sectionLabel, { marginTop: 20, color: c.textMuted }]}>{t('shift_calculator').toUpperCase()}</Text>
      <View style={s.calcGrid}>
        <StatCard label={t('orders_to_goal')} value={String(ordersToGoal)} c={c} />
        <StatCard label={t('estimated_time')} value={`${estMinutes} min`} c={c} />
        <StatCard label={t('daily_goal')} value={`${Math.round((shiftStats.totalEarnings / dailyGoal) * 100)}%`} c={c} />
      </View>
      <TouchableOpacity style={s.goalBtn} activeOpacity={0.7} onPress={() => setDailyGoal(dailyGoal === 300 ? 400 : 300)}>
        <Text style={[s.goalBtnText, { color: c.primary }]}>{t('change_goal')}</Text>
      </TouchableOpacity>

      <Text style={[s.sectionLabel, { marginTop: 20, color: c.textMuted }]}>{t('this_shift').toUpperCase()}</Text>

      {shiftOrders.length === 0 ? (
        <Text style={[s.emptyText, { color: c.textMuted }]}>{t('no_orders_yet')}</Text>
      ) : (
        shiftOrders.map((o) => <ShiftOrderRow key={o.id} order={o} c={c} />)
      )}
    </ScrollView>
  )
}

function StatCard({ label, value, c }: { label: string; value: string; c: AppColors }) {
  return (
    <View style={[s.statCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
      <Text style={[s.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[s.statLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  )
}

function ShiftOrderRow({ order, c }: { order: CompletedOrder; c: AppColors }) {
  const time = new Date(order.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return (
    <View style={[s.shiftOrderRow, { borderBottomColor: c.separator }]}>
      <PlatformIcon platform={order.platform as PlatformId} size={24} />
      <Text style={[s.shiftOrderAddr, { color: c.textSecondary }]} numberOfLines={1}>{order.dropoffAddress}</Text>
      <View style={s.shiftOrderRight}>
        <Text style={[s.shiftOrderEarnings, { color: c.text }]}>{order.earnings.toFixed(0)} PLN</Text>
        <ProfitBadge label={order.profitLabel as ProfitLabel} />
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 16 },
  timerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontFamily: fonts.medium },
  timerEarnings: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold },
  timer: { fontSize: 48, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 3, textAlign: 'center', marginBottom: 20 },
  shiftBtn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  shiftBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold },
  sectionLabel: { fontSize: 11, fontFamily: fonts.medium, letterSpacing: 1, marginBottom: 4 },
  sectionHint: { fontSize: 12, fontFamily: fonts.regular, marginBottom: 10 },
  platformRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8, gap: 12 },
  platformName: { flex: 1, fontSize: 15, fontFamily: fonts.medium },
  autoCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoLeft: { flex: 1 },
  autoTitle: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  autoDesc: { fontSize: 13, fontFamily: fonts.regular, marginTop: 2 },
  statsRow: { flexDirection: 'row', gap: 8 },
  calcGrid: { flexDirection: 'row', gap: 8, marginTop: 10 },
  statCard: { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12 },
  statValue: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 2 },
  statLabel: { fontSize: 11, fontFamily: fonts.regular },
  shiftOrderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  shiftOrderAddr: { flex: 1, fontSize: 13, fontFamily: fonts.regular },
  shiftOrderRight: { alignItems: 'flex-end', gap: 4 },
  shiftOrderEarnings: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold },
  emptyText: { textAlign: 'center', marginTop: 32, fontSize: 14, fontFamily: fonts.regular },
  goalBtn: { alignSelf: 'flex-start', marginTop: 10, marginBottom: 4, paddingVertical: 6 },
  goalBtnText: { fontSize: 13, fontFamily: fonts.medium },
})
