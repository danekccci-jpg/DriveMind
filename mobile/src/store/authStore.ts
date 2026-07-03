import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PaywallMode } from '../services/userFirestoreService'

export const GUEST_EMAIL = 'guest@drivemind.local'

interface AuthState {
  // ── Identity ───────────────────────────────────────────────────────────────
  userName: string | null
  userEmail: string | null
  firebaseUid: string | null
  /** 8-digit numeric public ID for support and UI. */
  publicId: string | null

  // ── Device fingerprint ─────────────────────────────────────────────────────
  /**
   * Stable UUID stored in expo-secure-store on first launch.
   * Used for guest trial tracking and anti-abuse checks.
   * Set once by `getOrCreateDeviceFingerprint()` in App.tsx.
   */
  deviceFingerprint: string | null

  // ── Subscription / trial ───────────────────────────────────────────────────
  completedOrdersCount: number
  isSubscribed: boolean
  /** Legacy: countdown timer triggered when order limit is hit. */
  trialEndsAt: string | null
  /** Absolute trial expiry (account creation + 7 days). */
  subscriptionEndsAt: string | null
  /** Remaining free welcome trips before trial timer starts. -1 = premium. */
  remainingTrips: number
  paywallMode: PaywallMode
  subscriptionLoaded: boolean
  isPaywallBlocked: boolean
  isSearchBlocked: boolean

  // ── Guest tier tracking ────────────────────────────────────────────────────
  /**
   * Number of orders completed while in guest mode on this device.
   * Persisted independently of sign-out — survives switching accounts.
   */
  guestOrderCount: number
  /**
   * True once a guest has used all GUEST_ORDER_THRESHOLD orders and must
   * register to continue.  Causes App.tsx to show the paywall.
   */
  isGuestBlocked: boolean

  // ── Session flags ──────────────────────────────────────────────────────────
  /** Same as isLoggedIn; kept for existing checks. */
  isAuthenticated: boolean
  /** Alias for isAuthenticated (bypass / Google sign-in). */
  isLoggedIn: boolean

  // ── Actions ────────────────────────────────────────────────────────────────
  setUser: (name: string | null, email: string | null) => void
  setSubscription: (fields: {
    firebaseUid: string | null
    completedOrdersCount: number
    isSubscribed: boolean
    trialEndsAt: string | null
    subscriptionEndsAt?: string | null
    publicId?: string | null
    paywallMode: PaywallMode
    isPaywallBlocked: boolean
    isSearchBlocked: boolean
    remainingTrips?: number
  }) => void
  setSearchBlocked: (blocked: boolean) => void
  setSubscriptionLoaded: (loaded: boolean) => void
  setAuthenticated: (v: boolean) => void
  setDeviceFingerprint: (fp: string) => void
  incrementGuestOrderCount: () => void
  setGuestOrderCount: (count: number) => void
  setGuestBlocked: (blocked: boolean) => void
  signOut: () => void
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === GUEST_EMAIL
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // ── Initial state ──────────────────────────────────────────────────────
      userName: null,
      userEmail: null,
      firebaseUid: null,
      publicId: null,
      deviceFingerprint: null,
      completedOrdersCount: 0,
      isSubscribed: false,
      trialEndsAt: null,
      subscriptionEndsAt: null,
      remainingTrips: 15,
      paywallMode: 'none',
      subscriptionLoaded: false,
      isPaywallBlocked: false,
      isSearchBlocked: false,
      guestOrderCount: 0,
      isGuestBlocked: false,
      isAuthenticated: false,
      isLoggedIn: false,

      // ── Actions ────────────────────────────────────────────────────────────
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
                subscriptionEndsAt: null,
                publicId: null,
                paywallMode: 'none' as PaywallMode,
                isPaywallBlocked: false,
                isSearchBlocked: false,
                subscriptionLoaded: true,
                // guest order count is preserved across setUser calls
              }
            : {}),
        })
      },

      setSubscription: ({
        firebaseUid,
        completedOrdersCount,
        isSubscribed,
        trialEndsAt,
        subscriptionEndsAt,
        publicId,
        paywallMode,
        isPaywallBlocked,
        isSearchBlocked,
        remainingTrips,
      }) =>
        set({
          firebaseUid,
          completedOrdersCount,
          isSubscribed,
          trialEndsAt,
          subscriptionEndsAt: subscriptionEndsAt ?? get().subscriptionEndsAt,
          publicId: publicId ?? get().publicId,
          remainingTrips: remainingTrips ?? get().remainingTrips,
          paywallMode,
          isPaywallBlocked,
          isSearchBlocked,
          subscriptionLoaded: true,
        }),

      setSearchBlocked: (isSearchBlocked) => {
        if (get().isSearchBlocked === isSearchBlocked) return
        set({ isSearchBlocked })
      },

      setSubscriptionLoaded: (subscriptionLoaded) => set({ subscriptionLoaded }),

      setAuthenticated: (v) => set({ isAuthenticated: v, isLoggedIn: v }),

      setDeviceFingerprint: (deviceFingerprint) => set({ deviceFingerprint }),

      incrementGuestOrderCount: () =>
        set((s) => ({ guestOrderCount: s.guestOrderCount + 1 })),

      setGuestOrderCount: (guestOrderCount) => set({ guestOrderCount }),

      setGuestBlocked: (isGuestBlocked) => set({ isGuestBlocked }),

      signOut: () =>
        set((s) => ({
          userName: null,
          userEmail: null,
          firebaseUid: null,
          publicId: null,
          completedOrdersCount: 0,
          isSubscribed: false,
          trialEndsAt: null,
          subscriptionEndsAt: null,
          remainingTrips: 15,
          paywallMode: 'none',
          subscriptionLoaded: false,
          isPaywallBlocked: false,
          isSearchBlocked: false,
          isAuthenticated: false,
          isLoggedIn: false,
          // Preserve device fingerprint and guest state across sign-outs
          // so reinstalling → guest → signing in doesn't reset the abuse protection
          deviceFingerprint: s.deviceFingerprint,
          guestOrderCount: s.guestOrderCount,
          isGuestBlocked: s.isGuestBlocked,
        })),
    }),
    {
      name: 'drivemind-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        userName: s.userName,
        userEmail: s.userEmail,
        firebaseUid: s.firebaseUid,
        publicId: s.publicId,
        deviceFingerprint: s.deviceFingerprint,
        completedOrdersCount: s.completedOrdersCount,
        isSubscribed: s.isSubscribed,
        trialEndsAt: s.trialEndsAt,
        subscriptionEndsAt: s.subscriptionEndsAt,
        remainingTrips: s.remainingTrips,
        paywallMode: s.paywallMode,
        isPaywallBlocked: s.isPaywallBlocked,
        isSearchBlocked: s.isSearchBlocked,
        guestOrderCount: s.guestOrderCount,
        isGuestBlocked: s.isGuestBlocked,
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
