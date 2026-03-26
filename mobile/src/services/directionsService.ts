const GMAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? ''

export interface RouteStep {
  instruction: string
  distanceText: string
  durationText: string
}

export interface DirectionsResult {
  polylinePoints: { latitude: number; longitude: number }[]
  distanceText: string
  durationText: string
  steps: RouteStep[]
}

// ── Polyline decoder (Google encoded polyline algorithm) ──────────────────────
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte: number

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0

    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    lng += result & 1 ? ~(result >> 1) : result >> 1

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 })
  }

  return points
}

// ── Strip HTML tags from Google step instructions ─────────────────────────────
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// ── Main directions fetch ─────────────────────────────────────────────────────
export async function getDirections(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  mode: 'driving' | 'bicycling' = 'driving',
): Promise<DirectionsResult> {
  if (!GMAPS_API_KEY || GMAPS_API_KEY === 'your_key_here') {
    throw new Error('[DriveMind] EXPO_PUBLIC_GOOGLE_MAPS_KEY is not configured.')
  }

  const url =
    `https://maps.googleapis.com/maps/api/directions/json` +
    `?origin=${originLat},${originLng}` +
    `&destination=${destLat},${destLng}` +
    `&mode=${mode}` +
    `&language=en` +
    `&key=${GMAPS_API_KEY}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`[DriveMind] Directions API HTTP error: ${response.status}`)
  }

  const json = await response.json()

  if (json.status !== 'OK') {
    throw new Error(`[DriveMind] Directions API error: ${json.status} — ${json.error_message ?? ''}`)
  }

  const route = json.routes[0]
  const leg = route.legs[0]

  const polylinePoints = decodePolyline(route.overview_polyline.points)

  const steps: RouteStep[] = (leg.steps as any[]).map((step) => ({
    instruction: stripHtml(step.html_instructions ?? ''),
    distanceText: step.distance?.text ?? '',
    durationText: step.duration?.text ?? '',
  }))

  return {
    polylinePoints,
    distanceText: leg.distance?.text ?? '',
    durationText: leg.duration?.text ?? '',
    steps,
  }
}
