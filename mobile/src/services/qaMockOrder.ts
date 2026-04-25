import { DeviceEventEmitter, Platform } from 'react-native'
import { EVENT_ORDER_SCRAPED } from './driverIngestBridge'

/** Same event name native Kotlin emits after a scrape cycle (`driverIngestBridge`). */
export const MOCK_ORDER_EVENT = EVENT_ORDER_SCRAPED

export type QaMockOrderPayload = {
  price: string
  distanceKm: string
  etaMin: string
  pickup: string
  dropoff: string
  surge: string
  packageName: string
}

const DEFAULT_MOCK: QaMockOrderPayload = {
  price: '35,50 PLN',
  distanceKm: '8 km',
  etaMin: '12 min',
  pickup: 'QA — pickup',
  dropoff: '8 km — ul. Mockowa 7, Kraków',
  surge: '',
  packageName: 'com.ubercab.driver',
}

/**
 * Fires the same DeviceEventEmitter event the native scraper would emit after a full scrape cycle.
 * Requires `useDriverIngestBridge` to be mounted (normal app boot).
 */
export function emitQaMockOrderEvent(overrides?: Partial<QaMockOrderPayload>): void {
  if (Platform.OS !== 'android') return
  const payload = { ...DEFAULT_MOCK, ...overrides }
  DeviceEventEmitter.emit(EVENT_ORDER_SCRAPED, payload)
}
