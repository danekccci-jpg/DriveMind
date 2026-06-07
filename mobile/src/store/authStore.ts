import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PaywallMode } from '../services/userFirestoreService'

export const GUEST_EMAIL = 'guest@drivemind.local'

interface AuthState {
  userName: string | null
  userEmail: string | null
  firebaseUid: string | null
  completedOrdersCount: number
  isSubscribed: boolean
  trialEndsAt: string | null
  paywallMode: PaywallMode
  subscriptionLoaded: boolean
  isPaywallBlocked: boolean
  isSearchBlocked: boolean
  /** Same as isLoggedIn; kept for existing checks. */
  isAuthenticated: boolean
  /** Alias for isAuthenticated (bypass / Google sign-in). */
  isLoggedIn: boolean
  setUser: (name: string | null, email: string | null) => void
  setSubscription: (fields: {
    firebaseUid: string | null
    completedOrdersCount: number
    isSubscribed: boolean
    trialEndsAt: string | null
    paywallMode: PaywallMode
    isPaywallBlocked: boolean
    isSearchBlocked: boolean
  }) => void
  setSearchBlocked: (blocked: boolean) => void
  setSubscriptionLoaded: (loaded: boolean) => void
  setAuthenticated: (v: boolean) => void
  signOut: () => void
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === GUEST_EMAIL
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      userName: null,
      userEmail: null,
      firebaseUid: null,
      completedOrdersCount: 0,
      isSubscribed: false,
      trialEndsAt: null,
      paywallMode: 'none',
      subscriptionLoaded: false,
      isPaywallBlocked: false,
      isSearchBlocked: false,
      isAuthenticated: false,
      isLoggedIn: false,
      setUser: (userName, userEmail) => {
        const ok = !!(userEmail && userEmail.trim().length > 0)
        const guest = isGuestEmail(userEmail)
        set({
          userName,
          userEmail,
          isAuthenticated: ok,
          isLoggedIn: ok,
          ...(guest
            ? {
                firebaseUid: null,
                completedOrdersCount: 0,
                isSubscribed: false,
                trialEndsAt: null,
                paywallMode: 'none' as PaywallMode,
                isPaywallBlocked: false,
                isSearchBlocked: false,
                subscriptionLoaded: true,
              }
            : {}),
        })
      },
      setSubscription: ({
        firebaseUid,
        completedOrdersCount,
        isSubscribed,
        trialEndsAt,
        paywallMode,
        isPaywallBlocked,
        isSearchBlocked,
      }) =>
        set({
          firebaseUid,
          completedOrdersCount,
          isSubscribed,
          trialEndsAt,
          paywallMode,
          isPaywallBlocked,
          isSearchBlocked,
          subscriptionLoaded: true,
        }),
      setSearchBlocked: (isSearchBlocked) => set({ isSearchBlocked }),
      setSubscriptionLoaded: (subscriptionLoaded) => set({ subscriptionLoaded }),
      setAuthenticated: (v) => set({ isAuthenticated: v, isLoggedIn: v }),
      signOut: () =>
        set({
          userName: null,
          userEmail: null,
          firebaseUid: null,
          completedOrdersCount: 0,
          isSubscribed: false,
          trialEndsAt: null,
          paywallMode: 'none',
          subscriptionLoaded: false,
          isPaywallBlocked: false,
          isSearchBlocked: false,
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
        firebaseUid: s.firebaseUid,
        completedOrdersCount: s.completedOrdersCount,
        isSubscribed: s.isSubscribed,
        trialEndsAt: s.trialEndsAt,
        paywallMode: s.paywallMode,
        isPaywallBlocked: s.isPaywallBlocked,
        isSearchBlocked: s.isSearchBlocked,
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
          subscriptionLoaded: false,
        }
      },
    },
  ),
)
