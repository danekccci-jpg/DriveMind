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
  'com.bolt.delivery',
  'com.glovoapp.courier',
  'com.wolt.handler',
]

const DRIVEMIND_PERMISSIONS = ['android.permission.PACKAGE_USAGE_STATS']

/** Overlay spring animation + MapsInitializer need app-level deps (not api-transitive from RN Maps). */
function ensureDriveMindGradleDeps(gradlePath) {
  let gradle = fs.readFileSync(gradlePath, 'utf8')
  let changed = false
  for (const dep of DRIVEMIND_GRADLE_DEPS) {
    if (gradle.includes(dep)) continue
    const anchor = 'implementation("com.facebook.react:react-android")'
    if (!gradle.includes(anchor)) continue
    gradle = gradle.replace(anchor, `${anchor}\n    ${dep}`)
    changed = true
  }
  if (changed) fs.writeFileSync(gradlePath, gradle, 'utf8')
}

function ensureGoogleServicesPlugin(rootGradlePath, appGradlePath) {
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

function withDriveMindAndroidManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest
    for (const perm of DRIVEMIND_PERMISSIONS) {
      addPermission(manifest, perm)
    }
    addQueryPackages(manifest)

    const application = ensureArray(manifest.application)[0]
    if (application) {
      addDriveMindServices(application)
    }

    return cfg
  })
}

function assertManifestContainsServices(manifestPath) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `[with-drivemind-native] AndroidManifest.xml not found at ${manifestPath}`,
    )
  }
  const xml = fs.readFileSync(manifestPath, 'utf8')
  const required = [
    'DriveMindScraperService',
    'BIND_ACCESSIBILITY_SERVICE',
    'DriveMindNotificationService',
    'BIND_NOTIFICATION_LISTENER_SERVICE',
    'accessibility_service_config',
  ]
  const missing = required.filter((token) => !xml.includes(token))
  if (missing.length > 0) {
    throw new Error(
      `[with-drivemind-native] AndroidManifest missing required entries: ${missing.join(', ')}`,
    )
  }
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

      const rootGradle = path.join(projectRoot, 'build.gradle')
      const appGradle = path.join(projectRoot, 'app', 'build.gradle')
      ensureGoogleServicesPlugin(rootGradle, appGradle)
      if (fs.existsSync(appGradle)) {
        ensureDriveMindGradleDeps(appGradle)
      }

      const proguardSrc = path.join(NATIVE_SRC, 'proguard-rules.pro')
      const proguardDest = path.join(projectRoot, 'app', 'proguard-rules.pro')
      mergeProguardRules(proguardSrc, proguardDest)

      const manifestPath = path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml')
      assertManifestContainsServices(manifestPath)

      return cfg
    },
  ])
}

module.exports = createRunOncePlugin(withDriveMindNative, 'with-drivemind-native', '2.0.0')
