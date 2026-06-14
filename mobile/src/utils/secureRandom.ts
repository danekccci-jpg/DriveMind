/**
 * Cross-platform secure(ish) random bytes.
 * Hermes exposes `global.crypto.getRandomValues` in dev but it may be absent
 * in some release bundles — fall back to Math.random() rather than crash login.
 */
export function getSecureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const crypto = (global as unknown as { crypto?: { getRandomValues?: (a: Uint8Array) => void } })
    .crypto
  if (crypto?.getRandomValues) {
    crypto.getRandomValues(bytes)
    return bytes
  }
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

export function generateUUIDv4(): string {
  const bytes = getSecureRandomBytes(16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const h = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Human-readable public ID: "DM-XXXX-XXXX". */
export function generatePublicId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = getSecureRandomBytes(8)
  const segment = (start: number) =>
    Array.from(bytes.slice(start, start + 4))
      .map((b) => chars[b % chars.length])
      .join('')
  return `DM-${segment(0)}-${segment(4)}`
}
