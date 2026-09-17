import { Capacitor } from '@capacitor/core'

const PUBLIC_ORIGIN = 'https://yatraflow-blond.vercel.app'

export function publicShareUrl(pubId: string, origin: string, native = false): string {
  return `${native ? PUBLIC_ORIGIN : origin.replace(/\/+$/, '')}/i/${encodeURIComponent(pubId)}`
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
  const id = /^#\/pub\/([A-Za-z0-9_-]{1,64})$/.exec(location.hash)?.[1]
  const pathname = id ? `/i/${id}` : /^\/i\/[^/]+$/.test(location.pathname) ? '/' : location.pathname
  if (pathname !== location.pathname) {
    history.replaceState(history.state, '', `${pathname}${location.search}${location.hash}`)
  }
}

export function currentPublicShareUrl(pubId: string): string {
  return publicShareUrl(pubId, location.origin, Capacitor.isNativePlatform())
}
