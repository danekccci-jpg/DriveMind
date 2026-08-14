import * as Localization from 'expo-localization'

/**
 * Languages the app can auto-detect from the device's system locale.
 * Mirrors the full set of app UI languages (`DRIVEMIND_LANGUAGES`).
 * If the device language is not one of these, the app falls back to English.
 */
export const AUTO_DETECT_LANGUAGES = ['en', 'ru', 'pl', 'uk'] as const
export type AutoDetectLanguage = (typeof AUTO_DETECT_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: AutoDetectLanguage = 'en'

function isAutoDetectLanguage(tag: string): tag is AutoDetectLanguage {
  return (AUTO_DETECT_LANGUAGES as readonly string[]).includes(tag)
}

/**
 * Detects the device's current system language and maps it to one of the
 * app's supported auto-detect languages. Falls back to English when the
 * system language isn't one of the app's UI languages (e.g. 'de', 'fr', 'es').
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
