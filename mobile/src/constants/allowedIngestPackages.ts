/** Notification listener — strict whitelist (no Google Play / system apps). */
export const ALLOWED_NOTIFICATION_PACKAGES = [
  'com.ubercab.driver',
  'com.bolt.driver',
  'com.bolt.delivery',
] as const

/** Accessibility scrape — driver/courier apps only. */
export const ALLOWED_SCRAPE_PACKAGES = [
  ...ALLOWED_NOTIFICATION_PACKAGES,
  'com.glovoapp.courier',
  'com.wolt.handler',
] as const

export function isAllowedNotificationPackage(packageName: string | undefined | null): boolean {
  if (!packageName) return false
  return (ALLOWED_NOTIFICATION_PACKAGES as readonly string[]).includes(packageName)
}

export function isAllowedScrapePackage(packageName: string | undefined | null): boolean {
  if (!packageName) return false
  return (ALLOWED_SCRAPE_PACKAGES as readonly string[]).includes(packageName)
}
