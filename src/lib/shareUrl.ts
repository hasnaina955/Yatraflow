import { Capacitor } from '@capacitor/core'
import { routeParts } from './pageTitle'

const PUBLIC_ORIGIN = 'https://yatraflow-blond.vercel.app'

export function publicShareUrl(pubId: string, origin: string, native = false): string {
  return `${native ? PUBLIC_ORIGIN : origin.replace(/\/+$/, '')}/i/${encodeURIComponent(pubId)}`
}

/** Use the router's segments (including ignored trailing segments), then the API's id allowlist. */
export function publicAddressPath(hash: string, pathname: string): string {
  const [head, id] = routeParts(hash.replace(/^#/, ''))
  if (head === 'pub' && id && /^[A-Za-z0-9_-]{1,64}$/.test(id)) return `/i/${id}`
  return /^\/i\/[^/]+$/.test(pathname) ? '/' : pathname
}

/**
 * Keep the browser's path in step with the hash route, so whatever a visitor
 * copies out of the address bar is readable by a link-preview crawler. A
 * fragment never leaves the browser, so `/#/pub/<id>` reaches a preview as the
 * bare site; the same page addressed as `/i/<id>#/pub/<id>` reaches the
 * `/i/<id>` function and carries that itinerary's own Open Graph tags.
 *
 * `replaceState`, never `pushState`: this is one page under a second name, so it
 * must not add a history entry or Back doubles up. Native and `file://` builds
 * are left alone — only the web has a crawler to serve.
 */
export function syncPublicAddress(): void {
  if (Capacitor.isNativePlatform() || !/^https?:$/.test(location.protocol)) return
  const pathname = publicAddressPath(location.hash, location.pathname)
  if (pathname !== location.pathname) {
    history.replaceState(history.state, '', `${pathname}${location.search}${location.hash}`)
  }
}

export function currentPublicShareUrl(pubId: string): string {
  return publicShareUrl(pubId, location.origin, Capacitor.isNativePlatform())
}

/**
 * The buyer's own card address (ROADMAP I-21): the publication, plus the
 * entitlement that proves the purchase.
 *
 * The parameter is a REQUEST to be verified, never a claim the client gets to
 * make: `api/i.js` renders the "I bought …" framing only when the database
 * confirms that this entitlement is for this publication, and otherwise serves
 * the creator's card. So an unverified address is still safe to hand a crawler —
 * that is the whole reason the framing can be trusted when it does appear.
 */
export function buyerShareUrl(pubId: string, entitlementId: string, origin: string, native = false): string {
  return `${publicShareUrl(pubId, origin, native)}?buyer=${encodeURIComponent(entitlementId)}`
}

export function currentBuyerShareUrl(pubId: string, entitlementId: string): string {
  return buyerShareUrl(pubId, entitlementId, location.origin, Capacitor.isNativePlatform())
}

/**
 * What a buyer posts alongside it. Deliberately one sentence: the card
 * underneath carries the plan's own facts, and the buyer's own words sit above
 * it — so this adds the claim they are making and nothing they did not say,
 * which is why it carries no price and no numbers.
 */
export function purchaseShareMessage(title: string, url: string): string {
  return `I bought the "${title}" plan on YatraFlow — you can see it here: ${url}`
}
