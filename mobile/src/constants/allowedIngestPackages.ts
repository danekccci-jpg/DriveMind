/** Notification listener — canonical production package IDs. */
export const ALLOWED_NOTIFICATION_PACKAGES = [
  'com.ubercab.driver',
  'com.bolt.driver',
  'ee.mtakso.driver', // Kraków / EU Bolt (Taxify)
  'com.bolt.delivery',
  'com.glovoapp.courier',
  'com.wolt.courier.android',
  'com.wolt.handler', // legacy Wolt
  'pl.pyszne',
  'com.justeattakeaway.courier',
] as const

/** Accessibility scrape — driver/courier apps only. */
export const ALLOWED_SCRAPE_PACKAGES = [
  ...ALLOWED_NOTIFICATION_PACKAGES,
] as const

/** Guessxx Kraków mock APKs with non-production applicationIds. */
export const GUESSXX_MOCK_PACKAGES = [
  'com.guessxx.mock.uber',
  'com.guessxx.mock.bolt',
  'com.guessxx.mock.boltfood',
  'com.guessxx.krakowmocks',
] as const

const BRAND_TO_NOTIFICATION_PACKAGE: Record<string, string> = {
  uber: 'com.ubercab.driver',
  bolt: 'com.bolt.driver',
  bolt_food: 'com.bolt.delivery',
  glovo: 'com.glovoapp.courier',
  wolt: 'com.wolt.courier.android',
  pyszne: 'pl.pyszne',
  just_eat: 'com.justeattakeaway.courier',
}

/** Legacy poster IDs → canonical ingest package (mirrors Kotlin NotificationBrandRouter). */
const PACKAGE_ALIASES: Record<string, string> = {
  'ee.mtakso.driver': 'com.bolt.driver',
  'com.wolt.handler': 'com.wolt.courier.android',
}

export function toCanonicalNotificationPackage(packageName: string): string {
  return PACKAGE_ALIASES[packageName] ?? packageName
}

/** Mirrors Kotlin [NotificationBrandRouter.isMockOrTestPackage]. */
export function isMockOrTestPackage(packageName: string | undefined | null): boolean {
  const p = (packageName ?? '').toLowerCase()
  if (!p || p === 'com.guessxx.drivemind') return false
  if ((GUESSXX_MOCK_PACKAGES as readonly string[]).includes(packageName ?? '')) return true
  return (
    p.includes('mock') ||
    p.includes('krakowmock') ||
    p.includes('drivermock') ||
    p.startsWith('com.guessxx.mock') ||
    p.includes('.mock.')
  )
}

const NOTIFICATION_BRAND_KEYWORDS: { keyword: string; brand: keyof typeof BRAND_TO_NOTIFICATION_PACKAGE }[] = [
  { keyword: 'glovo', brand: 'glovo' },
  { keyword: 'wolt', brand: 'wolt' },
  { keyword: 'pyszne', brand: 'pyszne' },
  { keyword: 'just eat', brand: 'just_eat' },
  { keyword: 'justeat', brand: 'just_eat' },
  { keyword: 'uber', brand: 'uber' },
  { keyword: 'bolt food', brand: 'bolt_food' },
  { keyword: 'bolt delivery', brand: 'bolt_food' },
  { keyword: 'bolt dostawa', brand: 'bolt_food' },
  { keyword: 'bolt', brand: 'bolt' },
]

/** Mirrors Kotlin [NotificationBrandRouter.matchPackageHint]. */
export function matchPackageHint(sourcePackage: string | undefined | null): string | null {
  const p = (sourcePackage ?? '').toLowerCase()
  if (!p || p === 'com.guessxx.drivemind') return null
  if (p.includes('ubercab') || p.includes('uber')) return BRAND_TO_NOTIFICATION_PACKAGE.uber
  if (
    p.includes('boltfood') ||
    p.includes('bolt_food') ||
    (p.includes('bolt') && (p.includes('food') || p.includes('delivery') || p.includes('dostawa'))) ||
    (p.includes('delivery') && p.includes('bolt'))
  ) {
    return BRAND_TO_NOTIFICATION_PACKAGE.bolt_food
  }
  if (p.includes('bolt') || p.includes('mtakso') || p.includes('taxify')) {
    return BRAND_TO_NOTIFICATION_PACKAGE.bolt
  }
  if (p.includes('glovo')) return BRAND_TO_NOTIFICATION_PACKAGE.glovo
  if (p.includes('wolt')) return BRAND_TO_NOTIFICATION_PACKAGE.wolt
  if (p.includes('pyszne')) return BRAND_TO_NOTIFICATION_PACKAGE.pyszne
  if (p.includes('justeat') || p.includes('just_eat') || p.includes('justeattakeaway')) {
    return BRAND_TO_NOTIFICATION_PACKAGE.just_eat
  }
  if (isMockOrTestPackage(p)) return BRAND_TO_NOTIFICATION_PACKAGE.uber
  return null
}

/** Mirrors Kotlin [NotificationBrandRouter.matchBrand]. */
export function matchBrandFromNotificationText(
  title?: string | null,
  text?: string | null,
  bigText?: string | null,
): string | null {
  const full = [title, text, bigText].filter(Boolean).join(' ').toLowerCase()
  if (!full.trim()) return null
  for (const { keyword, brand } of NOTIFICATION_BRAND_KEYWORDS) {
    if (full.includes(keyword)) return BRAND_TO_NOTIFICATION_PACKAGE[brand]
  }
  return null
}

/**
 * Resolves the canonical driver package for a notification.
 * Native layer routes mock posters to production package IDs; this helper
 * covers buffered replays and dev-only paths that still carry mock package names.
 */
export function resolveNotificationPackage(
  packageName: string | undefined | null,
  title?: string | null,
  text?: string | null,
  sourcePackage?: string | null,
): string | null {
  if (isMockOrTestPackage(packageName ?? sourcePackage)) {
    const fromMock = matchPackageHint(sourcePackage ?? packageName)
    if (fromMock) return fromMock
  }

  if (packageName) {
    const canonical = toCanonicalNotificationPackage(packageName)
    if ((ALLOWED_NOTIFICATION_PACKAGES as readonly string[]).includes(packageName) ||
        (ALLOWED_NOTIFICATION_PACKAGES as readonly string[]).includes(canonical)) {
      return canonical
    }
    if ((ALLOWED_SCRAPE_PACKAGES as readonly string[]).includes(packageName) ||
        (ALLOWED_SCRAPE_PACKAGES as readonly string[]).includes(canonical)) {
      return canonical
    }
  }

  const fromSourceHint = matchPackageHint(sourcePackage ?? packageName)
  if (fromSourceHint) return fromSourceHint

  const fromText = matchBrandFromNotificationText(title, text)
  if (fromText) return fromText

  return null
}

export function isAllowedNotificationPackage(
  packageName: string | undefined | null,
  title?: string | null,
  text?: string | null,
): boolean {
  return resolveNotificationPackage(packageName, title, text) != null
}

/** Mirrors Kotlin [NotificationBrandRouter.isMonitoredDriverPackage]. */
export function isAllowedScrapePackage(packageName: string | undefined | null): boolean {
  if (!packageName) return false
  const canonical = toCanonicalNotificationPackage(packageName)
  if ((ALLOWED_SCRAPE_PACKAGES as readonly string[]).includes(packageName)) return true
  if ((ALLOWED_SCRAPE_PACKAGES as readonly string[]).includes(canonical)) return true
  if (isMockOrTestPackage(packageName)) return true
  return matchPackageHint(packageName) != null
}
