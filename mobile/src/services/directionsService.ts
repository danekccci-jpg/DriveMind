import { useNavigationSettingsStore } from '../store/navigationSettingsStore'
import { useLanguageStore } from '../store/languageStore'
import { getGoogleMapsApiKey } from '../utils/googleMapsConfig'
import { devLog, devWarn } from '../utils/devLog'
const DIRECTIONS_PROXY_URL = (process.env.EXPO_PUBLIC_DIRECTIONS_PROXY_URL ?? '').trim()

/** Google Routes language code from DriveMind UI language. */
export function googleDirectionsLanguage(): string {
  const l = useLanguageStore.getState().language
  if (l === 'pl') return 'pl'
  if (l === 'uk') return 'uk'
  if (l === 'ru') return 'ru'
  return 'en'
}

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
    devWarn('[DriveMind] decodePolyline: empty or missing encoded string; returning no points')
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
  const lang = googleDirectionsLanguage()
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
    devLog('[DriveMind] RAW PROXY RESPONSE:', proxyText.slice(0, 4000))
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

  const key = getGoogleMapsApiKey()
  if (!key || key === 'your_key_here') {
    throw new Error(
      '[DriveMind] Directions API is not configured. Set EXPO_PUBLIC_DIRECTIONS_PROXY_URL or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY (or legacy EXPO_PUBLIC_GOOGLE_MAPS_KEY).',
    )
  }
  devWarn('[DriveMind] Using client-side Routes API key. Prefer EXPO_PUBLIC_DIRECTIONS_PROXY_URL to avoid key exposure.')

  // ── Routes API v2 (POST) ──────────────────────────────────────────────────
  // Replaces the legacy Directions GET API.  The field mask intentionally omits
  // step-level detail because Routes v2 step instructions require the
  // routes.legs.steps.navigationInstruction field which has a separate billing
  // SKU.  We decode the overview polyline and surface a single progress step.
  const routesApiMode = mode === 'bicycling' ? 'BICYCLE' : 'DRIVE'
  const routingPreference = (nav.trafficAware && mode !== 'bicycling')
    ? 'TRAFFIC_AWARE'
    : 'TRAFFIC_UNAWARE'

  const body = {
    origin: {
      location: { latLng: { latitude: originLat, longitude: originLng } },
    },
    destination: {
      location: { latLng: { latitude: destLat, longitude: destLng } },
    },
    travelMode: routesApiMode,
    routingPreference,
    ...(nav.avoidTolls ? { routeModifiers: { avoidTolls: true } } : {}),
    languageCode: lang,
    computeAlternativeRoutes: false,
  }

  devLog('[DriveMind] Routes API POST body:', JSON.stringify(body).slice(0, 400))

  const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
    },
    body: JSON.stringify(body),
  })

  const responseText = await response.text()
  devLog('[DriveMind] RAW ROUTES API RESPONSE:', responseText.slice(0, 4000))

  let json: { routes?: any[]; error?: { message?: string; status?: string } }
  try {
    json = JSON.parse(responseText) as typeof json
  } catch (e) {
    throw new Error(`[DriveMind] Routes API returned non-JSON (${String(e)}). First bytes: ${responseText.slice(0, 200)}`)
  }

  if (!response.ok) {
    throw new Error(
      `[DriveMind] Routes API HTTP ${response.status} — ${json.error?.message ?? responseText.slice(0, 500)}`,
    )
  }

  const route = json.routes?.[0]
  if (!route) {
    throw new Error('[DriveMind] Routes API: no route returned')
  }

  const encoded: string | undefined = route.polyline?.encodedPolyline
  const polylinePoints = decodePolyline(encoded)
  if (polylinePoints.length === 0) {
    devWarn('[DriveMind] Routes API: encodedPolyline decoded to 0 points; map may not show a route')
  }

  // Routes v2 returns duration as a string like "123s"
  const rawDuration: string | undefined = route.duration
  const durationSecondsTotal = rawDuration
    ? parseInt(rawDuration.replace(/[^0-9]/g, ''), 10) || 0
    : 0
  const distanceMeters: number = typeof route.distanceMeters === 'number' ? route.distanceMeters : 0

  // Format human-readable strings (Routes v2 does not return text labels in the
  // minimal field mask — we compute them locally to avoid billing extra fields).
  const distanceKmVal = distanceMeters / 1000
  const distanceText =
    distanceKmVal >= 1
      ? `${distanceKmVal.toFixed(1)} km`
      : `${distanceMeters} m`

  const totalMin = Math.round(durationSecondsTotal / 60)
  const durationText =
    totalMin >= 60
      ? `${Math.floor(totalMin / 60)} h ${totalMin % 60} min`
      : `${totalMin} min`

  // Routes v2 step instructions require an extra field mask SKU — we surface a
  // single synthetic step from the route summary so HUD distance/ETA still work.
  const steps: RouteStep[] = [
    {
      instruction: '',
      distanceText,
      durationText,
      distanceMeters,
      durationSeconds: durationSecondsTotal,
      maneuver: undefined,
      polylinePoints: polylinePoints.length > 0 ? polylinePoints : undefined,
    },
  ]

  return {
    polylinePoints,
    distanceText,
    durationText,
    durationSecondsTotal,
    steps,
  }
}

function formatCoordFallback(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

/**
 * Reverse-geocode a point to a formatted address (Google Geocoding API).
 * Falls back to compact lat,lng when the key is missing or the request fails.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  assertValidCoord(lat, lng, 'geocode')

  const lang = googleDirectionsLanguage()

  const geoKey = getGoogleMapsApiKey()
  if (!geoKey || geoKey === 'your_key_here') {
    return formatCoordFallback(lat, lng)
  }

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json')
  url.searchParams.set('latlng', `${coordToken(lat)},${coordToken(lng)}`)
  url.searchParams.set('key', geoKey)
  url.searchParams.set('language', lang)

  try {
    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
    const text = await response.text()
    let json: { status?: string; results?: { formatted_address?: string }[] }
    try {
      json = JSON.parse(text) as typeof json
    } catch {
      return formatCoordFallback(lat, lng)
    }
    if (json.status === 'OK' && json.results?.[0]?.formatted_address) {
      return json.results[0].formatted_address as string
    }
  } catch (e) {
    devWarn('[DriveMind] reverseGeocode failed', e)
  }
  return formatCoordFallback(lat, lng)
}
