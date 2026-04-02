// app.config.js reads environment variables and merges them into the Expo
// config at prebuild / EAS build time. The static app.json is the base.
const base = require('./app.json')

module.exports = ({ config }) => {
  const merged = { ...config, ...base.expo }
  return {
    ...merged,
    extra: {
      ...(merged.extra || {}),
      /** Socket.io / API base; also set EXPO_PUBLIC_BACKEND_URL for Metro. */
      backendUrl: process.env.EXPO_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? '',
    },
    android: {
      ...merged.android,
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? '',
        },
      },
    },
  }
}
