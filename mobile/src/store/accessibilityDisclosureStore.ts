import { create } from 'zustand'

import { usePermissionOnboardingStore } from './permissionOnboardingStore'

export type AccessibilityDisclosureResult = 'accepted' | 'cancelled'

interface AccessibilityDisclosureState {
  visible: boolean
  resolver: ((result: AccessibilityDisclosureResult) => void) | null
  requestDisclosure: () => Promise<AccessibilityDisclosureResult>
  accept: () => void
  cancel: () => void
  /** Hide without notifying waiters — used when native bridge already reports ready. */
  forceHide: () => void
}

export const useAccessibilityDisclosureStore = create<AccessibilityDisclosureState>((set, get) => ({
  visible: false,
  resolver: null,

  requestDisclosure: () =>
    new Promise<AccessibilityDisclosureResult>((resolve) => {
      const { visible, resolver } = get()
      if (visible && resolver) {
        resolver('cancelled')
      }
      set({ visible: true, resolver: resolve })
      usePermissionOnboardingStore.getState().setExplicitVisible(true)
    }),

  accept: () => {
    const { resolver } = get()
    resolver?.('accepted')
    set({ visible: false, resolver: null })
    usePermissionOnboardingStore.getState().setExplicitVisible(false)
  },

  cancel: () => {
    const { resolver } = get()
    resolver?.('cancelled')
    set({ visible: false, resolver: null })
    usePermissionOnboardingStore.getState().setExplicitVisible(false)
  },

  forceHide: () => {
    set({ visible: false, resolver: null })
    usePermissionOnboardingStore.getState().setExplicitVisible(false)
  },
}))
