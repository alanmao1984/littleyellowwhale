import { createHash, randomBytes } from 'crypto'

// Secrets are shown to the user exactly once; only their SHA-256 hash is stored,
// so a leaked database row can never reveal a usable token or pairing code.
export function generateSecret(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex')
}

// Human-copyable pairing code: 8 Crockford base32 chars in two groups.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export function generatePairingCode(): { code: string; codeHash: string } {
  const bytes = randomBytes(8)
  let raw = ''
  for (let i = 0; i < 8; i += 1) raw += ALPHABET[bytes[i] % ALPHABET.length]
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`
  return { code, codeHash: hashToken(code) }
}
