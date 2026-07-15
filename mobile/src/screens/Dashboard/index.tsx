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
  Platform,
  ScrollView,
  Linking,
  NativeModules,
  TouchableOpacity,
  StatusBar,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons'
import Svg, { Circle } from 'react-native-svg'
import Reanimated, { SlideInRight } from 'react-native-reanimated'

import { AnimatedRegion } from '../../components/MapViewWeb'
import { WazeDirectionCard } from './WazeDirectionCard'
import { DashboardMap } from './DashboardMap'
import { DashboardBottomSheet } from './DashboardBottomSheet'
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
import { checkPermissionsStatus } from '../../services/permissionManager'
import { usePermissionOnboardingFocusCheck } from '../../hooks/usePermissionOnboardingFocusCheck'
import { useDriverSessionStore } from '../../store/driverSessionStore'
import { requestShiftAccessibilityDisclosure } from '../../services/accessibilityDisclosure'
import { useShallow } from 'zustand/react/shallow'
import { useDriverIngestStore } from '../../store/driverIngestStore'
import { useAuthStore } from '../../store/authStore'
import { fonts } from '../../theme/typography'
import { useTheme, type AppColors } from '../../theme/theme'
import { computeProfitability } from '@drivemind/shared'
// NUCLEAR DEBUG: direct react-native-maps import disabled for this build.
import { MAP_STYLE_DARK, MAP_STYLE_LIGHT } from '../../map/mapStyles'
import AnimatedButton from '../../components/AnimatedButton'
import Logo from '../../components/common/Logo'

const GOAL_RING_SIZE = 54
const GOAL_RING_STROKE = 5
const ElasticInRight = SlideInRight.springify().damping(9).stiffness(180)

const KRAKOW_REGION = {
  latitude: 50.0614,
  longitude: 19.9366,
  latitudeDelta: 0.06,
  longitudeDelta: 0.06,
}

function ordersStoreActivePlatforms(orders: Order[]): { orderId: string; platform: string }[] {
  return orders
    .map((order) => ({ orderId: order.id, platform: order.platform?.toLowerCase?.() ?? '' }))
    .filter((row): row is { orderId: string; platform: string } => ['uber', 'bolt', 'wolt', 'glovo'].includes(row.platform))
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
  usePermissionOnboardingFocusCheck()

  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
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
          {t('dashboard_isolation_title')}
        </Text>
        <Text style={{ color: c.textSecondary, fontSize: 14, textAlign: 'center' }}>
          {t('dashboard_isolation_body')}
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
    confirmOrder, rejectOrder, dismissOrder,
    updateNavigationPhase, stopNavigation, recomputeNavigationTarget, updateNavigationRoute,
    startShiftManually,
  } = useOrdersStore()
  const navPerspective3d = isNavigating ? true : mapPerspective3d
  const navigationOrderId = useOrdersStore((s) => s.navigationOrderId)
  const isDriverOnline = useDriverSessionStore((s) => s.isOnline)
  const setIsDriverOnline = useDriverSessionStore((s) => s.setIsOnline)
  const setAccessibilityConsentGiven = useDriverSessionStore((s) => s.setAccessibilityConsentGiven)

  // Shallow compare — a plain selector returning `{ id, ... }` creates a new object every
  // getSnapshot call and triggers "Maximum update depth exceeded" once activeRide is set.
  const activeRideSnapshot = useDriverIngestStore(
    useShallow((s) => {
      const r = s.activeRide
      if (!r) return null
      return {
        id: r.id,
        platform: r.platform,
        price: r.price,
        pickup: r.pickup,
        destination: r.destination,
        text: r.text,
        distanceKm: r.distanceKm,
        etaMin: r.etaMin,
      }
    }),
  )
  const dismissActiveRide = useDriverIngestStore((s) => s.dismissActiveRide)
  const removeIngestOffer = useDriverIngestStore((s) => s.removeOffer)
  const isSearchBlocked = useAuthStore((s) => s.isSearchBlocked)

  const openPaywall = useCallback(() => {
    navigation.navigate('Paywall')
  }, [navigation])

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
    if (!activeRideSnapshot) return null
    const parsedPrice = Number.parseFloat((activeRideSnapshot.price ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
    const earnings = Number.isFinite(parsedPrice) ? parsedPrice : 0
    const distParsed = Number.parseFloat((activeRideSnapshot.distanceKm ?? '').replace(',', '.').replace(/[^\d.]/g, ''))
    const etaParsed = Number.parseInt((activeRideSnapshot.etaMin ?? '').replace(/[^\d]/g, ''), 10)
    return {
      id: activeRideSnapshot.id,
      platform: activeRideSnapshot.platform === 'unknown' ? 'uber' : activeRideSnapshot.platform,
      pickupAddress: activeRideSnapshot.pickup?.trim() || '—',
      dropoffAddress: activeRideSnapshot.destination ?? activeRideSnapshot.text ?? '—',
      earnings,
      distanceKm: Number.isFinite(distParsed) && distParsed > 0 ? distParsed : 5,
      durationMin: Number.isFinite(etaParsed) && etaParsed > 0 ? etaParsed : 15,
      deadrunKm: 0,
      pickupLat: 50.0614,
      pickupLng: 19.9366,
      dropoffLat: 50.0614,
      dropoffLng: 19.9366,
      profitScore: 0,
      profitTier: 'STANDARD',
      status: 'pickup',
    } as Order
  }, [activeOrder, activeRideSnapshot])
  const hasSuggestedOrder = !!suggestion

  const sheetMode = useMemo(() => {
    if (!isDriverOnline) return 'off_air' as const
    if (isSearchBlocked && !hasSuggestedOrder) return 'blocked' as const
    if (!hasSuggestedOrder) return 'searching' as const
    return 'order' as const
  }, [isDriverOnline, isSearchBlocked, hasSuggestedOrder])

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
    let cancelled = false

    const stopWatching = () => {
      sub?.remove()
      headingSub?.remove()
      sub = null
      headingSub = null
    }

    const startWatching = async () => {
      if (cancelled || AppState.currentState !== 'active' || sub != null) return
      try {
        const NUCLEAR_DISABLE_GOOGLE_LOCATION_CALLS = false
        if (NUCLEAR_DISABLE_GOOGLE_LOCATION_CALLS) return
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (cancelled || AppState.currentState !== 'active') return
        const existing = await Location.getForegroundPermissionsAsync()
        if (existing.status !== 'granted' || cancelled) return
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        if (cancelled) return
        const first: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude }
        setUserLocation(first)
        lastPosForBearingRef.current = first
        setUserSpeedMps(loc.coords.speed ?? null)
        const h = loc.coords.heading
        if (h != null && h >= 0) setUserHeadingDeg(h)
        if (cancelled || AppState.currentState !== 'active') return
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
    }

    void startWatching()
    const appSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void startWatching()
      else stopWatching()
    })

    return () => {
      cancelled = true
      stopWatching()
      appSub.remove()
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
    if (activeRideSnapshot && !activeOrder) {
      removeIngestOffer(activeRideSnapshot.id)
    }
    if (Platform.OS === 'android') triggerScraperWindow()
    pendingOrderRef.current = suggestion
    openPlatformDeepLink(suggestion?.platform ?? '')
  }, [suggestion, activeRideSnapshot, activeOrder, removeIngestOffer])

  const handleDismissSuggestion = useCallback(() => {
    if (!suggestion) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (activeOrder) {
      dismissOrder(suggestion.id)
    } else if (activeRideSnapshot) {
      dismissActiveRide()
    }
  }, [suggestion, activeOrder, activeRideSnapshot, dismissOrder, dismissActiveRide])

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
          Alert.alert(t('directions_alert_title'), message)
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
  const [permissionsChecked, setPermissionsChecked] = useState(false)
  const mapStyleReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Native blue-dot follows expo-location watch — only show once we have a fix.
  const showsUserLocationOnMap = !!userLocation
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
    if (!permissionsChecked) {
      void checkPermissionsStatus()
      setPermissionsChecked(true)
    }
  }, [permissionsChecked])

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

  const mapInitialRegion = useMemo(
    () =>
      userLocation
        ? { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }
        : KRAKOW_REGION,
    [userLocation?.latitude, userLocation?.longitude],
  )

  const doStartShift = useCallback(() => {
    startShiftManually()
    setIsDriverOnline(true)
  }, [startShiftManually, setIsDriverOnline])

  const handleStartShift = useCallback(async () => {
    const canProceed =
      Platform.OS !== 'android' ? true : await requestShiftAccessibilityDisclosure()
    if (!canProceed) {
      setIsDriverOnline(false)
      return
    }
    setAccessibilityConsentGiven(true)
    doStartShift()
  }, [doStartShift, setAccessibilityConsentGiven, setIsDriverOnline])

  const handleSwitchPlatform = useCallback(async (platform: string) => {
    const normalized = platform.toLowerCase()
    const packageByPlatform: Record<string, string> = {
      uber: 'com.ubercab.driver',
      bolt: 'com.bolt.driver',
      glovo: 'com.glovo',
      wolt: 'com.wolt.courier.android',
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

  return (
    <View style={[s.root, { backgroundColor: c.tabBar }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={s.mapFill}>
      {!NUCLEAR_DISABLE_NATIVE_MAPS && isMapReady && (
      <DashboardMap
        mapRef={mapRef}
        isDark={isDark}
        isMapStyleReady={isMapStyleReady}
        mapStyleForMap={mapStyleForMap}
        onMapReady={onMapReady}
        isNavigating={isNavigating}
        showsUserLocation={!isNavigating && showsUserLocationOnMap}
        mapBottomPadding={mapBottomPadding}
        initialRegion={mapInitialRegion}
        trimmedRoute={trimmedRoute}
        destCoordNav={destCoordNav}
        navigationPhase={navigationPhase}
        destPulse={destPulse}
        nearDestination={nearDestination}
        animatedCoord={animatedCoord}
        markerStyle={markerStyle}
        smoothHeading={smoothHeading}
        userLocation={userLocation}
      />
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

      {/* Status bar backdrop */}
      {!isNavigating && (
        <View
          style={[
            s.statusBarBackdrop,
            { height: insets.top, backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)' },
          ]}
        />
      )}

      {/* Header */}
      {!isNavigating && (
        <View style={[s.header, { top: insets.top + 8, paddingLeft: 4 }]}>
          <AnimatedButton
            style={s.headerLogoBtn}
            activeOpacity={1}
            accessibilityLabel="DriveMind"
          >
            <Logo theme="auto" variant="full" size={32} style={s.headerLogoImage} />
          </AnimatedButton>
          <View style={[s.rolePill, { backgroundColor: c.surface, borderColor: c.border }]}>
            <MaterialCommunityIcons name={role === 'courier' ? 'bike' : 'car-outline'} size={14} color={c.secondary} />
            <Text style={[s.rolePillText, { color: c.text }]}>{role}</Text>
          </View>
        </View>
      )}

      {isNavigating && activeOrderPlatforms.length > 0 && (
        <View pointerEvents="box-none" style={s.quickSwitchColumn}>
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

        <DashboardBottomSheet
          sheetMode={sheetMode}
          suggestion={suggestion}
          tierForSuggestion={tierForSuggestion}
          c={c}
          onDismiss={handleDismissSuggestion}
          onAccept={handleAcceptSuggestion}
          onOpenPaywall={openPaywall}
          onStartShift={handleStartShift}
        />
      </View>
      {isShiftActive && <View pointerEvents="none" style={[s.minimalHudWrap, { top: insets.top + 18 }]}>
        <View style={[s.speedChip, { backgroundColor: c.surface, borderColor: c.separator }]}>
          <Text style={[s.speedValue, { color: c.text }]}>{speedLabelKmh}</Text>
          <Text style={[s.speedUnit, { color: c.textMuted }]}>{t('speed_unit_kmh')}</Text>
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
  statusBarBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 },
  header: { position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLogoBtn: { paddingVertical: 4, paddingRight: 8, flexShrink: 0, alignItems: 'flex-start' },
  headerLogoImage: { height: 32, width: undefined, maxWidth: 168 },
  rolePill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  rolePillText: { fontSize: 12, fontFamily: fonts.medium, textTransform: 'capitalize' },
  quickSwitchColumn: {
    position: 'absolute',
    left: 14,
    top: '38%',
    zIndex: 40,
    gap: 10,
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
  orderActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dismissBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  searchBarBlocked: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
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
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 78,
  },
  speedValue: { fontSize: 22, lineHeight: 24, fontFamily: fonts.bold, fontWeight: '700' },
  speedUnit: { fontSize: 11, fontFamily: fonts.medium },
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
