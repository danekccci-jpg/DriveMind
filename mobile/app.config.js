// app.config.js reads environment variables and merges them into the Expo
// config at prebuild / EAS build time. The static app.json is the base.
const base = require('./app.json')

module.exports = ({ config }) => {
  const merged = { ...config, ...base.expo }

  const mapsKey =
    (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '').trim() ||
    (process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '').trim() ||
    merged.android?.config?.googleMaps?.apiKey ||
    merged.ios?.config?.googleMapsApiKey ||
    ''

  return {
    ...merged,
    extra: {
      ...(merged.extra || {}),
      /** Socket.io / API base; also set EXPO_PUBLIC_BACKEND_URL for Metro. */
      backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? '',
      googleMapsApiKey: mapsKey,
    },
    ios: {
      ...merged.ios,
      config: {
        ...(merged.ios?.config || {}),
        googleMapsApiKey: mapsKey || merged.ios?.config?.googleMapsApiKey,
      },
    },
    android: {
      ...merged.android,
      config: {
        ...(merged.android?.config || {}),
        googleMaps: {
          ...(merged.android?.config?.googleMaps || {}),
          apiKey: mapsKey || merged.android?.config?.googleMaps?.apiKey,
        },
      },
    },
  }
}
