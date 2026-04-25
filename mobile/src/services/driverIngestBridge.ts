import { useEffect, useRef } from 'react'
import { AppState, DeviceEventEmitter, NativeModules, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useDriverIngestStore } from '../store/driverIngestStore'
import { useOrdersStore } from '../store/ordersStore'
import { useRoleStore } from '../store/roleStore'
import { computeProfitability } from '@drivemind/shared'

export const EVENT_NOTIFICATION = 'DriveMindNotification'
export const EVENT_SCRAPE = 'DriveMindScrape'
export const EVENT_ORDER_SCRAPED = 'onOrderScraped'

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
  /** Optional: forward to `Log.d("DM_DEBUG", …)` from Kotlin for logcat parity. */
  logDmDebug?: (phase: string, detail: string, jsonPayload: string) => void
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

function dmDebug(phase: string, detail: string, extra?: Record<string, unknown>) {
  const tail = extra && Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''
  console.log(`DM_DEBUG ${phase}: ${detail}${tail}`)
  try {
    getNative()?.logDmDebug?.(phase, detail, JSON.stringify(extra ?? {}))
  } catch {
    /* noop */
  }
}

/** First plausible decimal in the string (handles `12,50`, `12.50`, `35,50 PLN`). */
function parsePriceNumber(priceRaw: string): number {
  if (!priceRaw) return 0
  const m = priceRaw.replace(/\s+/g, ' ').match(/(\d+(?:[.,]\d+)?)/)
  if (!m?.[1]) return 0
  const normalized = m[1].includes(',') && m[1].includes('.')
    ? m[1].replace(/\./g, '').replace(',', '.')
    : m[1].replace(',', '.')
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Kilometres from `km` or metres from standalone `m` (avoids matching `min`). */
function parseDistanceKm(text: string): number | null {
  const km = text.match(/(\d+(?:[.,]\d+)?)\s*km\b/i)
  if (km?.[1]) {
    const n = Number.parseFloat(km[1].replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  const meters = text.match(/(\d+(?:[.,]\d+)?)\s*m\b(?![a-z])/i)
  if (meters?.[1]) {
    const n = Number.parseFloat(meters[1].replace(',', '.'))
    if (!Number.isFinite(n)) return null
    return n / 1000
  }
  return null
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
  const orderDedupeRef = useRef({ sig: '', at: 0 })
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
        dmDebug('ORDER_DETECTED', 'notification payload', {
          pkg: payload.packageName,
          price: payload.price,
          title: payload.title?.slice(0, 80),
        })
        handlersRef.current.ingestNotification(payload)
        const nativeNow = getNative()
        if (!nativeNow) return
        const role = useRoleStore.getState().role ?? 'courier'
        dmDebug('PARSING_START', 'notification → profitability', { role })
        let price = 0
        let distanceKm = 6
        let etaMin = 18
        let result: ReturnType<typeof computeProfitability>
        try {
          price = parsePriceNumber(payload.price ?? '')
          distanceKm = parseDistanceKm(payload.text) ?? 6
          etaMin = parseEtaMin(payload.text) ?? 18
          result = computeProfitability({
            role,
            pricePLN: price,
            distanceKm,
            etaMin,
            dropoffLabel: payload.text,
            isWeekendOrNight: isWeekendOrNightNow(),
          })
        } catch (e) {
          dmDebug('PARSING_ERROR', 'notification parse failed', { reason: String(e) })
          return
        }
        dmDebug('PARSING_SUCCESS', 'notification parsed', {
          price,
          distanceKm,
          etaMin,
          tier: result.profitTier,
        })
        const potential = `${price > 0 ? price.toFixed(2) : '--'} ${payload.currency ?? 'zł'}`
        void nativeNow.isOverlayPermissionGranted().then((granted) => {
          if (!granted) {
            dmDebug('WIDGET_TRIGGERED', 'skipped — overlay not granted', {})
            return
          }
          try {
            nativeNow.updateOverlayProfitability(result.profitTier, potential)
            dmDebug('WIDGET_TRIGGERED', 'updateOverlayProfitability', {
              tier: result.profitTier,
              potential,
            })
          } catch (e) {
            dmDebug('PARSING_ERROR', 'overlay update failed', { reason: String(e) })
          }
        })
      },
    )

    // ── 2. Legacy DriveMindScrape (backward compat — toast only) ─────────────
    const sub2 = DeviceEventEmitter.addListener(
      EVENT_SCRAPE,
      (payload: { price: string; destination: string; surge: string; packageName: string }) => {
        dmDebug('ORDER_DETECTED', 'legacy DriveMindScrape', {
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
        const sig = `${payload.packageName}|${payload.price}|${payload.distanceKm}|${(payload.dropoff ?? '').slice(0, 48)}`
        const now = Date.now()
        const dedupe = orderDedupeRef.current
        if (sig === dedupe.sig && now - dedupe.at < 180) {
          dmDebug('ORDER_DEDUPED', 'near-duplicate scrape ignored', { dtMs: now - dedupe.at })
          return
        }
        dedupe.sig = sig
        dedupe.at = now

        dmDebug('ORDER_DETECTED', 'onOrderScraped', {
          pkg: payload.packageName,
          price: payload.price,
          distanceKm: payload.distanceKm,
          etaMin: payload.etaMin,
          pickup: payload.pickup?.slice(0, 40),
          dropoff: payload.dropoff?.slice(0, 40),
        })

        try {
          dmDebug('PARSING_START', 'ingest + compute', {})

          // Persist raw scrape into the ingest store (same shape as legacy scrape).
          handlersRef.current.ingestScrape({
            price: payload.price,
            destination: payload.dropoff,
            surge: payload.surge,
            packageName: payload.packageName,
          })

          const nativeNow = getNative()
          if (!nativeNow) {
            dmDebug('PARSING_ERROR', 'native module missing', {})
            return
          }

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

          dmDebug('PARSING_SUCCESS', 'computeProfitability', {
            tier: result.profitTier,
            label: result.tierLabel,
            złPerKm: result.złPerKm?.toFixed(2),
            score: result.score0to100,
            price,
            distKm,
            eta,
          })

          const priceStr = `${price > 0 ? price.toFixed(2) : '--'} zł`
          // Production flow:
          // 1) parse raw scrape → 2) computeProfitability → 3) updateOverlayProfitability
          void nativeNow.isOverlayPermissionGranted().then((granted) => {
            if (!granted) {
              dmDebug('WIDGET_TRIGGERED', 'skipped — overlay not granted', {})
              return
            }
            try {
              nativeNow.updateOverlayProfitability(result.profitTier, priceStr)
              dmDebug('WIDGET_TRIGGERED', 'updateOverlayProfitability', {
                tier: result.profitTier,
                priceStr,
              })
            } catch (e) {
              dmDebug('PARSING_ERROR', 'overlay update failed', { reason: String(e) })
            }
          })

          const platName = packageToPlatformName(payload.packageName ?? '')
          handlersRef.current.showToast(`${result.tierLabel}  ${platName} · ${priceStr}`)
        } catch (e) {
          dmDebug('PARSING_ERROR', 'onOrderScraped pipeline failed', { reason: String(e) })
        }
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
