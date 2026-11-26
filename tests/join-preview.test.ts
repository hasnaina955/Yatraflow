// ============ /join/<code>: the invite link card (#1042) ============
// The handler answers a link preview with the app's shell and an invite head: the
// trip's name and day count, and nothing else. These tests pin what it shows, what
// it reads, the headers, the fallback, and the rules its server copies share with
// the client (src/lib/inviteCode.ts and src/lib/dayCount.ts).
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { inviteHead, namedTitle, readInvite, renderInvitePage } from '../api/join.js'
import { headTags } from '../api/_headTemplate.js'
import { dayCountForRange as serverDayCount } from '../api/_dayCount.js'
import { looksLikeInviteCode as serverLooks, normalizeInviteCode as serverNormalize } from '../api/_inviteCode.js'
import { OG_TITLE_MAX } from '../api/_shareCard.js'
import { dayCountForRange } from '../src/lib/dayCount'
import { looksLikeInviteCode, normalizeInviteCode } from '../src/lib/inviteCode'

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

/** A stand-in for the built shell: the managed head tags, the hashed app assets and
 *  the #root the build writes. */
const SHELL = [
  '<!doctype html>',
  '<html lang="en-IN">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <meta name="description" content="Site description." />',
  '    <meta property="og:url" content="https://www.yatraflow.in/" />',
  '    <meta property="og:image" content="https://www.yatraflow.in/og-default.png" />',
  '    <link rel="canonical" href="https://www.yatraflow.in/" />',
  '    <title>Site title</title>',
  '    <script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '    <link rel="stylesheet" crossorigin href="/assets/index-def456.css">',
  '  </head>',
  '  <body>',
  '    <div id="root"><noscript><p>Free calculators</p></noscript></div>',
  '  </body>',
  '</html>',
].join('\n')

const ORIGIN = 'https://www.yatraflow.in'
const CODE = 'RAJASTHAN-XM9P4KTN'

interface Rpc {
  status?: number
  body?: unknown
}

/** Stubs fetch for the two reads the handler makes: the RPC and the shell. Returns the
 *  URLs fetched, so a test can say which reads ran. */
function stubFetch(options: { rpc?: Rpc | 'network'; shell?: 'ok' | 'fail' } = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith('/rest/v1/rpc/get_trip_by_invite_code')) {
      if (options.rpc === 'network') throw new TypeError('fetch failed')
      const rpc = options.rpc ?? { status: 200, body: [] }
      return new Response(JSON.stringify(rpc.body ?? []), {
        status: rpc.status ?? 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (url.endsWith('/index.html')) {
      if (options.shell === 'fail') return new Response('down', { status: 503 })
      return new Response(SHELL, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    throw new Error(`unexpected fetch ${url}`)
  }))
  return calls
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

async function run(method: string, code: string | undefined) {
  const res = makeRes()
  await handler({ method, query: code === undefined ? {} : { code } }, res)
  return res
}

/** The trip row the anonymous RPC returns, with every field a link preview must NOT show. */
function trip(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Rajasthan Winter Loop',
    owner_id: 'owner-private-id',
    start_location: 'Delhi',
    destinations: ['Jaipur', 'Jodhpur'],
    start_date: '2026-12-01',
    end_date: '2026-12-04',
    travellers: 6,
    budget_per_person_inr: 45000,
    invite_code: CODE,
    write_version: 3,
    days: [{ index: 0, stops: [{ name: 'Amber Fort' }] }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://db.example.test')
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test-key')
  vi.stubEnv('VERCEL_URL', '')
  vi.stubEnv('PUBLIC_ORIGIN', '')
  vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('the invite card names the trip and its day count, and nothing else', () => {
  it('shows the name and the day count in the title', async () => {
    stubFetch({ rpc: { body: [trip()] } })
    const res = await run('GET', CODE)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<title>Join «Rajasthan Winter Loop» · 4 days</title>')
    expect(res.body).toContain('<meta property="og:title" content="Join «Rajasthan Winter Loop» · 4 days" />')
  })

  it('shows none of the other fields the row carries', async () => {
    stubFetch({ rpc: { body: [trip()] } })
    const res = await run('GET', CODE)
    for (const secret of ['Delhi', 'Jaipur', 'Jodhpur', '45000', 'owner-private-id', 'Amber Fort', '2026-12-01', 'travellers', 'write_version']) {
      expect(res.body, secret).not.toContain(secret)
    }
  })

  it('writes the day part as "1 day" for a single date', () => {
    expect(namedTitle('Goa Weekend', 1)).toBe('Join «Goa Weekend» · 1 day')
  })

  it('leaves the day part out when the dates give no count', async () => {
    stubFetch({ rpc: { body: [trip({ start_date: null, end_date: null })] } })
    const res = await run('GET', CODE)
    expect(res.body).toContain('<title>Join «Rajasthan Winter Loop»</title>')
    expect(res.body).not.toContain(' days</title>')
  })

  it('leaves the day part out for an inverted date range', async () => {
    stubFetch({ rpc: { body: [trip({ start_date: '2026-12-04', end_date: '2026-12-01' })] } })
    const res = await run('GET', CODE)
    expect(res.body).toContain('<title>Join «Rajasthan Winter Loop»</title>')
  })

  it('cuts a long name at a word boundary, so the title stays inside the chat budget', () => {
    const title = namedTitle('A very long trip name that keeps going well past any chat preview budget at all', 12)
    expect(title.length).toBeLessThanOrEqual(OG_TITLE_MAX)
    expect(title.endsWith('» · 12 days')).toBe(true)
    expect(title).toContain('…')
  })
})

describe('the trip name is escaped everywhere it is written', () => {
  it('writes markup and quotes in the name as text, and a $& or $$ as literal text', async () => {
    // Short enough to fit the title budget, so the whole name is checked.
    const hostile = 'Goa <script>x</script> "q" $& $$'
    stubFetch({ rpc: { body: [trip({ name: hostile })] } })
    const res = await run('GET', CODE)
    expect(res.body).not.toContain('<script>x')
    expect(res.body).toContain('Goa &lt;script&gt;x&lt;/script&gt; &quot;q&quot; $&amp; $$')
    // The shell's own module script is the only script the page carries.
    expect(res.body.match(/<script\b/g)?.length).toBe(1)
  })
})

describe('the generic card: a code that resolves to nothing, and every failed read', () => {
  it.each([
    ['an empty list (no trip has the code)', { rpc: { body: [] } }],
    ['a non-OK answer', { rpc: { status: 500, body: { message: 'boom' } } }],
    ['a network error', { rpc: 'network' as const }],
    ['a row with no usable name', { rpc: { body: [trip({ name: '   ' })] } }],
    ['a non-array answer', { rpc: { body: { not: 'a list' } } }],
  ])('gives the generic card for %s', async (_label, options) => {
    stubFetch(options)
    const res = await run('GET', CODE)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain("<title>You&#39;re invited to plan a trip</title>")
    expect(res.body).not.toContain('Join «')
    expect(res.body).not.toContain('Rajasthan')
  })

  it('makes no trip read for a malformed code, and gives the generic card', async () => {
    const calls = stubFetch({ rpc: { body: [trip()] } })
    const res = await run('GET', '<script>alert(1)</script>')
    expect(calls.some(call => call.url.includes('/rpc/'))).toBe(false)
    expect(res.body).toContain("<title>You&#39;re invited to plan a trip</title>")
  })

  it('makes no trip read when the server has no database settings', async () => {
    vi.stubEnv('SUPABASE_URL', '')
    const calls = stubFetch({ rpc: { body: [trip()] } })
    const res = await run('GET', CODE)
    expect(calls.some(call => call.url.includes('/rpc/'))).toBe(false)
    expect(res.body).toContain("<title>You&#39;re invited to plan a trip</title>")
  })
})

describe('the response is noindex, uncached, and never an error page', () => {
  it('sets no-store and noindex on a named card, a generic card and a refusal', async () => {
    stubFetch({ rpc: { body: [trip()] } })
    for (const res of [await run('GET', CODE), await run('POST', CODE)]) {
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-robots-tag']).toBe('noindex')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    }
    const named = await run('GET', CODE)
    expect(named.body).toContain('<meta name="robots" content="noindex" />')
  })

  it('refuses a method other than GET or HEAD with 405, and allows GET and HEAD', async () => {
    const res = await run('POST', CODE)
    expect(res.statusCode).toBe(405)
    expect(res.headers.allow).toBe('GET, HEAD')
  })

  it('answers HEAD with headers only, and makes no read', async () => {
    const calls = stubFetch({ rpc: { body: [trip()] } })
    const res = await run('HEAD', CODE)
    expect(res.statusCode).toBe(200)
    expect(res.ended).toBe(true)
    expect(res.body).toBe('')
    expect(calls).toEqual([])
  })

  it('keeps the invite head and links into the app when the shell cannot be read', async () => {
    stubFetch({ rpc: { body: [trip()] }, shell: 'fail' })
    const res = await run('GET', CODE)
    expect(res.statusCode).toBe(200)
    // The trip is named in the head even when the shell is unavailable. Only the
    // generic body is shown, and the page still links into the app.
    expect(res.body).toContain('<title>Join «Rajasthan Winter Loop» · 4 days</title>')
    expect(res.body).toContain('<main><p>Open <a href="/">YatraFlow</a> to join the trip together.</p></main>')
    expect(res.body).toContain('<div id="root"><main>')
    expect(res.body).not.toContain('<h1')
  })

  it('answers the generic card, not an error, when the trip read throws', async () => {
    stubFetch({ rpc: 'network', shell: 'fail' })
    const res = await run('GET', CODE)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain("<title>You&#39;re invited to plan a trip</title>")
  })
})

describe('the page keeps the app shell, with the invite head in place of the homepage head', () => {
  it('keeps the hashed app assets and the root the app boots into', async () => {
    stubFetch({ rpc: { body: [trip()] } })
    const res = await run('GET', CODE)
    expect(res.body).toContain('<script type="module" crossorigin src="/assets/index-abc123.js"></script>')
    expect(res.body).toContain('<link rel="stylesheet" crossorigin href="/assets/index-def456.css">')
    expect(res.body).toContain('<div id="root"><noscript>')
  })

  it('carries one title, one description and one og:url, and no canonical', async () => {
    stubFetch({ rpc: { body: [trip()] } })
    const res = await run('GET', CODE)
    expect(res.body.match(/<title>/g)?.length).toBe(1)
    expect(res.body.match(/<meta name="description"/g)?.length).toBe(1)
    expect(res.body.match(/<meta property="og:url"/g)?.length).toBe(1)
    expect(res.body).toContain(`<meta property="og:url" content="${ORIGIN}/join/${CODE}" />`)
    expect(res.body).not.toContain('rel="canonical"')
    expect(res.body).not.toContain('Site title')
  })

  it('uses the invite card at its real size, for the image and the X card alike', async () => {
    stubFetch({ rpc: { body: [trip()] } })
    const res = await run('GET', CODE)
    expect(res.body).toContain(`<meta property="og:image" content="${ORIGIN}/og/invite.png" />`)
    expect(res.body).toContain('<meta property="og:image:width" content="1200" />')
    expect(res.body).toContain('<meta property="og:image:height" content="630" />')
    expect(res.body).toContain(`<meta name="twitter:image" content="${ORIGIN}/og/invite.png" />`)
  })

  it('omits og:url for a malformed code, since there is no address to name', () => {
    const head = inviteHead({ origin: ORIGIN })
    expect(head).not.toHaveProperty('url')
    const page = renderInvitePage(SHELL, head)
    expect(page).not.toContain('og:url" content="https://www.yatraflow.in/join/')
  })

  it('writes the same invite head into the shell and into the fallback', () => {
    const head = inviteHead({ name: 'Goa', days: 2, code: 'GOA-K7QFH3WT', origin: ORIGIN })
    expect(renderInvitePage(SHELL, head)).toContain(headTags(head))
    expect(renderInvitePage(null, head)).toContain(headTags(head))
  })
})

describe('the anonymous read is the one the invite screen makes', () => {
  it('posts the code to the invite RPC with the anonymous key, and no other key', async () => {
    const calls = stubFetch({ rpc: { body: [trip()] } })
    await readInvite(CODE)
    const rpc = calls.find(call => call.url.endsWith('/rest/v1/rpc/get_trip_by_invite_code'))
    expect(rpc).toBeDefined()
    expect(rpc?.url).toBe('https://db.example.test/rest/v1/rpc/get_trip_by_invite_code')
    expect(JSON.parse(String(rpc?.init?.body))).toEqual({ p_code: CODE })
    const headers = rpc?.init?.headers as Record<string, string>
    expect(headers.apikey).toBe('anon-test-key')
    expect(JSON.stringify(headers)).not.toContain('sb_secret')
  })

  it('reads the day count from the start and end dates the RPC returns', async () => {
    stubFetch({ rpc: { body: [trip({ start_date: '2026-03-01', end_date: '2026-03-10' })] } })
    expect(await readInvite(CODE)).toEqual({ name: 'Rajasthan Winter Loop', days: 10 })
  })

  it('keeps a priced trip out of the anonymous answer, so its card stays generic (see the migration)', () => {
    // The migration's anonymous branch returns no row for a trip with a paid published guide.
    const migration = read('supabase/migrations/20261124c_invite_preview_write_version.sql')
    expect(migration).toContain("coalesce(p.premium_price_inr, 0) > 0")
    expect(migration).toContain('grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;')
  })
})

describe('the server copies agree with the client rules', () => {
  const codes = [
    'goa-k7qfh3wt', ' GOA   K7QFH3WT ', 'GOA--K7QFH3WT', '-GOA-K7QFH3WT-', 'RAJASTHAN-XM9P4KTN',
    'GOA-K7QF', 'GOA-0OIL1I2Z', 'GOA K7QF', '', 'A-B', 'TOOLONGHEADX-K7QFH3WT', 'GOA-K7QFH3WT-EXTRA',
  ]

  it.each(codes)('normalises and checks %j the same way', code => {
    expect(serverNormalize(code)).toBe(normalizeInviteCode(code))
    expect(serverLooks(code)).toBe(looksLikeInviteCode(code))
  })

  const pairs: [string | null | undefined, string | null | undefined][] = [
    ['2026-12-01', '2026-12-04'], ['2026-12-01', '2026-12-01'], ['2026-02-30', '2026-03-01'],
    ['2026-12-04', '2026-12-01'], [null, '2026-01-01'], ['2026-13-01', '2026-13-02'],
    ['2026-03-28', '2026-04-02'], ['2026-10-30', '2026-11-02'], [undefined, undefined], ['garbage', '2026-01-01'],
  ]

  it.each(pairs)('counts the days from %s to %s the same way', (start, end) => {
    expect(serverDayCount(start, end)).toBe(dayCountForRange(start, end))
  })
})

describe('the rewrite and the cache for /join', () => {
  it('rewrites /join/:code to the handler before the SPA catch-all', () => {
    const vercel = JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] }
    const index = vercel.rewrites.findIndex(rule => rule.source === '/join/:code')
    const catchAll = vercel.rewrites.findIndex(rule => rule.source.startsWith('/((?!'))
    expect(index).toBeGreaterThanOrEqual(0)
    expect(vercel.rewrites[index].destination).toBe('/api/join?code=:code')
    expect(index).toBeLessThan(catchAll)
  })

  it('keeps /join/ out of the index in robots.txt, and never stores an invite response as the shell', () => {
    expect(read('public/robots.txt')).toMatch(/^Disallow: \/join\/$/m)
    const sw = read('public/sw.js')
    expect(sw).toContain("pathname.startsWith('/join/')")
    expect(sw).toContain('!isOwnDocument(url.pathname)')
  })
})
