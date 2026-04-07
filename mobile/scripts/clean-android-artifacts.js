/**
 * Removes Android build outputs so the next Gradle run cannot skip JS bundling
 * (createBundle*JsAndAssets stays up-to-date otherwise). Safe if android/ is missing.
 */
const fs = require('fs')
const path = require('path')

const mobileRoot = path.join(__dirname, '..')
const dirs = [
  path.join(mobileRoot, 'android', 'app', 'build'),
  path.join(mobileRoot, 'android', '.gradle'),
]

for (const d of dirs) {
  if (!fs.existsSync(d)) continue
  fs.rmSync(d, { recursive: true, force: true })
  console.log('[DriveMind] removed', path.relative(mobileRoot, d))
}
