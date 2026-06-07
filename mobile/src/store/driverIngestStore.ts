import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  isAllowedNotificationPackage,
  isAllowedScrapePackage,
} from '../constants/allowedIngestPackages'
import { buildIngestOrderHash } from '../utils/orderIngestHash'

export type IngestedSource = 'notification' | 'scrape'
export type IngestedPlatform = 'uber' | 'bolt' | 'glovo' | 'wolt' | 'unknown'

export interface IngestedOffer {
  id: string
  source: IngestedSource
  platform: IngestedPlatform
  title: string
  text: string
  price?: string
  pickup?: string
  destination?: string
  surge?: string
  distanceKm?: string
  etaMin?: string
  contentHash: string
  capturedAt: number
  expiresAt: number
}

const TTL_MS = 180_000

function id(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function platformFromPackage(pkg: string): IngestedPlatform {
  if (pkg.includes('ubercab') || pkg.includes('uber')) return 'uber'
  if (pkg.includes('bolt')) return 'bolt'
  if (pkg.includes('glovo')) return 'glovo'
  if (pkg.includes('wolt')) return 'wolt'
  return 'unknown'
}

function allOffers(state: Pick<DriverIngestState, 'activeRide' | 'backgroundOrders'>): IngestedOffer[] {
  return state.activeRide ? [state.activeRide, ...state.backgroundOrders] : state.backgroundOrders
}

function isDuplicateHash(
  state: Pick<DriverIngestState, 'activeRide' | 'backgroundOrders'>,
  hash: string,
): boolean {
  return allOffers(state).some((o) => o.contentHash === hash)
}

function queueOffer(
  state: Pick<DriverIngestState, 'activeRide' | 'backgroundOrders'>,
  offer: IngestedOffer,
): Pick<DriverIngestState, 'activeRide' | 'backgroundOrders'> {
  if (state.activeRide == null) {
    return { activeRide: offer, backgroundOrders: state.backgroundOrders }
  }
  return {
    activeRide: state.activeRide,
    backgroundOrders: [...state.backgroundOrders, offer],
  }
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
    pickup: string
    destination: string
    surge: string
    packageName: string
    distanceKm?: string
    etaMin?: string
  }) => void

  removeExpiredFromQueue: () => void
  dismissActiveRide: () => void
  removeOffer: (offerId: string) => void
}

export function selectAvailableIngestOffers(state: DriverIngestState): IngestedOffer[] {
  return allOffers(state)
}

export function selectAvailableIngestCount(state: DriverIngestState): number {
  return (state.activeRide ? 1 : 0) + state.backgroundOrders.length
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
        if (!isAllowedNotificationPackage(payload.packageName)) return
        const now = Date.now()
        const platform = platformFromPackage(payload.packageName)
        const contentHash = buildIngestOrderHash({
          platform,
          price: '',
          text: [payload.title, payload.text].filter(Boolean).join(' '),
        })
        const state = get()
        if (isDuplicateHash(state, contentHash)) return

        const offer: IngestedOffer = {
          id: id(),
          source: 'notification',
          platform,
          title: payload.title,
          text: payload.text,
          contentHash,
          capturedAt: payload.timestamp || now,
          expiresAt: now + TTL_MS,
        }
        set((s) => queueOffer(s, offer))
      },

      ingestFromScrape: (payload) => {
        if (!isAllowedScrapePackage(payload.packageName)) return
        const now = Date.now()
        const hasData =
          (payload.price && payload.price.length > 0) ||
          (payload.destination && payload.destination.length > 0) ||
          (payload.pickup && payload.pickup.length > 0) ||
          (payload.surge && payload.surge.length > 0)
        if (!hasData) return

        const platform = platformFromPackage(payload.packageName)
        const text = [payload.price, payload.pickup, payload.destination, payload.surge]
          .filter(Boolean)
          .join(' · ')
        const contentHash = buildIngestOrderHash({
          platform,
          price: payload.price,
          pickup: payload.pickup,
          destination: payload.destination,
          text,
        })
        const state = get()
        if (isDuplicateHash(state, contentHash)) return

        const offer: IngestedOffer = {
          id: id(),
          source: 'scrape',
          platform,
          title: payload.destination ? 'Trip' : 'Scrape',
          text,
          price: payload.price || undefined,
          pickup: payload.pickup || undefined,
          destination: payload.destination || undefined,
          surge: payload.surge || undefined,
          distanceKm: payload.distanceKm || undefined,
          etaMin: payload.etaMin || undefined,
          contentHash,
          capturedAt: now,
          expiresAt: now + TTL_MS,
        }

        set((s) => queueOffer(s, offer))
      },

      removeExpiredFromQueue: () => {
        const now = Date.now()
        set((state) => {
          const next: Partial<DriverIngestState> = {
            backgroundOrders: state.backgroundOrders.filter((o) => o.expiresAt > now),
          }
          if (state.activeRide != null && state.activeRide.expiresAt <= now) {
            const validQueue = state.backgroundOrders.filter((o) => o.expiresAt > now)
            const [promoted, ...rest] = validQueue
            next.activeRide = promoted ?? null
            next.backgroundOrders = rest
          }
          return next
        })
      },

      dismissActiveRide: () => {
        const now = Date.now()
        set((state) => {
          const validQueue = state.backgroundOrders.filter((o) => o.expiresAt > now)
          const [next, ...rest] = validQueue
          return {
            activeRide: next ?? null,
            backgroundOrders: rest,
          }
        })
      },

      removeOffer: (offerId) => {
        const now = Date.now()
        set((state) => {
          if (state.activeRide?.id === offerId) {
            const validQueue = state.backgroundOrders.filter((o) => o.expiresAt > now)
            const [next, ...rest] = validQueue
            return { activeRide: next ?? null, backgroundOrders: rest }
          }
          return {
            backgroundOrders: state.backgroundOrders.filter((o) => o.id !== offerId),
          }
        })
      },
    }),
    {
      name: 'drivemind-driver-ingest',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ soundEnabled: s.soundEnabled }),
    },
  ),
)
