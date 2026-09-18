import { existsSync, readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const sitemapPath = '../api/sitemap.js'
const fetchMock = vi.fn<typeof fetch>()

// 2026-09-17T00:00:00Z — a fixed instant so the expected <lastmod> is a literal
// rather than the handler's own formatting fed back to itself.
const SEP_17_2026_MS = 1789603200000

function makeRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    ended: false,
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value },
    status(code: number) { this.statusCode = code; return this },
    send(body: string) { this.body = body; return this },
    end() { this.ended = true; return this },
  }
}

function respond(rows: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(rows), { status }))
}

async function runHandler(method = 'GET') {
  const res = makeRes()
  const { default: handler } = await import(sitemapPath)
  await handler({ method }, res)
  return res
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://database.example.test/')
  vi.stubEnv('SUPABASE_ANON_KEY', 'test-anon-key')
  vi.stubEnv('PUBLIC_ORIGIN', undefined)
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', undefined)
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new Error('Unexpected fetch'))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('robots.txt', () => {
  it('ships as a real file rather than relying on a 404', () => {
    expect(existsSync(new URL('../public/robots.txt', import.meta.url))).toBe(true)
  })

  it('allows the app, blocks the API and the map proxy, and points at the sitemap', () => {
    const robots = read('../public/robots.txt')
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    // The /i/<id> rewrite target: indexing it would duplicate every itinerary.
    expect(robots).toMatch(/^Disallow: \/api\/$/m)
    expect(robots).toMatch(/^Disallow: \/mappls\/$/m)
    expect(robots).toMatch(/^Sitemap: https:\/\/yatraflow-blond\.vercel\.app\/sitemap\.xml$/m)
  })

  it('does not try to disallow hash routes, which a crawler never sends', () => {
    // A fragment is not part of the request, so `Disallow: /#/trips` would be
    // inert. Guard against the rule being added later by someone who assumes
    // otherwise — the hash-routed screens are `/` and share the shell's rules.
    expect(read('../public/robots.txt')).not.toMatch(/Disallow:.*#/)
  })
})

describe('vercel.json', () => {
  it('routes /sitemap.xml to the sitemap handler and keeps the publication rewrite', () => {
    const config = JSON.parse(read('../vercel.json'))
    expect(config.rewrites).toContainEqual({ source: '/sitemap.xml', destination: '/api/sitemap' })
    expect(config.rewrites).toContainEqual({ source: '/i/:id', destination: '/api/i?id=:id' })
  })
})

describe('sitemap handler in node', () => {
  it('lists the shell and every publication as absolute URLs', async () => {
    respond([
      { id: 'kerala-trip_1', refreshed_at: null, published_at: SEP_17_2026_MS },
      { id: 'goa-north', refreshed_at: null, published_at: SEP_17_2026_MS },
    ])
    const res = await runHandler()
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/xml; charset=utf-8')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.body).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(res.body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    expect(res.body).toContain('<loc>https://yatraflow-blond.vercel.app/</loc>')
    expect(res.body).toContain('<loc>https://yatraflow-blond.vercel.app/i/kerala-trip_1</loc>')
    expect(res.body).toContain('<loc>https://yatraflow-blond.vercel.app/i/goa-north</loc>')
    expect(res.body.trimEnd().endsWith('</urlset>')).toBe(true)
  })

  it('reads the catalogue from the published-itineraries table', async () => {
    respond([])
    await runHandler()
    const [requested] = fetchMock.mock.calls[0] as [string]
    expect(String(requested)).toContain('/rest/v1/published_itineraries')
    expect(String(requested)).toContain('select=id,refreshed_at,published_at')
  })

  it('prefers refreshed_at over published_at, and falls back when it is null', async () => {
    const earlier = SEP_17_2026_MS - 86_400_000 // 2026-09-16
    respond([
      { id: 'refreshed', refreshed_at: SEP_17_2026_MS, published_at: earlier },
      { id: 'never-refreshed', refreshed_at: null, published_at: SEP_17_2026_MS },
    ])
    const res = await runHandler()
    expect(res.body).toContain('<loc>https://yatraflow-blond.vercel.app/i/refreshed</loc>\n    <lastmod>2026-09-17</lastmod>')
    expect(res.body).toContain('<loc>https://yatraflow-blond.vercel.app/i/never-refreshed</loc>\n    <lastmod>2026-09-17</lastmod>')
  })

  it('omits lastmod entirely rather than guessing when no timestamp is usable', async () => {
    respond([{ id: 'undated', refreshed_at: null, published_at: null }])
    const res = await runHandler()
    expect(res.body).toContain('<loc>https://yatraflow-blond.vercel.app/i/undated</loc>')
    expect(res.body).not.toContain('<lastmod>')
  })

  it('skips rows whose id could not be a valid publication path', async () => {
    respond([
      { id: 'fine', refreshed_at: null, published_at: SEP_17_2026_MS },
      { id: 'has space', refreshed_at: null, published_at: SEP_17_2026_MS },
      { id: '', refreshed_at: null, published_at: SEP_17_2026_MS },
      { id: 42, refreshed_at: null, published_at: SEP_17_2026_MS },
    ])
    const res = await runHandler()
    expect(res.body).toContain('/i/fine')
    expect(res.body).not.toContain('has space')
    expect(res.body).not.toContain('has+space')
    expect((res.body.match(/<loc>/g) ?? []).length).toBe(2) // shell + one publication
  })

  it('serves the shell alone when the catalogue is genuinely empty', async () => {
    respond([])
    const res = await runHandler()
    expect(res.statusCode).toBe(200)
    expect((res.body.match(/<loc>/g) ?? []).length).toBe(1)
  })

  it('answers 503 rather than publishing a sitemap that omits every itinerary', async () => {
    // A valid-looking document listing only `/` would tell a crawler the
    // publications are gone. Unreachable must be distinguishable from empty.
    fetchMock.mockRejectedValue(new Error('network down'))
    const res = await runHandler()
    expect(res.statusCode).toBe(503)
    expect(res.body).toBe('')
  })

  it('answers 503 when the database credentials are absent', async () => {
    vi.stubEnv('SUPABASE_URL', undefined)
    vi.stubEnv('SUPABASE_ANON_KEY', undefined)
    const res = await runHandler()
    expect(res.statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches at the edge for an hour', async () => {
    respond([])
    const res = await runHandler()
    expect(res.headers['cache-control']).toContain('s-maxage=3600')
  })

  it('rejects writes and answers HEAD without a body', async () => {
    const post = await runHandler('POST')
    expect(post.statusCode).toBe(405)
    expect(post.headers.allow).toBe('GET, HEAD')

    respond([])
    const head = await runHandler('HEAD')
    expect(head.statusCode).toBe(200)
    expect(head.body).toBe('')
    expect(head.ended).toBe(true)
  })

  it('honours PUBLIC_ORIGIN so preview deployments do not advertise production URLs', async () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://preview.example.test/')
    respond([])
    const res = await runHandler()
    expect(res.body).toContain('<loc>https://preview.example.test/</loc>')
    expect(res.body).not.toContain('yatraflow-blond.vercel.app')
  })

  it('escapes XML metacharacters in the origin instead of emitting raw markup', async () => {
    // The escape function is the only barrier between an env-provided origin and
    // malformed XML. Codacy reads its `[...]` lookup as a "Generic Object Injection
    // Sink"; this asserts the emitted document, which is what actually matters and
    // is narrower than the pattern that cannot see the character-class restriction.
    vi.stubEnv('PUBLIC_ORIGIN', 'https://ex.test/?a=1&b=<2>')
    respond([])
    const res = await runHandler()
    expect(res.body).toContain('<loc>https://ex.test/?a=1&amp;b=&lt;2&gt;/</loc>')
  })
})
