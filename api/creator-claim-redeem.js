// The database transfers trips, merges the profile, keeps the claim record,
// and removes the empty shadow account in one transaction.
import { extractBearerToken, getAuthUser, hashClaimToken, isUuid, isValidTokenFormat } from './_auth.js'
import { claimConfig, claimError, claimFetch, claimJson, claimUnavailable, serviceHeaders } from './_creatorClaim.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return claimJson(res, 405, { error: 'Method not allowed.' })
  }
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
