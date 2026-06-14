import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import pl from './locales/pl.json'
import uk from './locales/uk.json'
import ru from './locales/ru.json'

// Language is read synchronously from the store's persisted state before i18n
// initialises. The store will call i18n.changeLanguage whenever the user
// changes the preference at runtime.
function getPersistedLanguage(): string {
  try {
    const raw = require('@react-native-async-storage/async-storage')
    // AsyncStorage is async; we fall back to 'en' and let the app call
    // i18n.changeLanguage once the store rehydrates.
  } catch {
    // ignore
  }
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    resources: {
      en: { translation: en },
      pl: { translation: pl },
      uk: { translation: uk },
      ru: { translation: ru },
    },
    lng: getPersistedLanguage(),
    fallbackLng: 'en',
    supportedLngs: ['en', 'pl', 'uk', 'ru'],
    nonExplicitSupportedLngs: true,
    returnEmptyString: false,
    returnNull: false,
    // Show English (never raw keys like "errors.network_fail") when a key is missing.
    parseMissingKeyHandler: (key) => {
      const fromEn = (en as Record<string, string>)[key]
      if (fromEn) return fromEn
      return key.split('.').pop() ?? key
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
