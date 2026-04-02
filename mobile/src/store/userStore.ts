import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface UserState {
  displayName: string
  setDisplayName: (name: string) => void
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      displayName: 'Driver',
      setDisplayName: (displayName) => set({ displayName }),
    }),
    {
      name: 'drivemind-user',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
