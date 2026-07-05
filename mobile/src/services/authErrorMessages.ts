import type { TFunction } from 'i18next'

import { isGoogleSignInDeveloperError } from './googleAuth'

export function getFirebaseAuthErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error ?? '')
}

/** Firebase / Google Cloud misconfiguration (SHA-1, API key restrictions, OAuth client). */
export function isAuthConfigurationError(error: unknown): boolean {
  if (isGoogleSignInDeveloperError(error)) return true

  const code = getFirebaseAuthErrorCode(error)
  if (
    code === 'auth/app-not-authorized' ||
    code === 'auth/invalid-api-key' ||
    code === 'auth/api-key-not-valid.-please-pass-a-valid-api-key'
  ) {
    return true
  }

  const message = errorMessage(error).toLowerCase()
  return (
    message.includes('api key not valid') ||
    message.includes('api_key') ||
    message.includes('app not authorized') ||
    message.includes('developer_error') ||
    message.includes('12500') ||
    message.includes('10:')
  )
}

export function formatAuthErrorMessage(error: unknown, t: TFunction): string {
  if (isAuthConfigurationError(error)) {
    return t('login_developer_error')
  }

  const code = getFirebaseAuthErrorCode(error)
  switch (code) {
    case 'auth/too-many-requests':
    case 'auth/quota-exceeded':
      return t('login_email_link_rate_limited')
    case 'auth/unauthorized-continue-uri':
    case 'auth/invalid-continue-uri':
      return t('login_email_link_unauthorized_domain')
    case 'auth/operation-not-allowed':
      return t('login_email_link_not_enabled')
    case 'auth/network-request-failed':
      return t('login_auth_network')
    case 'auth/invalid-email':
      return t('login_enter_valid_email')
    default:
      return t('login_failed')
  }
}

export function logAuthFailure(scope: string, error: unknown): void {
  const code = getFirebaseAuthErrorCode(error)
  const message = errorMessage(error)
  console.warn(`[DriveMind] ${scope} failed`, code ?? message, error)
}
