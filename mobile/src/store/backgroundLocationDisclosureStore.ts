import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type BackgroundLocationDisclosureResult = 'accepted' | 'declined'

interface BackgroundLocationDisclosureState {
  /** Persisted — true once the user has explicitly accepted the disclosure. */
  consentGiven: boolean
  /** True once the user has explicitly declined — suppresses re-prompt for the rest of this session. */
  declinedThisSession: boolean
  visible: boolean
  resolver: ((result: BackgroundLocationDisclosureResult) => void) | null

  /** Shows the modal (no-op if consent already given) and resolves with the user's choice. */
  requestDisclosure: () => Promise<BackgroundLocationDisclosureResult>
  accept: () => void
  decline: () => void
}

export const useBackgroundLocationDisclosureStore = create<BackgroundLocationDisclosureState>()(
  persist(
    (set, get) => ({
      consentGiven: false,
      declinedThisSession: false,
      visible: false,
      resolver: null,

      requestDisclosure: () =>
        new Promise<BackgroundLocationDisclosureResult>((resolve) => {
          if (get().consentGiven) {
            resolve('accepted')
            return
          }
          const { visible, resolver } = get()
          if (visible && resolver) {
            resolver('declined')
          }
          set({ visible: true, resolver: resolve })
        }),

      accept: () => {
        const { resolver } = get()
        resolver?.('accepted')
        set({ visible: false, resolver: null, consentGiven: true, declinedThisSession: false })
      },

      decline: () => {
        const { resolver } = get()
        resolver?.('declined')
        set({ visible: false, resolver: null, declinedThisSession: true })
      },
    }),
    {
      name: 'drivemind-bg-location-disclosure',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ consentGiven: s.consentGiven }),
    },
  ),
)
