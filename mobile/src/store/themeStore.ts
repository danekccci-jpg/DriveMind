import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

type ThemeMode = 'dark' | 'light' | 'system'

interface ThemeState {
  theme: ThemeMode
  toggleTheme: () => void
  setTheme: (theme: ThemeMode) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'system' as ThemeMode,
      toggleTheme: () => {
        const cur = get().theme
        const next: ThemeMode =
          cur === 'dark' ? 'light' : cur === 'light' ? 'system' : 'dark'
        set({ theme: next })
      },
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'drivemind-theme',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
