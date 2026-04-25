import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Modal,
  AppState,
  AppStateStatus,
  Alert,
  Animated,
  ActivityIndicator,
  Platform,
  ScrollView,
  Linking,
  NativeModules,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import Svg, { Circle } from 'react-native-svg'
import Reanimated, { SlideInRight } from 'react-native-reanimated'

import MapView, { Marker, MarkerAnimated, AnimatedRegion, PROVIDER_GOOGLE } from '../../components/MapViewWeb'
import { NavigationMapLayers } from '../../components/navigation/NavigationMapLayers'
import { WazeDirectionCard } from './WazeDirectionCard'
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
import { useOrdersStore, Order } from '../../store/ordersStore'
import { useRoleStore } from '../../store/roleStore'
import { openPlatformDeepLink } from '../../utils/platformDeepLink'
import { getTravelModeByVehicle } from '../../services/directionsService'
import { navigationEngine } from '../../services/navigationEngine'
import { triggerScraperWindow } from '../../services/driverIngestBridge'
import { requestAllPermissions } from '../../services/permissionManager'
import { useDriverSessionStore } from '../../store/driverSessionStore'
import { useDriverIngestStore } from '../../store/driverIngestStore'
import { fonts } from '../../theme/typography'
import { useTheme, type AppColors } from '../../theme/theme'
import { computeProfitability } from '@drivemind/shared'
// NUCLEAR DEBUG: direct react-native-maps import disabled for this build.
import { MAP_STYLE_DARK, MAP_STYLE_LIGHT } from '../../map/mapStyles'
import AnimatedButton from '../../components/AnimatedButton'
import Logo from '../../components/common/Logo'
import { emitQaMockOrderEvent } from '../../services/qaMockOrder'

const GOAL_RING_SIZE = 54
const GOAL_RING_STROKE = 5
const ElasticInRight = SlideInRight.springify().damping(9).stiffness(180)

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

function ordersStoreActivePlatforms(orders: Order[]): { orderId: string; platform: string }[] {
  return orders
    .map((order) => ({ orderId: order.id, platform: order.platform?.toLowerCase?.() ?? '' }))
    .filter((row): row is { orderId: string; platform: string } => ['uber', 'bolt', 'wolt', 'glovo'].includes(row.platform))
}

function alpha(hex: string, a: number): string {
  const m = hex.trim().replace('#', '')
  const full = m.length === 3 ? `${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}` : m
  const r = Number.parseInt(full.slice(0, 2), 16)
  const g = Number.parseInt(full.slice(2, 4), 16)
  const b = Number.parseInt(full.slice(4, 6), 16)
  return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
    ? `rgba(${r},${g},${b},${a})`
    : `rgba(255,255,255,${a})`
}

function speedKmh(speedMps: number | null): number {
  return speedMps != null && Number.isFinite(speedMps) ? Math.max(0, Math.round(speedMps * 3.6)) : 0
}

/**
 * Waze-style dynamic zoom:
 *  • Speed-based baseline: zooms out progressively from ~18 (stopped) to ~15.5 (highway)
 *  • Maneuver approach: within 200 m of the next turn, ramps zoom linearly from 18 → 19
 *    so the junction is crystal-clear by the time the driver arrives.
 *  • 3-D mode subtracts 0.25 to compensate for the perspective field-of-view change.
 */
function dynamicNavZoom(speedMps: number | null, distToManeuverM: number, perspective3d: boolean): number {
  const sp = speedMps ?? 0

  // Speed baseline — four smooth tiers
  let zoom: number
  if      (sp <  2) zoom = 18.0
  else if (sp <  8) zoom = 17.5
  else if (sp < 14) zoom = 16.8
  else if (sp < 22) zoom = 16.2
  else              zoom = 15.5

  // Maneuver approach: 200 m → zoom 18, 0 m → zoom 19
  if (distToManeuverM > 0 && distToManeuverM < 200) {
    const t = (200 - distToManeuverM) / 200   // 0.0 at 200 m, 1.0 at destination
    const maneuverZoom = 18.0 + t * 1.0       // 18 → 19
    zoom = Math.max(zoom, maneuverZoom)        // only zoom IN, never force zoom out
  }

  if (perspective3d) zoom -= 0.25
  return Math.max(14.8, Math.min(19.0, zoom))
}

export default function DashboardScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const { colors: c, isDark } = useTheme()
  const DASHBOARD_ISOLATION_MODE = false
  const NUCLEAR_DISABLE_NATIVE_MAPS = false

  if (DASHBOARD_ISOLATION_MODE) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.tabBar,
          paddingTop: insets.top + 24,
          paddingHorizontal: 16,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: c.text, fontSize: 20, fontFamily: fonts.semiBold, marginBottom: 8 }}>
          Dashboard Isolation Mode
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: 'center' }}>
          Map Hidden. Complex Animated and navigation map layers are temporarily disabled.
        </Text>
        <Text style={{ color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 12 }}>
          {t('ride')}
        </Text>
      </View>
    )
  }

  const markerStyle = useNavigationSettingsStore((s) => s.markerStyle)
  const units = useNavigationSettingsStore((s) => s.units)
  const mapPerspective3d = useNavigationSettingsStore((s) => s.mapPerspective3d)

  const role = useRoleStore((st) => st.role) ?? 'courier'
  const vehicleType = useRoleStore((st) => st.vehicleType)
  const {
    shiftStats, dailyGoal, isNavigating, navigationPhase, deliveryPhase, routePolyline,
    currentStep, routeSteps, routeDuration, routeDurationSeconds, pendingConfirmation,
    activeOrders, setPendingConfirmation,
    confirmOrder, rejectOrder,
    updateNavigationPhase, stopNavigation, recomputeNavigationTarget, updateNavigationRoute,
    startShiftManually,
  } = useOrdersStore()
  const navPerspective3d = isNavigating ? true : mapPerspective3d
  const navigationOrderId = useOrdersStore((s) => s.navigationOrderId)
  const isDriverOnline = useDriverSessionStore((s) => s.isOnline)
  const setIsDriverOnline = useDriverSessionStore((s) => s.setIsOnline)
  const activeRide = useDriverIngestStore((s) => s.activeRide)

  // Derived shift values — declared HERE so they are in scope for all useMemo/useCallback
  // hooks below. Declaring them after useMemo calls puts them in the TDZ (temporal dead zone)
  // for `const`, which Hermes enforces in release builds and causes a crash.
  const isShiftActive = shiftStats.startTime !== null
  const goalProgress = dailyGoal > 0 ? Math.min(shiftStats.totalEarnings / dailyGoal, 1) : 0

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
  const suggestion = useMemo(() => {
    if (activeOrder) return activeOrder
    if (!activeRide) return null
    const parsedPrice = Number.parseFloat((activeRide.price ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
    const earnings = Number.isFinite(parsedPrice) ? parsedPrice : 0
    return {
      id: activeRide.id,
      platform: activeRide.platform === 'unknown' ? 'uber' : activeRide.platform,
      pickupAddress: '—',
      dropoffAddress: activeRide.destination ?? activeRide.text ?? '—',
      earnings,
      distanceKm: 5,
      durationMin: 15,
      deadrunKm: 0,
      pickupLat: 50.0614,
      pickupLng: 19.9366,
      dropoffLat: 50.0614,
      dropoffLng: 19.9366,
      profitScore: 0,
      profitLabel: 'NEUTRAL',
      status: 'pickup',
    } as Order
  }, [activeOrder, activeRide])
  const hasSuggestedOrder = !!suggestion

  const sheetMode = useMemo(() => {
    if (!isDriverOnline) return 'off_air' as const
    if (!hasSuggestedOrder) return 'searching' as const
    return 'order' as const
  }, [isDriverOnline, hasSuggestedOrder])

  const sheetHeight = sheetMode === 'order' ? 148 : sheetMode === 'off_air' ? 92 : 74
  const mapBottomPadding = sheetHeight + insets.bottom + 10

  const tierForSuggestion = useMemo(() => {
    if (!suggestion) return null
    return computeProfitability({
      role: (useRoleStore.getState().role ?? 'courier') as any,
      pricePLN: suggestion.earnings,
      distanceKm: Math.max(0.2, (suggestion.distanceKm ?? 0) + (suggestion.deadrunKm ?? 0)),
      etaMin: Math.max(1, suggestion.durationMin ?? 1),
      dropoffLabel: suggestion.dropoffAddress,
    })
  }, [suggestion?.id])

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
  const etaText = useMemo(() => {
    const secs = routeDurationSeconds
    if (typeof secs === 'number' && Number.isFinite(secs) && secs > 0) {
      const d = new Date(Date.now() + secs * 1000)
      const hh = String(d.getHours()).padStart(2, '0')
      const mm = String(d.getMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    }
    return routeDuration || '—'
  }, [routeDurationSeconds, routeDuration])
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
        const NUCLEAR_DISABLE_GOOGLE_LOCATION_CALLS = true
        if (NUCLEAR_DISABLE_GOOGLE_LOCATION_CALLS) return
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (AppState.currentState !== 'active') return
        // NUCLEAR DEBUG: disabled native location permission path.
        // const { status } = await Location.requestForegroundPermissionsAsync()
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') return
        // NUCLEAR DEBUG: disabled native location reads.
        // const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        const first: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
        setUserLocation(first)
        lastPosForBearingRef.current = first
        setUserSpeedMps(loc.coords.speed ?? null)
        const h = loc.coords.heading
        if (h != null && h >= 0) setUserHeadingDeg(h)
        // NUCLEAR DEBUG: disabled native location subscription.
        // sub = await Location.watchPositionAsync(...)
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

  const handleAcceptSuggestion = useCallback(() => {
    if (!suggestion) return
    console.log('[DriveMind Nav]: accept tapped', { orderId: suggestion.id })
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    if (Platform.OS === 'android') triggerScraperWindow()
    pendingOrderRef.current = suggestion
    openPlatformDeepLink(suggestion?.platform ?? '')
  }, [suggestion])

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return
    const mode = getTravelModeByVehicle(vehicleType ?? null, role)
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
        if (AppState.currentState === 'active') {
          Alert.alert('Directions', message)
        }
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
  // Mount guard: delay native map attach on device boot/login transitions.
  const [isMapReady, setIsMapReady] = useState(false)
  const [isMapStyleReady, setIsMapStyleReady] = useState(false)
  const [permissionsRequested, setPermissionsRequested] = useState(false)
  const mapStyleReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const SHOWS_USER_LOCATION = false
  useEffect(() => {
    const id = setTimeout(() => setIsMapReady(true), 1000)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    setIsMapStyleReady(false)
  }, [isDark])

  useEffect(
    () => () => {
      if (mapStyleReadyTimeoutRef.current != null) {
        clearTimeout(mapStyleReadyTimeoutRef.current)
        mapStyleReadyTimeoutRef.current = null
      }
    },
    [],
  )

  const onMapReady = useCallback(() => {
    if (mapStyleReadyTimeoutRef.current != null) {
      clearTimeout(mapStyleReadyTimeoutRef.current)
    }
    mapStyleReadyTimeoutRef.current = setTimeout(() => {
      mapStyleReadyTimeoutRef.current = null
      setIsMapStyleReady(true)
    }, 150)
    if (!permissionsRequested) {
      void requestAllPermissions()
      setPermissionsRequested(true)
    }
  }, [permissionsRequested])

  useEffect(() => {
    if (Platform.OS === 'web') setIsMapStyleReady(true)
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
    const map = mapRef.current as {
      animateToRegion?: (region: {
        latitude: number
        longitude: number
        latitudeDelta: number
        longitudeDelta: number
      }, duration?: number) => void
    }
    if (typeof map.animateToRegion !== 'function') return
    if (!isNavigating) {
      map.animateToRegion(
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
    const map = mapRef.current as {
      fitToCoordinates?: (coords: LatLng[], opts?: {
        edgePadding?: { top: number; right: number; bottom: number; left: number }
        animated?: boolean
      }) => void
      animateCamera?: (camera: {
        center?: { latitude: number; longitude: number }
        pitch?: number
        zoom?: number
        heading?: number
      }, opts?: { duration?: number }) => void
    }
    const len = routePolylineSafe.length
    const crossedIntoRoute = prevRouteLenRef.current < 2 && len >= 2
    prevRouteLenRef.current = len
    if (!crossedIntoRoute || navIntroPlayedRef.current || len < 2) return

    navIntroPlayedRef.current = true
    setNavFollowReady(false)

    const coords = [...routePolylineSafe]
    if (destCoordNav) coords.push(destCoordNav)

    if (typeof map.fitToCoordinates === 'function') {
      map.fitToCoordinates(coords, {
      edgePadding: { top: 150, right: 150, bottom: 150, left: 150 },
      animated: true,
      })
    }

    clearTimeout(introTimersRef.current.t1)
    clearTimeout(introTimersRef.current.t2)

    introTimersRef.current.t1 = setTimeout(() => {
      const loc = userLocationRef.current
      if (!mapRef.current || !loc) {
        setNavFollowReady(true)
        return
      }
      if (typeof map.animateCamera !== 'function') {
        setNavFollowReady(true)
        return
      }
      map.animateCamera(
        {
          center: { latitude: loc.latitude, longitude: loc.longitude },
          pitch: 60,
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
    const map = mapRef.current as {
      animateCamera?: (camera: {
        center?: { latitude: number; longitude: number }
        pitch?: number
        heading?: number
        zoom?: number
      }, opts?: { duration?: number }) => void
    }
    if (typeof map.animateCamera !== 'function') return
    const zoom = dynamicNavZoom(userSpeedMps, hudDistanceM, navPerspective3d)
    map.animateCamera(
      {
        center: { latitude: userLocation.latitude, longitude: userLocation.longitude },
        pitch: navPerspective3d ? 60 : 0,
        heading: smoothHeading,
        zoom,
      },
      { duration: 1000 },
    )
  }, [isNavigating, navFollowReady, userLocation, smoothHeading, userSpeedMps, hudDistanceM, navPerspective3d])

  const safePlatform = suggestion?.platform ?? 'glovo'
  const platformName = safePlatform.charAt(0).toUpperCase() + safePlatform.slice(1)
  const activeOrderPlatforms = useMemo(
    () => ordersStoreActivePlatforms(activeOrders),
    [activeOrders],
  )
  const activeDeliveryOrders = useMemo(
    () => (role === 'courier' ? activeOrders.filter((o) => o.status === 'dropoff') : []),
    [activeOrders, role],
  )

  const handleSwitchPlatform = useCallback(async (platform: string) => {
    const normalized = platform.toLowerCase()
    const packageByPlatform: Record<string, string> = {
      uber: 'com.ubercab.driver',
      bolt: 'com.bolt.driver',
      glovo: 'com.glovo',
      wolt: 'com.wolt.handler',
    }
    const deepLinkByPlatform: Record<string, string> = {
      uber: 'uber://',
      bolt: 'bolt://',
      glovo: 'glovo://',
      wolt: 'wolt://',
    }
    const nativeQuickSwitch = (NativeModules.DriveMindNative as {
      openAppByPackage?: (packageName: string) => Promise<void> | void
    } | undefined)?.openAppByPackage

    try {
      if (Platform.OS === 'android' && typeof nativeQuickSwitch === 'function') {
        await nativeQuickSwitch(packageByPlatform[normalized] ?? '')
        return
      }
      const deepLink = deepLinkByPlatform[normalized]
      if (deepLink) {
        const canOpen = await Linking.canOpenURL(deepLink)
        if (canOpen) {
          await Linking.openURL(deepLink)
          return
        }
      }
      await openPlatformDeepLink(normalized)
    } catch (e) {
      console.warn('[DriveMind] fast switch failed', { platform: normalized, e })
    }
  }, [])

  const handleQaInjectMockOrder = useCallback(() => {
    if (!__DEV__) return
    Alert.alert(
      'DriveMind QA',
      'Inject mock onOrderScraped (35,50 PLN · 8 km) to exercise overlay math without Uber?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Inject', onPress: () => emitQaMockOrderEvent() },
      ],
    )
  }, [])

  return (
    <View style={[s.root, { backgroundColor: c.tabBar }]}>
      <View style={s.mapFill}>
      {!NUCLEAR_DISABLE_NATIVE_MAPS && isMapReady && (
      <MapView
        key={isDark ? 'map-dark' : 'map-light'}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        mapType="standard"
        googleRenderer={Platform.OS === 'android' ? 'LEGACY' : undefined}
        userInterfaceStyle="light"
        customMapStyle={isMapStyleReady ? mapStyleForMap : undefined}
        onMapReady={onMapReady}
        showsScale={false}
        showsPointsOfInterests={false}
        showsBuildings={false}
        showsIndoors={false}
        showsTraffic
        // TEMP: disable native user-location dot while isolating mqt_v_native release crash.
        showsUserLocation={!isNavigating && SHOWS_USER_LOCATION}
        showsMyLocationButton={false}
        compassEnabled={false}
        zoomControlEnabled={false}
        toolbarEnabled={false}
        mapToolbarEnabled={false}
        mapPadding={{ top: 0, right: 0, bottom: mapBottomPadding, left: 0 }}
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
            activeDeliveryOrders={activeDeliveryOrders}
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
      )}
      </View>

      {isNavigating && activeOrder && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
          <WazeDirectionCard
            maneuver={routeSteps?.[0]?.maneuver}
            distanceLine={distanceLine}
            streetName={streetTitle}
            etaText={etaText}
            topInset={insets.top + 28}
          />
        </View>
      )}

      {/* Header */}
      {!isNavigating && (
        <View style={[s.header, { top: insets.top + 16 }]}>
          <AnimatedButton
            style={s.headerLogoWrap}
            activeOpacity={1}
            delayLongPress={650}
            onLongPress={handleQaInjectMockOrder}
            accessibilityLabel="DriveMind"
          >
            <Logo size={32} />
          </AnimatedButton>
          <View style={[s.rolePill, { backgroundColor: c.surface, borderColor: c.border }]}>
            <MaterialCommunityIcons name={role === 'courier' ? 'bike' : 'car-outline'} size={14} color={c.secondary} />
            <Text style={[s.rolePillText, { color: c.text }]}>{role}</Text>
          </View>
        </View>
      )}

      {activeOrderPlatforms.length > 0 && (
        <View pointerEvents="box-none" style={[s.quickSwitchWrap, { bottom: mapBottomPadding + 12 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.quickSwitchContent}
          >
            {activeOrderPlatforms.map(({ orderId, platform }, idx) => (
              <Reanimated.View
                key={`quick-wrap-${orderId}`}
                entering={ElasticInRight.delay(idx * 45)}
              >
                <AnimatedButton
                  style={[s.quickSwitchBtn, { backgroundColor: c.surface, borderColor: c.separator }]}
                  activeOpacity={0.85}
                  onPress={() => {
                    void handleSwitchPlatform(platform)
                  }}
                >
                  <PlatformIcon platform={platform as any} size={18} active />
                </AnimatedButton>
              </Reanimated.View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Bottom sheet — order window */}
      <View
        style={[
          s.sheet,
          {
            minHeight: sheetHeight,
            paddingBottom: insets.bottom + 10,
            backgroundColor: c.tabBar,
            borderTopColor: c.tabBarBorder,
          },
        ]}
      >
        {/* Daily goal progress bar (thin) */}
        <View style={[s.goalBarTrack, { backgroundColor: c.separator }]}>
          <View
            style={[
              s.goalBarFill,
              {
                width: `${Math.round(goalProgress * 100)}%`,
                backgroundColor: c.primary,
              },
            ]}
          />
        </View>

        {sheetMode === 'order' && suggestion ? (
          <>
            <View style={s.orderRow}>
              <PlatformIcon platform={suggestion.platform as any} size={24} active />
              <View style={s.orderMid}>
                <View style={s.orderTopLine}>
                  {tierForSuggestion ? (
                    <View
                      style={[
                        s.tierPill,
                        {
                          borderColor: tierForSuggestion.tierColor,
                          backgroundColor: alpha(tierForSuggestion.tierColor, 0.14),
                        },
                      ]}
                    >
                      <Text style={[s.tierText, { color: tierForSuggestion.tierColor }]}>
                        {tierForSuggestion.tierLabel}
                      </Text>
                    </View>
                  ) : null}
                  <Text style={[s.priceText, { color: c.text }]}>{`${(suggestion.earnings ?? 0).toFixed(0)} zł`}</Text>
                </View>
                <Text style={[s.addrLine, { color: c.textSecondary }]} numberOfLines={1} ellipsizeMode="tail">
                  {`${rideStreetLine(suggestion.pickupAddress)} → ${rideStreetLine(suggestion.dropoffAddress)}`}
                </Text>
              </View>
            </View>

            <AnimatedButton
              style={[s.acceptBtn, { backgroundColor: c.primary }]}
              activeOpacity={0.85}
              onPress={handleAcceptSuggestion}
            >
              <Text style={[s.acceptBtnText, { color: c.textInverse }]}>
                {t('open_platform', {
                  platform: (suggestion.platform ?? '').toString().slice(0, 1).toUpperCase() +
                    (suggestion.platform ?? '').toString().slice(1),
                })}
              </Text>
            </AnimatedButton>
          </>
        ) : sheetMode === 'searching' ? (
          <View style={[s.searchBar, { borderColor: c.separator }]}>
            <ActivityIndicator size="small" color={c.primary} />
            <Text style={[s.searchText, { color: c.textSecondary }]}>{t('searching_orders')}</Text>
          </View>
        ) : (
          <View style={s.offAirRow}>
            <Text style={[s.offAirText, { color: c.textSecondary }]}>{t('off_air')}</Text>
            <AnimatedButton
              style={[s.startShiftBtn, { backgroundColor: c.primary }]}
              activeOpacity={0.85}
              onPress={() => {
                startShiftManually()
                setIsDriverOnline(true)
              }}
            >
              <Text style={[s.startShiftText, { color: c.textInverse }]}>{t('start_shift')}</Text>
            </AnimatedButton>
          </View>
        )}
      </View>
      {isShiftActive && <View pointerEvents="none" style={[s.minimalHudWrap, { top: insets.top + 18 }]}>
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
            <Text style={[s.goalRingLabel, { color: c.textMuted }]}>{t('goal_label')}</Text>
          </View>
        </View>
      </View>}

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
                  <AnimatedButton style={[s.modalBtnYes, { backgroundColor: c.primary }]} activeOpacity={0.8} onPress={handleConfirmYes}>
                    <Text style={[s.modalBtnYesText, { color: c.textInverse }]}>{t('yes')}</Text>
                  </AnimatedButton>
                  <AnimatedButton style={[s.modalBtnNo, { borderColor: c.border }]} activeOpacity={0.8} onPress={handleConfirmNo}>
                    <Text style={[s.modalBtnNoText, { color: c.text }]}>{t('no')}</Text>
                  </AnimatedButton>
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
  root: { flex: 1, alignSelf: 'stretch', width: '100%' },
  mapFill: { flex: 1, width: '100%', alignSelf: 'stretch' },
  header: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' },
  headerLogoWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  rolePillText: { fontSize: 12, fontFamily: fonts.medium, textTransform: 'capitalize' },
  quickSwitchWrap: {
    position: 'absolute',
    left: 18,
    right: 18,
    zIndex: 40,
    alignItems: 'center',
  },
  quickSwitchContent: {
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 24,
  },
  quickSwitchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    position: 'absolute',
    left: -1,
    right: -1,
    bottom: -1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 0.5,
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  goalBarTrack: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 10,
  },
  goalBarFill: {
    height: 4,
    borderRadius: 999,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  orderMid: { flex: 1, minWidth: 0 },
  orderTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  tierPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    maxWidth: '78%',
  },
  tierText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    fontWeight: '600',
  },
  priceText: {
    fontSize: 18,
    fontFamily: fonts.bold,
    fontWeight: '700',
  },
  addrLine: {
    fontSize: 12,
    fontFamily: fonts.medium,
  },
  acceptBtn: { height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  acceptBtnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginTop: 6,
  },
  searchText: { fontSize: 13, fontFamily: fonts.medium },
  offAirRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  offAirText: { fontSize: 13, fontFamily: fonts.medium },
  startShiftBtn: { height: 40, borderRadius: 10, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  startShiftText: { fontSize: 14, fontFamily: fonts.semiBold, fontWeight: '600' },
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
