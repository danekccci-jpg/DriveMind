#!/usr/bin/env node
/**
 * Validates that all locale files share the exact same key set as en.json.
 * Usage: node scripts/validate-locales.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localesDir = path.join(__dirname, '../src/i18n/locales')
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'))
const enKeys = Object.keys(en).sort()

let failed = false
for (const loc of ['pl', 'uk', 'ru']) {
  const data = JSON.parse(fs.readFileSync(path.join(localesDir, `${loc}.json`), 'utf8'))
  const keys = Object.keys(data).sort()
  const missing = enKeys.filter((k) => !(k in data))
  const extra = keys.filter((k) => !(k in en))
  if (missing.length || extra.length) {
    failed = true
    console.error(`[${loc}] missing: ${missing.length}`, missing.slice(0, 5))
    console.error(`[${loc}] extra: ${extra.length}`, extra.slice(0, 5))
  } else {
    console.log(`[${loc}] OK (${keys.length} keys)`)
  }
}

if (failed) process.exit(1)
console.log(`All locales match en.json (${enKeys.length} keys)`)
