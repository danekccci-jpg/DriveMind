import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

type Language = 'en' | 'pl'

interface LanguageState {
  language: Language
  hasChosenLanguage: boolean
  setLanguage: (language: Language) => void
  confirmLanguageChoice: (language: Language) => void
}

const storage =
  Platform.OS === 'web'
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => AsyncStorage)

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set) => ({
      language: 'en',
      hasChosenLanguage: false,
      setLanguage: (language) => set({ language }),
      confirmLanguageChoice: (language) =>
        set({ language, hasChosenLanguage: true }),
    }),
    {
      name: 'drivemind-language',
      storage,
    },
  ),
)
