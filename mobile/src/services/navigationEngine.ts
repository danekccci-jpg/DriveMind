import { getDirections, type TravelMode, type RouteStep } from './directionsService'
import { emitDriverLocation } from './socketService'
import { haversineMeters, smallestHeadingDeltaDeg, type LatLng } from '../navigation/navigationGeometry'

export interface NavigationRoutePayload {
  polyline: LatLng[]
  currentStep: string
  routeDistance: string
  routeDuration: string
  steps: RouteStep[]
  durationSecondsTotal: number
}

interface RouteRefreshParams {
  origin: LatLng
  destination: LatLng
  mode: TravelMode
  onRoute: (route: NavigationRoutePayload) => void
  onError?: (error: unknown) => void
}

function toRad(value: number): number {
  return (value * Math.PI) / 180
}

function distanceKm(a: LatLng, b: LatLng): number {
  const earthRadiusKm = 6371
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const k =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(k), Math.sqrt(1 - k))
  return earthRadiusKm * c
}

const MIN_MOVE_EMIT_M = 5
const MIN_HEADING_DELTA_DEG = 10
/** Ensures a heartbeat at least every minute if the filter blocks all samples. */
const MAX_EMIT_INTERVAL_MS = 60_000

class NavigationEngine {
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastRunAt = 0
  private requestSeq = 0
  private latestAppliedSeq = 0
  private lastOrigin: LatLng | null = null
  private lastDestination: LatLng | null = null
  private readonly debounceMs = 450
  private readonly minIntervalMs = 1600
  private readonly minDistanceDeltaKm = 0.08

  private lastEmitLat: number | null = null
  private lastEmitLng: number | null = null
  private lastEmitHeading: number | null = null
  private lastEmitAtMs = 0

  /**
   * Distance + heading-based emit (≥5 m or ≥10°), with a 60s safety heartbeat.
   * Queues via socketService when disconnected.
   */
  reportDriverLocation(payload: {
    lat: number
    lng: number
    heading: number | null
    speed: number | null
    isOnline: boolean
  }): void {
    if (!payload.isOnline) return

    const now = Date.now()
    const here: LatLng = { latitude: payload.lat, longitude: payload.lng }

    const isFirst = this.lastEmitLat == null || this.lastEmitLng == null
    let movedM = 0
    if (!isFirst) {
      movedM = haversineMeters(
        { latitude: this.lastEmitLat!, longitude: this.lastEmitLng! },
        here,
      )
    }

    let headingDelta = 0
    if (payload.heading != null && payload.heading >= 0 && this.lastEmitHeading != null) {
      headingDelta = smallestHeadingDeltaDeg(payload.heading, this.lastEmitHeading)
    }

    const movedEnough = movedM >= MIN_MOVE_EMIT_M
    const headingEnough =
      payload.heading != null &&
      payload.heading >= 0 &&
      this.lastEmitHeading != null &&
      headingDelta >= MIN_HEADING_DELTA_DEG
    const firstHeading =
      payload.heading != null && payload.heading >= 0 && this.lastEmitHeading == null
    const timeSafety = now - this.lastEmitAtMs >= MAX_EMIT_INTERVAL_MS

    if (!isFirst && !movedEnough && !headingEnough && !firstHeading && !timeSafety) {
      return
    }

    this.lastEmitLat = payload.lat
    this.lastEmitLng = payload.lng
    if (payload.heading != null && payload.heading >= 0) {
      this.lastEmitHeading = payload.heading
    }
    this.lastEmitAtMs = now

    emitDriverLocation({
      lat: payload.lat,
      lng: payload.lng,
      heading: payload.heading,
      speed: payload.speed,
    })
  }

  /** Call when ending a shift or going offline so the next fix is not suppressed. */
  resetLocationEmitFilter(): void {
    this.lastEmitLat = null
    this.lastEmitLng = null
    this.lastEmitHeading = null
    this.lastEmitAtMs = 0
  }

  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.requestSeq += 1
  }

  forceRefresh(params: RouteRefreshParams): void {
    this.cancelPending()
    void this.run(params)
  }

  scheduleRouteRefresh(params: RouteRefreshParams): void {
    const originChanged =
      !this.lastOrigin || distanceKm(this.lastOrigin, params.origin) >= this.minDistanceDeltaKm
    const destinationChanged =
      !this.lastDestination || distanceKm(this.lastDestination, params.destination) >= this.minDistanceDeltaKm

    if (!originChanged && !destinationChanged) {
      console.log('[DriveMind Nav]: engine skip refresh (anti-jitter)')
      return
    }

    this.lastOrigin = params.origin
    this.lastDestination = params.destination

    if (this.debounceTimer) clearTimeout(this.debounceTimer)

    const now = Date.now()
    const elapsed = now - this.lastRunAt
    const minWait = elapsed >= this.minIntervalMs ? this.debounceMs : this.minIntervalMs - elapsed

    this.debounceTimer = setTimeout(() => {
      void this.run(params)
    }, minWait)
  }

  private async run(params: RouteRefreshParams): Promise<void> {
    this.lastRunAt = Date.now()
    const seq = ++this.requestSeq
    console.log('[DriveMind Nav]: engine route request start', { seq, mode: params.mode })
    try {
      const route = await getDirections(
        params.origin.latitude,
        params.origin.longitude,
        params.destination.latitude,
        params.destination.longitude,
        params.mode,
      )

      if (seq < this.requestSeq || seq < this.latestAppliedSeq) {
        console.log('[DriveMind Nav]: engine ignore stale route', { seq, latest: this.requestSeq })
        return
      }

      this.latestAppliedSeq = seq
      params.onRoute({
        polyline: route.polylinePoints,
        currentStep: route.steps[0]?.instruction ?? '',
        routeDistance: route.distanceText,
        routeDuration: route.durationText,
        steps: route.steps,
        durationSecondsTotal: route.durationSecondsTotal,
      })
      console.log('[DriveMind Nav]: engine route applied', {
        seq,
        points: route.polylinePoints.length,
        distance: route.distanceText,
        duration: route.durationText,
      })
    } catch (error) {
      if (seq < this.requestSeq) return
      console.log('[DriveMind Nav]: engine route request failed', { seq, error })
      params.onError?.(error)
    }
  }
}

export const navigationEngine = new NavigationEngine()
