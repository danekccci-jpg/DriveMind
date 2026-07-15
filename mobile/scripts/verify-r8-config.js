/**
 * Fails fast before a Play upload build if R8 is not fully configured.
 */
const fs = require('fs')
const path = require('path')

const mobileRoot = path.join(__dirname, '..')
const gradlePropsPath = path.join(mobileRoot, 'android', 'gradle.properties')
const appGradlePath = path.join(mobileRoot, 'android', 'app', 'build.gradle')
const proguardPath = path.join(mobileRoot, 'android', 'app', 'proguard-rules.pro')

function readProp(content, key) {
  const match = content.match(new RegExp(`^${key.replace(/\./g, '\\.')}\\s*=\\s*(.+)$`, 'm'))
  return match ? match[1].trim() : null
}

if (!fs.existsSync(gradlePropsPath)) {
  console.error('[DriveMind] android/gradle.properties missing — run: npx expo prebuild --platform android')
  process.exit(1)
}

const gradleProps = fs.readFileSync(gradlePropsPath, 'utf8')
const minify = readProp(gradleProps, 'android.enableMinifyInReleaseBuilds')
const shrink = readProp(gradleProps, 'android.enableShrinkResourcesInReleaseBuilds')
const fullMode = readProp(gradleProps, 'android.enableR8.fullMode')
const bundleCompression = readProp(gradleProps, 'android.enableBundleCompression')
const optimizedShrink = readProp(gradleProps, 'android.r8.optimizedResourceShrinking')

const errors = []
if (minify !== 'true') {
  errors.push('android.enableMinifyInReleaseBuilds must be true')
}
if (shrink !== 'true') {
  errors.push('android.enableShrinkResourcesInReleaseBuilds must be true')
}
if (fullMode !== 'false') {
  errors.push('android.enableR8.fullMode must be false (full mode breaks React Native / Expo reflection)')
}
if (!fs.existsSync(proguardPath)) {
  errors.push('android/app/proguard-rules.pro is missing')
} else {
  const proguard = fs.readFileSync(proguardPath, 'utf8')
  if (/^-repackageclasses/m.test(proguard)) {
    errors.push('proguard-rules.pro must not use -repackageclasses (breaks manifest / JNI class lookups)')
  }
}
if (fs.existsSync(appGradlePath)) {
  const appGradle = fs.readFileSync(appGradlePath, 'utf8')
  if (!appGradle.includes('proguard-android-optimize.txt')) {
    errors.push('app/build.gradle must use proguard-android-optimize.txt (not proguard-android.txt)')
  }
} else {
  errors.push('android/app/build.gradle is missing')
}

if (errors.length > 0) {
  console.error('[DriveMind] R8 release config is NOT ready for Play upload:')
  errors.forEach((e) => console.error(`  - ${e}`))
  console.error('')
  console.error('Fix: npx expo prebuild --platform android --no-install')
  process.exit(1)
}

console.log('[DriveMind] R8 config OK (Play Console optimized)')
console.log(`  minify=${minify}, fullMode=${fullMode}, shrinkResources=${shrink}`)
console.log(`  optimizedResourceShrinking=${optimizedShrink ?? 'default'}, bundleCompression=${bundleCompression ?? 'default'}`)
console.log(`  proguard: proguard-android-optimize.txt + ${path.relative(mobileRoot, proguardPath)}`)
