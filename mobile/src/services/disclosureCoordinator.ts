import { useAccessibilityDisclosureStore } from '../store/accessibilityDisclosureStore'
import { usePermissionOnboardingStore } from '../store/permissionOnboardingStore'

/** Hide auto + explicit Prominent Disclosure overlays without resolving waiters. */
export function suppressAllDisclosureUI(): void {
  usePermissionOnboardingStore.getState().suppressAllDisclosure()
  useAccessibilityDisclosureStore.getState().forceHide()
}
