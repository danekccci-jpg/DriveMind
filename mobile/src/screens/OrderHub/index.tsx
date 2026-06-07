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
  Alert,
  Platform,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

import PlatformIcon from '../../components/PlatformIcon'
import { useOrdersStore, Order } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { triggerScraperWindow } from '../../services/driverIngestBridge'
import {
  useDriverIngestStore,
  selectAvailableIngestOffers,
  type IngestedOffer,
} from '../../store/driverIngestStore'
import { fonts } from '../../theme/typography'
import { useColors } from '../../theme/theme'
import { computeProfitability } from '@drivemind/shared'

type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']
const PLATFORM_LABEL: Record<string, string> = { glovo: 'Glovo', uber: 'Uber', bolt: 'Bolt', wolt: 'Wolt' }

function shortStreet(value: string): string {
  const s = (value ?? '').trim()
  if (!s) return '—'
  const i = s.indexOf(',')
  return i > 0 ? s.slice(0, i).trim() : s
}

function ingestToOrder(offer: IngestedOffer): Order {
  const parsedPrice = Number.parseFloat((offer.price ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
  const earnings = Number.isFinite(parsedPrice) ? parsedPrice : 0
  const distParsed = Number.parseFloat((offer.distanceKm ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
  const etaParsed = Number.parseInt((offer.etaMin ?? '').replace(/[^\d]/g, ''), 10)
  const platform = offer.platform === 'unknown' ? 'uber' : offer.platform
  return {
    id: offer.id,
    platform,
    pickupAddress: offer.pickup?.trim() || '—',
    dropoffAddress: offer.destination ?? offer.text ?? '—',
    earnings,
    distanceKm: Number.isFinite(distParsed) && distParsed > 0 ? distParsed : 5,
    durationMin: Number.isFinite(etaParsed) && etaParsed > 0 ? etaParsed : 15,
    deadrunKm: 0,
    pickupLat: 50.0614,
    pickupLng: 19.9366,
    dropoffLat: 50.0614,
    dropoffLng: 19.9366,
    profitScore: 0,
    profitLabel: 'NEUTRAL',
    status: 'pickup',
  }
}

export default function OrderHubScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const c = useColors()
  const role = useRoleStore((st) => st.role) ?? 'courier'
  const {
    pendingConfirmation,
    setPendingConfirmation, confirmOrder, rejectOrder,
  } = useOrdersStore()

  const availableOffers = useDriverIngestStore(selectAvailableIngestOffers)
  const removeOffer = useDriverIngestStore((s) => s.removeOffer)

  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId | 'all'>('all')
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingOrderRef = useRef<Order | null>(null)
  const platforms = role === 'taxi' ? TAXI_PLATFORMS : COURIER_PLATFORMS

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

  const filteredOffers = useMemo(() => {
    const base = role === 'taxi'
      ? availableOffers.filter((o) => o.platform === 'uber' || o.platform === 'bolt')
      : availableOffers
    return selectedPlatform === 'all'
      ? base
      : base.filter((o) => o.platform === selectedPlatform)
  }, [role, selectedPlatform, availableOffers])

  const availableCount = filteredOffers.length

  const handleAccept = useCallback(async (offer: IngestedOffer) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const order = ingestToOrder(offer)
    removeOffer(offer.id)
    if (Platform.OS === 'android') triggerScraperWindow()
    pendingOrderRef.current = order
    openPlatformDeepLink(order.platform)
  }, [removeOffer])

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    const order = pendingConfirmation
    void (async () => {
      try {
        await confirmOrder(order)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[DriveMind Nav]: OrderHub confirmOrder failed', e)
        Alert.alert(t('directions_alert_title'), message)
      }
    })()
  }, [pendingConfirmation, confirmOrder, t])

  const handleConfirmNo = useCallback(() => rejectOrder(), [rejectOrder])

  const renderOffer = useCallback(
    ({ item }: { item: IngestedOffer }) => {
      const order = ingestToOrder(item)
      const result = computeProfitability({
        role: role as 'courier' | 'taxi',
        pricePLN: order.earnings,
        distanceKm: Math.max(0.2, (order.distanceKm ?? 0) + (order.deadrunKm ?? 0)),
        etaMin: Math.max(1, order.durationMin ?? 1),
        dropoffLabel: order.dropoffAddress,
      })
      const platform = (item.platform === 'unknown' ? 'uber' : item.platform) as PlatformId

      return (
        <View style={[s.card, { backgroundColor: c.surface, borderColor: c.separator, borderLeftColor: result.tierColor }]}>
          <View style={s.cardHeader}>
            <PlatformIcon platform={platform} size={24} />
            <Text style={[s.cardPlatform, { color: c.text }]}>{PLATFORM_LABEL[item.platform] ?? item.platform}</Text>
            <View style={[s.tierPill, { borderColor: result.tierColor, backgroundColor: `${result.tierColor}22` }]}>
              <Text style={[s.tierPillText, { color: result.tierColor }]}>{result.tierLabel}</Text>
            </View>
            <Text style={[s.cardPrice, { color: c.text }]}>
              {order.earnings > 0 ? `${order.earnings.toFixed(0)} zł` : item.price ?? '—'}
            </Text>
          </View>
          <View style={[s.routeInline, { borderColor: c.separator }]}>
            <Text style={[s.addrSingle, { color: c.textSecondary }]} numberOfLines={2}>
              {`${shortStreet(order.pickupAddress)} → ${shortStreet(order.dropoffAddress)}`}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.acceptBtn, { backgroundColor: c.primary }]}
            activeOpacity={0.85}
            onPress={() => void handleAccept(item)}
          >
            <Text style={[s.acceptBtnText, { color: c.textInverse }]}>{t('accept')}</Text>
          </TouchableOpacity>
        </View>
      )
    },
    [role, handleAccept, t, c],
  )

  return (
    <View style={[s.root, { paddingTop: insets.top, backgroundColor: c.bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: c.text }]}>{t('available_orders')}</Text>
        <View style={[s.countBadge, { backgroundColor: c.surfaceAlt }]}>
          <Text style={[s.countText, { color: c.secondary }]}>{availableCount}</Text>
        </View>
      </View>

      <ScrollView
        style={s.pillsScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.pillsRow}
      >
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

      <View style={s.listWrap}>
        <FlatList
          style={s.listFlex}
          data={filteredOffers}
          keyExtractor={(item) => item.id}
          renderItem={renderOffer}
          contentContainerStyle={s.listPad}
          scrollEventThrottle={1}
          removeClippedSubviews
          maxToRenderPerBatch={8}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Text style={[s.empty, { color: c.textMuted }]}>{t('no_available_orders')}</Text>
            </View>
          }
        />
      </View>

      <Modal visible={!!pendingConfirmation} transparent animationType="fade">
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalCard, { backgroundColor: c.surface }]}>
            {pendingConfirmation && (
              <>
                <PlatformIcon platform={pendingConfirmation.platform as PlatformId} size={48} active />
                <Text style={[s.modalTitle, { color: c.text }]}>{t('order_accepted_title')}</Text>
                <ScrollView style={s.modalRoute} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  <Text style={[s.modalAddr, { color: c.textSecondary }]} numberOfLines={2}>
                    A: {pendingConfirmation.pickupAddress}
                  </Text>
                  <Text style={[s.modalArrow, { color: c.textMuted }]}>↓</Text>
                  <Text style={[s.modalAddr, { color: c.textSecondary }]} numberOfLines={2}>
                    B: {pendingConfirmation.dropoffAddress}
                  </Text>
                </ScrollView>
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

const s = StyleSheet.create({
  root: { flex: 1, alignSelf: 'stretch', width: '100%', minHeight: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
    flexShrink: 0,
  },
  pillsScroll: { flexGrow: 0, flexShrink: 0 },
  title: { fontSize: 22, fontWeight: '700', fontFamily: fonts.bold },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontSize: 13, fontFamily: fonts.medium },
  pillsRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
  pill: { height: 34, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  pillText: { fontSize: 13, fontFamily: fonts.medium },
  listWrap: { flex: 1, alignSelf: 'stretch', width: '100%', minHeight: 0 },
  listFlex: { flex: 1, alignSelf: 'stretch', width: '100%', minHeight: 0 },
  listPad: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 20,
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    paddingTop: 8,
  },
  card: { borderWidth: 1, borderLeftWidth: 2, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  cardPlatform: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold },
  cardPrice: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bold, letterSpacing: 1 },
  routeInline: {
    minHeight: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  addrSingle: { flex: 1, fontSize: 12, fontFamily: fonts.medium },
  tierPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '50%',
  },
  tierPillText: { fontSize: 10, fontFamily: fonts.semiBold },
  acceptBtn: {
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: { fontSize: 14, fontFamily: fonts.semiBold, fontWeight: '600' },
  empty: { textAlign: 'center', fontSize: 15, fontFamily: fonts.regular },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '600', fontFamily: fonts.semiBold, marginTop: 6 },
  modalRoute: { width: '100%', maxHeight: 280, marginVertical: 6 },
  modalAddr: { fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  modalArrow: { fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  modalYes: { flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalYesText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  modalNo: { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalNoText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
})
