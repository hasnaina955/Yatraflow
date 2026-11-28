// ============ Service worker — the offline shell (PWA) ============
// Hand-rolled rather than a workbox/vite-plugin-pwa build step: no new
// dependency, no generated manifest of hashed files to drift, and the whole
// policy fits in one readable file. Three rules, in order of the fetch below:
//
//   1. Navigations -> network-first, with the cached shell as the offline
//      fallback. The app is one HTML document (hash routing), so a single
//      cached shell serves every route.
//   2. Hashed build assets (/assets/*) and icons -> cache-first. Vite hashes
//      the filename, so a cache hit is always the right bytes for that URL.
//      (A MISS is guarded: the host's catch-all rewrite answers a vanished
//      chunk with 200 + the HTML shell, and caching that would poison the URL.)
//   3. Everything else -> straight to the network, uncached. `/api/*`, the
//      `/i/<id>` crawler preview, `sitemap.xml` and the Mappls proxy are in
//      the NEVER list below; cross-origin (Supabase, tiles, fonts, Wikimedia)
//      is left alone here — a cached auth/rest response is a correctness bug,
//      and phase 2 decides deliberately which cross-origin data may be kept.
//
// The cached shell is refreshed on every successful navigation (except the
// prerendered copy pages and invite links, see isOwnDocument below), and any cache
// that is not this version's is dropped on activate — so a deploy rolls the
// offline copy forward without a version bump. Bump SW_VERSION only to force a
// full drop (e.g. when the caching policy itself changes).
// v6 confirms the bare app shell positively before caching SHELL and precaches
// the shell's startup script and stylesheet assets during install.
// v7 keeps creator claim documents out of the cache.
const SW_VERSION = 'v8'
const CACHE = `yatraflow-${SW_VERSION}`
// The bare app shell. The build writes the prerendered home page to /index.html
// and keeps the shell at /app.html, which the SPA catch-all serves for every
// other route. v5 moved the key from '/' to '/app.html'.
const SHELL = '/app.html'
const SHELL_MARKER = '<meta name="yatraflow-shell" content="app" />'
const STATIC_ASSETS = ['/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']
const SHELL_ASSETS = [SHELL, ...STATIC_ASSETS]

/** Extracts same-origin module scripts and stylesheet/modulepreload links from shell HTML. */
function extractStartupAssets(html) {
  const assets = []
  const seen = new Set()
  const add = raw => {
    if (!raw) return
    let parsed
    try {
      parsed = new URL(raw, self.location.origin)
    } catch {
      return
    }
    if (parsed.origin !== self.location.origin) return
    const assetPath = parsed.pathname + parsed.search
    if (assetPath === SHELL || seen.has(assetPath)) return
    seen.add(assetPath)
    assets.push(assetPath)
  }
  // Literal patterns only: one per attribute that the precache reads.
  const ATTR_PATTERNS = {
    type: /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    src: /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    rel: /\brel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
    href: /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i,
  }
  const attr = (attrs, name) => {
    const match = ATTR_PATTERNS[name].exec(attrs)
    return match ? (match[1] ?? match[2] ?? match[3] ?? '') : ''
  }
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1]
    if (attr(attrs, 'type').toLowerCase() === 'module') add(attr(attrs, 'src'))
  }
  for (const match of html.matchAll(/<link\b([^>]*)>/gi)) {
    const attrs = match[1]
    const rels = attr(attrs, 'rel').toLowerCase().split(/\s+/)
    if (rels.includes('stylesheet') || rels.includes('modulepreload')) add(attr(attrs, 'href'))
  }
  return assets
}

/** Fetches the shell and all startup assets before writing the new version cache.
 *  If any fetch fails or returns HTML instead of an asset, install rejects so
 *  the old worker and its cache stay in control. */
async function precacheShell() {
  const shellResponse = await fetch(SHELL)
  if (!shellResponse.ok) throw new Error(`Shell precache failed: ${shellResponse.status}`)
  const shellHtml = await shellResponse.text()
  const shellCopy = new Response(shellHtml, {
    status: shellResponse.status,
    statusText: shellResponse.statusText,
    headers: shellResponse.headers,
  })
  const urls = [...new Set([...STATIC_ASSETS, ...extractStartupAssets(shellHtml)])]
  const entries = await Promise.all(
    urls.map(async assetUrl => {
      const response = await fetch(assetUrl)
      const type = (response.headers?.get?.('content-type') ?? '').toLowerCase()
      if (!response.ok || type.includes('text/html')) {
        throw new Error(`Asset precache failed: ${assetUrl} (${response.status})`)
      }
      return [assetUrl, response]
    }),
  )
  const cache = await caches.open(CACHE)
  await cache.put(SHELL, shellCopy)
  await Promise.all(entries.map(([assetUrl, response]) => cache.put(assetUrl, response)))
}

/** True only when HTML is the bare app shell: has the marker and no canonical or robots tag. */
function isBareAppShell(html) {
  return (
    html.includes(SHELL_MARKER) &&
    !html.includes('rel="canonical"') &&
    !html.includes('name="robots"')
  )
}

/** The prerendered copy pages (#1042) and the home page. Each is its own HTML document, not the
 *  app shell. A successful navigation to one must not overwrite the SHELL key,
 *  or the offline fallback would open that page at every address. The navigation
 *  itself still goes to the network first. Exact pathnames, with and without the
 *  slash and direct index.html URLs, because /faq, /faq/ and /faq/index.html all
 *  reach the page. */
const OWN_HTML = new Set([
  '/', '/index.html',
  '/faq', '/faq/', '/faq/index.html',
  '/how-it-works', '/how-it-works/', '/how-it-works/index.html',
  '/about', '/about/', '/about/index.html',
  '/for-creators', '/for-creators/', '/for-creators/index.html',
])

/** True for a navigation whose response is that page's own HTML, not the shell:
 *  a copy page, or an invite link. An invite response names a trip (#1042), so it
 *  must never become the offline fallback for every route. */
function isOwnDocument(pathname) {
  return OWN_HTML.has(pathname) || pathname.startsWith('/join/')
}

/** Paths that must never be cached or served from cache. `/i/` and `/c/` are
 *  the tag-bearing card endpoints: a navigation to one must reach the network
 *  even in the installed app, because a successful card answer would otherwise
 *  be cached under the SHELL key — offline navigations would then open card
 *  HTML at every address (#426 slice 4). The static calculator page is the
 *  same case: its navigation must not be filed under the SHELL key. */
const NEVER = [
  '/api/', '/i/', '/c/', '/claim', '/sitemap.xml', '/mappls/',
  // The static trip cost calculators and their hub (calculators/manifest.json).
  '/calculators/', '/trip-cost-calculators/',
  '/goa-trip-cost-calculator/', '/rajasthan-trip-cost-calculator/',
  '/meghalaya-trip-cost-calculator/', '/ladakh-trip-cost-calculator/',
]

self.addEventListener('install', event => {
  event.waitUntil(precacheShell())
  // Deliberately NO skipWaiting(): a new worker takes over on the next full
  // load, so a running session never has its shell swapped underneath it. The
  // app's own stale-chunk auto-reload covers the mid-session deploy case.
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

/** True when this request must be answered by the network alone. */
function networkOnly(url) {
  if (url.origin !== self.location.origin) return true
  return NEVER.some(prefix => prefix === '/claim' ? url.pathname === prefix : url.pathname.startsWith(prefix))
}

self.addEventListener('fetch', event => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (networkOnly(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Write SHELL only for a confirmed bare app shell response.
          // Copy pages and invite links stay out by path and by content.
          const type = (response.headers?.get?.('content-type') ?? '').toLowerCase()
          const readable = !type || type.includes('text/html') || type.startsWith('text/plain')
          if (response.ok && !isOwnDocument(url.pathname) && readable) {
            const probe = response.clone()
            const writeShell = probe
              .text()
              .then(html => {
                if (!isBareAppShell(html)) return
                const copy = new Response(html, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers,
                })
                return caches.open(CACHE).then(cache => cache.put(SHELL, copy))
              })
              .catch(() => {})
            if (typeof event.waitUntil === 'function') event.waitUntil(writeShell)
          }
          return response
        })
        .catch(() => caches.match(SHELL).then(hit => hit ?? Response.error())),
    )
    return
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        hit =>
          hit ??
          fetch(request)
            .then(response => {
              // The host's catch-all rewrite answers a MISSING asset with 200
              // + the HTML shell. Caching that would file markup under a .js
              // URL and serve it cache-first forever, so only a real asset may
              // enter the cache; a rewritten answer fails like the 404 it
              // hides, and the app's stale-chunk boundary owns the recovery.
              const type = response.headers.get('content-type') ?? ''
              if (!response.ok || type.includes('text/html')) return Response.error()
              const copy = response.clone()
              caches.open(CACHE).then(cache => cache.put(request, copy))
              return response
            })
            // An offline miss resolves as a network error — a rejected
            // respondWith surfaces as an unhandled failure, not a clean miss.
            .catch(() => Response.error()),
      ),
    )
  }
})
