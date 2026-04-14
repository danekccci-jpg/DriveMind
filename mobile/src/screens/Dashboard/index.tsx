import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  AppState,
  AppStateStatus,
  Alert,
  Animated,
  Platform,
  ScrollView,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import Svg, { Circle } from 'react-native-svg'

import MapView, { Marker, MarkerAnimated, AnimatedRegion } from '../../components/MapViewWeb'
import { NavigationMapLayers } from '../../components/navigation/NavigationMapLayers'
import { DirectionCard } from '../../components/navigation/DirectionCard'
import { PlayerNavMarker } from '../../components/navigation/PlayerNavMarker'
import { RouteSummary } from '../../components/RouteSummary'
import { formatNavDistanceLine } from '../../navigation/navigationFormatting'
import { useNavigationSettingsStore } from '../../store/navigationSettingsStore'
import {
  haversineMeters,
  trimPolylineBehindUser,
  distancePointToPolylineMeters,
  distanceToNextManeuverMeters,
  lowPassHeading,
  bearingDegrees,
  extractStreetName,
  type LatLng,
} from '../../navigation/navigationGeometry'
import PlatformIcon from '../../components/PlatformIcon'
import ProfitBadge from '../../components/ProfitBadge'
import { useOrdersStore, Order } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { getDashboardSuggestionOrder } from '../../data/mockOrders'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { getTravelModeByVehicle } from '../../services/directionsService'
import { navigationEngine } from '../../services/navigationEngine'
import { triggerScraperWindow } from '../../services/driverIngestBridge'
import { useDriverSessionStore } from '../../store/driverSessionStore'
import { fonts } from '../../theme/typography'
import { useTheme, type AppColors } from '../../theme/theme'
import { ProfitLabel } from '../../engine/profitEngine'
import { PROVIDER_GOOGLE } from 'react-native-maps'
import { MAP_STYLE_DARK, MAP_STYLE_LIGHT } from '../../map/mapStyles'

const TAB_BAR_HEIGHT = 60
const GOAL_RING_SIZE = 54
const GOAL_RING_STROKE = 5

const KRAKOW_REGION = {
  latitude: 50.0614,
  longitude: 19.9366,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
}

/** Short street line for compact Ride card (first segment before comma). */
function rideStreetLine(full: string): string {
  const s = full?.trim() || '—'
  const i = s.indexOf(',')
  return i > 0 ? s.slice(0, i).trim() : s
}

function Pill({ label, c }: { label: string; c: AppColors }) {
  return (
    <View style={[s.pill, { backgroundColor: c.surfaceAlt }]}>
      <Text style={[s.pillText, { color: c.textSecondary }]}>{label}</Text>
    </View>
  )
}

function speedKmh(speedMps: number | null): number {
  return speedMps != null && Number.isFinite(speedMps) ? Math.max(0, Math.round(speedMps * 3.6)) : 0
}

function dynamicNavZoom(speedMps: number | null, distToManeuverM: number, perspective3d: boolean): number {
  const sp = speedMps ?? 0
  let zoom = sp < 2 ? 18.2 : sp < 7 ? 17.6 : sp < 12 ? 17.1 : sp < 18 ? 16.4 : 15.8
  if (distToManeuverM > 0 && distToManeuverM < 260) {
    const approachBoost = Math.min(1.1, (260 - distToManeuverM) / 220)
    zoom += approachBoost
  }
  if (perspective3d) zoom -= 0.25
  return Math.max(14.8, Math.min(19, zoom))
}

export default function DashboardScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()

  const markerStyle = useNavigationSettingsStore((s) => s.markerStyle)
  const units = useNavigationSettingsStore((s) => s.units)
  const mapPerspective3d = useNavigationSettingsStore((s) => s.mapPerspective3d)

  const role = useRoleStore((st) => st.role) ?? 'courier'
  const vehicleType = useRoleStore((st) => st.vehicleType)
  const {
    shiftStats, dailyGoal, isNavigating, navigationPhase, deliveryPhase, routePolyline,
    currentStep, routeSteps, pendingConfirmation,
    activeOrders, setPendingConfirmation,
    confirmOrder, rejectOrder,
    updateNavigationPhase, stopNavigation, recomputeNavigationTarget, updateNavigationRoute,
  } = useOrdersStore()
  const navigationOrderId = useOrdersStore((s) => s.navigationOrderId)
  const isDriverOnline = useDriverSessionStore((s) => s.isOnline)

  const [userLocation, setUserLocation] = useState<LatLng | null>(null)
  const [userSpeedMps, setUserSpeedMps] = useState<number | null>(null)
  const [userHeadingDeg, setUserHeadingDeg] = useState<number | null>(null)
  const [smoothHeading, setSmoothHeading] = useState(0)
  const appStateRef = useRef<AppStateStatus>(AppState.currentState)
  const pendingOrderRef = useRef<Order | null>(null)
  const mapRef = useRef<any>(null)
  const lastPosForBearingRef = useRef<LatLng | null>(null)
  const prevHeadingRef = useRef<number | null>(null)
  const navIntroPlayedRef = useRef(false)
  const prevRouteLenRef = useRef(0)
  const introTimersRef = useRef<{ t1?: ReturnType<typeof setTimeout>; t2?: ReturnType<typeof setTimeout> }>({})
  const [navFollowReady, setNavFollowReady] = useState(false)
  const lastOffRouteForceRef = useRef(0)
  const skipEngineAfterDropoffRouteRef = useRef(false)
  const destPulse = useRef(new Animated.Value(1)).current
  const userLocationRef = useRef<LatLng | null>(null)
  const smoothHeadingRef = useRef(0)

  const animatedCoord = useRef(
    new AnimatedRegion({
      latitude: KRAKOW_REGION.latitude,
      longitude: KRAKOW_REGION.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    }),
  ).current

  const activeOrder = useMemo(
    () => activeOrders.find((o) => o.id === navigationOrderId) ?? activeOrders[0] ?? null,
    [activeOrders, navigationOrderId],
  )
  const routePolylineSafe = routePolyline ?? []
  const suggestion = activeOrder ?? getDashboardSuggestionOrder(role as 'courier' | 'taxi')

  const destCoordNav: LatLng | null = useMemo(() => {
    if (!isNavigating || !activeOrder) return null
    const toPickup =
      deliveryPhase === 'EN_ROUTE_TO_PICKUP' || deliveryPhase === 'AT_PICKUP'
    if (toPickup) {
      return { latitude: activeOrder.pickupLat, longitude: activeOrder.pickupLng }
    }
    return { latitude: activeOrder.dropoffLat, longitude: activeOrder.dropoffLng }
  }, [isNavigating, activeOrder, deliveryPhase])

  const trimmedRoute = useMemo(() => {
    if (!isNavigating || !userLocation || routePolylineSafe.length < 2) return routePolylineSafe
    return trimPolylineBehindUser(userLocation, routePolylineSafe)
  }, [isNavigating, userLocation, routePolylineSafe])

  const nearDestination = useMemo(() => {
    if (!userLocation || !destCoordNav) return false
    return haversineMeters(userLocation, destCoordNav) < 50
  }, [userLocation, destCoordNav])

  const hudDistanceM = useMemo(() => {
    if (!isNavigating || !userLocation) return 0
    return distanceToNextManeuverMeters(userLocation, routeSteps?.[0], trimmedRoute)
  }, [isNavigating, userLocation, routeSteps, trimmedRoute])

  const distanceLine = useMemo(
    () => formatNavDistanceLine(hudDistanceM, units),
    [hudDistanceM, units],
  )
  const streetTitle = extractStreetName(routeSteps?.[0]?.instruction ?? currentStep ?? '')
  const speedLabelKmh = useMemo(() => speedKmh(userSpeedMps), [userSpeedMps])
  const goalRing = useMemo(() => {
    const radius = (GOAL_RING_SIZE - GOAL_RING_STROKE) / 2
    const circumference = 2 * Math.PI * radius
    const progress = Math.min(Math.max(goalProgress, 0), 1)
    return {
      radius,
      circumference,
      dashOffset: circumference * (1 - progress),
      pct: Math.round(progress * 100),
    }
  }, [goalProgress])

  useEffect(() => {
    userLocationRef.current = userLocation
  }, [userLocation])

  useEffect(() => {
    smoothHeadingRef.current = smoothHeading
  }, [smoothHeading])

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    let headingSub: { remove: () => void } | null = null
    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const first: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
        setUserLocation(first)
        lastPosForBearingRef.current = first
        setUserSpeedMps(loc.coords.speed ?? null)
        const h = loc.coords.heading
        if (h != null && h >= 0) setUserHeadingDeg(h)
        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 8,
            timeInterval: 1000,
          },
          (l) => {
            setUserLocation({ latitude: l.coords.latitude, longitude: l.coords.longitude })
            setUserSpeedMps(l.coords.speed ?? null)
            const hd = l.coords.heading
            if (hd != null && hd >= 0) setUserHeadingDeg(hd)
          },
        )
        if (Platform.OS !== 'web' && typeof Location.watchHeadingAsync === 'function') {
          try {
            headingSub = await Location.watchHeadingAsync((e) => {
              const th = e.trueHeading
              const mh = e.magHeading
              const use = th >= 0 ? th : mh
              if (use >= 0) setUserHeadingDeg(use)
            })
          } catch {
            /* heading optional */
          }
        }
      } catch (e) {
        console.warn('Location error:', e)
      }
    })()
    return () => {
      sub?.remove()
      headingSub?.remove()
    }
  }, [])

  useEffect(() => {
    if (!userLocation) return
    navigationEngine.reportDriverLocation({
      lat: userLocation.latitude,
      lng: userLocation.longitude,
      heading: userHeadingDeg,
      speed: userSpeedMps,
      isOnline: isDriverOnline,
    })
  }, [userLocation, userHeadingDeg, userSpeedMps, isDriverOnline])

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
    if (Platform.OS === 'android') triggerScraperWindow()
    pendingOrderRef.current = suggestion
    openPlatformDeepLink(suggestion.platform)
  }, [suggestion])

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    const mode = getTravelModeByVehicle(vehicleType, role)
    const order = pendingConfirmation
    console.log('[DriveMind Nav]: confirm accepted order', {
      orderId: order.id,
      mode,
      hasLocation: !!userLocation,
    })
    void (async () => {
      try {
        await confirmOrder(
          order,
          userLocation
            ? {
                originLat: userLocation.latitude,
                originLng: userLocation.longitude,
                mode,
              }
            : undefined,
        )
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error('[DriveMind Nav]: confirmOrder / getDirections failed', e)
        Alert.alert('Directions', message)
      }
    })()
  }, [pendingConfirmation, confirmOrder, userLocation, vehicleType, role])

  const handleConfirmNo = useCallback(() => { rejectOrder() }, [rejectOrder])

  const mapStyleForMap = useMemo(
    () => (isDark ? MAP_STYLE_DARK : MAP_STYLE_LIGHT),
    [isDark],
  )

  /**
   * Two-step style application (Android Fabric / LEGACY renderer):
   *   1. key prop forces a full native remount on theme change.
   *   2. customMapStyle is withheld until onMapReady fires.
   *   3. 150 ms timeout pushes the style after the native surface is fully settled,
   *      preventing GMS from overwriting it during its own init sequence.
   */
  const [isMapReady, setIsMapReady] = useState(false)
  useEffect(() => {
    setIsMapReady(false)
  }, [isDark])

  const onMapReady = useCallback(() => {
    const id = setTimeout(() => setIsMapReady(true), 150)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (Platform.OS === 'web') setIsMapReady(true)
  }, [])

  useEffect(() => {
    if (!isNavigating || !userLocation) return
    if (deliveryPhase === 'AT_PICKUP') return
    const selectedId = recomputeNavigationTarget(userLocation.latitude, userLocation.longitude, 0.25)
    if (!selectedId) {
      stopNavigation()
    }
  }, [activeOrders, userLocation, isNavigating, deliveryPhase, recomputeNavigationTarget, stopNavigation])

  useEffect(() => {
    const target = activeOrder
    if (!isNavigating || !target || !userLocation) return
    if (deliveryPhase === 'AT_PICKUP') return
    if (skipEngineAfterDropoffRouteRef.current) {
      skipEngineAfterDropoffRouteRef.current = false
      return
    }
    const destination =
      target.status === 'pickup'
        ? { latitude: target.pickupLat, longitude: target.pickupLng }
        : { latitude: target.dropoffLat, longitude: target.dropoffLng }

    const mode = getTravelModeByVehicle(vehicleType, role)
    console.log('[DriveMind Nav]: route refresh scheduled', {
      orderId: target.id,
      phase: target.status,
      mode,
      origin: userLocation,
      destination,
    })
    navigationEngine.scheduleRouteRefresh({
      origin: userLocation,
      destination,
      mode,
      onRoute: (route) => {
        updateNavigationRoute({
          polyline: route.polyline,
          currentStep: route.currentStep,
          routeDistance: route.routeDistance,
          routeDuration: route.routeDuration,
          steps: route.steps,
          durationSecondsTotal: route.durationSecondsTotal,
        })
        updateNavigationPhase(target.status === 'pickup' ? 'pickup' : 'dropoff')
      },
      onError: (err) => console.warn('Directions fetch failed:', err),
    })
  }, [
    isNavigating,
    activeOrder,
    userLocation,
    vehicleType,
    role,
    deliveryPhase,
    updateNavigationRoute,
    updateNavigationPhase,
  ])

  useEffect(() => {
    if (isNavigating) return
    navigationEngine.cancelPending()
  }, [isNavigating])

  useEffect(() => {
    if (!isNavigating) {
      clearTimeout(introTimersRef.current.t1)
      clearTimeout(introTimersRef.current.t2)
      introTimersRef.current = {}
      navIntroPlayedRef.current = false
      prevRouteLenRef.current = 0
      setNavFollowReady(false)
    }
  }, [isNavigating])

  useEffect(() => {
    if (!userLocation) return
    animatedCoord.timing({
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      duration: 1000,
      useNativeDriver: false,
    }).start()
  }, [userLocation?.latitude, userLocation?.longitude, animatedCoord])

  useEffect(() => {
    if (!userLocation) return
    let nextH: number
    if (userHeadingDeg != null && userHeadingDeg >= 0) {
      nextH = userHeadingDeg
    } else if (lastPosForBearingRef.current) {
      nextH = bearingDegrees(lastPosForBearingRef.current, userLocation)
    } else {
      lastPosForBearingRef.current = userLocation
      return
    }
    lastPosForBearingRef.current = userLocation
    setSmoothHeading((prev) => {
      const p = prevHeadingRef.current ?? prev
      const merged = lowPassHeading(p, nextH, 3)
      prevHeadingRef.current = merged
      return merged
    })
  }, [userLocation, userHeadingDeg])

  useEffect(() => {
    if (!nearDestination) {
      destPulse.setValue(1)
      return
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(destPulse, { toValue: 1.35, duration: 700, useNativeDriver: true }),
        Animated.timing(destPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
    }
  }, [nearDestination, destPulse])

  useEffect(() => {
    if (!isNavigating || !userLocation || !activeOrder || routePolylineSafe.length < 2) return
    if (deliveryPhase === 'AT_PICKUP') return
    const d = distancePointToPolylineMeters(userLocation, routePolylineSafe)
    if (d <= 50) return
    if (Date.now() - lastOffRouteForceRef.current < 10_000) return
    lastOffRouteForceRef.current = Date.now()
    const destination =
      activeOrder.status === 'pickup'
        ? { latitude: activeOrder.pickupLat, longitude: activeOrder.pickupLng }
        : { latitude: activeOrder.dropoffLat, longitude: activeOrder.dropoffLng }
    const mode = getTravelModeByVehicle(vehicleType, role)
    // Smart off-route: refresh polyline only — do not fitToCoordinates; camera stays user-centric.
    navigationEngine.forceRefresh({
      origin: userLocation,
      destination,
      mode,
      onRoute: (route) => {
        updateNavigationRoute({
          polyline: route.polyline,
          currentStep: route.currentStep,
          routeDistance: route.routeDistance,
          routeDuration: route.routeDuration,
          steps: route.steps,
          durationSecondsTotal: route.durationSecondsTotal,
        })
        updateNavigationPhase(activeOrder.status === 'pickup' ? 'pickup' : 'dropoff')
      },
      onError: (err) => console.warn('[DriveMind Nav]: off-route refresh failed', err),
    })
  }, [
    isNavigating,
    userLocation,
    activeOrder,
    routePolylineSafe,
    vehicleType,
    role,
    updateNavigationRoute,
    updateNavigationPhase,
    deliveryPhase,
  ])

  useEffect(() => {
    if (!mapRef.current || !userLocation) return
    if (!isNavigating) {
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.035,
          longitudeDelta: 0.035,
        },
        600,
      )
    }
  }, [isNavigating, userLocation])

  useEffect(() => {
    if (!isNavigating || !mapRef.current) return
    const len = routePolylineSafe.length
    const crossedIntoRoute = prevRouteLenRef.current < 2 && len >= 2
    prevRouteLenRef.current = len
    if (!crossedIntoRoute || navIntroPlayedRef.current || len < 2) return

    navIntroPlayedRef.current = true
    setNavFollowReady(false)

    const coords = [...routePolylineSafe]
    if (destCoordNav) coords.push(destCoordNav)

    mapRef.current.fitToCoordinates(coords, {
      edgePadding: { top: 150, right: 150, bottom: 150, left: 150 },
      animated: true,
    })

    clearTimeout(introTimersRef.current.t1)
    clearTimeout(introTimersRef.current.t2)

    introTimersRef.current.t1 = setTimeout(() => {
      const loc = userLocationRef.current
      if (!mapRef.current || !loc) {
        setNavFollowReady(true)
        return
      }
      mapRef.current.animateCamera(
        {
          center: { latitude: loc.latitude, longitude: loc.longitude },
          pitch: useNavigationSettingsStore.getState().mapPerspective3d ? 60 : 0,
          zoom: 17.5,
          heading: smoothHeadingRef.current,
        },
        { duration: 1500 },
      )
      introTimersRef.current.t2 = setTimeout(() => setNavFollowReady(true), 1500)
    }, 750)
  }, [isNavigating, routePolylineSafe.length, routePolylineSafe, destCoordNav])

  useEffect(() => {
    if (!isNavigating || !navFollowReady || !mapRef.current || !userLocation) return
    const zoom = dynamicNavZoom(userSpeedMps, hudDistanceM, mapPerspective3d)
    mapRef.current.animateCamera(
      {
        center: { latitude: userLocation.latitude, longitude: userLocation.longitude },
        pitch: mapPerspective3d ? 60 : 0,
        heading: smoothHeading,
        zoom,
      },
      { duration: 1000 },
    )
  }, [isNavigating, navFollowReady, userLocation, smoothHeading, userSpeedMps, hudDistanceM, mapPerspective3d])

  const platformName = suggestion.platform.charAt(0).toUpperCase() + suggestion.platform.slice(1)

  return (
    <View style={[s.root, { backgroundColor: c.tabBar }]}>
      <View style={s.mapFill}>
      <MapView
        key={isDark ? 'map-dark' : 'map-light'}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="standard"
        googleRenderer={Platform.OS === 'android' ? 'LEGACY' : undefined}
        userInterfaceStyle="light"
        customMapStyle={isMapReady ? mapStyleForMap : undefined}
        onMapReady={onMapReady}
        showsScale={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsIndoors={false}
        showsTraffic
        showsUserLocation={!isNavigating}
        showsMyLocationButton={false}
        compassEnabled={false}
        zoomControlEnabled={false}
        toolbarEnabled={false}
        mapToolbarEnabled={false}
        initialRegion={userLocation ? { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 } : KRAKOW_REGION}
      >
        {isNavigating && (
          <NavigationMapLayers
            trimmedPolyline={trimmedRoute}
            destCoord={destCoordNav}
            navigationPhase={navigationPhase}
            destPulse={destPulse}
            nearDestination={nearDestination}
            isDark={isDark}
          />
        )}
        {isNavigating && Platform.OS !== 'web' && (
          <MarkerAnimated coordinate={animatedCoord} anchor={{ x: 0.5, y: 0.5 }} flat>
            <PlayerNavMarker styleId={markerStyle} headingDeg={smoothHeading} />
          </MarkerAnimated>
        )}
        {isNavigating && Platform.OS === 'web' && userLocation && (
          <Marker coordinate={userLocation} anchor={{ x: 0.5, y: 0.5 }} flat>
            <PlayerNavMarker styleId={markerStyle} headingDeg={smoothHeading} />
          </Marker>
        )}
      </MapView>
      </View>

      {isNavigating && activeOrder && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <DirectionCard
            maneuver={routeSteps?.[0]?.maneuver}
            distanceLine={distanceLine}
            streetName={streetTitle}
            c={c}
            topInset={insets.top + 28}
          />
        </View>
      )}

      {/* Header */}
      {!isNavigating && (
        <View style={[s.header, { top: insets.top + 16 }]}>
          <View style={s.headerLeft}>
            <Text style={[s.headerTitle, { color: c.text }]}>DriveMind</Text>
          </View>
          <View style={[s.rolePill, { backgroundColor: c.surface, borderColor: c.border }]}>
            <MaterialCommunityIcons name={role === 'courier' ? 'bike' : 'car-outline'} size={14} color={c.secondary} />
            <Text style={[s.rolePillText, { color: c.text }]}>{role}</Text>
          </View>
        </View>
      )}

      {/* Bottom sheet — order window */}
      <View
        style={[s.sheet, { paddingBottom: insets.bottom + 5, backgroundColor: c.tabBar, borderTopColor: c.tabBarBorder }]}
      >
        <View>
          <View style={[s.pullBar, { backgroundColor: c.border, marginBottom: 10 }]} />

          <View style={s.statsRow}>
            <StatCol label={t('earnings_label')} value={`${shiftStats.totalEarnings.toFixed(0)} PLN`} c={c} compact />
            <View style={[s.statDivider, { backgroundColor: c.separator }]} />
            <StatCol label={t('orders_label')} value={String(shiftStats.completedOrders)} c={c} compact />
            <View style={[s.statDivider, { backgroundColor: c.separator }]} />
            <StatCol label={t('hours_online')} value={`${hoursOnline.toFixed(1)}h`} c={c} compact />
          </View>
        </View>

        {isNavigating && activeOrder ? (
          <View style={{ height: 8 }} />
        ) : (
          <View
            style={[s.suggCard, { backgroundColor: c.card, borderColor: c.separator }]}
          >
            <View style={s.suggHeader}>
              <PlatformIcon platform={suggestion.platform as any} size={26} active />
              <Text style={[s.suggPlatform, { color: c.text }]} numberOfLines={1}>
                {platformName}
              </Text>
              <ProfitBadge label={suggestion.profitLabel as ProfitLabel} />
              <Text style={[s.suggPrice, { color: c.text }]}>{suggestion.earnings.toFixed(0)} PLN</Text>
            </View>
            <View style={[s.suggAddrRow, { borderColor: c.separator }]}>
              <Text
                style={[s.suggAddrText, { color: c.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {rideStreetLine(suggestion.pickupAddress)}
              </Text>
              <Feather name="arrow-right" size={14} color={c.textMuted} style={s.suggAddrSep} />
              <Text
                style={[s.suggAddrText, s.suggAddrTextRight, { color: c.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {rideStreetLine(suggestion.dropoffAddress)}
              </Text>
            </View>
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
      <View pointerEvents="none" style={[s.minimalHudWrap, { top: insets.top + 18 }]}>
        <View style={[s.speedChip, { backgroundColor: c.surface, borderColor: c.separator }]}>
          <Text style={[s.speedValue, { color: c.text }]}>{speedLabelKmh}</Text>
          <Text style={[s.speedUnit, { color: c.textMuted }]}>km/h</Text>
        </View>
        <View style={[s.goalRingCard, { backgroundColor: c.surface, borderColor: c.separator }]}>
          <Svg width={GOAL_RING_SIZE} height={GOAL_RING_SIZE}>
            <Circle
              cx={GOAL_RING_SIZE / 2}
              cy={GOAL_RING_SIZE / 2}
              r={goalRing.radius}
              stroke={c.separator}
              strokeWidth={GOAL_RING_STROKE}
              fill="none"
            />
            <Circle
              cx={GOAL_RING_SIZE / 2}
              cy={GOAL_RING_SIZE / 2}
              r={goalRing.radius}
              stroke={c.primary}
              strokeWidth={GOAL_RING_STROKE}
              fill="none"
              strokeDasharray={`${goalRing.circumference} ${goalRing.circumference}`}
              strokeDashoffset={goalRing.dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${GOAL_RING_SIZE / 2} ${GOAL_RING_SIZE / 2})`}
            />
          </Svg>
          <View style={s.goalRingCenter}>
            <Text style={[s.goalRingPct, { color: c.text }]}>{goalRing.pct}%</Text>
            <Text style={[s.goalRingLabel, { color: c.textMuted }]}>Goal</Text>
          </View>
        </View>
      </View>

      {/* Confirmation modal */}
      <Modal visible={!!pendingConfirmation} transparent animationType="fade">
        <View style={[s.modalOverlay, { backgroundColor: c.overlay }]}>
          <View style={[s.modalCard, { backgroundColor: c.surface }]}>
            {pendingConfirmation && (
              <>
                <PlatformIcon platform={pendingConfirmation.platform as any} size={48} active />
                <Text style={[s.modalTitle, { color: c.text }]}>{t('order_accepted_title')}</Text>
                <ScrollView style={s.modalRoute} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                  <RouteSummary
                    pickupAddress={pendingConfirmation.pickupAddress}
                    dropoffAddress={pendingConfirmation.dropoffAddress}
                    distanceKm={pendingConfirmation.distanceKm}
                  />
                </ScrollView>
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

const s = StyleSheet.create({
  root: { flex: 1, alignSelf: 'stretch', width: '100%' },
  mapFill: { flex: 1, width: '100%', alignSelf: 'stretch' },
  header: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 17, fontWeight: '600', fontFamily: fonts.semiBold },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  rolePillText: { fontSize: 12, fontFamily: fonts.medium, textTransform: 'capitalize' },
  sheet: {
    position: 'absolute',
    left: -1,
    right: -1,
    bottom: -1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 0.5,
    paddingHorizontal: 15,
    paddingTop: 6,
    paddingBottom: TAB_BAR_HEIGHT,
  },
  pullBar: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  statCol: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 24 },
  statLabel: { fontSize: 11, fontFamily: fonts.regular, letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: 26, fontWeight: '700', fontFamily: fonts.bold },
  statValueCompact: { fontSize: 20, fontWeight: '700', fontFamily: fonts.bold },
  suggCard: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginBottom: 0,
    marginHorizontal: -1,
  },
  suggHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  suggAddrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 36,
    maxHeight: 110,
    paddingVertical: 4,
    marginBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 5,
    gap: 0,
  },
  suggAddrText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.medium,
    fontWeight: '500',
  },
  suggAddrTextRight: { textAlign: 'right' },
  suggAddrSep: { paddingHorizontal: 4, flexShrink: 0 },
  suggPlatform: { flex: 1, fontSize: 14, fontWeight: '600', fontFamily: fonts.semiBold, minWidth: 0 },
  suggPrice: { fontSize: 16, fontWeight: '700', fontFamily: fonts.bold, flexShrink: 0 },
  addressLabel: { fontSize: 11, fontFamily: fonts.regular, letterSpacing: 0.5, marginBottom: 3 },
  addressValue: { fontSize: 13, fontFamily: fonts.regular, marginBottom: 8 },
  pillRow: { flexDirection: 'row', gap: 5, marginBottom: 5 },
  pill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  pillText: { fontSize: 12, fontFamily: fonts.regular },
  acceptBtn: { height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  modalOverlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { borderRadius: 16, padding: 24, width: '100%', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '600', fontFamily: fonts.semiBold, marginTop: 6 },
  modalRoute: { width: '100%', maxHeight: 320, marginVertical: 4 },
  modalAddress: { fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  modalArrow: { fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8, width: '100%' },
  modalBtnYes: { flex: 1, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnYesText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  modalBtnNo: { flex: 1, height: 50, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalBtnNoText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  minimalHudWrap: {
    position: 'absolute',
    right: 12,
    alignItems: 'center',
    gap: 10,
  },
  speedChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    minWidth: 70,
  },
  speedValue: { fontSize: 22, lineHeight: 24, fontFamily: fonts.bold, fontWeight: '700' },
  speedUnit: { fontSize: 11, fontFamily: fonts.medium, marginTop: 1 },
  goalRingCard: {
    width: 66,
    height: 66,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalRingPct: { fontSize: 11, fontFamily: fonts.bold, fontWeight: '700' },
  goalRingLabel: { fontSize: 9, fontFamily: fonts.medium, marginTop: -1 },
})
