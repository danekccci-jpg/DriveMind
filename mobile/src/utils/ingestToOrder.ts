import type { Order } from '../store/ordersStore'
import type { IngestedOffer, IngestedPlatform } from '../store/driverIngestStore'

const KRAKOW_FALLBACK_LAT = 50.0614
const KRAKOW_FALLBACK_LNG = 19.9366

function parseNumber(value: string | undefined): number {
  if (!value) return Number.NaN
  return Number.parseFloat(value.replace(',', '.').replace(/[^\d.]/g, ''))
}

function parseIntSafe(value: string | undefined): number {
  if (!value) return Number.NaN
  return Number.parseInt(value.replace(/[^\d]/g, ''), 10)
}

function normalizePlatform(p: IngestedPlatform): string {
  return p === 'unknown' ? 'uber' : p
}

/**
 * Build a domain `Order` from an `IngestedOffer` parsed by the native bridge.
 * Coordinates fall back to Krakow centre when the address-resolver did not
 * produce a lat/lng (passive Accept tracking does not require navigation).
 */
export function ingestOfferToOrder(offer: IngestedOffer): Order {
  const earnings = Number.isFinite(parseNumber(offer.price)) ? parseNumber(offer.price) : 0
  const dist = parseNumber(offer.distanceKm)
  const eta = parseIntSafe(offer.etaMin)
  return {
    id: offer.id,
    platform: normalizePlatform(offer.platform),
    pickupAddress: offer.pickup?.trim() || '—',
    dropoffAddress: offer.destination ?? offer.text ?? '—',
    earnings: Number.isFinite(earnings) ? earnings : 0,
    distanceKm: Number.isFinite(dist) && dist > 0 ? dist : 5,
    durationMin: Number.isFinite(eta) && eta > 0 ? eta : 15,
    deadrunKm: 0,
    pickupLat: KRAKOW_FALLBACK_LAT,
    pickupLng: KRAKOW_FALLBACK_LNG,
    dropoffLat: KRAKOW_FALLBACK_LAT,
    dropoffLng: KRAKOW_FALLBACK_LNG,
    profitScore: 0,
    profitLabel: 'NEUTRAL',
    status: 'pickup',
  }
}

interface PassiveAcceptInput {
  pricePLN: number
  distanceKm: number
  durationMin: number
  platform: string
  pickup: string
  dropoff: string
  packageName: string
  /** Original native id (when matched against an ingest offer); otherwise generated. */
  id?: string
  /** Stable content hash for deterministic trip id when ingest match is missing. */
  contentHash?: string
}

/**
 * Build a domain `Order` from a passive Accept native payload that did not
 * match any live ingest offer (e.g. when the offer expired from the ingest TTL).
 */
export function passiveAcceptToOrder(input: PassiveAcceptInput): Order {
  const id =
    input.id ??
    (input.contentHash
      ? `accepted-${input.contentHash}`
      : `accepted-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`)
  const platform = (() => {
    const p = input.platform.toLowerCase()
    if (p.includes('uber')) return 'uber'
    if (p.includes('bolt')) return 'bolt'
    if (p.includes('glovo')) return 'glovo'
    if (p.includes('wolt')) return 'wolt'
    return 'uber'
  })()
  return {
    id,
    platform,
    pickupAddress: input.pickup?.trim() || '—',
    dropoffAddress: input.dropoff?.trim() || '—',
    earnings: input.pricePLN > 0 ? input.pricePLN : 0,
    distanceKm: input.distanceKm > 0 ? input.distanceKm : 0,
    durationMin: input.durationMin > 0 ? input.durationMin : 0,
    deadrunKm: 0,
    pickupLat: KRAKOW_FALLBACK_LAT,
    pickupLng: KRAKOW_FALLBACK_LNG,
    dropoffLat: KRAKOW_FALLBACK_LAT,
    dropoffLng: KRAKOW_FALLBACK_LNG,
    profitScore: 0,
    profitLabel: 'NEUTRAL',
    status: 'pickup',
  }
}
