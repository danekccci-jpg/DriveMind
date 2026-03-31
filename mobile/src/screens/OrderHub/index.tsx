import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  Modal,
  AppState,
  AppStateStatus,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import SkeletonCard from '../../components/SkeletonCard'
import { useOrdersStore, Order } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { MOCK_ORDERS } from '../../data/mockOrders'
import { calculateProfitScore } from '../../engine/profitEngine'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { fonts } from '../../theme/typography'
import { useColors, type AppColors } from '../../theme/theme'

type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']
const PLATFORM_LABEL: Record<string, string> = { glovo: 'Glovo', uber: 'Uber', bolt: 'Bolt', wolt: 'Wolt' }

export default function OrderHubScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()
  const role = useRoleStore((st) => st.role) ?? 'courier'
  const fuelConsumption = useRoleStore((st) => st.fuelConsumption)
  const {
    shiftStats, lastPlatformActivity, pendingConfirmation,
    setPendingConfirmation, confirmOrder, rejectOrder, startNavigation,
  } = useOrdersStore()

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId | 'all'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingOrderRef = useRef<Order | null>(null)
  const platforms = role === 'taxi' ? TAXI_PLATFORMS : COURIER_PLATFORMS

  useEffect(() => { const tm = setTimeout(() => setIsLoading(false), 1500); return () => clearTimeout(tm) }, [])

  useEffect(() => {
    const handler = (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active' && pendingOrderRef.current) {
        setPendingConfirmation(pendingOrderRef.current)
        pendingOrderRef.current = null
      }
      appStateRef.current = next
    }
    const sub = AppState.addEventListener('change', handler)
    return () => sub.remove()
  }, [setPendingConfirmation])

  const filteredOrders = useMemo(() => {
    const base = role === 'taxi'
      ? MOCK_ORDERS.filter((o) => o.platform === 'uber' || o.platform === 'bolt')
      : MOCK_ORDERS
    return selectedPlatform === 'all' ? base : base.filter((o) => o.platform === selectedPlatform)
  }, [role, selectedPlatform])

  const handleAccept = useCallback(async (order: Order) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    pendingOrderRef.current = order
    openPlatformDeepLink(order.platform)
  }, [])

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    confirmOrder(pendingConfirmation)
    startNavigation(pendingConfirmation)
  }, [pendingConfirmation, confirmOrder, startNavigation])

  const handleConfirmNo = useCallback(() => rejectOrder(), [rejectOrder])

  const accent = useCallback((platform: string) => {
    const map: Record<string, string> = { glovo: c.glovo, uber: c.uber, bolt: c.bolt, wolt: c.wolt }
    return map[platform] ?? c.border
  }, [c])

  const renderOrder = useCallback(
    ({ item }: { item: Order; index: number }) => {
      const result = calculateProfitScore(item, shiftStats, role as 'courier' | 'taxi', fuelConsumption, lastPlatformActivity)
      const a = accent(item.platform)

      return (
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.separator, borderLeftColor: a }]}>
          <View style={s.cardHeader}>
            <PlatformIcon platform={item.platform as PlatformId} size={24} />
            <Text style={[s.cardPlatform, { color: c.text }]}>{PLATFORM_LABEL[item.platform] ?? item.platform}</Text>
            <ProfitBadge label={result.label} />
            <Text style={[s.cardPrice, { color: c.text }]}>{item.earnings.toFixed(0)} PLN</Text>
          </View>
          <Text style={[s.cardAddr, { color: c.textSecondary }]} numberOfLines={1}>{item.pickupAddress}</Text>
          <View style={s.dataGrid}>
            <DataCell label="DIST" value={`${item.distanceKm.toFixed(1)} km`} c={c} />
            <View style={[s.dataSep, { backgroundColor: c.separator }]} />
            <DataCell label="TIME" value={`${item.durationMin} min`} c={c} />
            <View style={[s.dataSep, { backgroundColor: c.separator }]} />
            <DataCell label="DEAD" value={`${item.deadrunKm.toFixed(1)} km`} c={c} />
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity style={[s.acceptBtn, { borderColor: a }]} activeOpacity={0.7} onPress={() => handleAccept(item)}>
              <Text style={[s.acceptText, { color: a }]}>{t('accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.skipBtn} activeOpacity={0.7}>
              <Text style={[s.skipText, { color: c.textMuted }]}>{t('skip_btn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )
    },
    [shiftStats, role, fuelConsumption, lastPlatformActivity, handleAccept, t, c, accent],
  )

  return (
    <View style={[s.root, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: c.text }]}>{t('available_orders')}</Text>
        <View style={[s.countBadge, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[s.countText, { color: c.secondary }]}>{filteredOrders.length}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.pillsRow}>
        {(['all', ...platforms] as const).map((p) => {
          const active = selectedPlatform === p
          return (
            <TouchableOpacity
              key={p}
              activeOpacity={0.7}
              style={[s.pill, { backgroundColor: active ? c.primary : 'transparent', borderColor: active ? c.primary : c.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedPlatform(p as typeof selectedPlatform) }}
            >
              <Text style={[s.pillText, { color: active ? c.textInverse : c.secondary }]}>
                {p === 'all' ? 'All' : PLATFORM_LABEL[p]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <View style={[s.banner, { backgroundColor: c.surface, borderLeftColor: c.primary }]}>
        <Text style={[s.bannerLabel, { color: c.textMuted }]}>{t('profit_engine').toUpperCase()}</Text>
        <Text style={[s.bannerValue, { color: c.text }]}>{t('best_zone_now')}: Stare Miasto</Text>
      </View>

      {isLoading ? (
        <ScrollView contentContainerStyle={s.listPad} showsVerticalScrollIndicator={false}>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </ScrollView>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrder}
          contentContainerStyle={s.listPad}
          scrollEventThrottle={1}
          removeClippedSubviews
          maxToRenderPerBatch={8}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={[s.empty, { color: c.textMuted }]}>{t('no_orders_yet')}</Text>}
        />
      )}

      <Modal visible={!!pendingConfirmation} transparent animationType="fade">
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalCard, { backgroundColor: c.surface }]}>
            {pendingConfirmation && (
              <>
                <PlatformIcon platform={pendingConfirmation.platform as PlatformId} size={48} active />
                <Text style={[s.modalTitle, { color: c.text }]}>{t('order_accepted_title')}</Text>
                <Text style={[s.modalAddr, { color: c.textSecondary }]} numberOfLines={2}>{pendingConfirmation.pickupAddress}</Text>
                <Text style={[s.modalArrow, { color: c.textMuted }]}>→</Text>
                <Text style={[s.modalAddr, { color: c.textSecondary }]} numberOfLines={2}>{pendingConfirmation.dropoffAddress}</Text>
                <View style={s.modalBtns}>
                  <TouchableOpacity style={[s.modalYes, { backgroundColor: c.primary }]} activeOpacity={0.8} onPress={handleConfirmYes}>
                    <Text style={[s.modalYesText, { color: c.textInverse }]}>{t('yes')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modalNo, { borderColor: c.border }]} activeOpacity={0.8} onPress={handleConfirmNo}>
                    <Text style={[s.modalNoText, { color: c.text }]}>{t('no')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  )
}

function DataCell({ label, value, c }: { label: string; value: string; c: AppColors }) {
  return (
    <View style={s.dataCell}>
      <Text style={[s.dataCellLabel, { color: c.textMuted }]}>{label}</Text>
      <Text style={[s.dataCellValue, { color: c.text }]}>{value}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10 },
  title: { fontSize: 22, fontWeight: '700', fontFamily: fonts.bold },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 13, fontFamily: fonts.medium },
  pillsRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  pill: { height: 34, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 13, fontFamily: fonts.medium },
  banner: { marginHorizontal: 20, marginBottom: 14, borderLeftWidth: 2, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16 },
  bannerLabel: { fontSize: 10, fontFamily: fonts.regular, letterSpacing: 1, marginBottom: 2 },
  bannerValue: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium },
  listPad: { paddingHorizontal: 20, paddingBottom: 20 },
  card: { borderWidth: 1, borderLeftWidth: 2, borderRadius: 14, padding: 16, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardPlatform: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold },
  cardPrice: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 2 },
  cardAddr: { fontSize: 13, fontFamily: fonts.regular, marginBottom: 12 },
  dataGrid: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  dataCell: { flex: 1, alignItems: 'center' },
  dataCellLabel: { fontSize: 10, fontFamily: fonts.regular, letterSpacing: 1, marginBottom: 2 },
  dataCellValue: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold },
  dataSep: { width: 1, height: 24 },
  btnRow: { flexDirection: 'row', gap: 8 },
  acceptBtn: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  acceptText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold },
  skipBtn: { flex: 0.4, height: 42, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 13, fontFamily: fonts.regular },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 15, fontFamily: fonts.regular },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '600', fontFamily: fonts.semiBold, marginTop: 6 },
  modalAddr: { fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  modalArrow: { fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  modalYes: { flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalYesText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  modalNo: { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalNoText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
})
