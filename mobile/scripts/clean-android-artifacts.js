/**
 * Removes Android build outputs so the next Gradle run cannot skip JS bundling
 * (createBundle*JsAndAssets stays up-to-date otherwise). Safe if android/ is missing.
 *
 * Also removes `.cxx` (CMake/ninja cache). Without this, `./gradlew clean` can fail on
 * Windows when codegen JNI folders were already deleted but CMake still references them.
 */
const fs = require('fs')
const path = require('path')

const mobileRoot = path.join(__dirname, '..')
const dirs = [
  path.join(mobileRoot, 'android', 'app', 'build'),
  path.join(mobileRoot, 'android', 'app', '.cxx'),
  path.join(mobileRoot, 'android', 'build'),
  path.join(mobileRoot, 'android', '.gradle'),
]

for (const d of dirs) {
  if (!fs.existsSync(d)) continue
  try {
    fs.rmSync(d, { recursive: true, force: true })
    console.log('[DriveMind] removed', path.relative(mobileRoot, d))
  } catch (error) {
    const rel = path.relative(mobileRoot, d)
    const isGradleCache = rel.replace(/\\/g, '/') === 'android/.gradle'
    if (isGradleCache && error && (error.code === 'EPERM' || error.code === 'EBUSY')) {
      console.warn(
        `[DriveMind] skipped ${rel} (locked by Gradle daemon). Run: cd android && gradlew --stop`,
      )
      continue
    }
    throw error
  }
}
