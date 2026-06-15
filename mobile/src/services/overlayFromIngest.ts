import { NativeModules, Platform } from 'react-native'
import { computeProfitability } from '@drivemind/shared'

import {
  selectAvailableIngestOffers,
  useDriverIngestStore,
  type IngestedOffer,
} from '../store/driverIngestStore'
import { useRoleStore } from '../store/roleStore'
import { deriveSearchBlockedFromStore } from './subscriptionGate'
import {
  parsePlnAmountFromText,
  parseDistanceKmFromText,
  parseEtaMinutesForPackage,
} from './orderScrapeNormalize'
import {
  formatOverlayMetrics,
  formatOverlayPrice,
  formatOverlayPrimaryRate,
  localizedProfitTierTitle,
} from '../utils/overlayI18n'

type OverlayNative = {
  isOverlayPermissionGranted: () => Promise<boolean>
  updateOverlayProfitability: (
    tierTitle: string,
    primaryRateLine: string,
    formattedPrice: string,
    formattedMetrics: string,
    tierColorHex: string,
    packageName: string,
    contentHash: string,
  ) => void
  showOverlayIdle?: () => void
}

function getNative(): OverlayNative | null {
  if (Platform.OS !== 'android') return null
  return (NativeModules.DriveMindNative as OverlayNative | undefined) ?? null
}

function isWeekendOrNightNow(): boolean {
  const now = new Date()
  const day = now.getDay()
  const hour = now.getHours()
  return day === 0 || day === 6 || hour >= 22 || hour < 6
}

/** Parse price / distance / ETA from a queued ingest row (with safe defaults). */
export function parseIngestOfferForOverlay(offer: IngestedOffer): {
  price: number
  distKm: number
  eta: number
  dropoffLabel: string
} | null {
  const blob = [offer.price, offer.distanceKm, offer.etaMin, offer.destination, offer.text, offer.title]
    .filter(Boolean)
    .join('\n')

  const price =
    parsePlnAmountFromText(offer.price ?? '') ||
    parsePlnAmountFromText(blob) ||
    Number.parseFloat((offer.price ?? '').replace(',', '.')) ||
    0

  if (!Number.isFinite(price) || price <= 0) return null

  const parsedDist =
    parseDistanceKmFromText(offer.distanceKm ?? '') ??
    parseDistanceKmFromText(offer.text ?? '') ??
    parseDistanceKmFromText(blob)
  const distKm = parsedDist != null && parsedDist > 0 ? parsedDist : 5

  const parsedEta =
    parseEtaMinutesForPackage(offer.etaMin ?? '', offer.packageName) ??
    parseEtaMinutesForPackage(offer.text ?? '', offer.packageName) ??
    parseEtaMinutesForPackage(blob, offer.packageName)
  const eta = parsedEta != null && parsedEta > 0 ? parsedEta : 15

  return {
    price,
    distKm,
    eta,
    dropoffLabel: offer.destination ?? offer.text ?? offer.title ?? '',
  }
}

/** Push one ingest row to the native OFFER overlay (caches even while DriveMind is foreground). */
export async function pushIngestedOfferToOverlay(offer: IngestedOffer): Promise<boolean> {
  if (deriveSearchBlockedFromStore()) return false

  const native = getNative()
  if (!native) return false

  const metrics = parseIngestOfferForOverlay(offer)
  if (!metrics) return false

  const granted = await native.isOverlayPermissionGranted().catch(() => false)
  if (!granted) return false

  const role = useRoleStore.getState().role ?? 'courier'
  const safeDist = Math.max(0.2, metrics.distKm)
  const safeEta = Math.max(1, metrics.eta)

  const result = computeProfitability({
    role,
    pricePLN: metrics.price,
    distanceKm: safeDist,
    etaMin: safeEta,
    dropoffLabel: metrics.dropoffLabel,
    isWeekendOrNight: isWeekendOrNightNow(),
  })

  try {
    native.updateOverlayProfitability(
      localizedProfitTierTitle(result.profitTier),
      formatOverlayPrimaryRate(result.złPerKm ?? metrics.price / safeDist),
      formatOverlayPrice(metrics.price),
      formatOverlayMetrics(safeDist, safeEta),
      result.tierColor,
      offer.packageName ?? offer.launchPackage ?? '',
      offer.contentHash ?? offer.id,
    )
    return true
  } catch {
    return false
  }
}

/**
 * On shift start (or when re-arming overlay): show the best queued offer on the widget,
 * or the IDLE radar pill when the queue is empty. Works for orders ingested before shift.
 */
export async function refreshOverlayFromIngestQueue(): Promise<void> {
  if (deriveSearchBlockedFromStore()) return

  const native = getNative()
  if (!native) return

  const granted = await native.isOverlayPermissionGranted().catch(() => false)
  if (!granted) return

  const now = Date.now()
  const offers = selectAvailableIngestOffers(useDriverIngestStore.getState())
    .filter((o) => o.expiresAt > now)
    .sort((a, b) => b.capturedAt - a.capturedAt)

  for (const offer of offers) {
    const pushed = await pushIngestedOfferToOverlay(offer)
    if (pushed) {
      if (__DEV__) {
        console.log('[DriveMind] refreshOverlayFromIngestQueue: offer', offer.id, offer.platform)
      }
      return
    }
  }

  try {
    native.showOverlayIdle?.()
  } catch {
    /* noop */
  }
}
