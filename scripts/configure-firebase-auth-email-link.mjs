#!/usr/bin/env node
/**
 * Configure Firebase Auth email-link settings for drivemind-d4994.
 *
 * Prerequisites:
 *   npx firebase-tools@latest login
 *   npx firebase-tools@latest use drivemind-d4994
 *
 * Usage:
 *   node scripts/configure-firebase-auth-email-link.mjs
 *
 * Note: Firebase does not expose customizable email-link sign-in templates via
 * the Identity Toolkit Admin API (unlike password-reset / verify-email). Email
 * link sign-in uses built-in localized templates selected by auth.languageCode
 * on the client. This script sets the project public display name so %APP_NAME%
 * resolves to "DriveMind" in those templates.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const PROJECT_ID = 'drivemind-d4994'
const DISPLAY_NAME = 'DriveMind'

const EMAIL_LINK_TEMPLATES = {
  en: {
    subject: 'Sign in to DriveMind',
    body: `Hello,

We received a request to sign in to DriveMind using your email address (%EMAIL%). To complete the sign-in process, please click the link below:

%LINK%

If you didn't request this link, you can safely ignore this email.

Best regards,
The DriveMind Team`,
  },
  ru: {
    subject: 'Вход в DriveMind',
    body: `Привет!

Мы получили запрос на вход в приложение DriveMind для %EMAIL%. Чтобы завершить авторизацию, просто нажмите на ссылку ниже:

%LINK%

Если вы не запрашивали эту ссылку, просто проигнорируйте это письмо.

С уважением,
Команда DriveMind`,
  },
  pl: {
    subject: 'Logowanie do DriveMind',
    body: `Cześć!

Otrzymaliśmy prośbę o zalogowanie się do DriveMind przy użyciu Twojego adresu e-mail (%EMAIL%). Aby ukończyć proces logowania, kliknij w poniższy link:

%LINK%

Jeśli to nie Ty wygenerowałeś tę prośbę, możesz bezpiecznie zignorować tę wiadomość.

Z poważaniem,
Zespół DriveMind`,
  },
}

function getFirebaseAccessToken() {
  const configPath = join(homedir(), '.config', 'configstore', 'firebase-tools.json')
  try {
    const raw = readFileSync(configPath, 'utf8')
    const config = JSON.parse(raw)
    const tokens = config?.tokens
    if (!tokens?.access_token) {
      throw new Error('No access_token in firebase-tools configstore')
    }
    if (tokens.expires_at && Date.now() > tokens.expires_at) {
      throw new Error('Firebase CLI access token expired — run: npx firebase-tools@latest login')
    }
    return tokens.access_token
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not read Firebase CLI credentials (${message}). Run:\n  npx firebase-tools@latest login\n  npx firebase-tools@latest use ${PROJECT_ID}`,
    )
  }
}

async function apiRequest(url, { method = 'GET', body, token }) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = text
  }
  if (!response.ok) {
    throw new Error(`${method} ${url} failed (${response.status}): ${text}`)
  }
  return json
}

async function updateProjectDisplayName(token) {
  const url = `https://firebase.googleapis.com/v1beta1/projects/${PROJECT_ID}?updateMask=displayName`
  const result = await apiRequest(url, {
    method: 'PATCH',
    token,
    body: { displayName: DISPLAY_NAME },
  })
  console.log(`✓ Project display name set to "${result.displayName}"`)
  return result
}

async function readIdentityToolkitConfig(token) {
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`
  const config = await apiRequest(url, { token })
  const sendEmailKeys = Object.keys(config?.notification?.sendEmail ?? {}).sort()
  console.log('Identity Toolkit sendEmail fields:', sendEmailKeys.join(', ') || '(none)')
  return config
}

async function tryCustomEmailLinkTemplate(token) {
  // Identity Toolkit v2 discovery document has no signInWithEmailLinkTemplate field.
  // Probe anyway so the script fails loudly if Google adds it later.
  const field = 'notification.sendEmail.signInWithEmailLinkTemplate'
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config?updateMask=${field}`
  const body = {
    notification: {
      sendEmail: {
        signInWithEmailLinkTemplate: {
          subject: EMAIL_LINK_TEMPLATES.en.subject,
          body: EMAIL_LINK_TEMPLATES.en.body,
          bodyFormat: 'PLAIN_TEXT',
          senderDisplayName: 'DriveMind',
        },
      },
    },
  }
  try {
    await apiRequest(url, { method: 'PATCH', token, body })
    console.log('✓ Custom email-link template applied (API now supports this field)')
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('signInWithEmailLinkTemplate') || message.includes('INVALID_ARGUMENT')) {
      console.log(
        'ℹ Email-link sign-in templates are not configurable via Identity Toolkit API.',
      )
      console.log(
        '  Firebase sends built-in localized templates (en/pl/ru) when the client sets auth.languageCode.',
      )
      console.log('  Reference copy for en/ru/pl is stored in this script for documentation.')
      return false
    }
    throw error
  }
}

function printManualConsoleSteps() {
  console.log('\nManual console checklist (if needed):')
  console.log(`  1. Firebase Console → Project settings → General → Public-facing name → "${DISPLAY_NAME}"`)
  console.log('  2. Authentication → Sign-in method → Email/Password → enable Email link (passwordless)')
  console.log('  3. Mobile app sets auth.languageCode before sendSignInLinkToEmail (implemented in emailLinkAuth.ts)')
  console.log('\nFor fully custom email-link copy (exact subject/body), use Admin SDK')
  console.log('generateSignInWithEmailLink + your own SMTP provider (see Firebase docs).')
}

async function main() {
  try {
    execSync('npx -y firebase-tools@latest use drivemind-d4994', { stdio: 'pipe' })
  } catch {
    // Non-fatal if firebase CLI is not logged in yet.
  }

  const token = getFirebaseAccessToken()
  await updateProjectDisplayName(token)
  await readIdentityToolkitConfig(token)
  await tryCustomEmailLinkTemplate(token)
  printManualConsoleSteps()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
