import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import pl from './locales/pl.json'

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
    },
    lng: getPersistedLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
