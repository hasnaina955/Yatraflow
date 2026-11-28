// Admin creates a private claim or revokes one. All claim writes use audited RPCs.
import { randomBytes, randomUUID } from 'node:crypto'
import { extractBearerToken, getAuthUser, isMasterAdmin, generateClaimToken, hashClaimToken, isUuid } from './_auth.js'
import { adminHeaders, claimConfig, claimError, claimFetch, claimJson, claimUnavailable, isRecord, serviceHeaders } from './_creatorClaim.js'
import { normalizeSeedTrip } from './_creatorClaimTrip.js'
import { resolveOrigin } from './_origin.js'

const maxTrips = 20

function optionalText(value, max) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.length > max) throw new Error('A profile field is not valid.')
  return value.trim() || null
}

function optionalUrl(value) {
  const text = optionalText(value, 2048)
  if (!text) return null
  try {
    const url = new URL(text)
    if (url.protocol === 'https:' && !url.username && !url.password) return text
  } catch { /* Report below. */ }
  throw new Error('Profile links need a valid HTTPS address.')
}

function socialLinks(raw) {
  if (raw == null) return null
  if (!isRecord(raw) || !Object.keys(raw).every(k => ['youtube', 'instagram'].includes(k))) {
    throw new Error('Social links are not valid.')
  }
  const links = {}
  for (const key of ['youtube', 'instagram']) {
    const link = optionalUrl(raw[key])
    if (link) links[key] = link
  }
  return Object.keys(links).length ? links : null
}

function normalizeClaim(body) {
  if (!isRecord(body)) throw new Error('Invalid claim data.')
  const name = optionalText(body.name, 120)
  if (!name) throw new Error('Creator name is required.')
  if (!Array.isArray(body.trips) || body.trips.length < 1 || body.trips.length > maxTrips) {
    throw new Error('Choose one to 20 trip files.')
  }
  const expiresDays = body.expiresDays ?? 30
  if (!Number.isInteger(expiresDays) || expiresDays < 1 || expiresDays > 180) {
    throw new Error('Choose a claim expiry of 1 to 180 days.')
  }
  return {
    p_target_name: name,
    p_target_avatar_url: optionalUrl(body.avatarUrl),
    p_target_home_city: optionalText(body.homeCity, 120),
    p_target_bio: optionalText(body.creatorBio, 2000),
    p_target_social_links: socialLinks(body.socialLinks),
    p_outreach_note: optionalText(body.outreachNote, 2000),
    p_expires_days: expiresDays,
    p_trips: body.trips.map(normalizeSeedTrip),
  }
}

async function createShadowUser(url, serviceKey) {
  const response = await claimFetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders(serviceKey),
    body: JSON.stringify({
      email: `unclaimed+${randomUUID()}@internal.yatraflow.invalid`,
      password: randomBytes(48).toString('hex'),
      email_confirm: false,
      user_metadata: { name: 'Unclaimed creator' },
      app_metadata: { is_unclaimed_shadow: true },
    }),
  })
  if (!response.ok) throw new Error('Shadow account creation failed')
  const data = await response.json()
  if (!isUuid(data?.id)) throw new Error('Invalid shadow account response')
  return data.id
}

/** A reported SQL error rolled back the RPC. A lost or malformed response
 *  does not prove rollback: deleting the account then can delete seeded trips. */
async function confirmedRollback(response) {
  if (response.status < 400 || response.status >= 500) return false
  const error = await response.clone().json().catch(() => null)
  return typeof error?.code === 'string' && /^(22|23|42|P0)[A-Z0-9]{3}$/.test(error.code)
}

async function discardShadow(url, serviceKey, id) {
  try {
    const response = await claimFetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: serviceHeaders(serviceKey),
    })
    return response.ok
  } catch {
    return false
  }
}

function uncertainCreate(res) {
  return claimJson(res, 503, { error: 'We could not confirm claim creation. Check the claim list before you try again.' })
}

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    res.setHeader('allow', 'GET, POST, DELETE')
    return claimJson(res, 405, { error: 'Method not allowed.' })
  }
  const token = extractBearerToken(req)
  if (!token) return claimJson(res, 403, { error: 'Master admin access is required.' })
  const { url, anonKey, serviceKey } = claimConfig()
  if (!url || !anonKey || !serviceKey) return claimUnavailable(res)

  try {
    const user = await getAuthUser(url, anonKey, token, AbortSignal.timeout(10000))
    if (!isMasterAdmin(user)) return claimJson(res, 403, { error: 'Master admin access is required.' })
    const headers = adminHeaders(anonKey, token)
    const profileResponse = await claimFetch(`${url}/rest/v1/profiles?select=is_disabled&id=eq.${user.id}`, { headers })
    if (!profileResponse.ok) return claimUnavailable(res)
    const profiles = await profileResponse.json()
    if (!Array.isArray(profiles)) return claimUnavailable(res)
    if (profiles.length !== 1 || profiles[0]?.is_disabled !== false) return claimJson(res, 403, { error: 'Master admin access is required.' })

    if (req.method === 'GET') {
      const response = await claimFetch(
        `${url}/rest/v1/creator_profile_claims?select=id,target_name,target_avatar_url,outreach_note,status,claimed_by,claimed_at,expires_at,created_at&order=created_at.desc&limit=100`,
        { headers },
      )
      if (!response.ok) return claimError(res, response)
      const rows = await response.json()
      if (!Array.isArray(rows) || !rows.every(r => isRecord(r) && isUuid(r.id) && typeof r.target_name === 'string'
        && ['unclaimed', 'claimed', 'revoked', 'expired'].includes(r.status))) return claimUnavailable(res)
      return claimJson(res, 200, rows.map(r => ({
        id: r.id, target_name: r.target_name, target_avatar_url: r.target_avatar_url,
        outreach_note: r.outreach_note, claimed_by: r.claimed_by, claimed_at: r.claimed_at,
        expires_at: r.expires_at, created_at: r.created_at,
        status: r.status === 'unclaimed' && Date.parse(r.expires_at) <= Date.now() ? 'expired' : r.status,
      })))
    }

    if (req.method === 'DELETE') {
      const claimId = req.query?.id
      if (!isUuid(claimId)) return claimJson(res, 400, { error: 'Invalid claim ID.' })
      const response = await claimFetch(`${url}/rest/v1/rpc/admin_revoke_creator_claim`, {
        method: 'POST', headers, body: JSON.stringify({ p_claim_id: claimId }),
      })
      if (!response.ok) return claimError(res, response)
      const result = await response.json()
      if (result?.claim_id !== claimId || result?.status !== 'revoked') return claimUnavailable(res)
      return claimJson(res, 200, { revoked: true })
    }

    let normalized
    try {
      normalized = normalizeClaim(req.body)
    } catch (error) {
      return claimJson(res, 400, { error: error.message })
    }

    const shadowId = await createShadowUser(url, serviceKey)
    const rawToken = generateClaimToken()
    try {
      const response = await claimFetch(`${url}/rest/v1/rpc/admin_create_creator_claim`, {
        method: 'POST', headers, body: JSON.stringify({
          ...normalized,
          p_shadow_profile_id: shadowId,
          p_token_hash: hashClaimToken(rawToken),
        }),
      })

      if (!response.ok) {
        if (await confirmedRollback(response)) {
          const discarded = await discardShadow(url, serviceKey, shadowId)
          return discarded
            ? claimError(res, response)
            : claimJson(res, 503, { error: 'Claim creation failed. The account cleanup needs admin review.' })
        }
        return uncertainCreate(res)
      }
      const data = await response.json()
      const row = Array.isArray(data) && data.length === 1 ? data[0] : null
      if (!isUuid(row?.claim_id) || !Array.isArray(row?.trip_ids)
        || row.trip_ids.length !== normalized.p_trips.length || !row.trip_ids.every(isUuid)) return uncertainCreate(res)
      // Never derive a secret-bearing address from an untrusted Host header.
      const claimPath = `/claim#${rawToken}`
      return claimJson(res, 201, { claimId: row.claim_id, tripIds: row.trip_ids, claimPath, claimUrl: `${resolveOrigin()}${claimPath}` })
    } catch {
      return uncertainCreate(res)
    }
  } catch {
    return claimUnavailable(res)
  }
}
