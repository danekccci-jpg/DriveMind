import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

import i18n from '../i18n'
import { detectDeviceLanguage } from '../i18n/detectDeviceLanguage'

export type Language = 'en' | 'pl' | 'uk' | 'ru'

/** App UI language cycle (Profile, Navigation settings, etc.). */
export const DRIVEMIND_LANGUAGES: Language[] = ['en', 'pl', 'uk', 'ru']

export function cycleDriveMindLanguage(current: Language): Language {
  const i = DRIVEMIND_LANGUAGES.indexOf(current)
  const idx = i >= 0 ? i : 0
  return DRIVEMIND_LANGUAGES[(idx + 1) % DRIVEMIND_LANGUAGES.length]
}

interface LanguageState {
  language: Language
  setLanguage: (language: Language) => void
}

const storage =
  Platform.OS === 'web'
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => AsyncStorage)

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      // Matches the language i18n already auto-detected on startup, so this
      // is a no-op until AsyncStorage rehydrates a previously chosen language
      // or the user explicitly picks one (Profile / Navigation settings).
      language: detectDeviceLanguage(),
      setLanguage: (language) => set({ language }),
    }),
    {
      name: 'drivemind-language',
      storage,
      onRehydrateStorage: () => (state) => {
        if (state?.language) {
          void i18n.changeLanguage(state.language)
        }
      },
    },
  ),
)
