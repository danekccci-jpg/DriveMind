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
  NativeModules,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Haptics from 'expo-haptics'

import PlatformIcon from '../../components/PlatformIcon'
import { useOrdersStore, Order, type CompletedOrder } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { triggerScraperWindow } from '../../services/driverIngestBridge'
import {
  useAvailableIngestOffers,
  useDriverIngestStore,
  type IngestedOffer,
} from '../../store/driverIngestStore'
import { fonts } from '../../theme/typography'
import { useColors } from '../../theme/theme'
import { computeProfitability } from '@drivemind/shared'
import { normalizePlatformId, type PlatformId } from '../../utils/normalizePlatformId'

const COURIER_PLATFORMS: PlatformId[] = ['glovo', 'uber', 'bolt', 'wolt']
const TAXI_PLATFORMS: PlatformId[] = ['uber', 'bolt']
const PLATFORM_LABEL: Record<string, string> = { glovo: 'Glovo', uber: 'Uber', bolt: 'Bolt', wolt: 'Wolt' }

function sanitizeIngestedOffer(offer: IngestedOffer, index: number): IngestedOffer {
  const safeId = offer.id?.trim() || `mock-${index}`
  return {
    ...offer,
    id: safeId,
    title: offer.title?.trim() || offer.text?.trim() || 'Mock offer',
    text: offer.text?.trim() || offer.title?.trim() || '',
    platform: offer.platform ?? 'unknown',
    packageName: offer.packageName?.trim() || offer.launchPackage?.trim() || 'unknown',
    launchPackage: offer.launchPackage?.trim() || offer.packageName?.trim() || 'unknown',
    contentHash: offer.contentHash?.trim() || safeId,
    capturedAt: typeof offer.capturedAt === 'number' && Number.isFinite(offer.capturedAt) ? offer.capturedAt : Date.now(),
    expiresAt: typeof offer.expiresAt === 'number' && Number.isFinite(offer.expiresAt) ? offer.expiresAt : Date.now() + 180_000,
  }
}

function shortStreet(value: string): string {
  const s = (value ?? '').trim()
  if (!s) return '—'
  const i = s.indexOf(',')
  return i > 0 ? s.slice(0, i).trim() : s
}

function ingestToOrder(offer: IngestedOffer, index = 0): Order {
  const parsedPrice = Number.parseFloat((offer.price ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
  const earnings = Number.isFinite(parsedPrice) ? parsedPrice : 0
  const distParsed = Number.parseFloat((offer.distanceKm ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
  const etaParsed = Number.parseInt((offer.etaMin ?? '').replace(/[^\d]/g, ''), 10)
  const platform = normalizePlatformId(offer.platform)
  return {
    id: offer.id?.trim() || `mock-${index}`,
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
  const orderHistory = useOrdersStore((s) => s.orderHistory)

  const availableOffers = useAvailableIngestOffers()
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
    const sanitized = availableOffers.map((o, i) => sanitizeIngestedOffer(o, i))
    const base = role === 'taxi'
      ? sanitized.filter((o) => o.platform === 'uber' || o.platform === 'bolt' || o.platform === 'unknown')
      : sanitized
    return selectedPlatform === 'all'
      ? base
      : base.filter((o) => normalizePlatformId(o.platform) === selectedPlatform)
  }, [role, selectedPlatform, availableOffers])

  const listHeader = useMemo(
    () => (
      <View style={s.sectionHeader}>
        <Text style={[s.sectionLabel, { color: c.textMuted }]}>
          {t('live_offers').toUpperCase()}
        </Text>
      </View>
    ),
    [c.textMuted, t],
  )

  const listEmpty = useMemo(
    () => (
      <View style={s.emptyWrap}>
        <Text style={[s.empty, { color: c.textMuted }]}>{t('no_available_orders')}</Text>
      </View>
    ),
    [c.textMuted, t],
  )

  const listFooter = useMemo(
    () => <CompletedRidesSection orders={orderHistory} c={c} t={t} />,
    [orderHistory, c, t],
  )

  const availableCount = filteredOffers.length

  const handleAccept = useCallback(async (offer: IngestedOffer) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    const order = ingestToOrder(offer)
    removeOffer(offer.id)
    if (Platform.OS === 'android') triggerScraperWindow()
    pendingOrderRef.current = order

    const launchPkg = offer.launchPackage || offer.packageName
    const nativeOpen = (NativeModules.DriveMindNative as {
      openAppByPackage?: (packageName: string) => Promise<boolean>
    } | undefined)?.openAppByPackage

    if (Platform.OS === 'android' && typeof nativeOpen === 'function' && launchPkg) {
      try {
        await nativeOpen(launchPkg)
        return
      } catch (e) {
        console.warn('[DriveMind] openAppByPackage failed, falling back to deep link', e)
      }
    }
    await openPlatformDeepLink(order.platform)
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
    ({ item, index }: { item: IngestedOffer; index: number }) => {
      try {
        const safe = sanitizeIngestedOffer(item, index)
        const order = ingestToOrder(safe, index)
        const result = computeProfitability({
          role: role as 'courier' | 'taxi',
          pricePLN: order.earnings,
          distanceKm: Math.max(0.2, (order.distanceKm ?? 0) + (order.deadrunKm ?? 0)),
          etaMin: Math.max(1, order.durationMin ?? 1),
          dropoffLabel: order.dropoffAddress,
        })
        const platform = normalizePlatformId(safe.platform)

        return (
          <View style={[s.card, { backgroundColor: c.surface, borderColor: c.separator, borderLeftColor: result.tierColor }]}>
            <View style={s.cardHeader}>
              <PlatformIcon platform={platform} size={24} />
              <Text style={[s.cardPlatform, { color: c.text }]}>
                {PLATFORM_LABEL[safe.platform] ?? PLATFORM_LABEL[platform] ?? safe.platform}
              </Text>
              <View style={[s.tierPill, { borderColor: result.tierColor, backgroundColor: `${result.tierColor}22` }]}>
                <Text style={[s.tierPillText, { color: result.tierColor }]}>{result.tierLabel}</Text>
              </View>
              <Text style={[s.cardPrice, { color: c.text }]}>
                {order.earnings > 0 ? `${order.earnings.toFixed(0)} zł` : safe.price ?? '—'}
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
              onPress={() => void handleAccept(safe)}
            >
              <Text style={[s.acceptBtnText, { color: c.textInverse }]}>{t('accept')}</Text>
            </TouchableOpacity>
          </View>
        )
      } catch (e) {
        if (__DEV__) console.warn('[DriveMind] OrderHub renderOffer failed', e, item)
        return (
          <View style={[s.card, { backgroundColor: c.surface, borderColor: c.separator }]}>
            <Text style={[s.cardPlatform, { color: c.textMuted }]}>Offer unavailable</Text>
          </View>
        )
      }
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
          keyExtractor={(item, index) => item.id || `mock-${index}`}
          renderItem={renderOffer}
          contentContainerStyle={s.listPad}
          scrollEventThrottle={1}
          removeClippedSubviews
          maxToRenderPerBatch={8}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          ListFooterComponent={listFooter}
        />
      </View>

      <Modal visible={!!pendingConfirmation} transparent animationType="fade">
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalCard, { backgroundColor: c.surface }]}>
            {pendingConfirmation && (
              <>
                <PlatformIcon platform={normalizePlatformId(pendingConfirmation.platform)} size={48} active />
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

function CompletedRidesSection({
  orders,
  c,
  t,
}: {
  orders: CompletedOrder[]
  c: ReturnType<typeof useColors>
  t: ReturnType<typeof useTranslation>['t']
}) {
  const recent = orders.slice(0, 10)
  return (
    <View style={s.completedWrap}>
      <Text style={[s.sectionLabel, { color: c.textMuted, marginTop: 12 }]}>
        {t('completed_rides').toUpperCase()}
      </Text>
      {recent.length === 0 ? (
        <Text style={[s.empty, { color: c.textMuted, marginTop: 12 }]}>
          {t('no_completed_rides')}
        </Text>
      ) : (
        recent.map((o, index) => {
          const completedAt = typeof o.completedAt === 'number' ? o.completedAt : Date.now()
          const time = Number.isFinite(completedAt)
            ? new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : '—'
          const rowKey = o.id || `completed-${index}`
          return (
            <View
              key={rowKey}
              style={[s.completedRow, { borderColor: c.separator, backgroundColor: c.surface }]}
            >
              <PlatformIcon platform={normalizePlatformId(o.platform)} size={22} />
              <View style={s.completedMid}>
                <Text style={[s.completedAddr, { color: c.text }]} numberOfLines={1}>
                  {shortStreet(o.dropoffAddress ?? '')}
                </Text>
                <Text style={[s.completedSub, { color: c.textMuted }]}>
                  {time} · {(Number(o.distanceKm) || 0).toFixed(1)} km
                </Text>
              </View>
              <Text style={[s.completedEarnings, { color: c.text }]}>
                {(Number(o.earnings) || 0).toFixed(0)} zł
              </Text>
            </View>
          )
        })
      )}
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
  sectionHeader: { paddingBottom: 8 },
  sectionLabel: { fontSize: 11, fontFamily: fonts.medium, letterSpacing: 1 },
  completedWrap: { paddingTop: 8, gap: 6 },
  completedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 10,
  },
  completedMid: { flex: 1 },
  completedAddr: { fontSize: 13, fontFamily: fonts.semiBold, fontWeight: '600' },
  completedSub: { fontSize: 11, fontFamily: fonts.regular, marginTop: 2 },
  completedEarnings: { fontSize: 14, fontWeight: '700', fontFamily: fonts.bold },
})
