import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const apiPath = '../api/i.js'
const shareUrlPath = '../src/lib/shareUrl.ts'
const fetchMock = vi.fn<typeof fetch>()
const publication = {
  id: 'kerala-trip_1',
  title: 'Tom & Jerry\'s "Monsoon" Escape',
  tagline: 'Kochi & back via "Munnar" tea hills',
  route_summary: ['Kochi', 'Munnar'],
  duration_days: 5,
  estimated_budget_per_person_inr: 12500,
}

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

async function runHandler(method = 'GET', id: unknown = publication.id) {
  const res = makeRes()
  const { default: handler } = await import(apiPath)
  await handler({ method, query: { id } }, res)
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

describe('share preview handler in node', () => {
  it('renders publication-specific metadata and escapes benign ampersands and quotes', async () => {
    respond([publication])
    const res = await runHandler()
    const title = 'Tom &amp; Jerry&#39;s &quot;Monsoon&quot; Escape — YatraFlow'
    const description = 'Kochi &amp; back via &quot;Munnar&quot; tea hills'
    const canonical = `https://yatraflow-blond.vercel.app/i/${publication.id}`
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.body).toContain(`<title>${title}</title>`)
    for (const property of ['og:title', 'twitter:title']) {
      expect(res.body).toContain(`${property}" content="${title}"`)
    }
    for (const property of ['description', 'og:description', 'twitter:description']) {
      expect(res.body).toContain(`${property}" content="${description}"`)
    }
    expect(res.body).toContain(`og:url" content="${canonical}"`)
    expect(res.body).toContain(`<link rel="canonical" href="${canonical}"`)
    expect(res.body).toContain(`location.replace("/#/pub/${publication.id}")`)
    expect(res.body).toContain(`href="/#/pub/${publication.id}"`)
    expect(res.body).not.toContain('og:image')
    expect(res.body).not.toContain('twitter:image')
    expect(res.body).toContain('twitter:card" content="summary"')
  })

  it('uses duration, Indian-formatted budget and array route facts without a tagline', async () => {
    respond([{ ...publication, tagline: null }])
    const res = await runHandler()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('content="5 days · ₹12,500/person · Kochi → Munnar"')
  })

  it('supports a string route summary', async () => {
    respond([{ ...publication, tagline: '', route_summary: 'Delhi & Agra' }])
    expect((await runHandler()).body).toContain('5 days · ₹12,500/person · Delhi &amp; Agra')
  })

  it('includes an optional https cover in Open Graph and Twitter metadata', async () => {
    respond([{ ...publication, cover_image_url: 'https://images.example.test/cover.jpg?width=800&height=400' }])
    const res = await runHandler()
    for (const property of ['og:image', 'twitter:image']) {
      expect(res.body).toContain(`${property}" content="https://images.example.test/cover.jpg?width=800&amp;height=400"`)
    }
    expect(res.body).toContain('twitter:card" content="summary_large_image"')
  })

  it.each([undefined, null, '', 'http://images.example.test/cover.jpg'])('omits a missing or non-https cover (%s)', async cover => {
    respond([{ ...publication, cover_image_url: cover }])
    const res = await runHandler()
    expect(res.body).not.toContain('og:image')
    expect(res.body).not.toContain('twitter:image')
    expect(res.body).toContain('twitter:card" content="summary"')
  })

  it('honors the configured public origin without a trailing slash', async () => {
    vi.stubEnv('PUBLIC_ORIGIN', 'https://app.example.test/')
    respond([publication])
    expect((await runHandler()).body).toContain(`href="https://app.example.test/i/${publication.id}"`)
  })

  it('fetches only the publication REST row with an AbortSignal, never the application shell', async () => {
    respond([publication])
    await runHandler()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    const target = new URL(String(url))
    expect(target.origin).toBe('https://database.example.test')
    expect(target.pathname).toBe('/rest/v1/published_itineraries')
    expect(target.searchParams.get('id')).toBe(`eq.${publication.id}`)
    expect(target.searchParams.get('limit')).toBe('1')
    expect(target.searchParams.get('select')?.split(',')).toEqual([
      'id', 'title', 'tagline', 'route_summary', 'cover_image_url', 'duration_days', 'estimated_budget_per_person_inr',
    ])
    expect(init?.headers).toMatchObject({ apikey: 'test-anon-key', authorization: 'Bearer test-anon-key' })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.signal?.aborted).toBe(false)
  })

  it.each(['GET', 'HEAD'])('%s returns 404 for a missing publication', async method => {
    respond([])
    const res = await runHandler(method)
    expect(res.statusCode).toBe(404)
    expect(res.headers['cache-control']).toBe('no-store')
    if (method === 'HEAD') {
      expect(res.body).toBe('')
      expect(res.ended).toBe(true)
    }
  })

  it('HEAD returns the successful GET status and headers without a body', async () => {
    respond([publication])
    const get = await runHandler()
    respond([publication])
    const head = await runHandler('HEAD')
    expect(head.statusCode).toBe(200)
    expect(head.statusCode).toBe(get.statusCode)
    expect(head.headers).toEqual(get.headers)
    expect(head.body).toBe('')
    expect(head.ended).toBe(true)
  })

  it.each(['GET', 'HEAD'])('%s returns 503 no-store when fetch rejects', async method => {
    fetchMock.mockRejectedValue(new Error('Offline fixture'))
    const res = await runHandler(method)
    expect(res.statusCode).toBe(503)
    expect(res.headers['cache-control']).toBe('no-store')
    if (method === 'HEAD') expect(res.body).toBe('')
  })

  it.each(['upstream error', 'invalid JSON', 'unexpected shape'])('returns 503 no-store for %s', async failure => {
    if (failure === 'upstream error') respond({}, 500)
    else if (failure === 'invalid JSON') fetchMock.mockResolvedValue(new Response('Unavailable'))
    else respond({ message: 'Unavailable' })
    const res = await runHandler()
    expect(res.statusCode).toBe(503)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it.each(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'both'])('returns 503 no-store without fetch when %s is missing', async missing => {
    if (missing !== 'SUPABASE_ANON_KEY') vi.stubEnv('SUPABASE_URL', undefined)
    if (missing !== 'SUPABASE_URL') vi.stubEnv('SUPABASE_ANON_KEY', undefined)
    const res = await runHandler()
    expect(res.statusCode).toBe(503)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['', 'two words', 'x'.repeat(65), undefined])('rejects an invalid simple id (%s) without fetch', async id => {
    const res = makeRes()
    const { default: handler } = await import(apiPath)
    await handler({ method: 'GET', query: { id } }, res)
    expect(res.statusCode).toBe(400)
    expect(res.ended).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([[['one']], [['one', 'two']]])('rejects an array id (%j) without fetch', async id => {
    const res = await runHandler('GET', id)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['POST', 'PUT', 'DELETE', 'OPTIONS'])('returns 405 for %s without fetch', async method => {
    const res = await runHandler(method)
    expect(res.statusCode).toBe(405)
    expect(res.headers.allow).toBe('GET, HEAD')
    expect(res.body).toBe('')
    expect(res.ended).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('public share URLs', () => {
  it.each(['https://app.example.test', 'https://app.example.test/'])('uses root /i/id for web origin %s', async origin => {
    const { publicShareUrl } = await import(shareUrlPath)
    expect(publicShareUrl(publication.id, origin)).toBe(`https://app.example.test/i/${publication.id}`)
    expect(publicShareUrl(publication.id, origin, false)).toBe(`https://app.example.test/i/${publication.id}`)
  })

  it.each(['capacitor://localhost', 'http://localhost', 'https://preview.example.test'])('uses production https for native origin %s', async origin => {
    const { publicShareUrl } = await import(shareUrlPath)
    expect(publicShareUrl(publication.id, origin, true)).toBe(`https://yatraflow-blond.vercel.app/i/${publication.id}`)
  })
})

describe('public share source wiring', () => {
  it('rewrites /i/:id to the handler and forwards the id', () => {
    const config = JSON.parse(read('../vercel.json'))
    expect(config.rewrites).toContainEqual({ source: '/i/:id', destination: '/api/i?id=:id' })
  })

  it.each(['../src/pages/PublicItinerary.tsx', '../src/pages/trip/ShareTab.tsx'])('%s calls currentPublicShareUrl for published links', path => {
    const source = read(path)
    expect(source).toMatch(/import\s*\{[^}]*\bcurrentPublicShareUrl\b[^}]*\}\s*from\s*['"][^'"]*\/lib\/shareUrl['"]/)
    expect(source).toMatch(/currentPublicShareUrl\(\s*pub\.id\s*\)/)
    expect(source).not.toContain('${location.pathname}#/pub/')
  })
})
