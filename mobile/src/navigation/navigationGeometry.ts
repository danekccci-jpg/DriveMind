import type { RouteStep } from '../services/directionsService'

export type LatLng = { latitude: number; longitude: number }

const EARTH_M = 6371000

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180
  const lat1 = (a.latitude * Math.PI) / 180
  const lat2 = (b.latitude * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Smallest angle between two compass headings in [0, 180]. */
export function smallestHeadingDeltaDeg(a: number, b: number): number {
  let d = Math.abs(a - b) % 360
  if (d > 180) d = 360 - d
  return d
}

function projectOnSegment(p: LatLng, a: LatLng, b: LatLng): { dist: number; t: number; proj: LatLng } {
  const abx = b.longitude - a.longitude
  const aby = b.latitude - a.latitude
  const apx = p.longitude - a.longitude
  const apy = p.latitude - a.latitude
  const ab2 = abx * abx + aby * aby
  let t = ab2 < 1e-22 ? 0 : (apx * abx + apy * aby) / ab2
  t = Math.max(0, Math.min(1, t))
  const proj = {
    latitude: a.latitude + t * aby,
    longitude: a.longitude + t * abx,
  }
  return { dist: haversineMeters(p, proj), t, proj }
}

/** Minimum distance from point to any segment of the polyline (meters). */
export function distancePointToPolylineMeters(p: LatLng, polyline: LatLng[]): number {
  if (polyline.length < 2) return polyline.length === 1 ? haversineMeters(p, polyline[0]) : Infinity
  let min = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const { dist } = projectOnSegment(p, polyline[i], polyline[i + 1])
    if (dist < min) min = dist
  }
  return min
}

/**
 * Drop vertices behind the user; keeps the path ahead for a cleaner nav line.
 */
export function trimPolylineBehindUser(user: LatLng, polyline: LatLng[]): LatLng[] {
  if (polyline.length < 2) return polyline
  let bestI = 0
  let bestD = Infinity
  for (let i = 0; i < polyline.length - 1; i++) {
    const { dist } = projectOnSegment(user, polyline[i], polyline[i + 1])
    if (dist < bestD) {
      bestD = dist
      bestI = i
    }
  }
  const a = polyline[bestI]
  const b = polyline[bestI + 1]
  const { t, proj } = projectOnSegment(user, a, b)
  const head: LatLng[] = []
  if (t < 0.98) head.push(proj)
  const tail = polyline.slice(bestI + 1)
  const merged = [...head, ...tail]
  return merged.length >= 2 ? merged : polyline
}

/** Distance along polyline from projected position to end (first step or full line). */
export function metersRemainingAlongPolyline(user: LatLng, points: LatLng[]): number {
  if (points.length < 2) return 0
  let bestD = Infinity
  let bestRemain = 0
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const { dist, t } = projectOnSegment(user, a, b)
    const segLen = haversineMeters(a, b)
    let remain = (1 - t) * segLen
    for (let j = i + 1; j < points.length - 1; j++) {
      remain += haversineMeters(points[j], points[j + 1])
    }
    if (dist < bestD) {
      bestD = dist
      bestRemain = remain
    }
  }
  return Math.max(0, bestRemain)
}

export function distanceToNextManeuverMeters(
  user: LatLng,
  firstStep: RouteStep | undefined,
  fallbackPolyline: LatLng[],
): number {
  const pts = firstStep?.polylinePoints
  if (pts && pts.length >= 2) {
    return metersRemainingAlongPolyline(user, pts)
  }
  if (fallbackPolyline.length >= 2) {
    return metersRemainingAlongPolyline(user, fallbackPolyline)
  }
  return 0
}

export function bearingDegrees(from: LatLng, to: LatLng): number {
  const φ1 = (from.latitude * Math.PI) / 180
  const φ2 = (to.latitude * Math.PI) / 180
  const Δλ = ((to.longitude - from.longitude) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return ((θ * 180) / Math.PI + 360) % 360
}

/** Smooth heading: ignore updates smaller than threshold (degrees). */
export function lowPassHeading(prev: number | null, next: number, thresholdDeg: number, alpha = 0.25): number {
  if (prev === null || Number.isNaN(prev)) return next
  let d = next - prev
  while (d > 180) d -= 360
  while (d < -180) d += 360
  if (Math.abs(d) < thresholdDeg) return prev
  const blended = prev + alpha * d
  return ((blended % 360) + 360) % 360
}

/** Try to pull a street/road name from Google instruction text. */
export function extractStreetName(instruction: string): string {
  const s = instruction.replace(/\s+/g, ' ').trim()
  if (!s) return ''
  const onto = s.match(/(?:onto|on to|on)\s+([^,<—–-]+?)(?:\s*[,.<]|$)/i)
  if (onto?.[1]) return onto[1].trim()
  const quoted = s.match(/["«]([^"»]+)["»]/)
  if (quoted?.[1]) return quoted[1].trim()
  return s.length > 42 ? `${s.slice(0, 40)}…` : s
}
