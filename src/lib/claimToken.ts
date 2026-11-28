import { claimTokenFromHash } from './routes'

export const CLAIM_TOKEN_KEY = 'yf.claimToken'
export const CLAIM_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
type ClaimStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function readStoredToken(raw: string, now: () => number): string | null {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const record = parsed as { token?: unknown; savedAt?: unknown }
  if (typeof record.token !== 'string' || typeof record.savedAt !== 'number' || !Number.isFinite(record.savedAt)) {
    return null
  }
  const token = claimTokenFromHash(`#${record.token}`)
  if (!token) return null
  const age = now() - record.savedAt
  return age >= 0 && age <= CLAIM_TOKEN_MAX_AGE_MS ? token : null
}

export function readClaimToken(
  hash: string,
  storage: () => ClaimStorage,
  clearHash: () => void,
  now: () => number = Date.now,
): string | null {
  const token = claimTokenFromHash(hash)
  if (token) {
    try { storage().setItem(CLAIM_TOKEN_KEY, JSON.stringify({ token, savedAt: now() })) } catch { /* Keep the token for this visit. */ }
    clearHash()
    return token
  }
  let raw: string | null
  try { raw = storage().getItem(CLAIM_TOKEN_KEY) } catch { return null }
  if (raw == null) return null
  const stored = readStoredToken(raw, now)
  if (!stored) clearClaimToken(storage)
  return stored
}

export function clearClaimToken(storage: () => ClaimStorage): void {
  try { storage().removeItem(CLAIM_TOKEN_KEY) } catch { /* Storage may be unavailable. */ }
}
