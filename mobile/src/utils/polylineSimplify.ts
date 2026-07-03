export interface LatLngPoint {
  lat: number
  lng: number
}

/**
 * Douglas-Peucker polyline simplification.
 * Reduces point count while preserving shape within `epsilon` tolerance.
 * Epsilon is in degrees (~0.00005 ≈ 5m at equator).
 */
export function douglasPeucker<T extends LatLngPoint>(points: T[], epsilon: number): T[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0
  const start = points[0]
  const end = points[points.length - 1]

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end)
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon)
    const right = douglasPeucker(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [start, end]
}

function perpendicularDistance(point: LatLngPoint, lineStart: LatLngPoint, lineEnd: LatLngPoint): number {
  const dx = lineEnd.lng - lineStart.lng
  const dy = lineEnd.lat - lineStart.lat
  const norm = Math.sqrt(dx * dx + dy * dy)
  if (norm === 0) {
    return Math.sqrt((point.lng - lineStart.lng) ** 2 + (point.lat - lineStart.lat) ** 2)
  }
  return (
    Math.abs(dy * point.lng - dx * point.lat + lineEnd.lng * lineStart.lat - lineEnd.lat * lineStart.lng) / norm
  )
}

/**
 * Haversine distance between two points in meters.
 */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}
