export type PlatformId = 'glovo' | 'uber' | 'bolt' | 'wolt'

/** Coerce mock/unknown platform strings to a safe renderable id. */
export function normalizePlatformId(raw?: string): PlatformId {
  if (raw === 'uber' || raw === 'bolt' || raw === 'glovo' || raw === 'wolt') return raw
  return 'uber'
}
