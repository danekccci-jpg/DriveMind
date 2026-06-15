/** Google Play subscription SKU — must match Play Console product id. */
export const SUBSCRIPTION_SKU = 'drivemind_weekly_premium'

/** Android application id — must match Play Console package name. */
export const ANDROID_PACKAGE_NAME = 'com.guessxx.drivemind'

/** Weekly price shown in paywall copy (actual charge is defined in Play Console). */
export const SUBSCRIPTION_PRICE_LABEL = '8.99 PLN / week'

export type SubscriptionFirestoreStatus = 'active' | 'expired' | 'pending'

export interface UserSubscriptionRecord {
  status: SubscriptionFirestoreStatus
  expiresAt: Date | null
  subscriptionId: string | null
  lastVerified: Date | null
  purchaseToken: string | null
}
