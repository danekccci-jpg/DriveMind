/**
 * Google Maps / Directions / Geocoding API key from Expo public env.
 * Prefer EXPO_PUBLIC_GOOGLE_MAPS_API_KEY; EXPO_PUBLIC_GOOGLE_MAPS_KEY is legacy fallback.
 */
export function getGoogleMapsApiKey(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ??
    ''
  ).trim()
}
