import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

/** Max auto permission prompts across cold starts (not explicit user actions). */
export const MAX_PERMISSION_AUTO_PROMPTS = 3

interface PermissionOnboardingState {
  /** Cold starts where the auto permission modal was shown (permissions still missing). */
  permissionsShownCount: number
  /** Total cold starts since install — used for first-launch Order Reader disclosure. */
  appOpenCount: number
  /** True when core ingest permissions are missing (set on cold start only). */
  autoVisible: boolean
  /** Mirrors explicit Prominent Disclosure requests (shift / legacy flows). */
  explicitVisible: boolean
  /** User tapped "Maybe later" — suppress auto modal until next cold start. */
  sessionDismissed: boolean

  incrementAppOpenCount: () => number
  recordPermissionPromptShown: () => void
  setAutoVisible: (visible: boolean) => void
  setExplicitVisible: (visible: boolean) => void
  /** Clears auto + explicit visibility flags in this store only. */
  suppressAllDisclosure: () => void
  dismissForSession: () => void
  resetSessionDismiss: () => void
}

export const usePermissionOnboardingStore = create<PermissionOnboardingState>()(
  persist(
    (set, get) => ({
      permissionsShownCount: 0,
      appOpenCount: 0,
      autoVisible: false,
      explicitVisible: false,
      sessionDismissed: false,

      incrementAppOpenCount: () => {
        const next = get().appOpenCount + 1
        set({ appOpenCount: next })
        return next
      },

      recordPermissionPromptShown: () => {
        set((s) => ({
          permissionsShownCount: s.permissionsShownCount + 1,
          autoVisible: true,
          sessionDismissed: false,
        }))
      },

      setAutoVisible: (visible) => {
        if (get().autoVisible === visible) return
        set({ autoVisible: visible })
      },

      setExplicitVisible: (visible) => {
        if (get().explicitVisible === visible) return
        set({ explicitVisible: visible })
      },

      suppressAllDisclosure: () => {
        set({ autoVisible: false, explicitVisible: false })
      },

      dismissForSession: () =>
        set({ sessionDismissed: true, autoVisible: false, explicitVisible: false }),

      resetSessionDismiss: () => set({ sessionDismissed: false }),
    }),
    {
      name: 'drivemind-permission-onboarding',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        permissionsShownCount: s.permissionsShownCount,
        appOpenCount: s.appOpenCount,
      }),
    },
  ),
)
