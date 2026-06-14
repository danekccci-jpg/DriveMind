/**
 * RN subscription layer for DriveMindNotificationService events.
 */
import {
  DeviceEventEmitter,
  type EmitterSubscription,
  NativeModules,
  Platform,
} from 'react-native'
import { toCanonicalNotificationPackage } from '../constants/allowedIngestPackages'
import { parseEtaMinutesForPackage } from './orderScrapeNormalize'

export const EVENT_NOTIFICATION = 'DriveMindNotification'

export type ParsedNotificationPayload = {
  title: string
  text: string
  timestamp: number
  packageName: string
  sourcePackage: string
  brand: string
  price: string
  distanceKm: string
  etaMin: string
  pickup: string
  dropoff: string
}

type DriveMindNativeModule = {
  openNotificationListenerSettings?: () => void
  getServiceStatuses?: () => Promise<{ notificationListenerEnabled: boolean }>
}

type RawNotificationEvent = Partial<ParsedNotificationPayload> & {
  timestamp?: number | string
}

function getNative(): DriveMindNativeModule | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as DriveMindNativeModule | undefined) ?? null
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function metricString(value: unknown, fallback = '0'): string {
  if (typeof value !== 'string' && typeof value !== 'number') return fallback
  const raw = String(value).trim().replace(',', '.')
  if (!raw || raw === '0' || raw === '0.0') return fallback === '0' ? '0' : raw
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 ? String(n) : fallback
}

/** Normalizes native bridge payloads with safe defaults for missing fields. */
export function normalizeParsedNotificationPayload(raw: RawNotificationEvent): ParsedNotificationPayload {
  const sourcePackage = nonEmptyString(raw.sourcePackage ?? raw.packageName, '')
  const packageName = toCanonicalNotificationPackage(nonEmptyString(raw.packageName, sourcePackage))
  const title = nonEmptyString(raw.title, '')
  const text = nonEmptyString(raw.text, '')
  const blob = [title, text].filter(Boolean).join('\n')

  const nativeEta = metricString(raw.etaMin, '0')
  const parsedEta = parseEtaMinutesForPackage(blob, packageName)
  const etaMin =
    nativeEta !== '0'
      ? nativeEta
      : parsedEta != null && parsedEta > 0
        ? String(parsedEta)
        : '0'

  return {
    title,
    text,
    timestamp:
      typeof raw.timestamp === 'number' && Number.isFinite(raw.timestamp)
        ? raw.timestamp
        : Date.now(),
    packageName,
    sourcePackage,
    brand: nonEmptyString(raw.brand, ''),
    price: metricString(raw.price, '0'),
    distanceKm: metricString(raw.distanceKm, '0'),
    etaMin,
    pickup: nonEmptyString(raw.pickup, 'Unknown'),
    dropoff: nonEmptyString(raw.dropoff, 'Unknown'),
  }
}

export function subscribeToDriveMindNotifications(
  onNotification: (payload: ParsedNotificationPayload) => void,
): EmitterSubscription | null {
  if (Platform.OS !== 'android') return null
  return DeviceEventEmitter.addListener(EVENT_NOTIFICATION, (raw: RawNotificationEvent) => {
    onNotification(normalizeParsedNotificationPayload(raw))
  })
}

export function openNotificationAccessSettings(): void {
  try {
    getNative()?.openNotificationListenerSettings?.()
  } catch {
    /* noop */
  }
}

export async function isNotificationListenerEnabled(): Promise<boolean> {
  try {
    const status = await getNative()?.getServiceStatuses?.()
    return status?.notificationListenerEnabled === true
  } catch {
    return false
  }
}
