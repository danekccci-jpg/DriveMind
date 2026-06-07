import {
  executeMutation,
  executeQuery,
  getDataConnect,
  mutationRef,
  queryRef,
} from 'firebase/data-connect'

import { getFirebaseApp } from '../config/firebase'
import { connectorConfig } from './connectorConfig'

export interface UserRecord {
  id: string
  createdAt: string
  isSubscribed: boolean
  trialEndsAt: string
}

function dataConnect() {
  return getDataConnect(getFirebaseApp(), connectorConfig)
}

export async function fetchUserById(id: string): Promise<UserRecord | null> {
  const ref = queryRef(dataConnect(), 'GetUserById', { id })
  const result = await executeQuery(ref)
  const user = (result.data as { user?: UserRecord | null }).user
  return user ?? null
}

export async function createUserRecord(trialEndsAt: string): Promise<UserRecord> {
  const ref = mutationRef(dataConnect(), 'CreateUser', { trialEndsAt })
  const result = await executeMutation(ref)
  const inserted = (result.data as { user_insert: UserRecord }).user_insert
  return inserted
}

const TRIAL_MS = 7 * 24 * 60 * 60 * 1000

export function trialEndsAtSevenDaysFromNow(): string {
  return new Date(Date.now() + TRIAL_MS).toISOString()
}

export async function ensureUserRecord(uid: string): Promise<UserRecord> {
  const existing = await fetchUserById(uid)
  if (existing) return existing
  return createUserRecord(trialEndsAtSevenDaysFromNow())
}

export function isPaywallRequired(user: Pick<UserRecord, 'isSubscribed' | 'trialEndsAt'>): boolean {
  if (user.isSubscribed) return false
  const trialEnd = new Date(user.trialEndsAt).getTime()
  return Number.isFinite(trialEnd) && Date.now() > trialEnd
}
