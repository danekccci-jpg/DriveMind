import type { ProfitTier } from '@drivemind/shared'

const LEGACY_TIER_MAP: Record<string, ProfitTier> = {
  legendary: 'EXCELLENT',
  excellent: 'EXCELLENT',
  great: 'EXCELLENT',
  very_good: 'GOOD_DEAL',
  good_deal: 'GOOD_DEAL',
  good: 'GOOD_DEAL',
  worth_it: 'STANDARD',
  standard: 'STANDARD',
  ok: 'STANDARD',
  okay: 'STANDARD',
  neutral: 'STANDARD',
  risky: 'LOW_YIELD',
  trash: 'LOW_YIELD',
  low_yield: 'LOW_YIELD',
  low: 'LOW_YIELD',
  skip: 'LOW_YIELD',
}

const VALID_TIERS = new Set<ProfitTier>(['EXCELLENT', 'GOOD_DEAL', 'STANDARD', 'LOW_YIELD'])

/** Maps legacy API / persisted values to the current ProfitTier codes. */
export function normalizeProfitTier(raw: string | undefined | null): ProfitTier {
  const normalized = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized in LEGACY_TIER_MAP) {
    return LEGACY_TIER_MAP[normalized]
  }

  const upper = String(raw ?? '').trim().toUpperCase()
  if (VALID_TIERS.has(upper as ProfitTier)) {
    return upper as ProfitTier
  }

  return 'STANDARD'
}

type OrderProfitFields = {
  profitLabel?: string
  profitTier?: string
}

/** Migrates persisted orders that still store `profitLabel`. */
export function withNormalizedProfitTier<T extends OrderProfitFields>(
  order: T,
): Omit<T, 'profitLabel'> & { profitTier: ProfitTier } {
  const { profitLabel, ...rest } = order
  const profitTier = normalizeProfitTier(order.profitTier ?? profitLabel)
  return { ...rest, profitTier }
}
