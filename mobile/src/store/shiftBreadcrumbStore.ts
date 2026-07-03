import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { douglasPeucker, haversineMeters } from '../utils/polylineSimplify'

export interface Breadcrumb {
  lat: number
  lng: number
  ts: number
}

export interface ShiftOrderFlag {
  lat: number
  lng: number
  ts: number
  type: 'pickup' | 'dropoff'
  orderId: string
}

export interface ArchivedShift {
  id: string
  startTime: number
  endTime: number
  breadcrumbs: Breadcrumb[]
  orderFlags: ShiftOrderFlag[]
  totalEarnings: number
  totalKm: number
  completedOrders: number
  hoursActive: number
}

interface ShiftBreadcrumbState {
  isRecording: boolean
  currentBreadcrumbs: Breadcrumb[]
  currentOrderFlags: ShiftOrderFlag[]
  lastArchivedShift: ArchivedShift | null

  startRecording: () => void
  stopRecording: () => void
  addBreadcrumb: (lat: number, lng: number) => void
  addOrderFlag: (flag: Omit<ShiftOrderFlag, 'ts'>) => void
  archiveShift: (stats: {
    startTime: number
    totalEarnings: number
    totalKm: number
    completedOrders: number
  }) => void
  clearCurrent: () => void
}

const MAX_BREADCRUMBS = 25_000
const MIN_DISTANCE_METERS = 10
const SIMPLIFICATION_EPSILON = 0.00004

export const useShiftBreadcrumbStore = create<ShiftBreadcrumbState>()(
  persist(
    (set, get) => ({
      isRecording: false,
      currentBreadcrumbs: [],
      currentOrderFlags: [],
      lastArchivedShift: null,

      startRecording: () =>
        set({ isRecording: true, currentBreadcrumbs: [], currentOrderFlags: [] }),

      stopRecording: () => set({ isRecording: false }),

      addBreadcrumb: (lat, lng) => {
        if (!get().isRecording) return
        const crumbs = get().currentBreadcrumbs
        if (crumbs.length >= MAX_BREADCRUMBS) return

        if (crumbs.length > 0) {
          const last = crumbs[crumbs.length - 1]
          if (haversineMeters(last.lat, last.lng, lat, lng) < MIN_DISTANCE_METERS) return
        }

        set({ currentBreadcrumbs: [...crumbs, { lat, lng, ts: Date.now() }] })
      },

      addOrderFlag: (flag) => {
        if (!get().isRecording) return
        set({
          currentOrderFlags: [...get().currentOrderFlags, { ...flag, ts: Date.now() }],
        })
      },

      archiveShift: (stats) => {
        const crumbs = get().currentBreadcrumbs
        const simplified = crumbs.length > 3
          ? douglasPeucker(crumbs, SIMPLIFICATION_EPSILON)
          : crumbs

        const endTime = Date.now()
        const hoursActive = Math.max(0, (endTime - stats.startTime) / 3_600_000)

        const archived: ArchivedShift = {
          id: `shift-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          startTime: stats.startTime,
          endTime,
          breadcrumbs: simplified,
          orderFlags: get().currentOrderFlags,
          totalEarnings: stats.totalEarnings,
          totalKm: stats.totalKm,
          completedOrders: stats.completedOrders,
          hoursActive,
        }

        set({
          lastArchivedShift: archived,
          currentBreadcrumbs: [],
          currentOrderFlags: [],
          isRecording: false,
        })
      },

      clearCurrent: () =>
        set({ currentBreadcrumbs: [], currentOrderFlags: [], isRecording: false }),
    }),
    {
      name: 'drivemind-shift-breadcrumbs',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        lastArchivedShift: s.lastArchivedShift,
        isRecording: s.isRecording,
      }),
    },
  ),
)
