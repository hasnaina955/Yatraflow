// Shared response and configuration helpers for creator claim functions.
import { supabaseServiceHeaders } from './_supabase-headers.js'

export function claimHeaders(res) {
  res.setHeader('cache-control', 'private, no-store, max-age=0')
  res.setHeader('x-robots-tag', 'noindex, nofollow, noarchive')
  res.setHeader('referrer-policy', 'no-referrer')
}

export function claimJson(res, status, body) {
  claimHeaders(res)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  return res.status(status).send(JSON.stringify(body))
}

export function claimConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return { url, anonKey, serviceKey }
}

export function adminHeaders(anonKey, token) {
  return { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

export function serviceHeaders(serviceKey) {
  return supabaseServiceHeaders(serviceKey, { 'content-type': 'application/json' })
}

/** Bound each backend call. Never log tokens, request addresses or upstream bodies. */
export function claimFetch(url, options = {}) {
  return fetch(url, { ...options, signal: AbortSignal.timeout(10000) })
}

export function claimUnavailable(res) {
  return claimJson(res, 503, { error: 'The claim service is not available. Try again later.' })
}

const errorStatus = {
  claim_not_found: [404, 'This claim link is not valid.'],
  claim_already_redeemed: [409, 'This profile has already been claimed.'],
  claim_revoked: [410, 'This claim link was revoked.'],
  claim_expired: [410, 'This claim link has expired. Ask the YatraFlow team for a new link.'],
  claimer_ineligible: [403, 'Your account cannot claim this profile.'],
  invalid_claimer: [403, 'Your account cannot claim this profile.'],
  claim_shadow_invalid: [409, 'This claim needs manual review. Contact the YatraFlow team.'],
  claim_has_no_trips: [409, 'This claim needs manual review. Contact the YatraFlow team.'],
}

export async function claimError(res, response) {
  const body = await response.json().catch(() => null)
  const message = typeof body?.message === 'string' ? body.message : ''
  if (message.startsWith('paid_publication_requires_manual_review:')) {
    return claimJson(res, 409, { code: 'publication_requires_manual_review', error: 'This claim has a publication. It needs a manual handoff.' })
  }
  const mapped = Object.hasOwn(errorStatus, message) ? errorStatus[message] : null
  if (mapped) return claimJson(res, mapped[0], { code: message, error: mapped[1] })
  if (response.status === 403 || body?.code === '42501') return claimJson(res, 403, { error: 'You do not have access to this action.' })
  return claimUnavailable(res)
}

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
