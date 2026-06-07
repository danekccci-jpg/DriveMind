import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getDirections, type TravelMode, type RouteStep } from '../services/directionsService'
import { navigationEngine } from '../services/navigationEngine'
import { emitOrderAccepted, clearPendingDriverLocation } from '../services/socketService'
import { useWalletStore } from './walletStore'
import { playWalletCreditSound } from '../services/walletSound'
import { devLog } from '../utils/devLog'
import { notifyOrderCompletedForUser } from '../services/userFirestoreService'

export interface Order {
  id: string
  platform: string
  RestaurantLogo?: string
  restaurantName?: string
  pickupAddress: string
  dropoffAddress: string
  earnings: number
  distanceKm: number
  durationMin: number
  deadrunKm: number
  pickupLat: number
  pickupLng: number
  dropoffLat: number
  dropoffLng: number
  profitScore: number
  profitLabel: string
  status: 'pickup' | 'dropoff' | 'completed'
}

export interface CompletedOrder extends Order {
  completedAt: number
}

export interface ShiftStats {
  totalEarnings: number
  totalKm: number
  totalMinutes: number
  completedOrders: number
  startTime: number | null
  lastOrderDropoffLat: number | null
  lastOrderDropoffLng: number | null
}

const DEFAULT_SHIFT_STATS: ShiftStats = {
  totalEarnings: 0,
  totalKm: 0,
  totalMinutes: 0,
  completedOrders: 0,
  startTime: null,
  lastOrderDropoffLat: null,
  lastOrderDropoffLng: null,
}

interface NavigationRoute {
  latitude: number
  longitude: number
}

const KRAKOW_FALLBACK_ORIGIN = { latitude: 50.0614, longitude: 19.9366 }

/** Explicit delivery lifecycle for navigation UX and routing. */
export type DeliveryPhase =
  | 'IDLE'
  | 'EN_ROUTE_TO_PICKUP'
  | 'AT_PICKUP'
  | 'EN_ROUTE_TO_DROPOFF'
  | 'COMPLETED'

function toRad(value: number): number {
  return (value * Math.PI) / 180
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

function emptyRouteState() {
  return {
    routePolyline: null as NavigationRoute[] | null,
    currentStep: null as string | null,
    routeDistance: null as string | null,
    routeDuration: null as string | null,
    routeSteps: null as RouteStep[] | null,
    routeDurationSeconds: null as number | null,
  }
}

interface OrdersState {
  activeOrders: Order[]
  pendingConfirmation: Order | null
  orderHistory: CompletedOrder[]
  shiftStats: ShiftStats
  dailyGoal: number
  lastPlatformActivity: Record<string, number>
  isNavigating: boolean
  /** Leg of journey for map layers & destination marker (pickup vs dropoff). */
  navigationPhase: 'pickup' | 'dropoff' | null
  deliveryPhase: DeliveryPhase
  routePolyline: NavigationRoute[] | null
  currentStep: string | null
  routeDistance: string | null
  routeDuration: string | null
  routeSteps: RouteStep[] | null
  routeDurationSeconds: number | null
  navigationOrderId: string | null
  lastNearestDistanceKm: number | null

  /**
   * Earnings still required to reach today's daily goal.
   * Returns 0 once the goal is met.
   */
  remainingToGoal: number

  setPendingConfirmation: (order: Order | null) => void
  confirmOrder: (
    order: Order,
    options?: { originLat: number; originLng: number; mode: TravelMode },
  ) => Promise<void>
  rejectOrder: () => void
  /** Removes an active order without completing it; promotes the next one if navigating. */
  dismissOrder: (orderId: string) => void
  completeOrder: (orderId: string) => void
  setOrderStatus: (orderId: string, status: Order['status']) => void
  setDailyGoal: (goal: number) => void
  startNavigation: (order: Order) => void
  recomputeNavigationTarget: (originLat: number, originLng: number, thresholdKm?: number) => string | null
  updateNavigationPhase: (phase: 'pickup' | 'dropoff' | null) => void
  updateNavigationRoute: (route: {
    polyline: NavigationRoute[]
    currentStep: string
    routeDistance: string
    routeDuration: string
    steps?: RouteStep[]
    durationSecondsTotal?: number
  }) => void
  stopNavigation: () => void
  startShiftManually: () => void
  endShiftManually: () => void
  /** Driver is within 50 m of pickup — waiting to start delivery leg. */
  arriveAtPickup: (orderId: string) => void
  /** Clears route, fetches new directions from current GPS to dropoff. */
  startDeliveryToDropoff: (
    orderId: string,
    options: { originLat: number; originLng: number; mode: TravelMode },
  ) => Promise<void>
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      activeOrders: [],
      pendingConfirmation: null,
      orderHistory: [],
      shiftStats: DEFAULT_SHIFT_STATS,
      dailyGoal: 500,
      remainingToGoal: 500,
      lastPlatformActivity: {},
      isNavigating: false,
      navigationPhase: null,
      deliveryPhase: 'IDLE',
      routePolyline: null,
      currentStep: null,
      routeDistance: null,
      routeDuration: null,
      routeSteps: null,
      routeDurationSeconds: null,
      navigationOrderId: null,
      lastNearestDistanceKm: null,

      setPendingConfirmation: (order) =>
        set({
          pendingConfirmation: order,
          deliveryPhase:
            order ? 'IDLE' : get().isNavigating ? get().deliveryPhase : 'IDLE',
        }),

      confirmOrder: async (order, options) => {
        const { shiftStats, activeOrders } = get()
        devLog('[DriveMind Nav]: confirmOrder called', {
          orderId: order.id,
          platform: order.platform,
          hasRouteContext: !!options,
        })
        set({
          activeOrders: [...activeOrders, { ...order, status: 'pickup' }],
          pendingConfirmation: null,
          isNavigating: true,
          navigationPhase: 'pickup',
          navigationOrderId: order.id,
          deliveryPhase: 'EN_ROUTE_TO_PICKUP',
          shiftStats: {
            ...shiftStats,
            startTime: shiftStats.startTime ?? Date.now(),
          },
          lastPlatformActivity: {
            ...get().lastPlatformActivity,
            [order.platform]: Date.now(),
          },
        })

        const originLat = options?.originLat ?? KRAKOW_FALLBACK_ORIGIN.latitude
        const originLng = options?.originLng ?? KRAKOW_FALLBACK_ORIGIN.longitude
        const mode = options?.mode ?? 'driving'
        try {
          devLog('[DriveMind Nav]: fetching pickup route', {
            orderId: order.id,
            origin: { latitude: originLat, longitude: originLng },
            pickup: { latitude: order.pickupLat, longitude: order.pickupLng },
            mode,
            usedFallbackOrigin: !options,
          })
          const route = await getDirections(
            originLat,
            originLng,
            order.pickupLat,
            order.pickupLng,
            mode,
          )
          set({
            routePolyline: route.polylinePoints,
            currentStep: route.steps[0]?.instruction ?? '',
            routeDistance: route.distanceText,
            routeDuration: route.durationText,
            routeSteps: route.steps.length > 0 ? route.steps : null,
            routeDurationSeconds: route.durationSecondsTotal > 0 ? route.durationSecondsTotal : null,
          })
          emitOrderAccepted(order.id)
          devLog('[DriveMind Store]: State updated with polyline length:', route.polylinePoints.length)
          devLog('[DriveMind Nav]: pickup route ready', {
            points: route.polylinePoints.length,
            distance: route.distanceText,
            duration: route.durationText,
          })
        } catch (error) {
          devLog('[DriveMind Nav]: pickup route fetch failed', {
            orderId: order.id,
            error,
          })
          throw error
        }
      },

      rejectOrder: () => set({ pendingConfirmation: null }),

      dismissOrder: (orderId) => {
        navigationEngine.cancelPending()
        const { activeOrders, navigationOrderId } = get()
        const remaining = activeOrders.filter((o) => o.id !== orderId)
        if (remaining.length === activeOrders.length) return

        if (remaining.length === 0) {
          navigationEngine.resetLocationEmitFilter()
          clearPendingDriverLocation()
          set({
            activeOrders: [],
            isNavigating: false,
            navigationOrderId: null,
            navigationPhase: null,
            deliveryPhase: 'IDLE',
            lastNearestDistanceKm: null,
            ...emptyRouteState(),
          })
          return
        }

        const wasNavTarget = navigationOrderId === orderId
        const nextNavOrder =
          (wasNavTarget ? remaining[0] : remaining.find((o) => o.id === navigationOrderId)) ?? remaining[0]

        set({
          activeOrders: remaining,
          ...(wasNavTarget
            ? {
                navigationOrderId: nextNavOrder.id,
                navigationPhase: nextNavOrder.status === 'dropoff' ? 'dropoff' : 'pickup',
                deliveryPhase:
                  nextNavOrder.status === 'dropoff' ? 'EN_ROUTE_TO_DROPOFF' : 'EN_ROUTE_TO_PICKUP',
                lastNearestDistanceKm: null,
                ...emptyRouteState(),
              }
            : {}),
        })
      },

      completeOrder: (orderId) => {
        navigationEngine.cancelPending()
        const { activeOrders, orderHistory, shiftStats } = get()
        const order = activeOrders.find((o) => o.id === orderId)
        if (!order) return
        devLog('[DriveMind Nav]: completeOrder called', { orderId })

        const completed: CompletedOrder = { ...order, status: 'completed', completedAt: Date.now() }
        const trimmedHistory = [completed, ...orderHistory].slice(0, 50)
        const remaining = activeOrders.filter((o) => o.id !== orderId)

        const nextStats: ShiftStats = {
          ...shiftStats,
          totalEarnings: shiftStats.totalEarnings + order.earnings,
          totalKm: shiftStats.totalKm + order.distanceKm,
          totalMinutes: shiftStats.totalMinutes + order.durationMin,
          completedOrders: shiftStats.completedOrders + 1,
          lastOrderDropoffLat: order.dropoffLat,
          lastOrderDropoffLng: order.dropoffLng,
        }
        const remainingToGoal = Math.max(0, get().dailyGoal - nextStats.totalEarnings)

        useWalletStore.getState().recordOrderPayout(order.id, order.earnings, {
          pickupAddress: order.pickupAddress,
          dropoffAddress: order.dropoffAddress,
          distanceKm: order.distanceKm,
        })
        void playWalletCreditSound()

        if (remaining.length === 0) {
          navigationEngine.resetLocationEmitFilter()
          clearPendingDriverLocation()
          set({
            activeOrders: [],
            orderHistory: trimmedHistory,
            shiftStats: nextStats,
            remainingToGoal,
            isNavigating: false,
            navigationOrderId: null,
            navigationPhase: null,
            deliveryPhase: 'IDLE',
            lastNearestDistanceKm: null,
            ...emptyRouteState(),
          })
          void notifyOrderCompletedForUser()
          return
        }

        const next = remaining[0]
        set({
          activeOrders: remaining,
          orderHistory: trimmedHistory,
          shiftStats: nextStats,
          remainingToGoal,
          navigationOrderId: next.id,
          navigationPhase: next.status === 'dropoff' ? 'dropoff' : 'pickup',
          deliveryPhase: next.status === 'dropoff' ? 'EN_ROUTE_TO_DROPOFF' : 'EN_ROUTE_TO_PICKUP',
          lastNearestDistanceKm: null,
          ...emptyRouteState(),
        })
        void notifyOrderCompletedForUser()
      },

      setOrderStatus: (orderId, status) =>
        set((state) => ({
          activeOrders: state.activeOrders.map((o) => (o.id === orderId ? { ...o, status } : o)),
        })),

      setDailyGoal: (dailyGoal) =>
        set((state) => ({
          dailyGoal,
          remainingToGoal: Math.max(0, dailyGoal - state.shiftStats.totalEarnings),
        })),

      startNavigation: (order) =>
        set({
          isNavigating: true,
          navigationOrderId: order.id,
          navigationPhase: order.status === 'pickup' ? 'pickup' : 'dropoff',
          deliveryPhase: order.status === 'pickup' ? 'EN_ROUTE_TO_PICKUP' : 'EN_ROUTE_TO_DROPOFF',
        }),

      recomputeNavigationTarget: (originLat, originLng, thresholdKm = 0.2) => {
        const { activeOrders, navigationOrderId, lastNearestDistanceKm, deliveryPhase } = get()
        if (deliveryPhase === 'AT_PICKUP') {
          return navigationOrderId
        }
        if (activeOrders.length === 0) {
          devLog('[DriveMind Nav]: no active orders; stopping navigation target')
          set({ navigationOrderId: null, navigationPhase: null, lastNearestDistanceKm: null })
          return null
        }

        const pickupOrders = activeOrders.filter((o) => o.status === 'pickup')
        const candidates = pickupOrders.length > 0 ? pickupOrders : activeOrders
        const nearest = candidates.reduce<{ id: string; distance: number } | null>((best, o) => {
          const targetLat = o.status === 'pickup' ? o.pickupLat : o.dropoffLat
          const targetLng = o.status === 'pickup' ? o.pickupLng : o.dropoffLng
          const currentDistance = distanceKm(originLat, originLng, targetLat, targetLng)
          if (!best || currentDistance < best.distance) {
            return { id: o.id, distance: currentDistance }
          }
          return best
        }, null)

        if (!nearest) return null

        const shouldKeepCurrent =
          navigationOrderId &&
          navigationOrderId !== nearest.id &&
          lastNearestDistanceKm !== null &&
          nearest.distance >= lastNearestDistanceKm - thresholdKm

        const nextId = shouldKeepCurrent ? navigationOrderId : nearest.id
        const nextOrder = activeOrders.find((o) => o.id === nextId)
        set({
          navigationOrderId: nextId,
          navigationPhase: nextOrder?.status === 'dropoff' ? 'dropoff' : 'pickup',
          lastNearestDistanceKm: nearest.distance,
        })
        devLog('[DriveMind Nav]: navigation target recomputed', {
          nextId,
          phase: nextOrder?.status === 'dropoff' ? 'dropoff' : 'pickup',
          nearestDistanceKm: nearest.distance,
        })
        return nextId
      },

      updateNavigationPhase: (navigationPhase) => set({ navigationPhase }),

      updateNavigationRoute: ({ polyline, currentStep, routeDistance, routeDuration, steps, durationSecondsTotal }) =>
        set({
          routePolyline: polyline,
          currentStep,
          routeDistance,
          routeDuration,
          ...(steps !== undefined && { routeSteps: steps.length > 0 ? steps : null }),
          ...(durationSecondsTotal !== undefined && {
            routeDurationSeconds: durationSecondsTotal > 0 ? durationSecondsTotal : null,
          }),
        }),

      stopNavigation: () => {
        navigationEngine.resetLocationEmitFilter()
        clearPendingDriverLocation()
        set({
          isNavigating: false,
          navigationOrderId: null,
          navigationPhase: null,
          deliveryPhase: 'IDLE',
          routePolyline: null,
          currentStep: null,
          routeDistance: null,
          routeDuration: null,
          routeSteps: null,
          routeDurationSeconds: null,
          lastNearestDistanceKm: null,
        })
      },

      startShiftManually: () =>
        set((state) => ({
          shiftStats: {
            ...state.shiftStats,
            startTime: state.shiftStats.startTime ?? Date.now(),
          },
        })),

      endShiftManually: () =>
        set((state) => ({
          shiftStats: {
            ...state.shiftStats,
            startTime: null,
          },
        })),

      arriveAtPickup: (orderId) => {
        const { activeOrders, deliveryPhase } = get()
        const o = activeOrders.find((x) => x.id === orderId)
        if (!o || deliveryPhase !== 'EN_ROUTE_TO_PICKUP') return
        set({ deliveryPhase: 'AT_PICKUP' })
      },

      startDeliveryToDropoff: async (orderId, options) => {
        const state = get()
        const order = state.activeOrders.find((o) => o.id === orderId)
        if (!order || state.deliveryPhase !== 'AT_PICKUP') return

        navigationEngine.cancelPending()
        set({
          activeOrders: state.activeOrders.map((o) => (o.id === orderId ? { ...o, status: 'dropoff' as const } : o)),
          navigationPhase: 'dropoff',
          deliveryPhase: 'EN_ROUTE_TO_DROPOFF',
          ...emptyRouteState(),
        })

        try {
          const route = await getDirections(
            options.originLat,
            options.originLng,
            order.dropoffLat,
            order.dropoffLng,
            options.mode,
          )
          set({
            routePolyline: route.polylinePoints,
            currentStep: route.steps[0]?.instruction ?? '',
            routeDistance: route.distanceText,
            routeDuration: route.durationText,
            routeSteps: route.steps.length > 0 ? route.steps : null,
            routeDurationSeconds: route.durationSecondsTotal > 0 ? route.durationSecondsTotal : null,
          })
          devLog('[DriveMind Nav]: dropoff route ready', {
            orderId,
            points: route.polylinePoints.length,
          })
        } catch (error) {
          console.error('[DriveMind Nav]: startDeliveryToDropoff failed', error)
          throw error
        }
      },
    }),
    {
      name: 'drivemind-orders-v2',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeOrders: state.activeOrders,
        orderHistory: state.orderHistory,
        shiftStats: state.shiftStats,
        dailyGoal: state.dailyGoal,
        remainingToGoal: state.remainingToGoal,
        lastPlatformActivity: state.lastPlatformActivity,
        pendingConfirmation: state.pendingConfirmation,
        isNavigating: state.isNavigating,
        navigationPhase: state.navigationPhase,
        deliveryPhase: state.deliveryPhase,
        navigationOrderId: state.navigationOrderId,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const id = state.navigationOrderId
        const orderOk = !!(id && state.activeOrders?.some((o) => o.id === id))
        const phase = state.deliveryPhase
        const recover =
          orderOk &&
          (phase === 'EN_ROUTE_TO_PICKUP' ||
            phase === 'AT_PICKUP' ||
            phase === 'EN_ROUTE_TO_DROPOFF')

        if (recover) {
          state.isNavigating = true
          state.routePolyline = null
          state.currentStep = null
          state.routeDistance = null
          state.routeDuration = null
          state.routeSteps = null
          state.routeDurationSeconds = null
          state.lastNearestDistanceKm = null
          state.pendingConfirmation = null
          devLog('[DriveMind Store]: rehydrated active navigation; route will be refetched', {
            deliveryPhase: phase,
            orderId: id,
          })
        } else {
          state.isNavigating = false
          state.navigationPhase = null
          state.deliveryPhase = 'IDLE'
          state.routePolyline = null
          state.currentStep = null
          state.routeDistance = null
          state.routeDuration = null
          state.routeSteps = null
          state.routeDurationSeconds = null
          state.navigationOrderId = null
          state.lastNearestDistanceKm = null
        }
      },
    },
  ),
)

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * Derived selector: earnings still needed to reach today's daily goal.
 * Returns 0 once the goal has been met or exceeded.
 *
 * Usage: `const remaining = useOrdersStore(selectRemainingToGoal)`
 */
export function selectRemainingToGoal(state: OrdersState): number {
  return Math.max(0, state.dailyGoal - state.shiftStats.totalEarnings)
}
