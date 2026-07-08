import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import pl from './locales/pl.json'
import uk from './locales/uk.json'
import ru from './locales/ru.json'
import { detectDeviceLanguage } from './detectDeviceLanguage'

// The initial language is detected synchronously from the device's system
// locale (see `detectDeviceLanguage`), falling back to English when the
// system language isn't one of the app's supported languages. If the user
// previously made an explicit choice, `languageStore`'s `onRehydrateStorage`
// callback will call `i18n.changeLanguage` once AsyncStorage rehydrates,
// overriding this initial detection.
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
    lng: detectDeviceLanguage(),
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
