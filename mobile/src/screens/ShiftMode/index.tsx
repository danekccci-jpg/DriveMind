import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import { useOrdersStore, CompletedOrder } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { MOCK_SHIFT_HISTORY } from '../../data/mockShiftHistory'
import { fonts } from '../../theme/typography'
import { ProfitLabel } from '../../engine/profitEngine'

type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']

const PLATFORM_LABEL: Record<string, string> = {
  glovo: 'Glovo',
  uber: 'Uber',
  bolt: 'Bolt',
  wolt: 'Wolt',
}

// ── Live timer ────────────────────────────────────────────────────────────────
function useShiftTimer(startTime: number | null): string {
  const [elapsed, setElapsed] = useState(
    startTime ? Date.now() - startTime : 0,
  )

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
  const role = useRoleStore((st) => st.role) ?? 'courier'
  const { shiftStats, orderHistory } = useOrdersStore()

  const platforms = role === 'taxi' ? TAXI_PLATFORMS : COURIER_PLATFORMS

  const isActive = shiftStats.startTime !== null
  const timer = useShiftTimer(shiftStats.startTime)

  // Platform toggles (local UI state — extend with store later)
  const [activePlatforms, setActivePlatforms] = useState<Record<string, boolean>>(
    Object.fromEntries(platforms.map((p) => [p, true])),
  )
  const [autoMode, setAutoMode] = useState(false)

  const togglePlatform = (p: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setActivePlatforms((prev) => ({ ...prev, [p]: !prev[p] }))
  }

  // Shift orders: combine real history + mock history for display
  const shiftOrders: CompletedOrder[] = useMemo(() => {
    const real = orderHistory.filter(
      (o) => shiftStats.startTime && o.completedAt >= shiftStats.startTime,
    )
    return real.length > 0 ? real : MOCK_SHIFT_HISTORY
  }, [orderHistory, shiftStats.startTime])

  // Stats
  const avgRate =
    shiftStats.totalKm > 0
      ? (shiftStats.totalEarnings / shiftStats.totalKm).toFixed(2)
      : '—'

  const bestPlatform = useMemo(() => {
    if (shiftOrders.length === 0) return '—'
    const totals: Record<string, number> = {}
    shiftOrders.forEach((o) => {
      totals[o.platform] = (totals[o.platform] ?? 0) + o.earnings
    })
    const best = Object.entries(totals).sort((a, b) => b[1] - a[1])[0]
    return best ? PLATFORM_LABEL[best[0]] ?? best[0] : '—'
  }, [shiftOrders])

  // Shift start/end (stub — extend with ordersStore action later)
  const handleToggleShift = () => {
    // Handled by ordersStore.confirmOrder setting startTime;
    // end-shift would reset it. Placeholder for future implementation.
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: 32 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Timer card ── */}
      <View style={s.card}>
        <View style={s.timerTopRow}>
          <View style={[s.statusPill, isActive ? s.statusActive : s.statusInactive]}>
            <Text style={[s.statusText, isActive ? s.statusTextActive : s.statusTextInactive]}>
              {isActive ? '● ACTIVE' : '○ INACTIVE'}
            </Text>
          </View>
          <Text style={s.timerEarnings}>
            {shiftStats.totalEarnings.toFixed(2)} PLN
          </Text>
        </View>

        <Text style={s.timer}>{timer}</Text>

        <TouchableOpacity
          style={[s.shiftBtn, isActive ? s.shiftBtnEnd : s.shiftBtnStart]}
          activeOpacity={0.85}
          onPress={handleToggleShift}
        >
          <Text style={[s.shiftBtnText, isActive ? s.shiftBtnTextEnd : s.shiftBtnTextStart]}>
            {isActive ? 'End Shift' : 'Start Shift'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Active Platforms ── */}
      <Text style={s.sectionLabel}>{t('active_platforms').toUpperCase()}</Text>
      <Text style={s.sectionHint}>{t('only_active_receive')}</Text>

      {platforms.map((p) => (
        <View key={p} style={s.platformRow}>
          <PlatformIcon platform={p} size={32} />
          <Text style={s.platformName}>{PLATFORM_LABEL[p]}</Text>
          <Switch
            value={activePlatforms[p] ?? true}
            onValueChange={() => togglePlatform(p)}
            trackColor={{ false: '#2A2A2A', true: '#FFFFFF' }}
            thumbColor={activePlatforms[p] ? '#000000' : '#888888'}
          />
        </View>
      ))}

      {/* ── Auto Mode ── */}
      <View style={[s.card, s.autoCard]}>
        <View style={s.autoLeft}>
          <Text style={s.autoTitle}>{t('auto_mode')}</Text>
          <Text style={s.autoDesc}>{t('auto_mode_desc')}</Text>
        </View>
        <Switch
          value={autoMode}
          onValueChange={(v) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            setAutoMode(v)
          }}
          trackColor={{ false: '#2A2A2A', true: '#FFFFFF' }}
          thumbColor={autoMode ? '#000000' : '#888888'}
        />
      </View>

      {/* ── Stats row ── */}
      <View style={s.statsRow}>
        <StatCard label={t('orders_this_shift')} value={String(shiftStats.completedOrders)} />
        <StatCard label={t('avg_pln_km')} value={`${avgRate}`} />
        <StatCard label={t('best_platform')} value={bestPlatform} />
      </View>

      {/* ── This shift orders ── */}
      <Text style={[s.sectionLabel, { marginTop: 20 }]}>{t('this_shift').toUpperCase()}</Text>

      {shiftOrders.length === 0 ? (
        <Text style={s.emptyText}>{t('no_orders_yet')}</Text>
      ) : (
        shiftOrders.map((o) => (
          <ShiftOrderRow key={o.id} order={o} />
        ))
      )}
    </ScrollView>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

function ShiftOrderRow({ order }: { order: CompletedOrder }) {
  const time = new Date(order.completedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <View style={s.shiftOrderRow}>
      <PlatformIcon platform={order.platform as PlatformId} size={28} />
      <Text style={s.shiftOrderAddr} numberOfLines={1}>
        {order.dropoffAddress}
      </Text>
      <View style={s.shiftOrderRight}>
        <Text style={s.shiftOrderEarnings}>{order.earnings.toFixed(0)} PLN</Text>
        <ProfitBadge label={order.profitLabel as ProfitLabel} />
      </View>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  content: { paddingHorizontal: 16 },

  card: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },

  // Timer card
  timerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusActive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  statusInactive: { backgroundColor: '#1A1A1A' },
  statusText: { fontSize: 11, fontFamily: fonts.medium },
  statusTextActive: { color: '#22C55E' },
  statusTextInactive: { color: '#444444' },
  timerEarnings: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF' },
  timer: {
    fontSize: 48,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    letterSpacing: 3,
    textAlign: 'center',
    marginBottom: 20,
  },
  shiftBtn: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  shiftBtnStart: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  shiftBtnEnd: { backgroundColor: 'transparent', borderColor: '#EF4444' },
  shiftBtnText: { fontSize: 16, fontWeight: '600', fontFamily: fonts.semiBold },
  shiftBtnTextStart: { color: '#000000' },
  shiftBtnTextEnd: { color: '#EF4444' },

  // Section labels
  sectionLabel: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#444444',
    letterSpacing: 1,
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#888888',
    marginBottom: 10,
  },

  // Platform rows
  platformRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  platformName: {
    flex: 1,
    fontSize: 15,
    fontFamily: fonts.medium,
    color: '#FFFFFF',
  },

  // Auto mode card
  autoCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoLeft: { flex: 1 },
  autoTitle: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },
  autoDesc: { fontSize: 13, fontFamily: fonts.regular, color: '#888888', marginTop: 2 },

  // Stats row
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
  },
  statValue: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF', marginBottom: 2 },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, color: '#888888' },

  // Shift order rows
  shiftOrderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A1A',
  },
  shiftOrderAddr: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#888888',
  },
  shiftOrderRight: { alignItems: 'flex-end', gap: 4 },
  shiftOrderEarnings: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },

  emptyText: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#444444',
  },
})
