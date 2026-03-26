import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

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

  setPendingConfirmation: (order: Order | null) => void
  confirmOrder: (order: Order) => void
  rejectOrder: () => void
  completeOrder: (orderId: string) => void
  setOrderStatus: (orderId: string, status: Order['status']) => void
  setDailyGoal: (goal: number) => void
  startNavigation: (order: Order) => void
  updateNavigationPhase: (phase: 'pickup' | 'dropoff' | null) => void
  updateNavigationRoute: (route: {
    polyline: NavigationRoute[]
    currentStep: string
    routeDistance: string
    routeDuration: string
  }) => void
  stopNavigation: () => void
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

      setPendingConfirmation: (order) => set({ pendingConfirmation: order }),

      confirmOrder: (order) => {
        const { shiftStats, activeOrders } = get()
        set({
          activeOrders: [...activeOrders, { ...order, status: 'pickup' }],
          pendingConfirmation: null,
          shiftStats: {
            ...shiftStats,
            startTime: shiftStats.startTime ?? Date.now(),
          },
          lastPlatformActivity: {
            ...get().lastPlatformActivity,
            [order.platform]: Date.now(),
          },
        })
      },

      rejectOrder: () => set({ pendingConfirmation: null }),

      completeOrder: (orderId) => {
        const { activeOrders, orderHistory, shiftStats } = get()
        const order = activeOrders.find((o) => o.id === orderId)
        if (!order) return

        const completed: CompletedOrder = { ...order, status: 'completed', completedAt: Date.now() }
        const trimmedHistory = [completed, ...orderHistory].slice(0, 50)

        set({
          activeOrders: activeOrders.filter((o) => o.id !== orderId),
          orderHistory: trimmedHistory,
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
          navigationPhase: order.status === 'pickup' ? 'pickup' : 'dropoff',
        }),

      updateNavigationPhase: (navigationPhase) => set({ navigationPhase }),

      updateNavigationRoute: ({ polyline, currentStep, routeDistance, routeDuration }) =>
        set({
          routePolyline: polyline,
          currentStep,
          routeDistance,
          routeDuration,
        }),

      stopNavigation: () =>
        set({
          isNavigating: false,
          navigationPhase: null,
          routePolyline: null,
          currentStep: null,
          routeDistance: null,
          routeDuration: null,
        }),
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
        }
      },
    },
  ),
)
