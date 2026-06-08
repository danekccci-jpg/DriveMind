import { create } from 'zustand'

export type AccessibilityDisclosureResult = 'accepted' | 'cancelled'

interface AccessibilityDisclosureState {
  visible: boolean
  resolver: ((result: AccessibilityDisclosureResult) => void) | null
  requestDisclosure: () => Promise<AccessibilityDisclosureResult>
  accept: () => void
  cancel: () => void
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
    }),

  accept: () => {
    const { resolver } = get()
    resolver?.('accepted')
    set({ visible: false, resolver: null })
  },

  cancel: () => {
    const { resolver } = get()
    resolver?.('cancelled')
    set({ visible: false, resolver: null })
  },
}))
