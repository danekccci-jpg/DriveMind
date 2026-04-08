import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type IngestedSource = 'notification' | 'scrape'

export interface IngestedOffer {
  id: string
  source: IngestedSource
  platform: 'uber' | 'bolt' | 'unknown'
  title: string
  text: string
  price?: string
  destination?: string
  surge?: string
  capturedAt: number
  expiresAt: number
}

const TTL_MS = 180_000

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function platformFromPackage(pkg: string): 'uber' | 'bolt' | 'unknown' {
  if (pkg.includes('ubercab') || pkg.includes('uber')) return 'uber'
  if (pkg.includes('bolt')) return 'bolt'
  return 'unknown'
}

interface DriverIngestState {
  activeRide: IngestedOffer | null
  backgroundOrders: IngestedOffer[]
  soundEnabled: boolean
  lastToastMessage: string | null

  setSoundEnabled: (enabled: boolean) => void
  showToast: (message: string) => void
  clearToast: () => void

  ingestFromNotification: (payload: {
    title: string
    text: string
    timestamp: number
    packageName: string
  }) => void
  ingestFromScrape: (payload: {
    price: string
    destination: string
    surge: string
    packageName: string
  }) => void

  removeExpiredFromQueue: () => void
  dismissActiveRide: () => void
}

export const useDriverIngestStore = create<DriverIngestState>()(
  persist(
    (set, get) => ({
      activeRide: null,
      backgroundOrders: [],
      soundEnabled: true,
      lastToastMessage: null,

      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),

      showToast: (message) => set({ lastToastMessage: message }),

      clearToast: () => set({ lastToastMessage: null }),

      ingestFromNotification: (payload) => {
        const now = Date.now()
        const offer: IngestedOffer = {
          id: id(),
          source: 'notification',
          platform: platformFromPackage(payload.packageName),
          title: payload.title,
          text: payload.text,
          capturedAt: payload.timestamp || now,
          expiresAt: now + TTL_MS,
        }
        set((state) => {
          if (state.activeRide == null) {
            return { activeRide: offer }
          }
          return {
            backgroundOrders: [...state.backgroundOrders, offer],
          }
        })
      },

      ingestFromScrape: (payload) => {
        const now = Date.now()
        const hasData =
          (payload.price && payload.price.length > 0) ||
          (payload.destination && payload.destination.length > 0) ||
          (payload.surge && payload.surge.length > 0)
        if (!hasData) return

        const offer: IngestedOffer = {
          id: id(),
          source: 'scrape',
          platform: platformFromPackage(payload.packageName),
          title: payload.destination ? 'Trip' : 'Scrape',
          text: [payload.price, payload.destination, payload.surge].filter(Boolean).join(' · '),
          price: payload.price || undefined,
          destination: payload.destination || undefined,
          surge: payload.surge || undefined,
          capturedAt: now,
          expiresAt: now + TTL_MS,
        }

        set((state) => {
          if (state.activeRide == null) {
            return { activeRide: offer }
          }
          return {
            backgroundOrders: [...state.backgroundOrders, offer],
          }
        })
      },

      removeExpiredFromQueue: () => {
        const now = Date.now()
        set((state) => ({
          backgroundOrders: state.backgroundOrders.filter((o) => o.expiresAt > now),
        }))
      },

      dismissActiveRide: () => set({ activeRide: null }),
    }),
    {
      name: 'drivemind-driver-ingest',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ soundEnabled: s.soundEnabled }),
    },
  ),
)
