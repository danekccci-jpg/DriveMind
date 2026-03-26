import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  AppState,
  AppStateStatus,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import Svg, { Path, Line, Polyline as SvgPolyline } from 'react-native-svg'

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../../components/MapViewWeb'
import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import { useOrdersStore, Order } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { getDashboardSuggestionOrder } from '../../data/mockOrders'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { fonts } from '../../theme/typography'
import { ProfitLabel } from '../../engine/profitEngine'

const TAB_BAR_HEIGHT = 60
const { width: SCREEN_W } = Dimensions.get('window')

// ── Google Maps dark style ────────────────────────────────────────────────────
const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#555555' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0a0a0a' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1c1c1c' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#2a2a2a' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050505' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#111111' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

const KRAKOW_REGION = {
  latitude: 50.0614,
  longitude: 19.9366,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
}

// ── Small SVG helpers ─────────────────────────────────────────────────────────
function ChevronIcon({ open, color = '#888' }: { open: boolean; color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path
        d={open ? 'M3 10 L8 5 L13 10' : 'M3 6 L8 11 L13 6'}
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

function ArrowIcon({ color = '#fff' }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path
        d="M3 9h12M10 4l5 5-5 5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

// ── Pill ─────────────────────────────────────────────────────────────────────
function Pill({ label }: { label: string }) {
  return (
    <View style={s.pill}>
      <Text style={s.pillText}>{label}</Text>
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function DashboardScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()

  const role = useRoleStore((st) => st.role) ?? 'courier'
  const {
    shiftStats,
    dailyGoal,
    isNavigating,
    navigationPhase,
    routePolyline,
    currentStep,
    routeDistance,
    routeDuration,
    pendingConfirmation,
    activeOrders,
    lastPlatformActivity,
    setPendingConfirmation,
    confirmOrder,
    rejectOrder,
    setOrderStatus,
    completeOrder,
    startNavigation,
    updateNavigationPhase,
    stopNavigation,
    setDailyGoal,
  } = useOrdersStore()

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [calcOpen, setCalcOpen] = useState(false)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingOrderRef = useRef<Order | null>(null)

  // Suggestion order (first active order if navigating, else mock suggestion)
  const activeOrder = activeOrders[0] ?? null
  const suggestion = activeOrder ?? getDashboardSuggestionOrder(role as 'courier' | 'taxi')

  // ── Location permission + watch ───────────────────────────────────────────
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return

        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude })

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 20 },
          (l) => setUserLocation({ latitude: l.coords.latitude, longitude: l.coords.longitude }),
        )
      } catch (e) {
        console.warn('Location error:', e)
      }
    })()
    return () => { sub?.remove() }
  }, [])

  // ── AppState listener for platform return (order confirmation) ────────────
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

  // ── Computed values ───────────────────────────────────────────────────────
  const hoursOnline =
    shiftStats.startTime ? (Date.now() - shiftStats.startTime) / 3_600_000 : 0
  const goalProgress = Math.min(shiftStats.totalEarnings / dailyGoal, 1)
  const ordersToGoal = Math.max(
    0,
    Math.ceil((dailyGoal - shiftStats.totalEarnings) / (suggestion.earnings || 1)),
  )
  const estMinutes = ordersToGoal * (suggestion.durationMin || 20)
  const avgRate =
    shiftStats.totalKm > 0
      ? (shiftStats.totalEarnings / shiftStats.totalKm).toFixed(2)
      : '—'

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleAcceptSuggestion = useCallback(() => {
    pendingOrderRef.current = suggestion
    openPlatformDeepLink(suggestion.platform)
  }, [suggestion])

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    confirmOrder(pendingConfirmation)
    startNavigation(pendingConfirmation)
  }, [pendingConfirmation, confirmOrder, startNavigation])

  const handleConfirmNo = useCallback(() => {
    rejectOrder()
  }, [rejectOrder])

  const handleReachedPickup = useCallback(() => {
    if (!activeOrder) return
    setOrderStatus(activeOrder.id, 'dropoff')
    updateNavigationPhase('dropoff')
  }, [activeOrder, setOrderStatus, updateNavigationPhase])

  const handleCompleteOrder = useCallback(() => {
    if (!activeOrder) return
    completeOrder(activeOrder.id)
    stopNavigation()
  }, [activeOrder, completeOrder, stopNavigation])

  // ── Map destination point ─────────────────────────────────────────────────
  const destCoord =
    isNavigating && activeOrder
      ? navigationPhase === 'pickup'
        ? { latitude: activeOrder.pickupLat, longitude: activeOrder.pickupLng }
        : { latitude: activeOrder.dropoffLat, longitude: activeOrder.dropoffLng }
      : null

  const platformName =
    suggestion.platform.charAt(0).toUpperCase() + suggestion.platform.slice(1)

  return (
    <View style={s.root}>
      {/* ── Map ── */}
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        customMapStyle={DARK_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={
          userLocation
            ? { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }
            : KRAKOW_REGION
        }
      >
        {isNavigating && routePolyline && routePolyline.length > 0 && (
          <Polyline
            coordinates={routePolyline}
            strokeColor="#FFFFFF"
            strokeWidth={3}
          />
        )}
        {destCoord && (
          <Marker coordinate={destCoord} pinColor={navigationPhase === 'pickup' ? '#F59E0B' : '#22C55E'} />
        )}
      </MapView>

      {/* ── Header overlay ── */}
      <View style={[s.header, { top: insets.top + 16 }]}>
        <Text style={s.headerTitle}>DriveMind</Text>
        <View style={s.rolePill}>
          <Text style={s.rolePillText}>{role === 'courier' ? '🚲' : '🚗'} {role}</Text>
        </View>
      </View>

      {/* ── Bottom sheet ── */}
      <View style={[s.sheet, { paddingBottom: insets.bottom + 8 }]}>
        {/* Pull indicator */}
        <View style={s.pullBar} />

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatCol label={t('earnings_label')} value={`${shiftStats.totalEarnings.toFixed(0)} PLN`} />
          <View style={s.statDivider} />
          <StatCol label={t('orders_label')} value={String(shiftStats.completedOrders)} />
          <View style={s.statDivider} />
          <StatCol label={t('hours_online')} value={`${hoursOnline.toFixed(1)}h`} />
        </View>

        {/* Daily goal bar */}
        <View style={s.goalRow}>
          <Text style={s.goalLabel}>{t('daily_goal')}</Text>
          <Text style={s.goalValue}>
            {goalProgress >= 1
              ? t('goal_reached')
              : `${shiftStats.totalEarnings.toFixed(0)} / ${dailyGoal} PLN`}
          </Text>
        </View>
        <View style={s.goalTrack}>
          <View style={[s.goalFill, { width: `${(goalProgress * 100).toFixed(1)}%` as any }]} />
        </View>

        {/* Navigation bar (replaces suggestion when navigating) */}
        {isNavigating && activeOrder ? (
          <NavigationBar
            step={currentStep}
            distance={routeDistance}
            duration={routeDuration}
            phase={navigationPhase}
            onReachedPickup={handleReachedPickup}
            onComplete={handleCompleteOrder}
            t={t}
          />
        ) : (
          /* Active suggestion card */
          <View style={s.suggCard}>
            <View style={s.suggHeader}>
              <PlatformIcon platform={suggestion.platform as any} size={32} />
              <Text style={s.suggPlatform}>{platformName}</Text>
              <ProfitBadge label={suggestion.profitLabel as ProfitLabel} />
              <Text style={s.suggPrice}>{suggestion.earnings.toFixed(0)} PLN</Text>
            </View>

            <Text style={s.addressLabel}>{t('pickup').toUpperCase()}</Text>
            <Text style={s.addressValue} numberOfLines={1}>{suggestion.pickupAddress}</Text>

            <View style={s.pillRow}>
              <Pill label={`${suggestion.distanceKm.toFixed(1)} km`} />
              <Pill label={`${suggestion.durationMin} min`} />
              <Pill label={role === 'taxi' ? t('ride') : t('delivery')} />
            </View>

            <TouchableOpacity style={s.acceptBtn} activeOpacity={0.85} onPress={handleAcceptSuggestion}>
              <Text style={s.acceptBtnText}>{t('open_platform', { platform: platformName })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Shift calculator (collapsible) */}
        <TouchableOpacity style={s.calcHeader} activeOpacity={0.7} onPress={() => setCalcOpen((o) => !o)}>
          <Text style={s.calcTitle}>{t('shift_calculator')}</Text>
          <ChevronIcon open={calcOpen} />
        </TouchableOpacity>

        {calcOpen && (
          <View style={s.calcGrid}>
            <CalcCard label={t('orders_to_goal')} value={String(ordersToGoal)} />
            <CalcCard label={t('estimated_time')} value={`${estMinutes} min`} />
            <CalcCard label={t('avg_pln_km')} value={`${avgRate} PLN`} />
            <CalcCard label={t('daily_goal')} value={`${(goalProgress * 100).toFixed(0)}%`} />
            <TouchableOpacity
              style={s.changeGoalBtn}
              onPress={() => setDailyGoal(dailyGoal === 300 ? 400 : 300)}
            >
              <Text style={s.changeGoalText}>{t('change_goal')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Confirmation modal ── */}
      <Modal visible={!!pendingConfirmation} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            {pendingConfirmation && (
              <>
                <PlatformIcon platform={pendingConfirmation.platform as any} size={48} />
                <Text style={s.modalTitle}>{t('order_accepted_title')}</Text>
                <Text style={s.modalAddress} numberOfLines={2}>
                  {pendingConfirmation.pickupAddress}
                </Text>
                <Text style={s.modalArrow}>→</Text>
                <Text style={s.modalAddress} numberOfLines={2}>
                  {pendingConfirmation.dropoffAddress}
                </Text>
                <View style={s.modalBtns}>
                  <TouchableOpacity style={s.modalBtnYes} activeOpacity={0.8} onPress={handleConfirmYes}>
                    <Text style={s.modalBtnYesText}>{t('yes')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalBtnNo} activeOpacity={0.8} onPress={handleConfirmNo}>
                    <Text style={s.modalBtnNoText}>{t('no')}</Text>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCol({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.statCol}>
      <Text style={s.statLabel}>{label.toUpperCase()}</Text>
      <Text style={s.statValue}>{value}</Text>
    </View>
  )
}

function CalcCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.calcCard}>
      <Text style={s.calcCardValue}>{value}</Text>
      <Text style={s.calcCardLabel}>{label}</Text>
    </View>
  )
}

function NavigationBar({
  step,
  distance,
  duration,
  phase,
  onReachedPickup,
  onComplete,
  t,
}: {
  step: string | null
  distance: string | null
  duration: string | null
  phase: 'pickup' | 'dropoff' | null
  onReachedPickup: () => void
  onComplete: () => void
  t: (key: string) => string
}) {
  return (
    <View style={s.navBar}>
      <View style={s.navRow}>
        <ArrowIcon />
        <Text style={s.navStep} numberOfLines={2}>{step ?? '—'}</Text>
        <View style={s.navMeta}>
          {distance && <Text style={s.navMetaText}>{distance}</Text>}
          {duration && <Text style={s.navMetaText}>{duration}</Text>}
        </View>
      </View>
      <TouchableOpacity
        style={s.navBtn}
        activeOpacity={0.8}
        onPress={phase === 'pickup' ? onReachedPickup : onComplete}
      >
        <Text style={s.navBtnText}>
          {phase === 'pickup' ? t('reached_pickup') : t('complete_order')}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
  },
  rolePill: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  rolePillText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#FFFFFF',
    textTransform: 'capitalize',
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: TAB_BAR_HEIGHT,
  },
  pullBar: {
    width: 36,
    height: 4,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statCol: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: '#1A1A1A' },
  statLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#444444',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statValue: { fontSize: 26, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF' },

  // Daily goal
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  goalLabel: { fontSize: 13, fontFamily: fonts.regular, color: '#888888' },
  goalValue: { fontSize: 13, fontFamily: fonts.regular, color: '#FFFFFF' },
  goalTrack: {
    height: 2,
    backgroundColor: '#1A1A1A',
    borderRadius: 1,
    overflow: 'hidden',
    marginBottom: 16,
  },
  goalFill: { height: 2, backgroundColor: '#FFFFFF', borderRadius: 1 },

  // Suggestion card
  suggCard: {
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  suggHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  suggPlatform: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
  },
  suggPrice: { fontSize: 20, fontWeight: '700', fontFamily: fonts.bold, color: '#FFFFFF' },
  addressLabel: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#444444',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  addressValue: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#FFFFFF',
    marginBottom: 10,
  },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: {
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { fontSize: 13, fontFamily: fonts.regular, color: '#888888' },
  acceptBtn: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#000000',
  },

  // Shift calculator
  calcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  calcTitle: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: fonts.medium,
    color: '#FFFFFF',
  },
  calcGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  calcCard: {
    width: (SCREEN_W - 48 - 8) / 2,
    backgroundColor: '#111111',
    borderRadius: 10,
    padding: 12,
  },
  calcCardValue: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  calcCardLabel: { fontSize: 11, fontFamily: fonts.regular, color: '#888888' },
  changeGoalBtn: { paddingVertical: 6 },
  changeGoalText: { fontSize: 13, fontFamily: fonts.medium, color: '#FFFFFF' },

  // Navigation bar
  navBar: {
    backgroundColor: '#111111',
    borderLeftWidth: 2,
    borderLeftColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  navStep: {
    flex: 1,
    fontSize: 14,
    fontFamily: fonts.medium,
    color: '#FFFFFF',
  },
  navMeta: { alignItems: 'flex-end' },
  navMetaText: { fontSize: 12, fontFamily: fonts.regular, color: '#888888' },
  navBtn: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
  },

  // Confirmation modal
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
  modalAddress: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#888888',
    textAlign: 'center',
  },
  modalArrow: { fontSize: 16, color: '#444444' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  modalBtnYes: {
    flex: 1,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnYesText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#000000',
  },
  modalBtnNo: {
    flex: 1,
    height: 50,
    borderWidth: 1,
    borderColor: '#FFFFFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnNoText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
  },
})
