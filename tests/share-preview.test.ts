// Share preview: a shared itinerary link must be a real path, and the document
// it serves must carry that itinerary's own tags.
//
// Why this exists: the app routes on the hash, so `/#/pub/<id>` never reaches a
// server — every shared itinerary served the same `/` document, and a preview
// fetcher (WhatsApp, Slack, Facebook, X) had nothing itinerary-specific to read.
// It rendered a bare blue URL, in the one channel this product is built around.
//
// The fix is a chain of four links, and a break anywhere in it silently returns
// the product to the bare-URL state:
//   1. the share link must be `/i/<id>`            (src/lib/shareUrl.ts)
//   2. `/i/:id` must route to the function         (vercel.json)
//   3. the function must emit the tags             (api/i.js)
//   4. the shell must carry defaults for the rest  (index.html)
// Each is asserted below, statically, the way route-integrity.test.ts pins the
// router against its own links.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { publicShareUrl } from '../src/lib/shareUrl'

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

const html = read('index.html')
const vercel = JSON.parse(read('vercel.json')) as {
  rewrites: { source: string; destination: string }[]
}
const fn = read('api/i.js')
const publicPage = read('src/pages/PublicItinerary.tsx')
const shareTab = read('src/pages/trip/ShareTab.tsx')

describe('the share URL is a path, not a fragment', () => {
  it('builds /i/<id> from the site root', () => {
    expect(publicShareUrl('pub_1cp2i9jq872', 'https://example.com', '/')).toBe(
      'https://example.com/i/pub_1cp2i9jq872',
    )
  })

  it('survives an index.html pathname, so a sub-path host still resolves', () => {
    expect(publicShareUrl('pub_abc', 'https://example.com', '/index.html')).toBe(
      'https://example.com/i/pub_abc',
    )
  })

  it('keeps a sub-path deployment base', () => {
    expect(publicShareUrl('pub_abc', 'https://example.com', '/app/')).toBe(
      'https://example.com/app/i/pub_abc',
    )
  })

  it('never emits the hash form that previews as a bare URL', () => {
    for (const src of [publicPage, shareTab]) {
      expect(src).not.toContain('${location.origin}${location.pathname}#/pub/')
    }
  })

  it('is what both share surfaces actually call', () => {
    expect(publicPage).toContain('currentPublicShareUrl(pub.id)')
    expect(shareTab).toContain('currentPublicShareUrl(pub.id)')
  })
})

describe('/i/:id routes to the preview function', () => {
  it('rewrites to /api/i with the id as a query param', () => {
    const rule = vercel.rewrites.find((r) => r.source === '/i/:id')
    expect(rule, 'vercel.json has no /i/:id rewrite').toBeDefined()
    expect(rule!.destination).toBe('/api/i?id=:id')
  })
})

describe('the preview function emits per-itinerary tags', () => {
  it('emits the whole Open Graph set', () => {
    for (const tag of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url']) {
      expect(fn, `api/i.js does not emit ${tag}`).toContain(tag)
    }
    expect(fn).toContain('twitter:card')
  })

  it('reads the publication from Supabase', () => {
    expect(fn).toContain('published_itineraries')
    expect(fn).toContain('process.env.SUPABASE_URL')
    expect(fn).toContain('process.env.SUPABASE_ANON_KEY')
  })

  it('validates the id instead of trusting the query string', () => {
    // The id reaches a REST query and an inline script. A raw interpolation
    // there is an injection; the shape check is what makes it safe.
    expect(fn).toMatch(/const ID_RE = /)
    expect(fn).toContain('ID_RE.test(raw)')
  })

  it('escapes the id before it reaches the inline redirect', () => {
    // `encodeURIComponent` leaves an apostrophe alone, so it cannot be the only
    // guard on a value interpolated into a <script>.
    expect(fn).toContain('jsStr(id)')
    expect(fn).toContain('u003c')
    expect(fn).toContain('u003e')
  })

  it('serves absolute asset paths, so the app boots at /i/<id>', () => {
    // The deployed shell references its bundle as `./assets/…` so the Capacitor
    // build works from `file://`. Served at `/i/<id>` that resolves against
    // `/i/` and 404s — the tags would be right and the page would be blank.
    expect(fn).toContain('absoluteAssets(')
    expect(fn).toContain(String.raw`\.\/assets\/`)
    expect(fn).toContain('$1="/assets/')
  })

  it('never builds its fetch target from a request header', () => {
    // `host` / `x-forwarded-host` are caller-controlled. Feeding one into
    // `fetch()` makes this route an open proxy: it fetches an arbitrary URL
    // from the deployment's network, and the body is then returned as HTML
    // under this domain. No escaping in the file can prevent that, because the
    // payload would be the document we chose to fetch. The origin comes from
    // the platform environment instead.
    //
    // Assert on the *access*, not the words: the file is allowed to name the
    // headers in a comment explaining why they are not read.
    expect(fn).not.toMatch(/req\.headers/)
    expect(fn).toContain('SELF_ORIGIN')
    expect(fn).toContain('process.env.VERCEL_URL')
    expect(fn).toContain('loadShell(SELF_ORIGIN)')
  })

  it('degrades instead of failing when the env or the shell is missing', () => {
    expect(fn).toContain('catch')
    expect(fn).toContain('minimal(')
  })
})

describe('the shell carries defaults for everything else', () => {
  it('has a default tag set, so a site link is never a bare URL either', () => {
    for (const tag of ['og:title', 'og:description', 'og:url', 'twitter:card']) {
      expect(html, `index.html has no default ${tag}`).toContain(tag)
    }
    expect(html).toContain('rel="canonical"')
  })

  it('ships no og:image rather than one that 404s', () => {
    // There is no web-facing raster asset in the repo yet. A broken og:image
    // renders worse than none, so the default deliberately omits it and the
    // function emits one only when the publication carries an https cover.
    expect(html).not.toMatch(/<meta[^>]+property=["']og:image["']/)
  })
})
