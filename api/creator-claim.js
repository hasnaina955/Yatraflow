import { resolveOrigin } from './_origin.js'
import { escapeHtml } from './_escape.js'
import { extractBearerToken, getAuthUser, hashClaimToken, isMasterAdmin, isUuid, isValidTokenFormat } from './_auth.js'
import { claimConfig, claimError, claimFetch, claimHeaders, claimJson, claimUnavailable, isRecord, serviceHeaders } from './_creatorClaim.js'

function og(req, res) {
  claimHeaders(res)
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('vary', 'User-Agent')
  if (req.method === 'HEAD') return res.status(200).end()
  const title = 'Your YatraFlow Creator Profile is Ready'
  const description = 'Private creator invite. Preview your trips and claim your creator profile.'
  const image = escapeHtml(`${resolveOrigin()}/og/creator-claim-invite.png`)
  return res.status(200).send(`<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${title}</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="YatraFlow creator invite">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
</head><body><h1>${title}</h1><p>${description}</p></body></html>`)
}

function previewPayload(value) {
  if (!isRecord(value)) return null
  if (value.found === false && value.status === 'invalid') return { found: false, status: 'invalid' }
  if (value.found !== true) return null
  if (['claimed', 'revoked', 'expired'].includes(value.status)) return { found: true, status: value.status }
  if (value.status !== 'unclaimed' || !isRecord(value.creator) || typeof value.creator.name !== 'string'
    || typeof value.expires_at !== 'string' || !Array.isArray(value.trips) || value.trips.length < 1) return null
  const trips = []
  for (const trip of value.trips) {
    if (!isRecord(trip) || !isUuid(trip.id) || typeof trip.name !== 'string'
      || !Array.isArray(trip.destinations) || !trip.destinations.every(v => typeof v === 'string')
      || !Array.isArray(trip.days)) return null
    const days = []
    for (const day of trip.days) {
      if (!isRecord(day) || !Number.isInteger(day.index) || !Array.isArray(day.stops)
        || !day.stops.every(stop => isRecord(stop) && typeof stop.title === 'string')) return null
      days.push({
        index: day.index, title: typeof day.title === 'string' ? day.title : null,
        stops: day.stops.map(stop => ({ title: stop.title, arrivalTime: typeof stop.arrivalTime === 'string' ? stop.arrivalTime : null })),
      })
    }
    trips.push({
      id: trip.id, name: trip.name, destinations: trip.destinations,
      start_date: trip.start_date, end_date: trip.end_date,
      travellers: trip.travellers, budget_per_person_inr: trip.budget_per_person_inr, days,
    })
  }
  const creator = value.creator
  const textOrNull = value => typeof value === 'string' ? value : null
  return {
    found: true, status: 'unclaimed', expires_at: value.expires_at,
    creator: {
      name: creator.name, avatar_url: textOrNull(creator.avatar_url), home_city: textOrNull(creator.home_city),
      creator_bio: textOrNull(creator.creator_bio),
      social_links: isRecord(creator.social_links) ? {
        youtube: textOrNull(creator.social_links.youtube), instagram: textOrNull(creator.social_links.instagram),
      } : null,
    },
    trips,
  }
}

async function preview(req, res) {
  const token = req.body?.token
  if (!isValidTokenFormat(token)) return claimJson(res, 404, { found: false, status: 'invalid' })
  const { url, serviceKey } = claimConfig()
  if (!url || !serviceKey) return claimUnavailable(res)
  try {
    const response = await claimFetch(`${url}/rest/v1/rpc/get_creator_claim_preview`, {
      method: 'POST', headers: serviceHeaders(serviceKey),
      body: JSON.stringify({ p_token_hash: hashClaimToken(token) }),
    })
    if (!response.ok) return claimUnavailable(res)
    const preview = previewPayload(await response.json())
    if (!preview) return claimUnavailable(res)
    return claimJson(res, preview.found ? 200 : 404, preview)
  } catch {
    return claimUnavailable(res)
  }
}

async function redeem(req, res) {
  const bearer = extractBearerToken(req)
  if (!bearer) return claimJson(res, 401, { error: 'Sign in to claim this profile.' })
  const rawToken = req.body?.token
  if (!isValidTokenFormat(rawToken)) return claimJson(res, 400, { error: 'Invalid claim token.' })
  const { url, anonKey, serviceKey } = claimConfig()
  if (!url || !anonKey || !serviceKey) return claimUnavailable(res)
  try {
    const user = await getAuthUser(url, anonKey, bearer, AbortSignal.timeout(10000))
    if (!user) return claimJson(res, 401, { error: 'Sign in to claim this profile.' })
    if (user.app_metadata?.is_unclaimed_shadow) return claimJson(res, 403, { error: 'Your account cannot claim this profile.' })
    if (isMasterAdmin(user)) return claimJson(res, 403, { code: 'invalid_claimer', error: 'Admin accounts cannot claim a creator profile. Sign in with the creator account.' })

    const response = await claimFetch(`${url}/rest/v1/rpc/redeem_creator_claim`, {
      method: 'POST', headers: serviceHeaders(serviceKey),
      body: JSON.stringify({ p_token_hash: hashClaimToken(rawToken), p_claimer_id: user.id }),
    })
    if (!response.ok) return claimError(res, response)
    const result = await response.json()
    if (result?.claimer_id !== user.id || !isUuid(result?.claim_id) || !Array.isArray(result?.moved_trip_ids)
      || !result.moved_trip_ids.length || !result.moved_trip_ids.every(isUuid)) return claimUnavailable(res)

    return claimJson(res, 200, { ok: true, claimerId: user.id, movedTripIds: result.moved_trip_ids })
  } catch {
    return claimUnavailable(res)
  }
}

export default function handler(req, res) {
  claimHeaders(res)
  if ((req.method === 'GET' || req.method === 'HEAD') && req.query?.og === '1') return og(req, res)
  if (req.method === 'POST') {
    if (req.body?.action === 'preview') return preview(req, res)
    if (req.body?.action === 'redeem') return redeem(req, res)
    return claimJson(res, 400, { error: 'Unknown action.' })
  }
  res.setHeader('allow', 'GET, HEAD, POST')
  return claimJson(res, 405, { error: 'Method not allowed.' })
}
