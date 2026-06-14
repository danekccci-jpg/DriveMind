/**
 * Firestore operations for the `/device_fingerprints/{fingerprintId}` collection.
 *
 * Each document tracks:
 *   - guestOrderCount   : orders completed as a guest on this device
 *   - linkedUids        : Firebase UIDs that have signed in on this device
 *   - createdAt / lastSeenAt : housekeeping timestamps
 *
 * All functions are fire-and-forget safe — they catch errors internally so a
 * Firestore outage never blocks the app's critical sign-in / order completion path.
 */
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  increment,
  Timestamp,
} from 'firebase/firestore'
import { getFirestoreDb } from '../config/firebase'

export const DEVICE_FINGERPRINTS_COLLECTION = 'device_fingerprints'

export interface DeviceRecord {
  guestOrderCount: number
  linkedUids: string[]
  createdAt: string
  lastSeenAt: string
}

function deviceRef(fingerprintId: string) {
  return doc(getFirestoreDb(), DEVICE_FINGERPRINTS_COLLECTION, fingerprintId)
}

function parseTimestamp(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString()
  if (typeof value === 'string') return value
  return new Date().toISOString()
}

function parseRecord(data: Record<string, unknown>): DeviceRecord {
  return {
    guestOrderCount: typeof data.guestOrderCount === 'number' ? data.guestOrderCount : 0,
    linkedUids: Array.isArray(data.linkedUids) ? (data.linkedUids as string[]) : [],
    createdAt: parseTimestamp(data.createdAt),
    lastSeenAt: parseTimestamp(data.lastSeenAt),
  }
}

/** Fetches the device record. Returns null if not found or on network error. */
export async function getDeviceRecord(fingerprintId: string): Promise<DeviceRecord | null> {
  try {
    const snap = await getDoc(deviceRef(fingerprintId))
    if (!snap.exists()) return null
    return parseRecord(snap.data() as Record<string, unknown>)
  } catch {
    return null
  }
}

/**
 * Returns the remote guest order count for this device.
 * Returns 0 on error — fail-open so network issues never block the app.
 */
export async function getRemoteGuestOrderCount(fingerprintId: string): Promise<number> {
  const record = await getDeviceRecord(fingerprintId)
  return record?.guestOrderCount ?? 0
}

/**
 * Atomically increments the guest order count in Firestore.
 * Creates the record if it doesn't exist.
 * Returns the new count, or null if the write fails.
 */
export async function incrementGuestOrderCountRemote(
  fingerprintId: string,
): Promise<number | null> {
  try {
    const ref = deviceRef(fingerprintId)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        guestOrderCount: 1,
        linkedUids: [] as string[],
        createdAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
      })
      return 1
    }
    await updateDoc(ref, {
      guestOrderCount: increment(1),
      lastSeenAt: Timestamp.now(),
    })
    const updated = await getDoc(ref)
    const count = (updated.data() as { guestOrderCount?: number } | undefined)?.guestOrderCount
    return typeof count === 'number' ? count : 1
  } catch {
    return null
  }
}

/**
 * Associates a Firebase UID with this device (arrayUnion — idempotent).
 * Called after every successful Google sign-in.
 */
export async function linkUidToDevice(fingerprintId: string, uid: string): Promise<void> {
  try {
    const ref = deviceRef(fingerprintId)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        guestOrderCount: 0,
        linkedUids: [uid],
        createdAt: Timestamp.now(),
        lastSeenAt: Timestamp.now(),
      })
      return
    }
    await updateDoc(ref, {
      linkedUids: arrayUnion(uid),
      lastSeenAt: Timestamp.now(),
    })
  } catch {
    /* Never block sign-in due to Firestore errors */
  }
}

/**
 * Returns true if the device's `linkedUids` contains a UID that is NOT the
 * currently signing-in user — indicating potential multi-account trial abuse.
 *
 * Fails-closed: returns false on network error so legitimate users aren't blocked
 * by transient connectivity issues.
 */
export async function isDeviceLinkedToOtherUid(
  fingerprintId: string,
  currentUid: string,
): Promise<boolean> {
  try {
    const record = await getDeviceRecord(fingerprintId)
    if (!record) return false
    return record.linkedUids.some((uid) => uid !== currentUid)
  } catch {
    return false
  }
}
