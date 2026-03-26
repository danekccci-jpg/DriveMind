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
import { ProfitLabel } from '../../engine/profitEngine'

type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']

const PLATFORM_COLOR: Record<string, string> = {
  glovo: '#FFB800',
  uber: '#FFFFFF',
  bolt: '#34D186',
  wolt: '#00BCFF',
}

const PLATFORM_LABEL: Record<string, string> = {
  glovo: 'Glovo',
  uber: 'Uber',
  bolt: 'Bolt',
  wolt: 'Wolt',
}

export default function OrderHubScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const role = useRoleStore((st) => st.role) ?? 'courier'
  const fuelConsumption = useRoleStore((st) => st.fuelConsumption)
  const {
    shiftStats,
    lastPlatformActivity,
    pendingConfirmation,
    setPendingConfirmation,
    confirmOrder,
    rejectOrder,
    startNavigation,
  } = useOrdersStore()

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId | 'all'>('all')
  const [isLoading, setIsLoading] = useState(true)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingOrderRef = useRef<Order | null>(null)

  const platforms = role === 'taxi' ? TAXI_PLATFORMS : COURIER_PLATFORMS

  // Simulate 1.5s loading
  useEffect(() => {
    const t = setTimeout(() => setIsLoading(false), 1500)
    return () => clearTimeout(t)
  }, [])

  // AppState → show confirmation modal on return from platform app
  useEffect(() => {
    const handler = (next: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && next === 'active') {
        if (pendingOrderRef.current) {
          setPendingConfirmation(pendingOrderRef.current)
          pendingOrderRef.current = null
        }
      }
      appStateRef.current = next
    }
    const sub = AppState.addEventListener('change', handler)
    return () => sub.remove()
  }, [setPendingConfirmation])

  const filteredOrders = useMemo(() => {
    const base =
      role === 'taxi'
        ? MOCK_ORDERS.filter((o) => o.platform === 'uber' || o.platform === 'bolt')
        : MOCK_ORDERS
    return selectedPlatform === 'all'
      ? base
      : base.filter((o) => o.platform === selectedPlatform)
  }, [role, selectedPlatform])

  const handleAccept = useCallback(
    async (order: Order) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      pendingOrderRef.current = order
      openPlatformDeepLink(order.platform)
    },
    [],
  )

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    confirmOrder(pendingConfirmation)
    startNavigation(pendingConfirmation)
  }, [pendingConfirmation, confirmOrder, startNavigation])

  const handleConfirmNo = useCallback(() => rejectOrder(), [rejectOrder])

  const renderOrder = useCallback(
    ({ item }: { item: Order; index: number }) => {
      const result = calculateProfitScore(
        item,
        shiftStats,
        role as 'courier' | 'taxi',
        fuelConsumption,
        lastPlatformActivity,
      )
      const platformLabel = PLATFORM_LABEL[item.platform] ?? item.platform
      const borderColor = PLATFORM_COLOR[item.platform] ?? '#2A2A2A'

      return (
        <View style={[s.orderCard, { borderLeftColor: borderColor }]}>
          {/* Row 1: icon + name + price */}
          <View style={s.cardHeader}>
            <PlatformIcon platform={item.platform as PlatformId} size={40} />
            <Text style={s.platformName}>{platformLabel}</Text>
            <View style={s.priceBlock}>
              <Text style={s.price}>{item.earnings.toFixed(0)} PLN</Text>
              <ProfitBadge label={result.label} />
            </View>
          </View>

          {/* Row 2: pickup address */}
          <Text style={s.addrLabel}>{t('pickup').toUpperCase()}</Text>
          <Text style={s.addrValue} numberOfLines={1}>{item.pickupAddress}</Text>

          {/* Row 3: pills */}
          <View style={s.pillRow}>
            <InfoPill label={`${item.deadrunKm.toFixed(1)} km away`} />
            <InfoPill label={`${item.distanceKm.toFixed(1)} km`} />
            <InfoPill label={`${item.durationMin} min`} />
          </View>

          {/* Row 4: buttons */}
          <View style={s.btnRow}>
            <TouchableOpacity
              style={s.acceptBtn}
              activeOpacity={0.85}
              onPress={() => handleAccept(item)}
            >
              <Text style={s.acceptBtnText}>{t('accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.skipBtn} activeOpacity={0.7}>
              <Text style={s.skipBtnText}>{t('skip_btn')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )
    },
    [shiftStats, role, fuelConsumption, lastPlatformActivity, handleAccept, t],
  )

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.title}>{t('available_orders')}</Text>
        <View style={s.countBadge}>
          <Text style={s.countText}>{filteredOrders.length}</Text>
        </View>
      </View>

      {/* Platform filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pillsContainer}
      >
        {(['all', ...platforms] as const).map((p) => {
          const active = selectedPlatform === p
          return (
            <TouchableOpacity
              key={p}
              activeOpacity={0.7}
              style={[s.filterPill, active ? s.filterPillActive : s.filterPillInactive]}
              onPress={() => setSelectedPlatform(p as typeof selectedPlatform)}
            >
              <Text style={[s.filterPillText, active ? s.filterPillTextActive : s.filterPillTextInactive]}>
                {p === 'all' ? 'All' : PLATFORM_LABEL[p]}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {/* Profit Engine banner */}
      <View style={s.banner}>
        <Text style={s.bannerLabel}>{t('profit_engine').toUpperCase()}</Text>
        <Text style={s.bannerValue}>{t('best_zone_now')}: Stare Miasto</Text>
      </View>

      {/* List */}
      {isLoading ? (
        <ScrollView
          contentContainerStyle={s.listPad}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
          showsHorizontalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={s.empty}>{t('no_orders_yet')}</Text>
          }
        />
      )}

      {/* Confirmation modal */}
      <Modal visible={!!pendingConfirmation} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {pendingConfirmation && (
              <>
                <PlatformIcon platform={pendingConfirmation.platform as PlatformId} size={48} />
                <Text style={s.modalTitle}>{t('order_accepted_title')}</Text>
                <Text style={s.modalAddr} numberOfLines={2}>{pendingConfirmation.pickupAddress}</Text>
                <Text style={s.modalArrow}>→</Text>
                <Text style={s.modalAddr} numberOfLines={2}>{pendingConfirmation.dropoffAddress}</Text>
                <View style={s.modalBtns}>
                  <TouchableOpacity style={s.modalYes} activeOpacity={0.8} onPress={handleConfirmYes}>
                    <Text style={s.modalYesText}>{t('yes')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalNo} activeOpacity={0.8} onPress={handleConfirmNo}>
                    <Text style={s.modalNoText}>{t('no')}</Text>
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

function InfoPill({ label }: { label: string }) {
  return (
    <View style={s.infoPill}>
      <Text style={s.infoPillText}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF' },
  countBadge: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: { fontSize: 13, fontFamily: fonts.medium, color: '#888888' },

  pillsContainer: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
  filterPill: {
    height: 34,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  filterPillInactive: { backgroundColor: 'transparent', borderColor: '#2A2A2A' },
  filterPillText: { fontSize: 13, fontFamily: fonts.medium },
  filterPillTextActive: { color: '#000000' },
  filterPillTextInactive: { color: '#888888' },

  banner: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: '#111111',
    borderLeftWidth: 2,
    borderLeftColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bannerLabel: {
    fontSize: 10,
    fontFamily: fonts.regular,
    color: '#444444',
    letterSpacing: 1,
    marginBottom: 2,
  },
  bannerValue: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium, color: '#FFFFFF' },

  listPad: { paddingHorizontal: 20, paddingBottom: 20 },

  orderCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderLeftWidth: 2,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  platformName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
  },
  priceBlock: { alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 20, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF' },

  addrLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#444444',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  addrValue: { fontSize: 13, fontFamily: fonts.regular, color: '#888888', marginBottom: 10 },

  pillRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  infoPill: {
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  infoPillText: { fontSize: 13, fontFamily: fonts.regular, color: '#888888' },

  btnRow: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    flex: 1,
    height: 44,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold, color: '#000000' },
  skipBtn: {
    flex: 0.45,
    height: 44,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtnText: { fontSize: 14, fontFamily: fonts.medium, color: '#888888' },

  empty: {
    textAlign: 'center',
    marginTop: 60,
    fontSize: 15,
    fontFamily: fonts.regular,
    color: '#444444',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    alignItems: 'center',
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
    marginTop: 6,
  },
  modalAddr: { fontSize: 14, fontFamily: fonts.regular, color: '#888888', textAlign: 'center' },
  modalArrow: { fontSize: 16, color: '#444444' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  modalYes: {
    flex: 1,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalYesText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold, color: '#000000' },
  modalNo: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalNoText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold, color: '#FFFFFF' },
})
