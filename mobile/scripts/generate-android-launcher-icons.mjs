/**
 * Regenerates Android launcher mipmaps from DriveMind symbol assets.
 * Day (light): 1 foreground PNG on #F5F5F7 background.
 * Night (dark): foreground PNG + #08101C background (adaptive icon layers).
 *
 * Run after changing logo PNGs, then rebuild the APK:
 *   npm run icons:android
 *   npm run android:release:fresh
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MOBILE_ROOT = path.resolve(__dirname, '..')
const RES = path.join(MOBILE_ROOT, 'android', 'app', 'src', 'main', 'res')

const LIGHT_FG = path.join(MOBILE_ROOT, 'assets', 'logo', 'logo-symbol-light.png')
const DARK_FG = path.join(MOBILE_ROOT, 'assets', 'logo', 'logo-symbol-dark.png')
const ICON_1024 = path.join(MOBILE_ROOT, 'assets', 'icon.png')

const BG_LIGHT = '#F5F5F7'
const BG_DARK = '#08101C'

/** Pixels at or below this RGB level become transparent (removes solid black backplates). */
const BLACK_KEY_THRESHOLD = 28

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

async function loadAlphaKeyed(source) {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
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

/** Adaptive icon foreground layer sizes (dp × 1.5 for xxxhdpi baseline). */
const FOREGROUND = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
}

/** Legacy / fallback launcher icon sizes. */
const LEGACY = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}

async function renderForeground(source, size) {
  const keyed = await loadAlphaKeyed(source)
  return keyed
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function renderLegacyComposite(source, size, backgroundColor) {
  const bg = hexToRgb(backgroundColor)
  const keyed = await loadAlphaKeyed(source)
  return keyed
    .resize(size, size, { fit: 'contain', background: { ...bg, alpha: 1 } })
    .flatten({ background: bg })
    .png()
    .toBuffer()
}

async function writePng(buffer, destPath) {
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
  await fs.promises.writeFile(destPath, buffer)
}

/** Write PNG; remove legacy .webp sibling so Android does not pick the old asset. */
async function writeMipmapPng(buffer, destPath) {
  const webpSibling = destPath.replace(/\.png$/i, '.webp')
  if (fs.existsSync(webpSibling)) {
    await fs.promises.unlink(webpSibling)
  }
  await writePng(buffer, destPath)
}

function patchColorsXml(filePath, iconBackground) {
  let xml = fs.readFileSync(filePath, 'utf8')
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
  fs.writeFileSync(filePath, xml)
}

async function main() {
  for (const p of [LIGHT_FG, DARK_FG]) {
    if (!fs.existsSync(p)) {
      throw new Error(`Missing asset: ${p}`)
    }
  }

  console.log('[DriveMind] Generating adaptive foregrounds (light + night)…')
  for (const [density, px] of Object.entries(FOREGROUND)) {
    const lightBuf = await renderForeground(LIGHT_FG, px)
    const darkBuf = await renderForeground(DARK_FG, px)
    await writeMipmapPng(lightBuf, path.join(RES, `mipmap-${density}`, 'ic_launcher_foreground.png'))
    await writeMipmapPng(darkBuf, path.join(RES, `mipmap-night-${density}`, 'ic_launcher_foreground.png'))
  }

  console.log('[DriveMind] Generating legacy launcher icons…')
  for (const [density, px] of Object.entries(LEGACY)) {
    const lightBuf = await renderLegacyComposite(LIGHT_FG, px, BG_LIGHT)
    const darkBuf = await renderLegacyComposite(DARK_FG, px, BG_DARK)
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
      await writeMipmapPng(lightBuf, path.join(RES, `mipmap-${density}`, name))
      await writeMipmapPng(darkBuf, path.join(RES, `mipmap-night-${density}`, name))
    }
  }

  console.log('[DriveMind] Writing Play Store / Expo icon (1024)…')
  const icon1024 = await renderLegacyComposite(LIGHT_FG, 1024, BG_LIGHT)
  await writePng(icon1024, ICON_1024)

  patchColorsXml(path.join(RES, 'values', 'colors.xml'), BG_LIGHT)
  const nightColors = path.join(RES, 'values-night', 'colors.xml')
  if (!fs.existsSync(nightColors) || fs.readFileSync(nightColors, 'utf8').trim() === '<resources/>') {
    fs.writeFileSync(
      nightColors,
      `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="iconBackground">${BG_DARK}</color>\n</resources>\n`,
    )
  } else {
    patchColorsXml(nightColors, BG_DARK)
  }

  console.log('[DriveMind] Done. Reinstall the app (uninstall old APK first if the icon is cached).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
