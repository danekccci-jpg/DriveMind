// app.config.js reads environment variables and merges them into the Expo
// config at prebuild / EAS build time. The static app.json is the base.
//
// @expo/env: Metro/Gradle must run with NODE_ENV set (development | production | test).
// If NODE_ENV is unset, only .env and .env.local load — not .env.production — and
// EXPO_PUBLIC_* keys may be missing during release bundles. Use EAS env or
// `npm run android:release` / `cross-env NODE_ENV=production ...` for local APK builds.
const base = require('./app.json')

function envTrim(key) {
  return (process.env[key] ?? '').trim()
}

function googleIosUrlScheme(webClientId) {
  if (!webClientId) return ''
  const prefix = webClientId.replace(/\.apps\.googleusercontent\.com$/i, '')
  return prefix ? `com.googleusercontent.apps.${prefix}` : ''
}

function withGoogleSignInPlugin(plugins, iosUrlScheme) {
  if (!iosUrlScheme) return plugins
  return (plugins ?? []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === '@react-native-google-signin/google-signin') {
      return [plugin[0], { ...(plugin[1] ?? {}), iosUrlScheme }]
    }
    return plugin
  })
}

module.exports = ({ config }) => {
  const merged = { ...config, ...base.expo }

  const mapsKey =
    envTrim('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY') || envTrim('EXPO_PUBLIC_GOOGLE_MAPS_KEY')

  const webClientId = envTrim('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID')
  const iosUrlScheme = googleIosUrlScheme(webClientId)

  const firebase = {
    apiKey: envTrim('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: envTrim('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: envTrim('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: envTrim('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: envTrim('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: envTrim('EXPO_PUBLIC_FIREBASE_APP_ID'),
  }

  const dataConnectDefaults = merged.extra?.dataConnect ?? {}
  const dataConnect = {
    serviceId: envTrim('EXPO_PUBLIC_DATA_CONNECT_SERVICE_ID') || dataConnectDefaults.serviceId || 'drivemind',
    connectorId: envTrim('EXPO_PUBLIC_DATA_CONNECT_CONNECTOR_ID') || dataConnectDefaults.connectorId || 'default',
    location: envTrim('EXPO_PUBLIC_DATA_CONNECT_LOCATION') || dataConnectDefaults.location || 'europe-central2',
  }

  return {
    ...merged,
    plugins: withGoogleSignInPlugin(merged.plugins, iosUrlScheme),
    extra: {
      ...(merged.extra || {}),
      /** Socket.io / API base; also set EXPO_PUBLIC_BACKEND_URL for Metro. */
      backendUrl: envTrim('EXPO_PUBLIC_BACKEND_URL') || envTrim('BACKEND_URL'),
      googleMapsApiKey: mapsKey,
      firebase,
      dataConnect,
      googleWebClientId: webClientId,
    },
    ios: {
      ...merged.ios,
      config: {
        ...(merged.ios?.config || {}),
        googleMapsApiKey: mapsKey,
      },
    },
    android: {
      ...merged.android,
      config: {
        ...(merged.android?.config || {}),
        googleMaps: {
          ...(merged.android?.config?.googleMaps || {}),
          apiKey: mapsKey,
        },
      },
    },
  }
}
