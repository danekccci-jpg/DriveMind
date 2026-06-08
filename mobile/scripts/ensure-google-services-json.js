/**
 * Writes android/app/google-services.json from EXPO_PUBLIC_FIREBASE_* (.env).
 * Run after prebuild or before assembleRelease if the file is missing:
 *   node ./scripts/ensure-google-services-json.js
 */
const fs = require('fs')
const path = require('path')

require('@expo/env').load(path.join(__dirname, '..'), { force: true })

const MOBILE_ROOT = path.join(__dirname, '..')
const APP_DIR = path.join(MOBILE_ROOT, 'android', 'app')
const DEFAULT_PACKAGE = 'com.guessxx.drivemind'

function envTrim(key) {
  return (process.env[key] ?? '').trim()
}

function readPackageName() {
  try {
    const appJson = JSON.parse(fs.readFileSync(path.join(MOBILE_ROOT, 'app.json'), 'utf8'))
    return appJson?.expo?.android?.package ?? DEFAULT_PACKAGE
  } catch {
    return DEFAULT_PACKAGE
  }
}

function main() {
  if (!fs.existsSync(APP_DIR)) {
    console.error('[DriveMind] android/app not found — run `npx expo prebuild --platform android` first')
    process.exit(1)
  }

  const destPath = path.join(APP_DIR, 'google-services.json')
  if (fs.existsSync(destPath)) {
    console.log('[DriveMind] google-services.json already exists:', destPath)
    return
  }

  const apiKey = envTrim('EXPO_PUBLIC_FIREBASE_API_KEY')
  const projectId = envTrim('EXPO_PUBLIC_FIREBASE_PROJECT_ID')
  const appId = envTrim('EXPO_PUBLIC_FIREBASE_APP_ID')
  const senderId = envTrim('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')
  const storageBucket = envTrim('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET')
  const webClientId = envTrim('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID')

  if (!apiKey || !projectId || !appId || !senderId) {
    console.error('[DriveMind] Missing EXPO_PUBLIC_FIREBASE_* in .env — see .env.example')
    process.exit(1)
  }

  const payload = {
    project_info: {
      project_number: senderId,
      project_id: projectId,
      storage_bucket: storageBucket || `${projectId}.firebasestorage.app`,
    },
    client: [
      {
        client_info: {
          mobilesdk_app_id: appId,
          android_client_info: {
            package_name: readPackageName(),
          },
        },
        oauth_client: webClientId ? [{ client_id: webClientId, client_type: 3 }] : [],
        api_key: [{ current_key: apiKey }],
        services: {
          appinvite_service: {
            other_platform_oauth_client: [],
          },
        },
      },
    ],
    configuration_version: '1',
  }

  fs.writeFileSync(destPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  console.log('[DriveMind] Wrote', destPath)
}

main()
