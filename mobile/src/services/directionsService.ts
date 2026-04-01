import { useNavigationSettingsStore } from '../store/navigationSettingsStore'
import { useLanguageStore } from '../store/languageStore'

const GMAPS_API_KEY = (process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '').trim()
const DIRECTIONS_PROXY_URL = (process.env.EXPO_PUBLIC_DIRECTIONS_PROXY_URL ?? '').trim()

/** Google requires origin/destination as "lat,lng" with no spaces after the comma. */
function coordToken(n: number): string {
  return String(n).replace(/\s+/g, '')
}

function assertValidCoord(lat: number, lng: number, label: string): void {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`[DriveMind] Invalid ${label} coordinates: lat=${lat}, lng=${lng}`)
  }
}

export type TravelMode = 'driving' | 'bicycling'
export type VehicleType = 'bike' | 'moped' | 'car'

/**
 * @deprecated For live navigation use `useNavigationSettingsStore.getState().directionsMode` instead.
 * Vehicle type no longer maps to bicycling automatically (avoids "Walk your bicycle" in turn-by-turn).
 */
export function getTravelModeByVehicle(_vehicleType: VehicleType, _role: 'courier' | 'taxi' | null): TravelMode {
  return useNavigationSettingsStore.getState().directionsMode
}

export interface RouteStep {
  instruction: string
  distanceText: string
  durationText: string
  /** Meters for this step (Google distance.value). */
  distanceMeters: number
  durationSeconds: number
  /** Google maneuver hint, e.g. turn-left, turn-right */
  maneuver?: string
  /** Decoded points for this step (when available) for distance-to-turn. */
  polylinePoints?: { latitude: number; longitude: number }[]
}

export interface DirectionsResult {
  polylinePoints: { latitude: number; longitude: number }[]
  distanceText: string
  durationText: string
  /** Total leg duration in seconds (Google duration.value). */
  durationSecondsTotal: number
  steps: RouteStep[]
}

// ── Polyline decoder (Google encoded polyline algorithm) ──────────────────────
export function decodePolyline(encoded: string | null | undefined): { latitude: number; longitude: number }[] {
  if (encoded == null || typeof encoded !== 'string' || encoded.replace(/\s/g, '') === '') {
    console.warn('[DriveMind] decodePolyline: empty or missing encoded string; returning no points')
    return []
  }
  const clean = encoded.replace(/\s/g, '')
  const points: { latitude: number; longitude: number }[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < clean.length) {
    let shift = 0
    let result = 0
    let byte: number

    do {
      byte = clean.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    lat += result & 1 ? ~(result >> 1) : result >> 1

    shift = 0
    result = 0

    do {
      byte = clean.charCodeAt(index++) - 63
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
  _mode: TravelMode = 'driving',
): Promise<DirectionsResult> {
  assertValidCoord(originLat, originLng, 'origin')
  assertValidCoord(destLat, destLng, 'destination')

  const nav = useNavigationSettingsStore.getState()
  const lang = useLanguageStore.getState().language === 'pl' ? 'pl' : 'en'
  /** Single source of truth — default driving so HUD never shows walking/bicycle steps unless user enables bicycling in settings */
  const mode: TravelMode = nav.directionsMode

  if (DIRECTIONS_PROXY_URL) {
    const proxyResponse = await fetch(DIRECTIONS_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destLat, lng: destLng },
        mode,
        language: lang,
        avoidTolls: nav.avoidTolls,
        trafficAware: nav.trafficAware,
      }),
    })
    const proxyText = await proxyResponse.text()
    console.log('[DriveMind] RAW PROXY RESPONSE:', proxyText.slice(0, 4000))
    let proxyJson: any
    try {
      proxyJson = JSON.parse(proxyText)
    } catch {
      throw new Error(`[DriveMind] Directions proxy returned non-JSON (HTTP ${proxyResponse.status})`)
    }
    if (!proxyResponse.ok) {
      throw new Error(
        `[DriveMind] Directions proxy HTTP error: ${proxyResponse.status} — ${proxyText.slice(0, 500)}`,
      )
    }
    if (Array.isArray(proxyJson.polylinePoints)) {
      const steps = (proxyJson.steps ?? []) as RouteStep[]
      return {
        polylinePoints: proxyJson.polylinePoints,
        distanceText: proxyJson.distanceText ?? '',
        durationText: proxyJson.durationText ?? '',
        durationSecondsTotal: typeof proxyJson.durationSecondsTotal === 'number' ? proxyJson.durationSecondsTotal : 0,
        steps,
      }
    }
  }

  if (!GMAPS_API_KEY || GMAPS_API_KEY === 'your_key_here') {
    throw new Error('[DriveMind] Directions API is not configured. Set EXPO_PUBLIC_DIRECTIONS_PROXY_URL or EXPO_PUBLIC_GOOGLE_MAPS_KEY.')
  }
  console.warn('[DriveMind] Using client-side Directions API key. Prefer EXPO_PUBLIC_DIRECTIONS_PROXY_URL to avoid key exposure.')
  console.log(
    '[DriveMind] Using Key ending in:',
    GMAPS_API_KEY.length >= 4 ? GMAPS_API_KEY.slice(-4) : `(len ${GMAPS_API_KEY.length})`,
  )

  const url = new URL('https://maps.googleapis.com/maps/api/directions/json')
  url.searchParams.set('origin', `${coordToken(originLat)},${coordToken(originLng)}`)
  url.searchParams.set('destination', `${coordToken(destLat)},${coordToken(destLng)}`)
  url.searchParams.set('mode', mode)
  url.searchParams.set('language', lang)
  if (nav.avoidTolls) {
    url.searchParams.set('avoid', 'tolls')
  }
  if (nav.trafficAware && mode === 'driving') {
    url.searchParams.set('departure_time', String(Math.floor(Date.now() / 1000)))
  }
  url.searchParams.set('key', GMAPS_API_KEY)

  const sanitized =
    `${url.origin}${url.pathname}?` +
    [...url.searchParams.entries()]
      .map(([k, v]) => (k === 'key' ? `${k}=***` : `${k}=${v}`))
      .join('&')
  console.log('[DriveMind] Directions GET (sanitized):', sanitized)

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  const responseText = await response.text()
  console.log('[DriveMind] RAW GOOGLE RESPONSE:', responseText.slice(0, 4000))

  let json: { status?: string; error_message?: string; routes?: any[] }
  try {
    json = JSON.parse(responseText) as typeof json
  } catch (e) {
    throw new Error(`[DriveMind] Directions API returned non-JSON (${String(e)}). First bytes: ${responseText.slice(0, 200)}`)
  }

  if (!response.ok) {
    throw new Error(
      `[DriveMind] Directions API HTTP ${response.status} — ${json.error_message ?? responseText.slice(0, 500)}`,
    )
  }

  if (json.status !== 'OK') {
    throw new Error(`[DriveMind] Directions API error: ${json.status} — ${json.error_message ?? ''}`)
  }

  const route = json.routes?.[0]
  const leg = route?.legs?.[0]
  const encoded = route?.overview_polyline?.points
  if (!leg) {
    throw new Error('[DriveMind] Directions API: missing legs in response')
  }

  const polylinePoints = decodePolyline(encoded)
  if (polylinePoints.length === 0) {
    console.warn('[DriveMind] overview_polyline decoded to 0 points; map may not show a route')
  }

  const rawSteps = (leg.steps as any[]) ?? []
  const steps: RouteStep[] = rawSteps.map((step) => {
    const pts = step.polyline?.points ? decodePolyline(step.polyline.points) : undefined
    return {
      instruction: stripHtml(step.html_instructions ?? ''),
      distanceText: step.distance?.text ?? '',
      durationText: step.duration?.text ?? '',
      distanceMeters: typeof step.distance?.value === 'number' ? step.distance.value : 0,
      durationSeconds: typeof step.duration?.value === 'number' ? step.duration.value : 0,
      maneuver: typeof step.maneuver === 'string' ? step.maneuver : undefined,
      polylinePoints: pts && pts.length > 0 ? pts : undefined,
    }
  })

  const durationSecondsTotal =
    typeof leg.duration?.value === 'number' ? leg.duration.value : 0

  return {
    polylinePoints,
    distanceText: leg.distance?.text ?? '',
    durationText: leg.duration?.text ?? '',
    durationSecondsTotal,
    steps,
  }
}
