import { NativeModules, Platform } from 'react-native'
import i18n from '../i18n'
import type { Language } from '../store/languageStore'
import type { ProfitTier } from '@drivemind/shared'
import { deriveSearchBlockedFromStore } from '../services/subscriptionGate'

const TIER_KEYS: Record<ProfitTier, string> = {
  EXCELLENT: 'tier_excellent',
  GOOD_DEAL: 'tier_good_deal',
  STANDARD: 'tier_standard',
  LOW_YIELD: 'tier_low_yield',
}

function driveMindUiLanguage(): Language {
  const raw = (i18n.language || 'en').split('-')[0]
  if (raw === 'pl' || raw === 'uk' || raw === 'ru') return raw
  return 'en'
}

export function localizedProfitTierTitle(tier: string): string {
  const key = TIER_KEYS[tier as ProfitTier]
  if (key) return i18n.t(key)
  return i18n.t('tier_neutral')
}

/** Gross fare line for the OFFER card secondary row. */
export function formatOverlayPrice(price: number): string {
  const lng = driveMindUiLanguage()
  const rawAmt = price > 0 ? price.toFixed(2) : '--'
  const amount = lng === 'pl' ? rawAmt.replace('.', ',') : rawAmt
  return i18n.t('widget_price_pln', { amount })
}

/** ETA + distance secondary row for the OFFER card. */
export function formatOverlayMetrics(distKm: number, etaMin: number): string {
  const lng = driveMindUiLanguage()
  const kmStr = lng === 'pl' ? distKm.toFixed(1).replace('.', ',') : distKm.toFixed(1)
  const dLine = i18n.t('widget_distance_line', { km: kmStr })
  const tLine = i18n.t('widget_time_line', { min: etaMin })
  return `${dLine} · ${tLine}`
}

/**
 * Primary headline metric for the OFFER card — "4,20 zł/km".
 * This is the single most important number a driver evaluates when triaging
 * an offer at speed, so it gets the largest font + accent color treatment in
 * the native overlay.
 */
export function formatOverlayPrimaryRate(zlPerKm: number): string {
  const lng = driveMindUiLanguage()
  if (!Number.isFinite(zlPerKm) || zlPerKm <= 0) return ''
  const raw = zlPerKm.toFixed(2)
  const amount = lng === 'pl' ? raw.replace('.', ',') : raw
  return i18n.t('widget_zl_per_km', { rate: amount, defaultValue: `${amount} zł/km` })
}

export function syncNativeOverlayRadarLabel(): void {
  if (Platform.OS !== 'android') return
  try {
    const native = NativeModules.DriveMindNative as {
      setOverlayRadarLabel?: (l: string) => void
    } | undefined
    // IDLE pill label — "Online" when the radar is active, blocked-label when
    // the subscription gate has paused ingest.
    const label = deriveSearchBlockedFromStore()
      ? i18n.t('searchStatusBlocked')
      : i18n.t('overlay_online', { defaultValue: i18n.t('searchStatusActive') })
    native?.setOverlayRadarLabel?.(label)
  } catch {
    /* noop */
  }
}

/** Sync the localized labels for the Accept & Dismiss buttons. */
export function syncNativeOverlayButtonLabels(): void {
  if (Platform.OS !== 'android') return
  try {
    const native = NativeModules.DriveMindNative as {
      setOverlayButtonLabels?: (accept: string, dismiss: string) => void
    } | undefined
    const accept = i18n.t('overlay_accept', { defaultValue: 'Accept & Go' })
    const dismiss = i18n.t('overlay_dismiss', { defaultValue: 'Dismiss' })
    native?.setOverlayButtonLabels?.(accept, dismiss)
  } catch {
    /* noop */
  }
}
