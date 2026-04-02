import { io, type Socket } from 'socket.io-client'
import Constants from 'expo-constants'
import { useSocketConnectionStore } from '../store/socketConnectionStore'

let socket: Socket | null = null

type QueuedLoc = { lat: number; lng: number; heading: number; speed: number }

/** Latest sample while offline — sent once on reconnect. */
let pendingLocation: QueuedLoc | null = null

function getBackendUrl(): string {
  const extra = Constants.expoConfig?.extra as { backendUrl?: string } | undefined
  return (extra?.backendUrl ?? process.env.EXPO_PUBLIC_BACKEND_URL ?? '').trim()
}

/** Resolve backend URL (Expo extra `backendUrl`, then `EXPO_PUBLIC_BACKEND_URL`). */
export function resolveBackendUrl(): string {
  return getBackendUrl()
}

function flushPendingDriverLocation(): void {
  if (!socket?.connected || !pendingLocation) return
  socket.emit('update_location', pendingLocation)
  console.log('[DriveMind Socket]: flushed queued update_location')
  pendingLocation = null
}

export function initSocket(opts: {
  driverId: string
  onNewOrder?: (raw: unknown) => void
}): void {
  teardownSocket()
  const url = getBackendUrl()
  if (!url) {
    console.warn(
      '[DriveMind Socket]: No backend URL — set BACKEND_URL / EXPO_PUBLIC_BACKEND_URL in .env (see app.config.js). Realtime disabled.',
    )
    useSocketConnectionStore.getState().setSocketStatus('disconnected', 'no_backend_url')
    return
  }

  console.log('[DriveMind Socket]: connecting to', url)
  useSocketConnectionStore.getState().setSocketStatus('connecting', null)

  socket = io(url, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10_000,
    timeout: 20_000,
  })

  socket.on('connect', () => {
    console.log('[DriveMind Socket]: connect', socket?.id)
    useSocketConnectionStore.getState().setSocketStatus('connected', null)
    socket?.emit('driver_auth', { driverId: opts.driverId })
    flushPendingDriverLocation()
  })

  socket.on('disconnect', (reason) => {
    console.log('[DriveMind Socket]: disconnect', reason)
    useSocketConnectionStore.getState().setSocketStatus('disconnected', reason)
  })

  socket.on('connect_error', (err) => {
    console.warn('[DriveMind Socket]: connect_error', err?.message)
    useSocketConnectionStore.getState().setSocketStatus('disconnected', err?.message ?? 'connect_error')
  })

  socket.io.on('reconnect_attempt', (attempt) => {
    console.log('[DriveMind Socket]: reconnect_attempt', attempt)
    useSocketConnectionStore.getState().setSocketStatus('reconnecting', null)
  })

  socket.io.on('reconnect', (attempt) => {
    console.log('[DriveMind Socket]: reconnect ok', attempt)
    useSocketConnectionStore.getState().setSocketStatus('connected', null)
    socket?.emit('driver_auth', { driverId: opts.driverId })
    flushPendingDriverLocation()
  })

  socket.io.on('reconnect_error', (err) => {
    console.warn('[DriveMind Socket]: reconnect_error', err?.message)
  })

  socket.on('new_order', (payload: unknown) => {
    console.log('[DriveMind Socket]: new_order')
    opts.onNewOrder?.(payload)
  })
}

export function teardownSocket(): void {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  useSocketConnectionStore.getState().setSocketStatus('disconnected', null)
}

export function emitOrderAccepted(orderId: string): void {
  if (!socket?.connected) {
    console.warn('[DriveMind Socket]: order_accepted skipped (socket not connected)')
    return
  }
  socket.emit('order_accepted', { orderId })
  console.log('[DriveMind Socket]: emitted order_accepted', orderId)
}

export function emitDriverLocation(payload: {
  lat: number
  lng: number
  heading: number | null
  speed: number | null
}): void {
  const normalized: QueuedLoc = {
    lat: payload.lat,
    lng: payload.lng,
    heading: payload.heading ?? 0,
    speed: payload.speed ?? 0,
  }
  if (socket?.connected) {
    socket.emit('update_location', normalized)
  } else {
    pendingLocation = normalized
    console.log('[DriveMind Socket]: update_location queued (socket offline)')
  }
}

/** Clear queued location (e.g. sign-out). */
export function clearPendingDriverLocation(): void {
  pendingLocation = null
}

export function getSocket(): Socket | null {
  return socket
}
