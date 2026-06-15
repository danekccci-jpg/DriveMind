import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type WalletTransactionStatus = 'COMPLETED' | 'PENDING'

export interface WalletTransaction {
  id: string
  amount: number
  date: number
  orderId?: string
  status: WalletTransactionStatus
  /** Trip context for completed order payouts (optional for legacy rows). */
  pickupAddress?: string
  dropoffAddress?: string
  distanceKm?: number
}

interface WalletState {
  totalBalance: number
  transactions: WalletTransaction[]
  /** Credit wallet when a delivery order is completed (idempotent per completion). */
  recordOrderPayout: (
    orderId: string,
    amount: number,
    trip?: { pickupAddress?: string; dropoffAddress?: string; distanceKm?: number },
  ) => void
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      totalBalance: 0,
      transactions: [],

      recordOrderPayout: (orderId, amount, trip) => {
        if (amount <= 0) return
        if (get().transactions.some((t) => t.orderId === orderId)) return
        const id = `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
        const next: WalletTransaction = {
          id,
          amount,
          date: Date.now(),
          orderId,
          status: 'COMPLETED',
          ...(trip?.pickupAddress != null && trip.pickupAddress !== '' ? { pickupAddress: trip.pickupAddress } : {}),
          ...(trip?.dropoffAddress != null && trip.dropoffAddress !== '' ? { dropoffAddress: trip.dropoffAddress } : {}),
          ...(typeof trip?.distanceKm === 'number' && Number.isFinite(trip.distanceKm)
            ? { distanceKm: trip.distanceKm }
            : {}),
        }
        set({
          totalBalance: get().totalBalance + amount,
          transactions: [next, ...get().transactions].slice(0, 200),
        })
      },
    }),
    {
      name: 'drivemind-wallet',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ totalBalance: s.totalBalance, transactions: s.transactions }),
    },
  ),
)

export function selectTodayEarnings(transactions: WalletTransaction[]): number {
  const start = startOfLocalDay(Date.now())
  return transactions
    .filter((t) => t.status === 'COMPLETED' && t.date >= start)
    .reduce((s, t) => s + t.amount, 0)
}

export function selectWeeklyEarnings(transactions: WalletTransaction[]): number {
  const start = startOfLocalWeek(Date.now())
  return transactions
    .filter((t) => t.status === 'COMPLETED' && t.date >= start)
    .reduce((s, t) => s + t.amount, 0)
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Monday 00:00 local time as week start. */
function startOfLocalWeek(ts: number): number {
  const d = new Date(ts)
  const day = d.getDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset)
  start.setHours(0, 0, 0, 0)
  return start.getTime()
}
