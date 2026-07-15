import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type A11yServiceDisclosureResult = 'accepted' | 'cancelled'

interface A11yServiceDisclosureState {
  /** Persisted — true once the user has explicitly continued past the disclosure. */
  consentGiven: boolean
  visible: boolean
  resolver: ((result: A11yServiceDisclosureResult) => void) | null

  /** Shows the modal (no-op if consent already given) and resolves with the user's choice. */
  requestDisclosure: () => Promise<A11yServiceDisclosureResult>
  continueToSettings: () => void
  cancel: () => void
}

/**
 * Google Play policy gate for the AccessibilityService API: the prominent
 * in-app disclosure MUST be shown and explicitly accepted before the user is
 * ever directed to the Android Accessibility Settings screen.
 */
export const useA11yServiceDisclosureStore = create<A11yServiceDisclosureState>()(
  persist(
    (set, get) => ({
      consentGiven: false,
      visible: false,
      resolver: null,

      requestDisclosure: () =>
        new Promise<A11yServiceDisclosureResult>((resolve) => {
          if (get().consentGiven) {
            resolve('accepted')
            return
          }
          const { visible, resolver } = get()
          if (visible && resolver) {
            resolver('cancelled')
          }
          set({ visible: true, resolver: resolve })
        }),

      continueToSettings: () => {
        const { resolver } = get()
        resolver?.('accepted')
        set({ visible: false, resolver: null, consentGiven: true })
      },

      cancel: () => {
        const { resolver } = get()
        resolver?.('cancelled')
        set({ visible: false, resolver: null })
      },
    }),
    {
      name: 'drivemind-a11y-service-disclosure',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ consentGiven: s.consentGiven }),
    },
  ),
)
