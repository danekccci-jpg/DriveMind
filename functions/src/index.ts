import * as admin from 'firebase-admin'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import * as functions from 'firebase-functions'
import { google } from 'googleapis'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ── Constants ────────────────────────────────────────────────────────────────

const ANDROID_PACKAGE_NAME = 'com.guessxx.drivemind'
const DEFAULT_SUBSCRIPTION_ID = 'drivemind_weekly_premium'
const ANDROID_PUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher'
const USERS_COLLECTION = 'users'

// Payment states from Google Play Developer API (SubscriptionPurchase.paymentState)
const PAYMENT_RECEIVED = 1
const PAYMENT_FREE_TRIAL = 2

// ── Admin bootstrap ──────────────────────────────────────────────────────────

if (!admin.apps.length) {
  admin.initializeApp()
}

const db = admin.firestore()

// ── Google Play auth ─────────────────────────────────────────────────────────

let androidPublisherClient: ReturnType<typeof google.androidpublisher> | null = null

function resolveServiceAccountPath(): string {
  const configured = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PATH?.trim()
  if (configured && fs.existsSync(configured)) return configured
  const local = path.join(__dirname, '..', 'service-account-google-play.json')
  if (fs.existsSync(local)) return local
  throw new functions.https.HttpsError(
    'failed-precondition',
    'Google Play service account JSON is not configured on the server.',
  )
}

function getAndroidPublisher() {
  if (androidPublisherClient) return androidPublisherClient

  const keyFile = resolveServiceAccountPath()
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: [ANDROID_PUBLISHER_SCOPE],
  })

  androidPublisherClient = google.androidpublisher({
    version: 'v3',
    auth,
  })

  return androidPublisherClient
}

// ── Types ────────────────────────────────────────────────────────────────────

type VerifySubscriptionRequest = {
  purchaseToken?: string
  subscriptionId?: string
  packageName?: string
}

type SubscriptionStatus = 'active' | 'expired' | 'pending'

type VerifySubscriptionResponse = {
  ok: boolean
  status: SubscriptionStatus
  expiresAtMs: number | null
  subscriptionId: string
  paymentState: number | null
  acknowledged: boolean
}

function parseExpiryMillis(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function deriveSubscriptionStatus(
  expiryMs: number | null,
  paymentState: number | null | undefined,
  nowMs: number,
): SubscriptionStatus {
  if (paymentState === 0) return 'pending'
  if (expiryMs == null || expiryMs <= nowMs) return 'expired'
  if (paymentState === PAYMENT_RECEIVED || paymentState === PAYMENT_FREE_TRIAL) {
    return 'active'
  }
  // Grace / account hold / unknown — treat as expired until Google confirms payment.
  return 'expired'
}

// ── Callable: verifySubscription ─────────────────────────────────────────────

export const verifySubscription = functions.https.onCall(
  async (request): Promise<VerifySubscriptionResponse> => {
    if (!request.auth?.uid) {
      throw new functions.https.HttpsError('unauthenticated', 'Authentication is required.')
    }

    const uid = request.auth.uid
    const data = (request.data ?? {}) as VerifySubscriptionRequest
    const purchaseToken = (data?.purchaseToken ?? '').trim()
    const subscriptionId = (data?.subscriptionId ?? DEFAULT_SUBSCRIPTION_ID).trim()
    const packageName = (data?.packageName ?? ANDROID_PACKAGE_NAME).trim()

    if (!purchaseToken) {
      throw new functions.https.HttpsError('invalid-argument', 'purchaseToken is required.')
    }
    if (!subscriptionId) {
      throw new functions.https.HttpsError('invalid-argument', 'subscriptionId is required.')
    }

    const publisher = getAndroidPublisher()

    let purchase: {
      expiryTimeMillis?: string | null
      paymentState?: number | null
      acknowledgementState?: number | null
      autoRenewing?: boolean | null
    }

    try {
      const response = await publisher.purchases.subscriptions.get({
        packageName,
        subscriptionId,
        token: purchaseToken,
      })
      purchase = response.data
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      functions.logger.error('androidpublisher.subscriptions.get failed', {
        uid,
        subscriptionId,
        message,
      })
      throw new functions.https.HttpsError(
        'internal',
        'Unable to verify subscription with Google Play.',
      )
    }

    const nowMs = Date.now()
    const expiryMs = parseExpiryMillis(purchase.expiryTimeMillis ?? null)
    const paymentState =
      typeof purchase.paymentState === 'number' ? purchase.paymentState : null
    const status = deriveSubscriptionStatus(expiryMs, paymentState, nowMs)
    const isActive = status === 'active'

    const userRef = db.collection(USERS_COLLECTION).doc(uid)

    // Atomic merge — never wipe unrelated user fields (trial counters, publicId, etc.).
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef)
      const subscriptionPayload: Record<string, unknown> = {
        status,
        subscriptionId,
        purchaseToken,
        lastVerified: FieldValue.serverTimestamp(),
        paymentState,
        autoRenewing: purchase.autoRenewing === true,
      }

      if (expiryMs != null) {
        subscriptionPayload.expiresAt = Timestamp.fromMillis(expiryMs)
      }

      const updates: Record<string, unknown> = {
        subscription: subscriptionPayload,
        isSubscribed: isActive,
      }

      if (isActive && expiryMs != null) {
        updates.subscriptionEndsAt = Timestamp.fromMillis(expiryMs)
      }

      if (snap.exists) {
        tx.update(userRef, updates)
      } else {
        tx.set(userRef, {
          completedOrdersCount: 0,
          createdAt: FieldValue.serverTimestamp(),
          ...updates,
        })
      }
    })

    functions.logger.info('verifySubscription completed', {
      uid,
      subscriptionId,
      status,
      expiryMs,
      paymentState,
    })

    return {
      ok: isActive,
      status,
      expiresAtMs: expiryMs,
      subscriptionId,
      paymentState,
      acknowledged: purchase.acknowledgementState === 1,
    }
  },
)
