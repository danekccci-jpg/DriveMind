import { useEffect, useRef } from 'react'
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { useDriverIngestStore } from '../store/driverIngestStore'

const EVENT_NOTIFICATION = 'DriveMindNotification'
const EVENT_SCRAPE = 'DriveMindScrape'

type DriveMindNativeType = {
  getBufferedNotificationsJson: () => Promise<string>
  clearNotificationBuffer: () => void
  getSoundEnabled: () => Promise<boolean>
  setSoundEnabled: (enabled: boolean) => void
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

/**
 * Subscribes to native notification + scrape events, TTL sweep, NetInfo sync.
 * Mount once under App.
 */
export function useDriverIngestBridge(): void {
  const ingestNotification = useDriverIngestStore((s) => s.ingestFromNotification)
  const ingestScrape = useDriverIngestStore((s) => s.ingestFromScrape)
  const removeExpired = useDriverIngestStore((s) => s.removeExpiredFromQueue)
  const showToast = useDriverIngestStore((s) => s.showToast)
  const soundEnabled = useDriverIngestStore((s) => s.soundEnabled)
  const setSoundEnabled = useDriverIngestStore((s) => s.setSoundEnabled)

  const handlersRef = useRef({ ingestNotification, ingestScrape, removeExpired, showToast })
  handlersRef.current = { ingestNotification, ingestScrape, removeExpired, showToast }

  useEffect(() => {
    if (Platform.OS !== 'android') return

    const native = getNative()
    if (!native) return

    void native.getSoundEnabled().then((v) => {
      if (typeof v === 'boolean') setSoundEnabled(v)
    })

    void NetInfo.fetch().then((s) => {
      if (s.isConnected) void syncBufferedNotificationsIfNeeded()
    })

    const sub1 = DeviceEventEmitter.addListener(EVENT_NOTIFICATION, (payload: { title: string; text: string; timestamp: number; packageName: string }) => {
      handlersRef.current.ingestNotification(payload)
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
  }, [setSoundEnabled])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const n = getNative()
    if (!n) return
    try {
      n.setSoundEnabled(soundEnabled)
    } catch {
      /* noop */
    }
  }, [soundEnabled])
}
