import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

function makeDriverId(): string {
  return `dm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

interface DriverSessionState {
  /** Stable id sent to backend on `driver_auth`. */
  driverId: string
  /** When true, driver receives dispatches and broadcasts GPS (throttled). */
  isOnline: boolean
  setIsOnline: (v: boolean) => void
  /**
   * True once the user has tapped "Accept" on the Prominent Disclosure screen
   * for the Android Accessibility Service.
   * Per Google Play policy, we still show the disclosure every time the service
   * is disabled — this flag is informational only (used for analytics / ordering).
   */
  accessibilityConsentGiven: boolean
  setAccessibilityConsentGiven: (v: boolean) => void
}

export const useDriverSessionStore = create<DriverSessionState>()(
  persist(
    (set) => ({
      driverId: makeDriverId(),
      isOnline: true,
      setIsOnline: (isOnline) => set({ isOnline }),
      accessibilityConsentGiven: false,
      setAccessibilityConsentGiven: (accessibilityConsentGiven) => set({ accessibilityConsentGiven }),
    }),
    {
      name: 'drivemind-driver-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ driverId: s.driverId, isOnline: s.isOnline, accessibilityConsentGiven: s.accessibilityConsentGiven }),
      onRehydrateStorage: () => (state) => {
        if (state && !state.driverId) {
          state.driverId = makeDriverId()
        }
      },
    },
  ),
)
