import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getDirections, type TravelMode, type RouteStep } from '../services/directionsService'

export interface Order {
  id: string
  platform: string
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
export type LifecyclePhase =
  | 'idle'
  | 'awaitingConfirm'
  | 'pickupRouting'
  | 'pickupArrived'
  | 'dropoffRouting'
  | 'completed'

function toRad(value: number): number {
  return (value * Math.PI) / 180
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadiusKm * c
}

interface OrdersState {
  activeOrders: Order[]
  pendingConfirmation: Order | null
  orderHistory: CompletedOrder[]
  shiftStats: ShiftStats
  dailyGoal: number
  lastPlatformActivity: Record<string, number>
  isNavigating: boolean
  navigationPhase: 'pickup' | 'dropoff' | null
  routePolyline: NavigationRoute[] | null
  currentStep: string | null
  routeDistance: string | null
  routeDuration: string | null
  routeSteps: RouteStep[] | null
  routeDurationSeconds: number | null
  navigationOrderId: string | null
  lastNearestDistanceKm: number | null
  lifecyclePhase: LifecyclePhase

  setPendingConfirmation: (order: Order | null) => void
  confirmOrder: (
    order: Order,
    options?: { originLat: number; originLng: number; mode: TravelMode },
  ) => Promise<void>
  rejectOrder: () => void
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
  markPickupArrived: (orderId: string) => void
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      activeOrders: [],
      pendingConfirmation: null,
      orderHistory: [],
      shiftStats: DEFAULT_SHIFT_STATS,
      dailyGoal: 300,
      lastPlatformActivity: {},
      isNavigating: false,
      navigationPhase: null,
      routePolyline: null,
      currentStep: null,
      routeDistance: null,
      routeDuration: null,
      routeSteps: null,
      routeDurationSeconds: null,
      navigationOrderId: null,
      lastNearestDistanceKm: null,
      lifecyclePhase: 'idle',

      setPendingConfirmation: (order) =>
        set({
          pendingConfirmation: order,
          lifecyclePhase: order ? 'awaitingConfirm' : get().isNavigating ? get().lifecyclePhase : 'idle',
        }),

      confirmOrder: async (order, options) => {
        const { shiftStats, activeOrders } = get()
        console.log('[DriveMind Nav]: confirmOrder called', {
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
          lifecyclePhase: 'pickupRouting',
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
          console.log('[DriveMind Nav]: fetching pickup route', {
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
          console.log('[DriveMind Store]: State updated with polyline length:', route.polylinePoints.length)
          console.log('[DriveMind Nav]: pickup route ready', {
            points: route.polylinePoints.length,
            distance: route.distanceText,
            duration: route.durationText,
          })
        } catch (error) {
          console.log('[DriveMind Nav]: pickup route fetch failed', {
            orderId: order.id,
            error,
          })
          throw error
        }
      },

      rejectOrder: () => set({ pendingConfirmation: null }),

      completeOrder: (orderId) => {
        const { activeOrders, orderHistory, shiftStats } = get()
        const order = activeOrders.find((o) => o.id === orderId)
        if (!order) return
        console.log('[DriveMind Nav]: completeOrder called', { orderId })

        const completed: CompletedOrder = { ...order, status: 'completed', completedAt: Date.now() }
        const trimmedHistory = [completed, ...orderHistory].slice(0, 50)

        set({
          activeOrders: activeOrders.filter((o) => o.id !== orderId),
          orderHistory: trimmedHistory,
          lifecyclePhase: activeOrders.length > 1 ? 'pickupRouting' : 'completed',
          shiftStats: {
            ...shiftStats,
            totalEarnings: shiftStats.totalEarnings + order.earnings,
            totalKm: shiftStats.totalKm + order.distanceKm,
            totalMinutes: shiftStats.totalMinutes + order.durationMin,
            completedOrders: shiftStats.completedOrders + 1,
            lastOrderDropoffLat: order.dropoffLat,
            lastOrderDropoffLng: order.dropoffLng,
          },
        })
      },

      setOrderStatus: (orderId, status) =>
        set((state) => ({
          activeOrders: state.activeOrders.map((o) =>
            o.id === orderId ? { ...o, status } : o,
          ),
        })),

      setDailyGoal: (dailyGoal) => set({ dailyGoal }),

      startNavigation: (order) =>
        set({
          isNavigating: true,
          navigationOrderId: order.id,
          navigationPhase: order.status === 'pickup' ? 'pickup' : 'dropoff',
        }),

      recomputeNavigationTarget: (originLat, originLng, thresholdKm = 0.2) => {
        const { activeOrders, navigationOrderId, lastNearestDistanceKm } = get()
        if (activeOrders.length === 0) {
          console.log('[DriveMind Nav]: no active orders; stopping navigation target')
          set({ navigationOrderId: null, navigationPhase: null, lastNearestDistanceKm: null })
          return null
        }

        const pickupOrders = activeOrders.filter((o) => o.status === 'pickup')
        const candidates = pickupOrders.length > 0 ? pickupOrders : activeOrders
        const nearest = candidates.reduce<{ id: string; distance: number } | null>((best, order) => {
          const targetLat = order.status === 'pickup' ? order.pickupLat : order.dropoffLat
          const targetLng = order.status === 'pickup' ? order.pickupLng : order.dropoffLng
          const currentDistance = distanceKm(originLat, originLng, targetLat, targetLng)
          if (!best || currentDistance < best.distance) {
            return { id: order.id, distance: currentDistance }
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
        console.log('[DriveMind Nav]: navigation target recomputed', {
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

      stopNavigation: () =>
        set({
          isNavigating: false,
          navigationOrderId: null,
          navigationPhase: null,
          routePolyline: null,
          currentStep: null,
          routeDistance: null,
          routeDuration: null,
          routeSteps: null,
          routeDurationSeconds: null,
          lastNearestDistanceKm: null,
          lifecyclePhase: 'idle',
        }),

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

      markPickupArrived: (orderId) =>
        set((state) => ({
          activeOrders: state.activeOrders.map((o) =>
            o.id === orderId ? { ...o, status: 'dropoff' } : o,
          ),
          navigationPhase: 'dropoff',
          lifecyclePhase: 'dropoffRouting',
        })),
    }),
    {
      name: 'drivemind-orders',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeOrders: state.activeOrders,
        orderHistory: state.orderHistory,
        shiftStats: state.shiftStats,
        dailyGoal: state.dailyGoal,
        lastPlatformActivity: state.lastPlatformActivity,
        pendingConfirmation: state.pendingConfirmation,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isNavigating = false
          state.navigationPhase = null
          state.routePolyline = null
          state.currentStep = null
          state.routeDistance = null
          state.routeDuration = null
          state.routeSteps = null
          state.routeDurationSeconds = null
          state.navigationOrderId = null
          state.lastNearestDistanceKm = null
          state.lifecyclePhase = 'idle'
        }
      },
    },
  ),
)
