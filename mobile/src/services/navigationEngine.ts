import { getDirections, type TravelMode, type RouteStep } from './directionsService'

type LatLng = { latitude: number; longitude: number }

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

  cancelPending(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    // Logical cancellation: older promises are ignored by seq checks
    this.requestSeq += 1
  }

  /** Bypass debounce/throttle (e.g. off-route > 50 m). */
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

