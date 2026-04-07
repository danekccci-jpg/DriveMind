import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface AuthState {
  userName: string | null
  userEmail: string | null
  /** Same as isLoggedIn; kept for existing checks. */
  isAuthenticated: boolean
  /** Alias for isAuthenticated (bypass / Google sign-in). */
  isLoggedIn: boolean
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
      isLoggedIn: false,
      setUser: (userName, userEmail) => {
        const ok = !!(userEmail && userEmail.trim().length > 0)
        set({ userName, userEmail, isAuthenticated: ok, isLoggedIn: ok })
      },
      setAuthenticated: (v) => set({ isAuthenticated: v, isLoggedIn: v }),
      signOut: () =>
        set({
          userName: null,
          userEmail: null,
          isAuthenticated: false,
          isLoggedIn: false,
        }),
    }),
    {
      name: 'drivemind-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        userName: s.userName,
        userEmail: s.userEmail,
        isAuthenticated: s.isAuthenticated,
        isLoggedIn: s.isLoggedIn,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AuthState>
        const c = current as AuthState
        const auth = p.isAuthenticated ?? false
        return {
          ...c,
          ...p,
          isAuthenticated: auth,
          isLoggedIn: p.isLoggedIn ?? auth,
        }
      },
    },
  ),
)
