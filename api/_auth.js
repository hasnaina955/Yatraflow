// Authentication and token helpers for creator claims.
import { createHash, randomBytes } from 'node:crypto'

export function extractBearerToken(req) {
  const header = req.headers?.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

/** Ask Auth to verify the session. An unavailable Auth service is not a valid denial. */
export async function getAuthUser(supabaseUrl, anonKey, token, signal) {
  if (!token) return null
  const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    signal,
  })
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new Error('Auth unavailable')
  const user = await res.json()
  if (!isUuid(user?.id)) throw new Error('Invalid Auth response')
  return user
}

export function isMasterAdmin(user) {
  return user?.app_metadata?.role === 'masteradmin' && !user.app_metadata.is_unclaimed_shadow
}

export function hashClaimToken(rawToken) {
  return createHash('sha256').update(rawToken).digest('hex')
}

export function generateClaimToken() {
  return randomBytes(32).toString('hex')
}

export function isValidTokenFormat(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
}
