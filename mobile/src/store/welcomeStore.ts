import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

interface WelcomeState {
  /** True once the user has dismissed the initial value-proposition screen. Persisted forever. */
  hasSeenWelcome: boolean
  setHasSeenWelcome: (hasSeenWelcome: boolean) => void
}

const storage =
  Platform.OS === 'web'
    ? createJSONStorage(() => localStorage)
    : createJSONStorage(() => AsyncStorage)

export const useWelcomeStore = create<WelcomeState>()(
  persist(
    (set) => ({
      hasSeenWelcome: false,
      setHasSeenWelcome: (hasSeenWelcome) => set({ hasSeenWelcome }),
    }),
    {
      name: 'drivemind-welcome',
      storage,
    },
  ),
)
