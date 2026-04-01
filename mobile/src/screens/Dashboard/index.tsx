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
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import * as Location from 'expo-location'
import * as Haptics from 'expo-haptics'
import { MaterialCommunityIcons } from '@expo/vector-icons'

import MapView, { Marker, MarkerAnimated, AnimatedRegion, PROVIDER_GOOGLE } from '../../components/MapViewWeb'
import { NavigationMapLayers } from '../../components/navigation/NavigationMapLayers'
import { NavigationHud } from '../../components/navigation/NavigationHud'
import { PlayerNavMarker } from '../../components/navigation/PlayerNavMarker'
import { MapControls } from '../../components/map/MapControls'
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

  const mapAppearance = useNavigationSettingsStore((s) => s.mapAppearance)
  const markerStyle = useNavigationSettingsStore((s) => s.markerStyle)
  const units = useNavigationSettingsStore((s) => s.units)
  const mapPerspective3d = useNavigationSettingsStore((s) => s.mapPerspective3d)

  const role = useRoleStore((st) => st.role) ?? 'courier'
  const vehicleType = useRoleStore((st) => st.vehicleType)
  const {
    shiftStats, dailyGoal, isNavigating, navigationPhase, deliveryPhase, routePolyline,
    currentStep, routeDistance, routeDuration, routeSteps, routeDurationSeconds, pendingConfirmation,
    activeOrders, setPendingConfirmation,
    confirmOrder, rejectOrder, completeOrder, arriveAtPickup, startDeliveryToDropoff,
    updateNavigationPhase, stopNavigation, recomputeNavigationTarget, updateNavigationRoute,
  } = useOrdersStore()
  const navigationOrderId = useOrdersStore((s) => s.navigationOrderId)

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
  const timeLeftSeconds = routeDurationSeconds ?? 0

  const hudVariant = deliveryPhase === 'AT_PICKUP' ? 'atPickup' : 'navigation'
  const navPrimaryLabel = useMemo(() => {
    if (deliveryPhase === 'EN_ROUTE_TO_PICKUP') return t('reached_pickup')
    if (deliveryPhase === 'AT_PICKUP') return t('nav_start_delivery')
    return t('nav_finish')
  }, [deliveryPhase, t])
  const navPrimaryDisabled = deliveryPhase === 'EN_ROUTE_TO_PICKUP' && !nearDestination

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

  const handleCompleteOrder = useCallback(() => {
    if (!activeOrder) return
    console.log('[DriveMind Nav]: destination reached; completing order', { orderId: activeOrder.id })
    completeOrder(activeOrder.id)
  }, [activeOrder, completeOrder])

  const onNavPrimary = useCallback(() => {
    if (!activeOrder) return
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    if (deliveryPhase === 'EN_ROUTE_TO_PICKUP') {
      if (!nearDestination) return
      arriveAtPickup(activeOrder.id)
      return
    }
    if (deliveryPhase === 'AT_PICKUP') {
      if (!userLocation) {
        Alert.alert('', t('nav_need_location'))
        return
      }
      const mode = getTravelModeByVehicle(vehicleType, role)
      void (async () => {
        try {
          await startDeliveryToDropoff(activeOrder.id, {
            originLat: userLocation.latitude,
            originLng: userLocation.longitude,
            mode,
          })
          skipEngineAfterDropoffRouteRef.current = true
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          Alert.alert('Directions', message)
        }
      })()
      return
    }
    if (deliveryPhase === 'EN_ROUTE_TO_DROPOFF') {
      handleCompleteOrder()
    }
  }, [
    activeOrder,
    deliveryPhase,
    nearDestination,
    userLocation,
    vehicleType,
    role,
    arriveAtPickup,
    startDeliveryToDropoff,
    handleCompleteOrder,
    t,
  ])

  const onPerspectiveToggle = useCallback(
    (perspective3d: boolean) => {
      if (!mapRef.current || !userLocation) return
      mapRef.current.animateCamera(
        {
          center: { latitude: userLocation.latitude, longitude: userLocation.longitude },
          pitch: perspective3d ? 60 : 0,
          heading: smoothHeading,
          zoom: 17.5,
        },
        { duration: 450 },
      )
    },
    [userLocation, smoothHeading],
  )

  const mapStyleForMap = useMemo(() => {
    if (mapAppearance === 'light') return LIGHT_MAP_STYLE
    if (mapAppearance === 'dark') return DARK_MAP_STYLE
    return isDark ? DARK_MAP_STYLE : LIGHT_MAP_STYLE
  }, [mapAppearance, isDark])

  const mapRemountKey = `${mapAppearance}-${markerStyle}-${isDark}`

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
    const sp = userSpeedMps ?? 0
    const zoom = sp < 2 ? 17.5 : sp < 8 ? 17 : sp < 15 ? 16.5 : 16
    mapRef.current.animateCamera(
      {
        center: { latitude: userLocation.latitude, longitude: userLocation.longitude },
        pitch: mapPerspective3d ? 60 : 0,
        heading: smoothHeading,
        zoom,
      },
      { duration: 1000 },
    )
  }, [isNavigating, navFollowReady, userLocation, smoothHeading, userSpeedMps, mapPerspective3d])

  const platformName = suggestion.platform.charAt(0).toUpperCase() + suggestion.platform.slice(1)

  return (
    <View style={[s.root, { backgroundColor: c.tabBar }]}>
      <View style={s.mapFill}>
      <MapView
        key={mapRemountKey}
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyleForMap}
        showsUserLocation={!isNavigating}
        showsMyLocationButton={false}
        initialRegion={userLocation ? { ...userLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 } : KRAKOW_REGION}
      >
        {isNavigating && (
          <NavigationMapLayers
            trimmedPolyline={trimmedRoute}
            destCoord={destCoordNav}
            navigationPhase={navigationPhase}
            destPulse={destPulse}
            nearDestination={nearDestination}
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
          <MapControls
            mapRef={mapRef}
            userLocation={userLocation}
            smoothHeading={smoothHeading}
            isDark={isDark}
            bottomOffset={insets.bottom + 168}
            onPerspectiveToggle={onPerspectiveToggle}
          />
          <NavigationHud
            maneuver={routeSteps?.[0]?.maneuver}
            distanceLine={distanceLine}
            streetName={streetTitle}
            timeLeftSeconds={timeLeftSeconds}
            c={c}
            hudVariant={hudVariant}
            onPrimary={onNavPrimary}
            timeLeftLabel={t('nav_time_left')}
            arrivalLabel={t('nav_arrival')}
            primaryLabel={navPrimaryLabel}
            primaryDisabled={navPrimaryDisabled}
            atPickupTitle={t('nav_at_pickup_banner')}
            atPickupSubtitle={activeOrder.pickupAddress}
            topInset={insets.top + 28}
          />
        </View>
      )}

      {/* Header */}
      {!isNavigating && (
        <View style={[s.header, { top: insets.top + 16 }]}>
          <Text style={[s.headerTitle, { color: c.text }]}>DriveMind</Text>
          <View style={[s.rolePill, { backgroundColor: c.surface, borderColor: c.border }]}>
            <MaterialCommunityIcons name={role === 'courier' ? 'bike' : 'car-outline'} size={14} color={c.secondary} />
            <Text style={[s.rolePillText, { color: c.text }]}>{role}</Text>
          </View>
        </View>
      )}

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
          <View style={{ height: 8 }} />
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

const s = StyleSheet.create({
  root: { flex: 1 },
  mapFill: { flex: 1, width: '100%' },
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
