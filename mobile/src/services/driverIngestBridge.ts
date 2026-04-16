import { useEffect, useRef } from 'react'
import { AppState, DeviceEventEmitter, NativeModules, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useDriverIngestStore } from '../store/driverIngestStore'
import { useOrdersStore } from '../store/ordersStore'
import { useRoleStore } from '../store/roleStore'
import { computeProfitability } from '@drivemind/shared'

const EVENT_NOTIFICATION = 'DriveMindNotification'
const EVENT_SCRAPE = 'DriveMindScrape'

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
  updateOverlayProfitability: (tier: 'TRASH' | 'OKAY' | 'PROFIT' | 'NEUTRAL', potentialProfit: string) => void
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

/** Sync offline notification buffer when network returns (entries &lt; 1h). */
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

  useEffect(() => {
    if (!enabled) return
    if (Platform.OS !== 'android') return

    const native = getNative()
    if (!native) return

    void native.getSoundEnabled().then((v) => {
      if (typeof v === 'boolean') setSoundEnabled(v)
    })

    void NetInfo.fetch().then((s) => {
      if (s.isConnected) void syncBufferedNotificationsIfNeeded()
    })

    const sub1 = DeviceEventEmitter.addListener(EVENT_NOTIFICATION, (payload: {
      title: string
      text: string
      timestamp: number
      packageName: string
      appName?: string
      price?: string
      currency?: string
    }) => {
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
    })
    const sub2 = DeviceEventEmitter.addListener(EVENT_SCRAPE, (payload: { price: string; destination: string; surge: string; packageName: string }) => {
      handlersRef.current.ingestScrape(payload)
      const plat = payload.packageName?.includes('bolt') ? 'Bolt' : 'Uber'
      handlersRef.current.showToast(`✅ ${plat} data synced`)
    })

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
      clearInterval(ttl)
      unsubNet()
    }
  }, [setSoundEnabled, enabled])

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
