import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  AppState,
  AppStateStatus,
  Dimensions,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import Svg, { Path } from 'react-native-svg'

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../../components/MapViewWeb'
import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import { useOrdersStore, Order } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { getDashboardSuggestionOrder } from '../../data/mockOrders'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { fonts } from '../../theme/typography'
import { useTheme, type AppColors } from '../../theme/theme'
import { ProfitLabel } from '../../engine/profitEngine'

const TAB_BAR_HEIGHT = 60
const { width: SCREEN_W } = Dimensions.get('window')

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

function ChevronIcon({ open, color = '#888' }: { open: boolean; color?: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
      <Path d={open ? 'M3 10 L8 5 L13 10' : 'M3 6 L8 11 L13 6'} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

function Pill({ label, c }: { label: string; c: AppColors }) {
  return (
    <View style={[s.pill, { backgroundColor: c.surfaceAlt }]}>
      <Text style={[s.pillText, { color: c.textSecondary }]}>{label}</Text>
    </View>
  )
}

export default function DashboardScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()

  const role = useRoleStore((st) => st.role) ?? 'courier'
  const {
    shiftStats, dailyGoal, isNavigating, navigationPhase, routePolyline,
    currentStep, routeDistance, routeDuration, pendingConfirmation,
    activeOrders, lastPlatformActivity, setPendingConfirmation,
    confirmOrder, rejectOrder, setOrderStatus, completeOrder,
    startNavigation, updateNavigationPhase, stopNavigation, setDailyGoal,
  } = useOrdersStore()

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [calcOpen, setCalcOpen] = useState(false)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingOrderRef = useRef<Order | null>(null)

  const activeOrder = activeOrders[0] ?? null
  const suggestion = activeOrder ?? getDashboardSuggestionOrder(role as 'courier' | 'taxi')

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
      } catch (e) { console.warn('Location error:', e) }
    })()
    return () => { sub?.remove() }
  }, [])

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

  const hoursOnline = shiftStats.startTime ? (Date.now() - shiftStats.startTime) / 3_600_000 : 0
  const goalProgress = Math.min(shiftStats.totalEarnings / dailyGoal, 1)
  const ordersToGoal = Math.max(0, Math.ceil((dailyGoal - shiftStats.totalEarnings) / (suggestion.earnings || 1)))
  const estMinutes = ordersToGoal * (suggestion.durationMin || 20)
  const avgRate = shiftStats.totalKm > 0 ? (shiftStats.totalEarnings / shiftStats.totalKm).toFixed(2) : '—'

  const handleAcceptSuggestion = useCallback(() => {
    pendingOrderRef.current = suggestion
    openPlatformDeepLink(suggestion.platform)
  }, [suggestion])

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    confirmOrder(pendingConfirmation)
    startNavigation(pendingConfirmation)
  }, [pendingConfirmation, confirmOrder, startNavigation])

  const handleConfirmNo = useCallback(() => { rejectOrder() }, [rejectOrder])

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

  const destCoord = isNavigating && activeOrder
    ? navigationPhase === 'pickup'
      ? { latitude: activeOrder.pickupLat, longitude: activeOrder.pickupLng }
      : { latitude: activeOrder.dropoffLat, longitude: activeOrder.dropoffLng }
    : null

  const platformName = suggestion.platform.charAt(0).toUpperCase() + suggestion.platform.slice(1)

  return (
    <View style={[s.root, { backgroundColor: c.tabBar }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        customMapStyle={isDark ? DARK_MAP_STYLE : []}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={userLocation ? { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 } : KRAKOW_REGION}
      >
        {isNavigating && routePolyline && routePolyline.length > 0 && (
          <Polyline coordinates={routePolyline} strokeColor={c.primary} strokeWidth={3} />
        )}
        {destCoord && <Marker coordinate={destCoord} pinColor={navigationPhase === 'pickup' ? '#F59E0B' : '#22C55E'} />}
      </MapView>

      {/* Header */}
      <View style={[s.header, { top: insets.top + 16 }]}>
        <Text style={[s.headerTitle, { color: c.text }]}>DriveMind</Text>
        <View style={[s.rolePill, { backgroundColor: c.surface, borderColor: c.border }]}>
          <MaterialCommunityIcons name={role === 'courier' ? 'bike' : 'car-outline'} size={14} color={c.secondary} />
          <Text style={[s.rolePillText, { color: c.text }]}>{role}</Text>
        </View>
      </View>

      {/* Bottom sheet */}
      <View style={[s.sheet, { paddingBottom: insets.bottom + 8, backgroundColor: c.tabBar, borderTopColor: c.tabBarBorder }]}>
        <View style={[s.pullBar, { backgroundColor: c.border }]} />

        <View style={s.statsRow}>
          <StatCol label={t('earnings_label')} value={`${shiftStats.totalEarnings.toFixed(0)} PLN`} c={c} />
          <View style={[s.statDivider, { backgroundColor: c.separator }]} />
          <StatCol label={t('orders_label')} value={String(shiftStats.completedOrders)} c={c} />
          <View style={[s.statDivider, { backgroundColor: c.separator }]} />
          <StatCol label={t('hours_online')} value={`${hoursOnline.toFixed(1)}h`} c={c} />
        </View>

        <View style={s.goalRow}>
          <Text style={[s.goalLabel, { color: c.textSecondary }]}>{t('daily_goal')}</Text>
          <Text style={[s.goalValue, { color: c.text }]}>
            {goalProgress >= 1 ? t('goal_reached') : `${shiftStats.totalEarnings.toFixed(0)} / ${dailyGoal} PLN`}
          </Text>
        </View>
        <View style={[s.goalTrack, { backgroundColor: c.separator }]}>
          <View style={[s.goalFill, { width: `${(goalProgress * 100).toFixed(1)}%` as any, backgroundColor: c.primary }]} />
        </View>

        {isNavigating && activeOrder ? (
          <NavigationBar step={currentStep} distance={routeDistance} duration={routeDuration} phase={navigationPhase}
            onReachedPickup={handleReachedPickup} onComplete={handleCompleteOrder} t={t} c={c} />
        ) : (
          <View style={[s.suggCard, { backgroundColor: c.card, borderColor: c.separator }]}>
            <View style={s.suggHeader}>
              <PlatformIcon platform={suggestion.platform as any} size={32} />
              <Text style={[s.suggPlatform, { color: c.text }]}>{platformName}</Text>
              <ProfitBadge label={suggestion.profitLabel as ProfitLabel} />
              <Text style={[s.suggPrice, { color: c.text }]}>{suggestion.earnings.toFixed(0)} PLN</Text>
            </View>
            <Text style={[s.addressLabel, { color: c.textMuted }]}>{t('pickup').toUpperCase()}</Text>
            <Text style={[s.addressValue, { color: c.text }]} numberOfLines={1}>{suggestion.pickupAddress}</Text>
            <View style={s.pillRow}>
              <Pill label={`${suggestion.distanceKm.toFixed(1)} km`} c={c} />
              <Pill label={`${suggestion.durationMin} min`} c={c} />
              <Pill label={role === 'taxi' ? t('ride') : t('delivery')} c={c} />
            </View>
            <TouchableOpacity style={[s.acceptBtn, { backgroundColor: c.primary }]} activeOpacity={0.85} onPress={handleAcceptSuggestion}>
              <Text style={[s.acceptBtnText, { color: c.textInverse }]}>{t('open_platform', { platform: platformName })}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity style={s.calcHeader} activeOpacity={0.7} onPress={() => setCalcOpen((o) => !o)}>
          <Text style={[s.calcTitle, { color: c.text }]}>{t('shift_calculator')}</Text>
          <ChevronIcon open={calcOpen} color={c.textSecondary} />
        </TouchableOpacity>

        {calcOpen && (
          <View style={s.calcGrid}>
            <CalcCard label={t('orders_to_goal')} value={String(ordersToGoal)} c={c} />
            <CalcCard label={t('estimated_time')} value={`${estMinutes} min`} c={c} />
            <CalcCard label={t('avg_pln_km')} value={`${avgRate} PLN`} c={c} />
            <CalcCard label={t('daily_goal')} value={`${(goalProgress * 100).toFixed(0)}%`} c={c} />
            <TouchableOpacity style={s.changeGoalBtn} onPress={() => setDailyGoal(dailyGoal === 300 ? 400 : 300)}>
              <Text style={[s.changeGoalText, { color: c.primary }]}>{t('change_goal')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Confirmation modal */}
      <Modal visible={!!pendingConfirmation} transparent animationType="fade">
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalCard, { backgroundColor: c.surface }]}>
            {pendingConfirmation && (
              <>
                <PlatformIcon platform={pendingConfirmation.platform as any} size={48} />
                <Text style={[s.modalTitle, { color: c.text }]}>{t('order_accepted_title')}</Text>
                <Text style={[s.modalAddress, { color: c.textSecondary }]} numberOfLines={2}>{pendingConfirmation.pickupAddress}</Text>
                <Text style={[s.modalArrow, { color: c.textMuted }]}>→</Text>
                <Text style={[s.modalAddress, { color: c.textSecondary }]} numberOfLines={2}>{pendingConfirmation.dropoffAddress}</Text>
                <View style={s.modalBtns}>
                  <TouchableOpacity style={[s.modalBtnYes, { backgroundColor: c.primary }]} activeOpacity={0.8} onPress={handleConfirmYes}>
                    <Text style={[s.modalBtnYesText, { color: c.textInverse }]}>{t('yes')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modalBtnNo, { borderColor: c.border }]} activeOpacity={0.8} onPress={handleConfirmNo}>
                    <Text style={[s.modalBtnNoText, { color: c.text }]}>{t('no')}</Text>
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

function StatCol({ label, value, c }: { label: string; value: string; c: AppColors }) {
  return (
    <View style={s.statCol}>
      <Text style={[s.statLabel, { color: c.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[s.statValue, { color: c.text }]}>{value}</Text>
    </View>
  )
}

function CalcCard({ label, value, c }: { label: string; value: string; c: AppColors }) {
  return (
    <View style={[s.calcCard, { backgroundColor: c.card }]}>
      <Text style={[s.calcCardValue, { color: c.text }]}>{value}</Text>
      <Text style={[s.calcCardLabel, { color: c.textSecondary }]}>{label}</Text>
    </View>
  )
}

function NavigationBar({ step, distance, duration, phase, onReachedPickup, onComplete, t, c }: {
  step: string | null; distance: string | null; duration: string | null
  phase: 'pickup' | 'dropoff' | null; onReachedPickup: () => void; onComplete: () => void
  t: (key: string) => string; c: AppColors
}) {
  return (
    <View style={[s.navBar, { backgroundColor: c.card, borderLeftColor: c.primary }]}>
      <View style={s.navRow}>
        <Feather name="arrow-right" size={18} color={c.text} />
        <Text style={[s.navStep, { color: c.text }]} numberOfLines={2}>{step ?? '—'}</Text>
        <View style={s.navMeta}>
          {distance && <Text style={[s.navMetaText, { color: c.textSecondary }]}>{distance}</Text>}
          {duration && <Text style={[s.navMetaText, { color: c.textSecondary }]}>{duration}</Text>}
        </View>
      </View>
      <TouchableOpacity style={[s.navBtn, { borderColor: c.primary }]} activeOpacity={0.8} onPress={phase === 'pickup' ? onReachedPickup : onComplete}>
        <Text style={[s.navBtnText, { color: c.primary }]}>{phase === 'pickup' ? t('reached_pickup') : t('complete_order')}</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  rolePillText: { fontSize: 12, fontFamily: fonts.medium, textTransform: 'capitalize' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTopWidth: 0.5, paddingHorizontal: 20, paddingTop: 12, paddingBottom: TAB_BAR_HEIGHT },
  pullBar: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  statCol: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32 },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: 26, fontWeight: '700', fontFamily: fonts.bold },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  goalLabel: { fontSize: 13, fontFamily: fonts.regular },
  goalValue: { fontSize: 13, fontFamily: fonts.regular },
  goalTrack: { height: 2, borderRadius: 1, overflow: 'hidden', marginBottom: 16 },
  goalFill: { height: 2, borderRadius: 1 },
  suggCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  suggHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  suggPlatform: { flex: 1, fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  suggPrice: { fontSize: 20, fontWeight: '700', fontFamily: fonts.bold },
  addressLabel: { fontSize: 11, fontFamily: fonts.regular, letterSpacing: 0.5, marginBottom: 3 },
  addressValue: { fontSize: 14, fontFamily: fonts.regular, marginBottom: 10 },
  pillRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  pillText: { fontSize: 13, fontFamily: fonts.regular },
  acceptBtn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  calcHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  calcTitle: { fontSize: 14, fontWeight: '500', fontFamily: fonts.medium },
  calcGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  calcCard: { width: (SCREEN_W - 48 - 8) / 2, borderRadius: 10, padding: 12 },
  calcCardValue: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 2 },
  calcCardLabel: { fontSize: 11, fontFamily: fonts.regular },
  changeGoalBtn: { paddingVertical: 6 },
  changeGoalText: { fontSize: 13, fontFamily: fonts.medium },
  navBar: { borderLeftWidth: 2, borderRadius: 12, padding: 14, marginBottom: 12 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  navStep: { flex: 1, fontSize: 14, fontFamily: fonts.medium },
  navMeta: { alignItems: 'flex-end' },
  navMetaText: { fontSize: 12, fontFamily: fonts.regular },
  navBtn: { height: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navBtnText: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '600', fontFamily: fonts.semiBold, marginTop: 6 },
  modalAddress: { fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  modalArrow: { fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  modalBtnYes: { flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnYesText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  modalBtnNo: { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnNoText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
})
