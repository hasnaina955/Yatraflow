// The public URL for a published itinerary.
//
// Why a path and not a fragment: the app routes on the hash, so `/#/pub/<id>`
// never reaches a server. Every shared itinerary serves the same `/` document,
// and a preview fetcher — WhatsApp, Slack, Facebook, X — has no way to tell one
// itinerary from another. It renders a bare blue URL, in the one channel this
// product is built around.
//
// `/i/<id>` is a real path, so it can be routed, read and tagged: `vercel.json`
// sends it to `api/i.js`, which returns the app shell with that itinerary's
// Open Graph tags injected. Humans still land in the app; crawlers read the card.
//
// Existing `#/pub/<id>` links keep working — the router still resolves them, so
// anything already shared does not break.
//
// `origin` and `pathname` are parameters rather than reads of `location` so the
// shape is testable: the suite runs in the node environment, where there is no
// `location` to read.
export function publicShareUrl(pubId: string, origin: string, pathname: string): string {
  // Everything up to the last `/` — `/` stays `/`, `/index.html` becomes `/`.
  // Hash routing means this is always `/` in practice; keeping it derived means
  // a sub-path deployment does not silently produce a broken link.
  const base = pathname.replace(/[^/]*$/, '')
  return `${origin}${base}i/${pubId}`
}

/** The same URL for the page currently open. */
export function currentPublicShareUrl(pubId: string): string {
  return publicShareUrl(pubId, location.origin, location.pathname)
}
