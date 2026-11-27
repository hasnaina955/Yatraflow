// ============ Public place coarsening (#1015) ============
// Strips street/building/house-number/PIN segments and trailing country from a
// trip start location so published itineraries show a town or city rather than
// a home address. Kept aligned with `get_public_trip` in
// supabase/migrations/20261128a_public_trip_privacy.sql.

const PIN_RE = /\b\d{6}\b/g
const STREET_PREFIX_RE = /^(?:#|no\.?\s*\d|\d)/i
const STREET_KEYWORD_RE = /\b(?:flat|apt|apartment|house|plot|door|floor|building|bldg|tower|wing|suite|road|rd|street|st|lane|ln|avenue|ave|marg|cross|main|sector|block|phase|colony|enclave|layout|extn|pin|pincode|home)\b/i

/** Coarsen a place label to at most its town/city and region, dropping street
 *  addresses, house numbers, PIN codes, and trailing country names. */
export function coarsenPublicPlace(place: string | null | undefined): string {
  if (typeof place !== 'string') return ''
  const segs: string[] = []
  for (const raw of place.split(',')) {
    const cleaned = raw.replace(PIN_RE, '').replace(/\s+/g, ' ').trim()
    if (!cleaned) continue
    if (cleaned.toLowerCase() === 'india') continue
    if (STREET_PREFIX_RE.test(cleaned)) continue
    if (STREET_KEYWORD_RE.test(cleaned)) continue
    segs.push(cleaned)
  }
  if (segs.length === 0) return ''
  if (segs.length === 1) return segs[0]
  return `${segs[segs.length - 2]}, ${segs[segs.length - 1]}`
}
