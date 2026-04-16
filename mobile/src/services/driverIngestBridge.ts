import { useEffect, useRef } from 'react'
import { AppState, DeviceEventEmitter, NativeModules, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useDriverIngestStore } from '../store/driverIngestStore'
import { useOrdersStore } from '../store/ordersStore'
import { useRoleStore } from '../store/roleStore'
import { computeProfitability } from '@drivemind/shared'

const EVENT_NOTIFICATION = 'DriveMindNotification'
const EVENT_SCRAPE       = 'DriveMindScrape'
const EVENT_ORDER_SCRAPED = 'onOrderScraped'

type DriveMindNativeType = {
  getBufferedNotificationsJson: () => Promise<string>
  clearNotificationBuffer: () => void
  getSoundEnabled: () => Promise<boolean>
  setSoundEnabled: (enabled: boolean) => void
  isOverlayPermissionGranted: () => Promise<boolean>
  requestOverlayPermission: () => void
  isUsageAccessGranted: () => Promise<boolean>
  requestUsageAccess: () => void
  setOverlayShiftActive: (active: boolean) => void
  updateOverlayProfitability: (
    tier: 'LEGENDARY' | 'VERY_GOOD' | 'WORTH_IT' | 'RISKY' | 'TRASH' | 'NEUTRAL',
    potentialProfit: string,
  ) => void
  /** Show (or update) the floating tier pill with an explicit label + hex colour. */
  showOverlay: (text: string, color: string) => void
  /** Remove the floating tier pill from the screen. */
  hideOverlay: () => void
  triggerScraperWindow: () => void
}

function getNative(): DriveMindNativeType | null {
  if (Platform.OS !== 'android') return null
  const m = NativeModules.DriveMindNative as DriveMindNativeType | undefined
  return m ?? null
}

/** Call after Accept in DriveMind or when opening provider app — starts 10s scraper window. */
export function triggerScraperWindow(): void {
  try {
    getNative()?.triggerScraperWindow()
  } catch {
    /* noop */
  }
}

/** Sync offline notification buffer when network returns (entries < 1h). */
export async function syncBufferedNotificationsIfNeeded(): Promise<void> {
  const native = getNative()
  if (!native) return
  try {
    const raw = await native.getBufferedNotificationsJson()
    const arr = JSON.parse(raw) as { title: string; text: string; timestamp: number; packageName: string }[]
    if (!Array.isArray(arr) || arr.length === 0) return
    const hourAgo = Date.now() - 60 * 60 * 1000
    const ingest = useDriverIngestStore.getState().ingestFromNotification
    for (const row of arr) {
      if (typeof row.timestamp === 'number' && row.timestamp >= hourAgo) {
        ingest({
          title: row.title ?? '',
          text: row.text ?? '',
          timestamp: row.timestamp,
          packageName: row.packageName ?? '',
        })
      }
    }
    native.clearNotificationBuffer()
  } catch (e) {
    console.warn('[DriveMind] syncBufferedNotificationsIfNeeded', e)
  }
}

function parsePriceNumber(priceRaw: string): number {
  if (!priceRaw) return 0
  const cleaned = priceRaw.replace(',', '.').replace(/[^\d.]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDistanceKm(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*km/i)
  if (!m?.[1]) return null
  const n = Number.parseFloat(m[1].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function parseEtaMin(text: string): number | null {
  const m = text.match(/(\d{1,3})\s*min/i)
  if (!m?.[1]) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

function isWeekendOrNightNow(): boolean {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  return day === 0 || day === 6 || hour >= 22 || hour < 6
}

/** Map a delivery-app package name to a human-readable platform label. */
function packageToPlatformName(pkg: string): string {
  if (pkg.includes('ubercab') || pkg.includes('uber')) return 'Uber'
  if (pkg.includes('bolt')) return 'Bolt'
  if (pkg.includes('glovo')) return 'Glovo'
  if (pkg.includes('wolt')) return 'Wolt'
  return 'App'
}

/**
 * Subscribes to native notification + scrape events, TTL sweep, NetInfo sync.
 * Mount once under App.
 */
export function useDriverIngestBridge(enabled = true): void {
  const ingestNotification = useDriverIngestStore((s) => s.ingestFromNotification)
  const ingestScrape = useDriverIngestStore((s) => s.ingestFromScrape)
  const removeExpired = useDriverIngestStore((s) => s.removeExpiredFromQueue)
  const showToast = useDriverIngestStore((s) => s.showToast)
  const soundEnabled = useDriverIngestStore((s) => s.soundEnabled)
  const setSoundEnabled = useDriverIngestStore((s) => s.setSoundEnabled)

  const handlersRef = useRef({ ingestNotification, ingestScrape, removeExpired, showToast })
  const overlayPermissionPromptedRef = useRef(false)
  const usagePermissionPromptedRef = useRef(false)
  handlersRef.current = { ingestNotification, ingestScrape, removeExpired, showToast }

  // ── Event subscriptions + TTL sweep + NetInfo sync ──────────────────────────
  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'android') return

    const native = getNative()
    if (!native) {
      console.warn('[DriveMind] ⚠️ DriveMindNative module not found — bridge inactive')
      return
    }

    console.log('[DriveMind] ✅ Driver ingest bridge started')

    void native.getSoundEnabled().then((v) => {
      if (typeof v === 'boolean') setSoundEnabled(v)
    })

    void NetInfo.fetch().then((s) => {
      if (s.isConnected) void syncBufferedNotificationsIfNeeded()
    })

    // ── 1. Notification listener (Uber + Bolt pushes) ────────────────────────
    const sub1 = DeviceEventEmitter.addListener(
      EVENT_NOTIFICATION,
      (payload: {
        title: string
        text: string
        timestamp: number
        packageName: string
        appName?: string
        price?: string
        currency?: string
      }) => {
        console.log('[DriveMind] 🔔 DriveMindNotification received', {
          pkg: payload.packageName,
          price: payload.price,
          title: payload.title,
        })
        handlersRef.current.ingestNotification(payload)
        const nativeNow = getNative()
        if (!nativeNow) return
        const role = useRoleStore.getState().role ?? 'courier'
        const price = parsePriceNumber(payload.price ?? '')
        const distanceKm = parseDistanceKm(payload.text) ?? 6
        const etaMin = parseEtaMin(payload.text) ?? 18
        const result = computeProfitability({
          role,
          pricePLN: price,
          distanceKm,
          etaMin,
          dropoffLabel: payload.text,
          isWeekendOrNight: isWeekendOrNightNow(),
        })
        const potential = `${price > 0 ? price.toFixed(2) : '--'} ${payload.currency ?? 'zł'}`
        nativeNow.updateOverlayProfitability(result.profitTier, potential)
      },
    )

    // ── 2. Legacy DriveMindScrape (backward compat — toast only) ─────────────
    const sub2 = DeviceEventEmitter.addListener(
      EVENT_SCRAPE,
      (payload: { price: string; destination: string; surge: string; packageName: string }) => {
        console.log('[DriveMind] 🔍 DriveMindScrape received', {
          pkg: payload.packageName,
          price: payload.price,
          destination: payload.destination?.slice(0, 60),
        })
        handlersRef.current.ingestScrape(payload)
        const platName = packageToPlatformName(payload.packageName ?? '')
        handlersRef.current.showToast(`📦 ${platName} data synced`)
      },
    )

    // ── 3. onOrderScraped — structured profitability pipeline ────────────────
    //
    // This is the primary path for all 4 platforms (Uber, Bolt, Glovo, Wolt).
    // Flow: scraper extracts order data → computeProfitability → showOverlay pill.
    const sub3 = DeviceEventEmitter.addListener(
      EVENT_ORDER_SCRAPED,
      (payload: {
        price: string
        distanceKm: string
        etaMin: string
        pickup: string
        dropoff: string
        surge: string
        packageName: string
      }) => {
        console.log('[DriveMind] 🚀 onOrderScraped received', {
          pkg: payload.packageName,
          price: payload.price,
          distanceKm: payload.distanceKm,
          etaMin: payload.etaMin,
          pickup: payload.pickup?.slice(0, 40),
          dropoff: payload.dropoff?.slice(0, 40),
        })

        // Persist raw scrape into the ingest store (same shape as legacy scrape).
        handlersRef.current.ingestScrape({
          price: payload.price,
          destination: payload.dropoff,
          surge: payload.surge,
          packageName: payload.packageName,
        })

        const nativeNow = getNative()
        if (!nativeNow) return

        const price = parsePriceNumber(payload.price)
        // Try the explicit distanceKm field first, fall back to parsing the dropoff address.
        const distKm =
          parseDistanceKm(payload.distanceKm ?? '') ??
          parseDistanceKm(payload.dropoff ?? '') ??
          5
        const eta = parseEtaMin(payload.etaMin ?? '') ?? 15
        const role = useRoleStore.getState().role ?? 'courier'

        const result = computeProfitability({
          role,
          pricePLN: price,
          distanceKm: Math.max(0.2, distKm),
          etaMin: Math.max(1, eta),
          dropoffLabel: payload.dropoff,
          isWeekendOrNight: isWeekendOrNightNow(),
        })

        console.log('[DriveMind] 📊 computeProfitability result', {
          tier: result.profitTier,
          label: result.tierLabel,
          złPerKm: result.złPerKm?.toFixed(2),
          score: result.score0to100,
        })

        const priceStr = `${price > 0 ? price.toFixed(2) : '--'} zł`
        console.log('[Bridge] Order Scraped and Analyzed:', {
          tier: result.profitTier,
          price: priceStr,
        })
        // Production flow:
        // 1) parse raw scrape → 2) computeProfitability → 3) updateOverlayProfitability
        void nativeNow.isOverlayPermissionGranted().then((granted) => {
          if (!granted) return
          nativeNow.updateOverlayProfitability(result.profitTier, priceStr)
        })

        const platName = packageToPlatformName(payload.packageName ?? '')
        handlersRef.current.showToast(`${result.tierLabel}  ${platName} · ${priceStr}`)
      },
    )

    const ttl = setInterval(() => {
      handlersRef.current.removeExpired()
    }, 10_000)

    const unsubNet = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        void syncBufferedNotificationsIfNeeded()
      }
    })

    return () => {
      sub1.remove()
      sub2.remove()
      sub3.remove()
      clearInterval(ttl)
      unsubNet()
    }
  }, [setSoundEnabled, enabled])

  // ── Overlay shift-state sync ─────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'android') return
    const native = getNative()
    if (!native) return
    const syncOverlay = (state: ReturnType<typeof useOrdersStore.getState>) => {
      const isShiftOn = state.shiftStats.startTime !== null
      Promise.all([native.isOverlayPermissionGranted(), native.isUsageAccessGranted()]).then(
        ([overlayGranted, usageGranted]) => {
          if (isShiftOn && !overlayGranted) {
            if (!overlayPermissionPromptedRef.current) {
              overlayPermissionPromptedRef.current = true
              if (AppState.currentState === 'active') {
                setTimeout(() => {
                  try {
                    if (AppState.currentState === 'active') native.requestOverlayPermission()
                  } catch {
                    /* noop */
                  }
                }, 500)
              }
            }
            native.setOverlayShiftActive(false)
            return
          }
          if (isShiftOn && !usageGranted) {
            if (!usagePermissionPromptedRef.current) {
              usagePermissionPromptedRef.current = true
              if (AppState.currentState === 'active') {
                setTimeout(() => {
                  try {
                    if (AppState.currentState === 'active') native.requestUsageAccess()
                  } catch {
                    /* noop */
                  }
                }, 500)
              }
            }
            native.setOverlayShiftActive(false)
            return
          }
          if (overlayGranted) overlayPermissionPromptedRef.current = false
          if (usageGranted) usagePermissionPromptedRef.current = false
          native.setOverlayShiftActive(isShiftOn && overlayGranted && usageGranted)
        },
      )
    }
    syncOverlay(useOrdersStore.getState())
    const unsub = useOrdersStore.subscribe(syncOverlay)
    return () => {
      unsub()
      try {
        native.setOverlayShiftActive(false)
      } catch {
        /* noop */
      }
    }
  }, [enabled])

  // ── Sound sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'android') return
    const n = getNative()
    if (!n) return
    try {
      n.setSoundEnabled(soundEnabled)
    } catch {
      /* noop */
    }
  }, [soundEnabled, enabled])
}
