import { NativeModules, Platform } from 'react-native'
import i18n from '../i18n'
import type { Language } from '../store/languageStore'
import type { ProfitTier } from '@drivemind/shared'
import { deriveSearchBlockedFromStore } from '../services/subscriptionGate'

const TIER_KEYS: Record<ProfitTier, string> = {
  LEGENDARY: 'tier_legendary',
  VERY_GOOD: 'tier_very_good',
  WORTH_IT: 'tier_worth_it',
  RISKY: 'tier_risky',
  TRASH: 'tier_trash',
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

/** Prominent price line for overlay card row 2. */
export function formatOverlayPrice(price: number): string {
  const lng = driveMindUiLanguage()
  const rawAmt = price > 0 ? price.toFixed(2) : '--'
  const amount = lng === 'pl' ? rawAmt.replace('.', ',') : rawAmt
  return i18n.t('widget_price_pln', { amount })
}

/** Muted metrics line for overlay card row 3. */
export function formatOverlayMetrics(distKm: number, etaMin: number): string {
  const lng = driveMindUiLanguage()
  const kmStr = lng === 'pl' ? distKm.toFixed(1).replace('.', ',') : distKm.toFixed(1)
  const dLine = i18n.t('widget_distance_line', { km: kmStr })
  const tLine = i18n.t('widget_time_line', { min: etaMin })
  return `${dLine} · ${tLine}`
}

export function syncNativeOverlayRadarLabel(): void {
  if (Platform.OS !== 'android') return
  try {
    const native = NativeModules.DriveMindNative as { setOverlayRadarLabel?: (l: string) => void } | undefined
    const label = deriveSearchBlockedFromStore()
      ? i18n.t('searchStatusBlocked')
      : i18n.t('searchStatusActive')
    native?.setOverlayRadarLabel?.(label)
  } catch {
    /* noop */
  }
}
