/**
 * Expo config plugin: copies canonical DriveMind Android native sources into the
 * prebuild `android/` tree so EAS Build preserves custom Kotlin + a11y XML even
 * when `mobile/android/` is gitignored locally.
 *
 * Source of truth: `mobile/drivemind-native/`
 */
const {
  withAndroidManifest,
  withDangerousMod,
  createRunOncePlugin,
} = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const PKG_ROOT = path.join(__dirname, '..')
const NATIVE_SRC = path.join(PKG_ROOT, 'drivemind-native')

const DRIVEMIND_GRADLE_DEPS = [
  'implementation("androidx.dynamicanimation:dynamicanimation:1.0.0")',
  'implementation("com.google.android.gms:play-services-maps:19.1.0")',
  "implementation platform('com.google.firebase:firebase-bom:34.14.0')",
  "implementation 'com.google.firebase:firebase-firestore'",
]

const GOOGLE_SERVICES_CLASSPATH = "classpath('com.google.gms:google-services:4.4.2')"

const DRIVER_PACKAGES = [
  'com.ubercab.driver',
  'com.bolt.driver',
  'ee.mtakso.driver',
  'com.bolt.delivery',
  'com.glovoapp.courier',
  'com.wolt.courier.android',
  'com.wolt.handler',
  'pl.pyszne',
  'com.justeattakeaway.courier',
  'com.guessxx.mock.uber',
  'com.guessxx.mock.bolt',
  'com.guessxx.mock.boltfood',
  'com.guessxx.krakowmocks',
]

const DRIVEMIND_PERMISSIONS = ['android.permission.PACKAGE_USAGE_STATS']
const DEFAULT_ANDROID_PACKAGE = 'com.guessxx.drivemind'

function envTrim(key) {
  return (process.env[key] ?? '').trim()
}

/**
 * Writes android/app/google-services.json from EXPO_PUBLIC_FIREBASE_* when missing.
 * Does not overwrite an existing file (e.g. downloaded from Firebase Console).
 */
function ensureGoogleServicesJson(appDir, packageName) {
  const destPath = path.join(appDir, 'google-services.json')
  if (fs.existsSync(destPath)) {
    return true
  }

  const apiKey = envTrim('EXPO_PUBLIC_FIREBASE_API_KEY')
  const projectId = envTrim('EXPO_PUBLIC_FIREBASE_PROJECT_ID')
  const appId = envTrim('EXPO_PUBLIC_FIREBASE_APP_ID')
  const senderId = envTrim('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID')
  const storageBucket = envTrim('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET')

  if (!apiKey || !projectId || !appId || !senderId) {
    console.warn(
      '[with-drivemind-native] google-services.json not written — set EXPO_PUBLIC_FIREBASE_* in .env (see .env.example)',
    )
    return false
  }

  const webClientId = envTrim('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID')
  const oauthClient = webClientId ? [{ client_id: webClientId, client_type: 3 }] : []

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
            package_name: packageName,
          },
        },
        oauth_client: oauthClient,
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
  return true
}

/** Overlay spring animation + MapsInitializer need app-level deps (not api-transitive from RN Maps). */
const FIREBASE_GRADLE_DEPS = [
  "implementation platform('com.google.firebase:firebase-bom:34.14.0')",
  "implementation 'com.google.firebase:firebase-firestore'",
]

function ensureDriveMindGradleDeps(gradlePath, hasGoogleServices = true) {
  let gradle = fs.readFileSync(gradlePath, 'utf8')
  let changed = false
  const deps = hasGoogleServices
    ? DRIVEMIND_GRADLE_DEPS
    : DRIVEMIND_GRADLE_DEPS.filter((dep) => !FIREBASE_GRADLE_DEPS.includes(dep))
  for (const dep of deps) {
    if (gradle.includes(dep)) continue
    const anchor = 'implementation("com.facebook.react:react-android")'
    if (!gradle.includes(anchor)) continue
    gradle = gradle.replace(anchor, `${anchor}\n    ${dep}`)
    changed = true
  }
  if (changed) fs.writeFileSync(gradlePath, gradle, 'utf8')
}

function ensureGoogleServicesPlugin(rootGradlePath, appGradlePath, googleServicesJsonPath) {
  if (!googleServicesJsonPath || !fs.existsSync(googleServicesJsonPath)) {
    console.warn(
      '[with-drivemind-native] Skipping google-services Gradle plugin — google-services.json is missing',
    )
    return
  }

  if (fs.existsSync(rootGradlePath)) {
    let rootGradle = fs.readFileSync(rootGradlePath, 'utf8')
    if (!rootGradle.includes('com.google.gms:google-services')) {
      const kotlinAnchor = "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')"
      if (rootGradle.includes(kotlinAnchor)) {
        rootGradle = rootGradle.replace(
          kotlinAnchor,
          `${kotlinAnchor}\n    ${GOOGLE_SERVICES_CLASSPATH}`,
        )
        fs.writeFileSync(rootGradlePath, rootGradle, 'utf8')
      }
    }
  }

  if (!fs.existsSync(appGradlePath)) return
  let appGradle = fs.readFileSync(appGradlePath, 'utf8')
  if (!appGradle.includes('com.google.gms.google-services')) {
    const pluginAnchor = 'apply plugin: "com.facebook.react"'
    if (appGradle.includes(pluginAnchor)) {
      appGradle = appGradle.replace(
        pluginAnchor,
        `${pluginAnchor}\napply plugin: "com.google.gms.google-services"`,
      )
      fs.writeFileSync(appGradlePath, appGradle, 'utf8')
    }
  }
}

/** Ensures accessibility_service_description exists in the app strings.xml (AAPT link). */
function mergeAccessibilityString(srcPath, destPath) {
  const src = fs.readFileSync(srcPath, 'utf8')
  const match = src.match(
    /<string name="accessibility_service_description">([\s\S]*?)<\/string>/,
  )
  if (!match) return
  const entry = `<string name="accessibility_service_description">${match[1]}</string>`
  if (!fs.existsSync(destPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true })
    fs.writeFileSync(destPath, `<resources>\n  ${entry}\n</resources>\n`, 'utf8')
    return
  }
  let dest = fs.readFileSync(destPath, 'utf8')
  if (dest.includes('name="accessibility_service_description"')) return
  dest = dest.replace('</resources>', `  ${entry}\n</resources>`)
  fs.writeFileSync(destPath, dest, 'utf8')
}

/**
 * Writes/updates android/gradle.properties to pin the release-minify setting.
 *
 * Why false?  Several Expo native modules use reflection patterns that R8's full
 * mode strips even with keep rules, causing hard-to-reproduce crashes on device.
 * Flip to `true` only after validating a release APK locally with `--no-minify`
 * removed.  The ProGuard keeps in proguard-rules.pro are kept comprehensive so
 * the switch is safe whenever we're ready.
 *
 * Keys managed by this function (idempotent — will not duplicate):
 *   android.enableMinifyInReleaseBuilds=false
 *   android.enableR8.fullMode=false
 */
function patchGradleProperties(gradlePropertiesPath) {
  const MANAGED_KEYS = {
    'android.enableMinifyInReleaseBuilds': 'false',
    'android.enableR8.fullMode': 'false',
  }

  let content = ''
  if (fs.existsSync(gradlePropertiesPath)) {
    content = fs.readFileSync(gradlePropertiesPath, 'utf8')
  }

  let changed = false
  for (const [key, value] of Object.entries(MANAGED_KEYS)) {
    const regex = new RegExp(`^${key.replace('.', '\\.')}\\s*=.*$`, 'm')
    const line = `${key}=${value}`
    if (regex.test(content)) {
      const updated = content.replace(regex, line)
      if (updated !== content) {
        content = updated
        changed = true
      }
    } else {
      content = content.trimEnd() + `\n# set by withDriveMindNative\n${line}\n`
      changed = true
    }
  }

  if (changed) {
    fs.mkdirSync(path.dirname(gradlePropertiesPath), { recursive: true })
    fs.writeFileSync(gradlePropertiesPath, content, 'utf8')
    console.log('[with-drivemind-native] patched gradle.properties: minify=false, R8.fullMode=false')
  }
}

const RELEASE_SIGNING_MARKER = '// DriveMind release signing (keystore.properties)'

/**
 * Wires android/app/build.gradle to sign release AAB/APK with Play upload key
 * from android/keystore.properties (not debug.keystore).
 */
function patchReleaseSigning(appGradlePath) {
  if (!fs.existsSync(appGradlePath)) return
  let gradle = fs.readFileSync(appGradlePath, 'utf8')
  if (gradle.includes(RELEASE_SIGNING_MARKER)) return

  const keystoreBlock = `
${RELEASE_SIGNING_MARKER} — Play upload key, NOT debug.
def drivemindKeystorePropertiesFile = rootProject.file("keystore.properties")
def drivemindKeystoreProperties = new Properties()
if (drivemindKeystorePropertiesFile.exists()) {
    drivemindKeystoreProperties.load(new FileInputStream(drivemindKeystorePropertiesFile))
}
`

  const jscIdx = gradle.indexOf('def jscFlavor = ')
  if (jscIdx === -1) {
    console.warn('[with-drivemind-native] patchReleaseSigning: jscFlavor anchor not found')
    return
  }
  const insertAt = gradle.indexOf('\n', jscIdx) + 1
  gradle = gradle.slice(0, insertAt) + keystoreBlock + gradle.slice(insertAt)

  gradle = gradle.replace(
    /(signingConfigs \{\s*\n\s*debug \{[\s\S]*?\n\s*\})/,
    `$1
        release {
            if (drivemindKeystorePropertiesFile.exists()) {
                storeFile file(drivemindKeystoreProperties['storeFile'])
                storePassword drivemindKeystoreProperties['storePassword']
                keyAlias drivemindKeystoreProperties['keyAlias']
                keyPassword drivemindKeystoreProperties['keyPassword']
            }
        }`,
  )

  gradle = gradle.replace(
    /(buildTypes \{\s*debug \{[\s\S]*?\}\s*release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
    `$1signingConfig drivemindKeystorePropertiesFile.exists()
                ? signingConfigs.release
                : signingConfigs.debug`,
  )

  const taskGraphGuard = `
gradle.taskGraph.whenReady { graph ->
    def releaseTasks = [':app:bundleRelease', ':app:assembleRelease']
    if (releaseTasks.any { graph.hasTask(it) } && !drivemindKeystorePropertiesFile.exists()) {
        throw new GradleException(
            "Missing android/keystore.properties — Play upload AAB/APK requires the upload key. " +
            "See mobile/docs/keystore.properties.example"
        )
    }
}
`
  if (!gradle.includes('gradle.taskGraph.whenReady')) {
    const androidBlockEnd = gradle.indexOf('\n}\n\n// Apply static values')
    if (androidBlockEnd !== -1) {
      gradle =
        gradle.slice(0, androidBlockEnd + 2) + taskGraphGuard + gradle.slice(androidBlockEnd + 2)
    }
  }

  fs.writeFileSync(appGradlePath, gradle, 'utf8')
  console.log('[with-drivemind-native] patched app/build.gradle: release signing via keystore.properties')
}

/** Appends DriveMind ProGuard keeps if not already present. */
function mergeProguardRules(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) return
  const src = fs.readFileSync(srcPath, 'utf8').trim()
  if (!src) return
  const marker = '# DriveMind native services'
  if (fs.existsSync(destPath)) {
    const dest = fs.readFileSync(destPath, 'utf8')
    if (dest.includes(marker) || dest.includes('DriveMindScraperService')) return
    fs.appendFileSync(destPath, `\n\n${src}\n`, 'utf8')
    return
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, `${src}\n`, 'utf8')
}

function copyDirFiles(srcDir, destDir, ext) {
  if (!fs.existsSync(srcDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  for (const name of fs.readdirSync(srcDir)) {
    if (ext && !name.endsWith(ext)) continue
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name))
  }
}

function ensureArray(node) {
  if (!node) return []
  return Array.isArray(node) ? node : [node]
}

function hasPermission(manifest, name) {
  return ensureArray(manifest['uses-permission']).some(
    (entry) => entry.$?.['android:name'] === name,
  )
}

function addPermission(manifest, name) {
  if (hasPermission(manifest, name)) return
  if (!manifest['uses-permission']) manifest['uses-permission'] = []
  const perms = ensureArray(manifest['uses-permission'])
  perms.push({ $: { 'android:name': name } })
  manifest['uses-permission'] = perms
}

function hasQueryPackage(queries, packageName) {
  return ensureArray(queries.package).some(
    (entry) => entry.$?.['android:name'] === packageName,
  )
}

function addQueryPackages(manifest) {
  if (!manifest.queries) manifest.queries = [{}]
  const queries = ensureArray(manifest.queries)[0]
  if (!queries.package) queries.package = []
  const packages = ensureArray(queries.package)
  for (const pkg of DRIVER_PACKAGES) {
    if (!hasQueryPackage(queries, pkg)) {
      packages.push({ $: { 'android:name': pkg } })
    }
  }
  queries.package = packages
  manifest.queries = [queries]
}

function hasService(application, serviceName) {
  return ensureArray(application.service).some(
    (entry) => entry.$?.['android:name'] === serviceName,
  )
}

function addDriveMindServices(application) {
  if (!application.service) application.service = []
  const services = ensureArray(application.service)

  if (!hasService(application, '.DriveMindScraperService')) {
    services.push({
      $: {
        'android:name': '.DriveMindScraperService',
        'android:exported': 'true',
        'android:permission': 'android.permission.BIND_ACCESSIBILITY_SERVICE',
        'android:label': '@string/app_name',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.accessibilityservice.AccessibilityService' } }],
        },
      ],
      'meta-data': [
        {
          $: {
            'android:name': 'android.accessibilityservice',
            'android:resource': '@xml/accessibility_service_config',
          },
        },
      ],
    })
  }

  if (!hasService(application, '.DriveMindNotificationService')) {
    services.push({
      $: {
        'android:name': '.DriveMindNotificationService',
        'android:exported': 'true',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.service.notification.NotificationListenerService',
              },
            },
          ],
        },
      ],
    })
  }

  application.service = services
}

const MANIFEST_REQUIRED_TOKENS = [
  'DriveMindScraperService',
  'BIND_ACCESSIBILITY_SERVICE',
  'DriveMindNotificationService',
  'BIND_NOTIFICATION_LISTENER_SERVICE',
  'accessibility_service_config',
]

function getOrCreateApplication(manifest) {
  if (!manifest.application) {
    manifest.application = []
  }
  const apps = ensureArray(manifest.application)
  if (!apps[0]) {
    apps.push({ $: { 'android:name': '.MainApplication' } })
    manifest.application = apps
  }
  return apps[0]
}

/** Validates merged manifest JSON (in-memory modResults), not the on-disk file. */
function assertManifestModResults(manifest) {
  const application = ensureArray(manifest.application)[0]
  if (!application) {
    throw new Error('[with-drivemind-native] AndroidManifest has no <application> node')
  }
  const xml = JSON.stringify(application)
  const missing = MANIFEST_REQUIRED_TOKENS.filter((token) => !xml.includes(token))
  if (missing.length > 0) {
    throw new Error(
      `[with-drivemind-native] AndroidManifest modResults missing required entries: ${missing.join(', ')}`,
    )
  }
}

function withDriveMindAndroidManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest
    for (const perm of DRIVEMIND_PERMISSIONS) {
      addPermission(manifest, perm)
    }
    addQueryPackages(manifest)

    const application = getOrCreateApplication(manifest)
    addDriveMindServices(application)
    assertManifestModResults(manifest)

    return cfg
  })
}

/**
 * Dangerous mod runs before Expo writes manifest modResults to disk — patch the template
 * file so intermediate tooling and post-prebuild inspection see DriveMind services.
 */
function patchManifestOnDisk(manifestPath) {
  if (!fs.existsSync(manifestPath)) return
  let xml = fs.readFileSync(manifestPath, 'utf8')
  if (xml.includes('DriveMindScraperService')) return

  if (!xml.includes('xmlns:tools=') && !xml.includes('xmlns:tools="')) {
    xml = xml.replace('<manifest ', '<manifest xmlns:tools="http://schemas.android.com/tools" ')
  }

  if (!xml.includes('android.permission.PACKAGE_USAGE_STATS')) {
    const perm =
      '  <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions"/>\n'
    xml = xml.replace('<application ', `${perm}<application `)
  }

  for (const pkg of DRIVER_PACKAGES) {
    if (!xml.includes(`android:name="${pkg}"`)) {
      const tag = `    <package android:name="${pkg}"/>\n`
      if (xml.includes('<queries>')) {
        xml = xml.replace('</queries>', `${tag}  </queries>`)
      } else {
        xml = xml.replace('<application ', `<queries>\n${tag}  </queries>\n  <application `)
      }
    }
  }

  const services = `
    <service android:name=".DriveMindScraperService" android:exported="true" android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE" android:label="@string/app_name">
      <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService"/>
      </intent-filter>
      <meta-data android:name="android.accessibilityservice" android:resource="@xml/accessibility_service_config"/>
    </service>
    <service android:name=".DriveMindNotificationService" android:exported="true" android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE">
      <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService"/>
      </intent-filter>
    </service>
`

  xml = xml.replace('</application>', `${services}  </application>`)
  fs.writeFileSync(manifestPath, xml, 'utf8')
}

function withDriveMindNative(config) {
  config = withDriveMindAndroidManifest(config)

  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot
      const kotlinDest = path.join(
        projectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'guessxx',
        'drivemind',
      )
      const kotlinSrc = path.join(NATIVE_SRC, 'java', 'com', 'guessxx', 'drivemind')
      copyDirFiles(kotlinSrc, kotlinDest, '.kt')

      const xmlSrc = path.join(NATIVE_SRC, 'res', 'xml', 'accessibility_service_config.xml')
      const xmlDest = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml', 'accessibility_service_config.xml')
      if (fs.existsSync(xmlSrc)) {
        fs.mkdirSync(path.dirname(xmlDest), { recursive: true })
        fs.copyFileSync(xmlSrc, xmlDest)
      }

      const stringsSrc = path.join(NATIVE_SRC, 'res', 'values', 'strings.xml')
      const stringsDest = path.join(projectRoot, 'app', 'src', 'main', 'res', 'values', 'strings.xml')
      if (fs.existsSync(stringsSrc)) {
        mergeAccessibilityString(stringsSrc, stringsDest)
      }

      const appDir = path.join(projectRoot, 'app')
      const packageName = cfg.android?.package ?? DEFAULT_ANDROID_PACKAGE
      const hasGoogleServices = ensureGoogleServicesJson(appDir, packageName)

      const rootGradle = path.join(projectRoot, 'build.gradle')
      const appGradle = path.join(appDir, 'build.gradle')
      ensureGoogleServicesPlugin(rootGradle, appGradle, path.join(appDir, 'google-services.json'))
      if (fs.existsSync(appGradle)) {
        ensureDriveMindGradleDeps(appGradle, hasGoogleServices)
        patchReleaseSigning(appGradle)
      }

      const proguardSrc = path.join(NATIVE_SRC, 'proguard-rules.pro')
      const proguardDest = path.join(projectRoot, 'app', 'proguard-rules.pro')
      mergeProguardRules(proguardSrc, proguardDest)

      const gradlePropertiesPath = path.join(projectRoot, 'gradle.properties')
      patchGradleProperties(gradlePropertiesPath)

      const manifestPath = path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml')
      patchManifestOnDisk(manifestPath)

      return cfg
    },
  ])
}

module.exports = createRunOncePlugin(withDriveMindNative, 'with-drivemind-native', '2.0.3')
