/**
 * Expo config plugin: regenerates Android adaptive launcher icons from DriveMind
 * symbol PNGs during every `expo prebuild` (and therefore every EAS Build).
 *
 * This replaces the need to run `npm run icons:android` manually before a release
 * build.  Because `mobile/android/` is gitignored, Expo regenerates that folder
 * from scratch on every EAS cloud build; without this plugin the device would show
 * the default Expo placeholder icons.
 *
 * Source assets (committed to git):
 *   mobile/assets/logo/logo-symbol-light.png   — foreground for day/light theme
 *   mobile/assets/logo/logo-symbol-dark.png    — foreground for night/dark theme
 *
 * Outputs written to {platformProjectRoot}/app/src/main/res/
 *   mipmap-{density}/ic_launcher_foreground.png  (adaptive layer)
 *   mipmap-{density}/ic_launcher.png             (legacy fallback)
 *   mipmap-{density}/ic_launcher_round.png       (legacy round fallback)
 *   mipmap-night-{density}/…                     (night-mode variants)
 *   values/colors.xml                            (iconBackground colour)
 *   values-night/colors.xml                      (night iconBackground colour)
 *
 * Safe-skips when source PNGs are absent (warns instead of failing) so the
 * plugin never breaks builds run against a skeleton checkout.
 */
const { withDangerousMod, createRunOncePlugin } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const BG_LIGHT = '#F5F5F7'
const BG_DARK = '#08101C'

/** Pixels at or below this RGB level are keyed out (removes black backplates). */
const BLACK_KEY_THRESHOLD = 28

/** Adaptive foreground layer sizes (dp × density scale, 108 dp base). */
const FOREGROUND_SIZES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
}

/** Legacy / fallback launcher icon sizes. */
const LEGACY_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

async function loadAlphaKeyed(sharp, source) {
  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const keyed = Buffer.from(data)
  for (let i = 0; i < keyed.length; i += 4) {
    const r = keyed[i]
    const g = keyed[i + 1]
    const b = keyed[i + 2]
    if (r <= BLACK_KEY_THRESHOLD && g <= BLACK_KEY_THRESHOLD && b <= BLACK_KEY_THRESHOLD) {
      keyed[i + 3] = 0
    }
  }
  return sharp(keyed, { raw: { width: info.width, height: info.height, channels: 4 } })
}

async function renderForeground(sharp, source, size) {
  const keyed = await loadAlphaKeyed(sharp, source)
  return keyed
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function renderLegacyComposite(sharp, source, size, backgroundColor) {
  const bg = hexToRgb(backgroundColor)
  const keyed = await loadAlphaKeyed(sharp, source)
  return keyed
    .resize(size, size, { fit: 'contain', background: { ...bg, alpha: 1 } })
    .flatten({ background: bg })
    .png()
    .toBuffer()
}

async function writeMipmapPng(buffer, destPath) {
  const webpSibling = destPath.replace(/\.png$/i, '.webp')
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
  if (fs.existsSync(webpSibling)) {
    await fs.promises.unlink(webpSibling)
  }
  await fs.promises.writeFile(destPath, buffer)
}

function patchColorsXml(filePath, iconBackground) {
  let xml = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8')
    : `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n`
  if (xml.includes('iconBackground')) {
    xml = xml.replace(
      /<color name="iconBackground">[^<]*<\/color>/,
      `<color name="iconBackground">${iconBackground}</color>`,
    )
  } else {
    xml = xml.replace(
      '</resources>',
      `  <color name="iconBackground">${iconBackground}</color>\n</resources>`,
    )
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, xml, 'utf8')
}

async function generateIcons(projectRoot, pkgRoot) {
  let sharp
  try {
    sharp = require('sharp')
  } catch {
    console.warn(
      '[with-drivemind-icons] sharp not available — skipping icon generation.' +
        ' Run `npm install` with devDependencies to install it.',
    )
    return
  }

  const LIGHT_FG = path.join(pkgRoot, 'assets', 'logo', 'logo-symbol-light.png')
  const DARK_FG = path.join(pkgRoot, 'assets', 'logo', 'logo-symbol-dark.png')

  for (const p of [LIGHT_FG, DARK_FG]) {
    if (!fs.existsSync(p)) {
      console.warn(`[with-drivemind-icons] Missing source asset: ${p} — skipping icon generation.`)
      return
    }
  }

  const RES = path.join(projectRoot, 'app', 'src', 'main', 'res')

  console.log('[with-drivemind-icons] Generating adaptive foreground layers (light + night)…')
  for (const [density, px] of Object.entries(FOREGROUND_SIZES)) {
    const lightBuf = await renderForeground(sharp, LIGHT_FG, px)
    const darkBuf = await renderForeground(sharp, DARK_FG, px)
    await writeMipmapPng(lightBuf, path.join(RES, `mipmap-${density}`, 'ic_launcher_foreground.png'))
    await writeMipmapPng(darkBuf, path.join(RES, `mipmap-night-${density}`, 'ic_launcher_foreground.png'))
  }

  console.log('[with-drivemind-icons] Generating legacy launcher icons…')
  for (const [density, px] of Object.entries(LEGACY_SIZES)) {
    const lightBuf = await renderLegacyComposite(sharp, LIGHT_FG, px, BG_LIGHT)
    const darkBuf = await renderLegacyComposite(sharp, DARK_FG, px, BG_DARK)
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      await writeMipmapPng(lightBuf, path.join(RES, `mipmap-${density}`, name))
      await writeMipmapPng(darkBuf, path.join(RES, `mipmap-night-${density}`, name))
    }
  }

  console.log('[with-drivemind-icons] Patching colors.xml…')
  patchColorsXml(path.join(RES, 'values', 'colors.xml'), BG_LIGHT)

  const nightColors = path.join(RES, 'values-night', 'colors.xml')
  if (!fs.existsSync(nightColors) || fs.readFileSync(nightColors, 'utf8').trim() === '<resources/>') {
    fs.mkdirSync(path.dirname(nightColors), { recursive: true })
    fs.writeFileSync(
      nightColors,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="iconBackground">${BG_DARK}</color>\n</resources>\n`,
      'utf8',
    )
  } else {
    patchColorsXml(nightColors, BG_DARK)
  }

  console.log('[with-drivemind-icons] Done — adaptive icons written to android/app/src/main/res/')
}

function withDriveMindIcons(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.platformProjectRoot
      const pkgRoot = path.join(__dirname, '..')
      await generateIcons(projectRoot, pkgRoot)
      return cfg
    },
  ])
}

module.exports = createRunOncePlugin(withDriveMindIcons, 'with-drivemind-icons', '1.0.0')
