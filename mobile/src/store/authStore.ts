import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface AuthState {
  userName: string | null
  userEmail: string | null
  isAuthenticated: boolean
  setUser: (name: string | null, email: string | null) => void
  setAuthenticated: (v: boolean) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userName: null,
      userEmail: null,
      isAuthenticated: false,
      setUser: (userName, userEmail) =>
        set({
          userName,
          userEmail,
          isAuthenticated: !!(userEmail && userEmail.trim().length > 0),
        }),
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      signOut: () =>
        set({
          userName: null,
          userEmail: null,
          isAuthenticated: false,
        }),
    }),
    {
      name: 'drivemind-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        userName: s.userName,
        userEmail: s.userEmail,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
)
