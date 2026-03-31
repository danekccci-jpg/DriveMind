import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  AppState,
  AppStateStatus,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'

import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from '../../components/MapViewWeb'
import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import { useOrdersStore, Order } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { getDashboardSuggestionOrder } from '../../data/mockOrders'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { getDirections, getTravelModeByVehicle } from '../../services/directionsService'
import { fonts } from '../../theme/typography'
import { useTheme, type AppColors } from '../../theme/theme'
import { ProfitLabel } from '../../engine/profitEngine'

const TAB_BAR_HEIGHT = 60

const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#0A0A0A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#EFEFEF' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#0A0A0A' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1A1A1A' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#2A2A2A' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#202020' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#050505' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#111111' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

const LIGHT_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#666666' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#EDEDED' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#D8D8D8' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#E3E3E3' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#CFCFCF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#F3F3F3' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#F5F5F5' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
]

const KRAKOW_REGION = {
  latitude: 50.0614,
  longitude: 19.9366,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
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
  const vehicleType = useRoleStore((st) => st.vehicleType)
  const {
    shiftStats, dailyGoal, isNavigating, navigationPhase, routePolyline,
    currentStep, routeDistance, routeDuration, pendingConfirmation,
    activeOrders, setPendingConfirmation,
    confirmOrder, rejectOrder, setOrderStatus, completeOrder,
    updateNavigationPhase, stopNavigation, recomputeNavigationTarget, updateNavigationRoute,
  } = useOrdersStore()
  const navigationOrderId = useOrdersStore((s) => s.navigationOrderId)

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingOrderRef = useRef<Order | null>(null)
  const mapRef = useRef<any>(null)

  const activeOrder = useMemo(
    () => activeOrders.find((o) => o.id === navigationOrderId) ?? activeOrders[0] ?? null,
    [activeOrders, navigationOrderId],
  )
  const routePolylineSafe = routePolyline ?? []
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

  const handleAcceptSuggestion = useCallback(() => {
    console.log('[DriveMind Nav]: accept tapped', { orderId: suggestion.id })
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    pendingOrderRef.current = suggestion
    openPlatformDeepLink(suggestion.platform)
  }, [suggestion])

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    const mode = getTravelModeByVehicle(vehicleType, role)
    console.log('[DriveMind Nav]: confirm accepted order', {
      orderId: pendingConfirmation.id,
      mode,
      hasLocation: !!userLocation,
    })
    void confirmOrder(
      pendingConfirmation,
      userLocation
        ? {
            originLat: userLocation.latitude,
            originLng: userLocation.longitude,
            mode,
          }
        : undefined,
    )
  }, [pendingConfirmation, confirmOrder, userLocation, vehicleType, role])

  const handleConfirmNo = useCallback(() => { rejectOrder() }, [rejectOrder])

  const handleReachedPickup = useCallback(() => {
    if (!activeOrder) return
    console.log('[DriveMind Nav]: pickup confirmed', { orderId: activeOrder.id })
    setOrderStatus(activeOrder.id, 'dropoff')
    updateNavigationPhase('dropoff')
  }, [activeOrder, setOrderStatus, updateNavigationPhase])

  const handleCompleteOrder = useCallback(() => {
    if (!activeOrder) return
    console.log('[DriveMind Nav]: destination reached; completing order', { orderId: activeOrder.id })
    completeOrder(activeOrder.id)
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    const remainingOrders = useOrdersStore.getState().activeOrders.filter((o) => o.id !== activeOrder.id)
    if (remainingOrders.length === 0) {
      console.log('[DriveMind Nav]: no remaining orders; navigation stop')
      stopNavigation()
    }
  }, [activeOrder, completeOrder, stopNavigation])

  useEffect(() => {
    if (!isNavigating || !userLocation) return
    const selectedId = recomputeNavigationTarget(userLocation.latitude, userLocation.longitude, 0.25)
    if (!selectedId) {
      stopNavigation()
    }
  }, [activeOrders, userLocation, isNavigating, recomputeNavigationTarget, stopNavigation])

  useEffect(() => {
    const target = activeOrder
    if (!isNavigating || !target || !userLocation) return
    const destination =
      target.status === 'pickup'
        ? { latitude: target.pickupLat, longitude: target.pickupLng }
        : { latitude: target.dropoffLat, longitude: target.dropoffLng }

    const mode = getTravelModeByVehicle(vehicleType, role)
    console.log('[DriveMind Nav]: route refresh', {
      orderId: target.id,
      phase: target.status,
      mode,
      origin: userLocation,
      destination,
    })
    getDirections(
      userLocation.latitude,
      userLocation.longitude,
      destination.latitude,
      destination.longitude,
      mode,
    )
      .then((route) => {
        updateNavigationRoute({
          polyline: route.polylinePoints,
          currentStep: route.steps[0]?.instruction ?? '',
          routeDistance: route.distanceText,
          routeDuration: route.durationText,
        })
        updateNavigationPhase(target.status === 'pickup' ? 'pickup' : 'dropoff')
        console.log('[DriveMind Nav]: route updated', {
          points: route.polylinePoints.length,
          distance: route.distanceText,
          duration: route.durationText,
        })
      })
      .catch((err) => console.warn('Directions fetch failed:', err))
  }, [isNavigating, activeOrder, userLocation, vehicleType, role, updateNavigationRoute, updateNavigationPhase])

  const destCoord = isNavigating && activeOrder
    ? navigationPhase === 'pickup'
      ? { latitude: activeOrder.pickupLat, longitude: activeOrder.pickupLng }
      : { latitude: activeOrder.dropoffLat, longitude: activeOrder.dropoffLng }
    : null

  useEffect(() => {
    if (!mapRef.current || !userLocation) return
    if (!isNavigating) {
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500,
      )
      return
    }

    if (routePolyline && routePolyline.length > 1) {
      const coords = [...routePolyline]
      if (destCoord) coords.push(destCoord)
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 140, right: 60, bottom: 220, left: 60 },
        animated: true,
      })
      return
    }
    mapRef.current.animateToRegion(
      {
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      500,
    )
  }, [isNavigating, userLocation, routePolyline, destCoord])

  useEffect(() => {
    if (!mapRef.current || routePolylineSafe.length === 0) return
    console.log('[DriveMind Nav]: fitting camera to polyline', { points: routePolylineSafe.length })
    mapRef.current.fitToCoordinates(routePolylineSafe, {
      edgePadding: { top: 140, right: 60, bottom: 220, left: 60 },
      animated: true,
    })
  }, [routePolylineSafe])

  const platformName = suggestion.platform.charAt(0).toUpperCase() + suggestion.platform.slice(1)

  return (
    <View style={[s.root, { backgroundColor: c.tabBar }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        customMapStyle={isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={userLocation ? { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 } : KRAKOW_REGION}
      >
        {isNavigating && routePolylineSafe.length > 0 && (
          <Polyline coordinates={routePolylineSafe} strokeColor="#1A5CFF" strokeWidth={4} zIndex={10} />
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
      <View style={[s.sheet, { paddingBottom: insets.bottom + 6, backgroundColor: c.tabBar, borderTopColor: c.tabBarBorder }]}>
        <View style={[s.pullBar, { backgroundColor: c.border, marginBottom: 10 }]} />

        <View style={s.statsRow}>
          <StatCol label={t('earnings_label')} value={`${shiftStats.totalEarnings.toFixed(0)} PLN`} c={c} compact />
          <View style={[s.statDivider, { backgroundColor: c.separator }]} />
          <StatCol label={t('orders_label')} value={String(shiftStats.completedOrders)} c={c} compact />
          <View style={[s.statDivider, { backgroundColor: c.separator }]} />
          <StatCol label={t('hours_online')} value={`${hoursOnline.toFixed(1)}h`} c={c} compact />
        </View>

        {isNavigating && activeOrder ? (
          <NavigationBar step={currentStep} distance={routeDistance} duration={routeDuration} phase={navigationPhase}
            onReachedPickup={handleReachedPickup} onComplete={handleCompleteOrder} t={t} c={c} />
        ) : (
          <View style={[s.suggCard, { backgroundColor: c.card, borderColor: c.separator }]}>
            <View style={s.suggHeader}>
              <PlatformIcon platform={suggestion.platform as any} size={32} active />
              <Text style={[s.suggPlatform, { color: c.text }]}>{platformName}</Text>
              <ProfitBadge label={suggestion.profitLabel as ProfitLabel} />
              <Text style={[s.suggPrice, { color: c.text }]}>{suggestion.earnings.toFixed(0)} PLN</Text>
            </View>
            <Text style={[s.addressLabel, { color: c.textMuted }]}>{t('pickup').toUpperCase()}</Text>
            <Text style={[s.addressValue, { color: c.text }]} numberOfLines={1}>{suggestion.pickupAddress}</Text>
            <View style={s.pillRow}>
              <Pill label={`${suggestion.distanceKm.toFixed(1)} km`} c={c} />
              <Pill label={`${suggestion.durationMin} min`} c={c} />
              <Pill label={`${Math.round(goalProgress * 100)}% ${t('daily_goal')}`} c={c} />
            </View>
            <TouchableOpacity style={[s.acceptBtn, { backgroundColor: c.primary }]} activeOpacity={0.85} onPress={handleAcceptSuggestion}>
              <Text style={[s.acceptBtnText, { color: c.textInverse }]}>{t('open_platform', { platform: platformName })}</Text>
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
                <PlatformIcon platform={pendingConfirmation.platform as any} size={48} active />
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

function StatCol({ label, value, c, compact = false }: { label: string; value: string; c: AppColors; compact?: boolean }) {
  return (
    <View style={s.statCol}>
      <Text style={[s.statLabel, { color: c.textMuted }]}>{label.toUpperCase()}</Text>
      <Text style={[compact ? s.statValueCompact : s.statValue, { color: c.text }]}>{value}</Text>
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
        <Text style={[s.navBtnText, { color: c.primary }]}>{phase === 'pickup' ? 'Confirm Pickup' : t('complete_order')}</Text>
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
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 18, borderTopRightRadius: 18, borderTopWidth: 0.5, paddingHorizontal: 16, paddingTop: 8, paddingBottom: TAB_BAR_HEIGHT },
  pullBar: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statCol: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 24 },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: 26, fontWeight: '700', fontFamily: fonts.bold },
  statValueCompact: { fontSize: 20, fontWeight: '700', fontFamily: fonts.bold },
  suggCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 6 },
  suggHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  suggPlatform: { flex: 1, fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  suggPrice: { fontSize: 18, fontWeight: '700', fontFamily: fonts.bold },
  addressLabel: { fontSize: 11, fontFamily: fonts.regular, letterSpacing: 0.5, marginBottom: 3 },
  addressValue: { fontSize: 13, fontFamily: fonts.regular, marginBottom: 8 },
  pillRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  pill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  pillText: { fontSize: 12, fontFamily: fonts.regular },
  acceptBtn: { height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  navBar: { borderLeftWidth: 2, borderRadius: 12, padding: 12, marginBottom: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
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
