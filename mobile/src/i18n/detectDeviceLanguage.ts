import * as Localization from 'expo-localization'

/**
 * Languages the app can auto-detect from the device's system locale.
 * Manual selection (see `languageStore`) additionally supports 'uk',
 * but system auto-detection is intentionally limited to this list per spec.
 */
export const AUTO_DETECT_LANGUAGES = ['en', 'ru', 'pl'] as const
export type AutoDetectLanguage = (typeof AUTO_DETECT_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AutoDetectLanguage = 'en'

function isAutoDetectLanguage(tag: string): tag is AutoDetectLanguage {
  return (AUTO_DETECT_LANGUAGES as readonly string[]).includes(tag)
}

/**
 * Detects the device's current system language and maps it to one of the
 * app's supported auto-detect languages. Falls back to English when the
 * system language isn't recognised (e.g. 'de', 'fr', 'uk').
 */
export function detectDeviceLanguage(): AutoDetectLanguage {
  try {
    const locales = Localization.getLocales()
    for (const locale of locales) {
      const languageCode = locale.languageCode?.toLowerCase()
      if (languageCode && isAutoDetectLanguage(languageCode)) {
        return languageCode
      }
    }
  } catch {
    // Localization APIs are unavailable (e.g. certain test/web environments).
  }
  return DEFAULT_LANGUAGE
}
