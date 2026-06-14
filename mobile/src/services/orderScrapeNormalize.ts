/**
 * Normalizes order strings scraped from Uber/Bolt/etc. when the *service app* UI
 * is in PL, UA, RU, or EN. DriveMind UI language is applied separately via i18n.
 *
 * Kotlin `DriveMindScraperService` should mirror these patterns for parity.
 */

/** Known distance field labels (substring match is enough for fuzzy UI trees). */
export const SCRAPER_DISTANCE_LABELS = [
  'Odległość',
  'odległość',
  'Відстань',
  'відстань',
  'Расстояние',
  'расстояние',
  'Distance',
  'distance',
] as const

export const SCRAPER_TIME_LABELS = [
  'Czas',
  'czas',
  'Час',
  'час',
  'Время',
  'время',
  'Time',
  'time',
] as const

export const SCRAPER_ACCEPT_LABELS = [
  'Przyjmij',
  'przyjmij',
  'Прийняти',
  'прийняти',
  'Принять',
  'принять',
  'Accept',
  'accept',
] as const

/** Pickup / Point A labels (mirrored in Kotlin scraper). */
export const SCRAPER_PICKUP_LABELS = [
  'Odbiór',
  'odbiór',
  'Odbior',
  'odbior',
  'Pickup',
  'pickup',
  'Pick up',
  'Отримання',
  'отримання',
  'Получение',
  'получение',
] as const

/** Dropoff / Point B labels (mirrored in Kotlin scraper). */
export const SCRAPER_DROPOFF_LABELS = [
  'Dostawa',
  'dostawa',
  'Dostarczenie',
  'dostarczenie',
  'Delivery',
  'delivery',
  'Dropoff',
  'dropoff',
  'Drop off',
  'Доставка',
  'доставка',
  'Доставлення',
  'доставлення',
] as const

/** Quick lookup Sets for native / tests. */
export const SCRAPER_DISTANCE_LABEL_SET = new Set<string>(SCRAPER_DISTANCE_LABELS)
export const SCRAPER_TIME_LABEL_SET = new Set<string>(SCRAPER_TIME_LABELS)
export const SCRAPER_ACCEPT_LABEL_SET = new Set<string>(SCRAPER_ACCEPT_LABELS)
export const SCRAPER_PICKUP_LABEL_SET = new Set<string>(SCRAPER_PICKUP_LABELS)
export const SCRAPER_DROPOFF_LABEL_SET = new Set<string>(SCRAPER_DROPOFF_LABELS)

/**
 * Decimal token for math: always dot, no thousands here (gig apps rarely show 1.234,56 in one token for trip stats).
 */
export function normalizeDecimalToken(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (t.includes(',') && t.includes('.')) {
    return t.replace(/\./g, '').replace(',', '.')
  }
  return t.replace(',', '.')
}

export function normalizeDecimalToFloat(raw: string): number {
  const n = Number.parseFloat(normalizeDecimalToken(raw))
  return Number.isFinite(n) ? n : 0
}

/** PLN amounts: currency is always treated as PLN for the profit engine. */
export function parsePlnAmountFromText(text: string): number {
  if (!text?.trim()) return 0
  const normalized = text.replace(/\s+/g, ' ')
  const patterns = [
    /\(\s*(\d+(?:[.,]\d+)?)\s*(?:zł|PLN|zlotych|zl)\s*\)/gi,
    /(\d+(?:[.,]\d+)?)\s*(?:zł|PLN|zlotych|zl)\b/gi,
    /(?:zł|PLN|zl)\s*(\d+(?:[.,]\d+)?)/gi,
  ]
  let best = 0
  for (const re of patterns) {
    re.lastIndex = 0
    for (const m of normalized.matchAll(re)) {
      if (!m[1]) continue
      const v = normalizeDecimalToFloat(m[1])
      if (v > best) best = v
    }
  }
  return best > 0 ? best : 0
}

/**
 * Distance in kilometres: Latin `km` or Cyrillic `км`.
 * Keeps standalone metres (Latin `m` only) to avoid `min`.
 */
export function parseDistanceKmFromText(text: string): number | null {
  if (!text?.trim()) return null
  const s = text.replace(/\s+/g, ' ')
  const kmLat = s.match(/(\d+(?:[.,]\d+)?)\s*km\b/i)
  if (kmLat?.[1]) {
    const n = normalizeDecimalToFloat(kmLat[1])
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const kmCy = s.match(/(\d+(?:[.,]\d+)?)\s*км\b/i)
  if (kmCy?.[1]) {
    const n = normalizeDecimalToFloat(kmCy[1])
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const meters = s.match(/(\d+(?:[.,]\d+)?)\s*m\b(?![a-z])/i)
  if (meters?.[1]) {
    const n = normalizeDecimalToFloat(meters[1])
    if (!Number.isFinite(n) || n <= 0) return null
    return n / 1000
  }
  return null
}

const ETA_MINUTE_PATTERNS = [/(\d{1,3})\s*min\b/gi, /(\d{1,3})\s*мин\b/gi, /(\d{1,3})\s*хв\b/gi]

/** Collect every minute token in document order (skips isolated pickup-only when multiple exist). */
export function collectEtaMinutesFromText(text: string): number[] {
  const s = text.replace(/\s+/g, ' ')
  const found: number[] = []
  for (const re of ETA_MINUTE_PATTERNS) {
    re.lastIndex = 0
    for (const m of s.matchAll(re)) {
      if (!m[1]) continue
      const n = Number.parseInt(m[1], 10)
      if (Number.isFinite(n) && n > 0 && n <= 180) found.push(n)
    }
  }
  return found
}

/**
 * Bolt shows pickup ETA and trip ETA (e.g. 12 min + 25 min).
 * Prefer trip duration (max); when two values exist, sum for total working time.
 */
export function parseBoltEtaMinutesFromText(text: string): number | null {
  const mins = collectEtaMinutesFromText(text)
  if (mins.length === 0) return null
  if (mins.length === 1) return mins[0]
  const tripDuration = Math.max(...mins)
  if (mins.length === 2) return mins[0] + mins[1]
  return tripDuration
}

/** ETA minutes: min / мин / хв — first match (non-Bolt apps). */
export function parseEtaMinutesFromText(text: string): number | null {
  const mins = collectEtaMinutesFromText(text)
  return mins.length > 0 ? mins[0] : null
}

export function parseEtaMinutesForPackage(
  text: string | null | undefined,
  packageName: string | null | undefined,
): number | null {
  const blob = (text ?? '').trim()
  if (!blob) return null
  const pkg = (packageName ?? '').toLowerCase()
  if (pkg.includes('bolt') || pkg.includes('mtakso') || pkg.includes('delivery')) {
    return parseBoltEtaMinutesFromText(blob)
  }
  return parseEtaMinutesFromText(blob)
}

const PRICE_TOKENS = ['zł', 'pln', 'eur', '€', '$', 'usd'] as const
const METRIC_TOKENS = ['min', 'мин', 'хв', 'km', 'км'] as const
const NOISE_HEADERS = new Set([
  'powiadomienie',
  'powiadomienia',
  'notification',
  'notifications',
  'alert',
  'reminder',
  'przypomnienie',
  'уведомление',
  'уведомления',
  'сповіщення',
])

function isNoiseOnly(lines: string[]): boolean {
  const substantive = lines.filter((line) => {
    const lower = line.toLowerCase().trim()
    if (!lower) return false
    return ![...NOISE_HEADERS].some((h) => lower === h || lower.startsWith(`${h} `))
  })
  if (substantive.length === 0) return true
  return substantive.every((line) => {
    const lower = line.toLowerCase().trim()
    return [...NOISE_HEADERS].some((h) => lower === h || lower.startsWith(`${h} `))
  })
}

/** Mirrors Kotlin [OrderLayoutValidator] — price currency AND metrics required. */
export function isValidOrderBlob(text: string): boolean {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return false
  if (isNoiseOnly(lines)) return false
  const blob = lines.join('\n').toLowerCase()
  const hasPrice = PRICE_TOKENS.some((t) => blob.includes(t))
  const hasMetrics = METRIC_TOKENS.some((t) => blob.includes(t))
  return hasPrice && hasMetrics
}
