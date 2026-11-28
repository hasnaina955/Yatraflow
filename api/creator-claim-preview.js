// A holder of a private link can read its approved preview. This function
// does not make claim writes and never returns the token or its hash.
import { hashClaimToken, isUuid, isValidTokenFormat } from './_auth.js'
import { claimConfig, claimFetch, claimJson, claimUnavailable, isRecord, serviceHeaders } from './_creatorClaim.js'

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('allow', 'GET')
    return claimJson(res, 405, { error: 'Method not allowed.' })
  }
  const token = req.query?.token
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
