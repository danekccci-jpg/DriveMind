import { create } from 'zustand'

export type SocketConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'

interface SocketConnectionState {
  status: SocketConnectionStatus
  lastDisconnectReason: string | null
  setSocketStatus: (status: SocketConnectionStatus, lastDisconnectReason?: string | null) => void
}

export const useSocketConnectionStore = create<SocketConnectionState>((set) => ({
  status: 'disconnected',
  lastDisconnectReason: null,
  setSocketStatus: (status, lastDisconnectReason) =>
    set((s) => ({
      status,
      lastDisconnectReason:
        lastDisconnectReason === undefined ? s.lastDisconnectReason : lastDisconnectReason,
    })),
}))
