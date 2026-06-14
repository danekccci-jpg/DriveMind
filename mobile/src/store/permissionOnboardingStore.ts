import { create } from 'zustand'

/**
 * In-memory only — resets on cold start.
 * Gates the auto-triggered permissions onboarding modal on the map screen.
 */
interface PermissionOnboardingState {
  /** True when core ingest permissions are missing (set by focus / AppState checks). */
  autoVisible: boolean
  /** Mirrors explicit Prominent Disclosure requests (shift / legacy flows). */
  explicitVisible: boolean
  /** User tapped "Maybe later" — suppress auto modal until next cold start. */
  sessionDismissed: boolean
  setAutoVisible: (visible: boolean) => void
  setExplicitVisible: (visible: boolean) => void
  /** Clears auto + explicit visibility flags in this store only. */
  suppressAllDisclosure: () => void
  dismissForSession: () => void
}

export const usePermissionOnboardingStore = create<PermissionOnboardingState>((set, get) => ({
  autoVisible: false,
  explicitVisible: false,
  sessionDismissed: false,

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

  dismissForSession: () => set({ sessionDismissed: true, autoVisible: false, explicitVisible: false }),
}))
