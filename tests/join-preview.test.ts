// ============ /join/<code>: the private invite card (#1042, #1045) ============
// Every anonymous request gets one generic card. The card names no trip.
// It shows no title, no day count and no names. The og:url carries no code.
// These tests pin the card, the headers, the fallback, and the shared rules.
// The server copies of the invite-code rules agree with src/lib/inviteCode.ts.
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import handler, { inviteHead, renderInvitePage } from '../api/join.js'
import { headTags } from '../api/_headTemplate.js'
import { dayCountForRange as serverDayCount } from '../api/_dayCount.js'
import { looksLikeInviteCode as serverLooks, normalizeInviteCode as serverNormalize } from '../api/_inviteCode.js'
import { dayCountForRange } from '../src/lib/dayCount'
import { looksLikeInviteCode, normalizeInviteCode } from '../src/lib/inviteCode'

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

/** A stand-in for the built shell: the managed head tags, hashed assets and root. */
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
const TITLE = '<title>You&#39;re invited to a trip on YatraFlow</title>'
const DESCRIPTION = '<meta name="description" content="Open the link to see the trip and join." />'

/** Stubs the shell read. The handler must make no other read. Returns the URLs fetched. */
function stubFetch(options: { shell?: 'ok' | 'fail' } = {}) {
  const calls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/app.html')) {
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

describe('every anonymous request gets the same private-invite card', () => {
  it('shows the generic title and description, and no trip data', async () => {
    stubFetch()
    const res = await run('GET', CODE)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(TITLE)
    expect(res.body).toContain(DESCRIPTION)
    expect(res.body).toContain(`<meta property="og:title" content="You&#39;re invited to a trip on YatraFlow" />`)
  })

  it('shows no trip title, day count, name, date or member', async () => {
    stubFetch()
    const res = await run('GET', CODE)
    for (const secret of ['Rajasthan', 'Winter', '4 days', 'Delhi', 'Jaipur', 'Jodhpur', 'owner-private-id', 'Amber Fort', '2026-12-01']) {
      expect(res.body, secret).not.toContain(secret)
    }
  })

  it('names /join in og:url, with no code in any meta tag', async () => {
    stubFetch()
    const res = await run('GET', CODE)
    expect(res.body).toContain(`<meta property="og:url" content="${ORIGIN}/join" />`)
    expect(res.body).not.toContain(CODE)
    expect(res.body).not.toContain('/join/')
  })

  it('gives byte-identical output for a valid, an invalid and a malformed code', async () => {
    const bodies: string[] = []
    for (const code of [CODE, 'GOA-XXXX', '<script>alert(1)</script>', '', 'not a code at all']) {
      stubFetch()
      const res = await run('GET', code)
      bodies.push(res.body)
    }
    expect(new Set(bodies).size).toBe(1)
    expect(bodies[0]).toContain(TITLE)
    expect(bodies[0]).toContain(DESCRIPTION)
  })

  it('makes no trip read for a code of any shape', async () => {
    for (const code of [CODE, 'GOA-XXXX', '<script>alert(1)</script>']) {
      const calls = stubFetch()
      await run('GET', code)
      expect(calls).toEqual([`${ORIGIN}/app.html`])
      expect(calls.some(url => url.includes('/rpc/'))).toBe(false)
    }
  })
})

describe('the response is noindex, uncached, and never an error page', () => {
  it('sets no-store and noindex on a card and a refusal', async () => {
    stubFetch()
    for (const res of [await run('GET', CODE), await run('POST', CODE)]) {
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.headers['x-robots-tag']).toBe('noindex')
      expect(res.headers['x-content-type-options']).toBe('nosniff')
    }
    const card = await run('GET', CODE)
    expect(card.body).toContain('<meta name="robots" content="noindex" />')
  })

  it('refuses a method other than GET or HEAD with 405, and allows GET and HEAD', async () => {
    const res = await run('POST', CODE)
    expect(res.statusCode).toBe(405)
    expect(res.headers.allow).toBe('GET, HEAD')
  })

  it('answers HEAD with headers only, and makes no read', async () => {
    const calls = stubFetch()
    const res = await run('HEAD', CODE)
    expect(res.statusCode).toBe(200)
    expect(res.ended).toBe(true)
    expect(res.body).toBe('')
    expect(calls).toEqual([])
  })

  it('keeps the generic card and a link into the app when the shell cannot be read', async () => {
    stubFetch({ shell: 'fail' })
    const res = await run('GET', CODE)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain(TITLE)
    expect(res.body).toContain('<main><p>Open <a href="/">YatraFlow</a> to join the trip together.</p></main>')
    expect(res.body).toContain('<div id="root"><main>')
    expect(res.body).not.toContain('<h1')
  })
})

describe('the page keeps the app shell, with the invite head in place of the homepage head', () => {
  it('keeps the hashed app assets and the root the app boots into', async () => {
    stubFetch()
    const res = await run('GET', CODE)
    expect(res.body).toContain('<script type="module" crossorigin src="/assets/index-abc123.js"></script>')
    expect(res.body).toContain('<link rel="stylesheet" crossorigin href="/assets/index-def456.css">')
    expect(res.body).toContain('<div id="root"><noscript>')
  })

  it('carries one title, one description and one og:url, and no canonical', async () => {
    stubFetch()
    const res = await run('GET', CODE)
    expect(res.body.match(/<title>/g)?.length).toBe(1)
    expect(res.body.match(/<meta name="description"/g)?.length).toBe(1)
    expect(res.body.match(/<meta property="og:url"/g)?.length).toBe(1)
    expect(res.body).toContain(`<meta property="og:url" content="${ORIGIN}/join" />`)
    expect(res.body).not.toContain('rel="canonical"')
    expect(res.body).not.toContain('Site title')
  })

  it('uses the invite card at its real size, for the image and the X card alike', async () => {
    stubFetch()
    const res = await run('GET', CODE)
    expect(res.body).toContain(`<meta property="og:image" content="${ORIGIN}/og/invite.png" />`)
    expect(res.body).toContain('<meta property="og:image:width" content="1200" />')
    expect(res.body).toContain('<meta property="og:image:height" content="630" />')
    expect(res.body).toContain(`<meta name="twitter:image" content="${ORIGIN}/og/invite.png" />`)
  })

  it('names /join in the head, with no code', () => {
    const head = inviteHead({ origin: ORIGIN })
    expect(head.url).toBe(`${ORIGIN}/join`)
    expect(head.title).toBe("You're invited to a trip on YatraFlow")
    expect(head.description).toBe('Open the link to see the trip and join.')
    expect(head).not.toHaveProperty('name')
    expect(head).not.toHaveProperty('days')
  })

  it('writes the same invite head into the shell and into the fallback', () => {
    const head = inviteHead({ origin: ORIGIN })
    expect(renderInvitePage(SHELL, head)).toContain(headTags(head))
    expect(renderInvitePage(null, head)).toContain(headTags(head))
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

  it('lets crawlers read an invite link: robots.txt does not disallow it, and the response is noindex', () => {
    expect(read('public/robots.txt')).not.toMatch(/^Disallow: \/join\/?$/m)
    const vercel = JSON.parse(read('vercel.json')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
    const rule = vercel.headers.find(entry => entry.source.startsWith('/(trip|'))
    expect(rule?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' })
    expect(new RegExp(`^${rule?.source}$`).test('/join/GOA-K7QFH3WT')).toBe(true)
  })

  it('never stores an invite response as the shell', () => {
    const sw = read('public/sw.js')
    expect(sw).toContain("pathname.startsWith('/join/')")
    expect(sw).toContain('!isOwnDocument(url.pathname)')
  })
})

describe('the card is for the link-preview bots, and every other visitor gets the app', () => {
  const vercel = JSON.parse(read('vercel.json')) as {
    rewrites: { source: string; destination: string; has?: { type: string; key: string; value: string }[] }[]
  }
  const join = vercel.rewrites.find(rule => rule.source === '/join/:code')
  const pub = vercel.rewrites.find(rule => rule.source === '/pub/:slug')
  const pattern = new RegExp(join?.has?.[0]?.value ?? '(?!)')

  it('gates the rewrite on the same user-agent condition as /pub/:slug, copied exactly', () => {
    expect(join?.has).toEqual(pub?.has)
    expect(join?.has).toHaveLength(1)
    expect(join?.has?.[0]).toMatchObject({ type: 'header', key: 'user-agent' })
    expect(join?.destination).toBe('/api/join?code=:code')
  })

  it.each([
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'facebookcatalog/1.0',
    'meta-externalagent/1.1',
    'meta-externalfetcher/1.1',
    'WhatsApp/2.23.20.0',
    'Twitterbot/1.0',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    'Slack-ImgProxy (+https://api.slack.com/robots)',
    'Discordbot/2.0; +https://discordapp.com/',
    'TelegramBot (like TwitterBot)',
    'SkypeUriPreview Preview/0.5',
    'Applebot/0.1',
    'Pinterestbot/1.0',
    'Pinterest/0.2 (+https://www.pinterest.com/bot.html)',
    'redditbot/1.0',
    'Embedly/0.2 (+https://embed.ly/)',
  ])('answers the preview bot %s with the card', agent => {
    expect(pattern.test(agent)).toBe(true)
  })

  it.each([
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    'Googlebot/2.1 (+http://www.google.com/bot.html)',
    'bingbot/2.0',
    'curl/8.4.0',
    '',
  ])('sends %j to the app, not the card', agent => {
    expect(pattern.test(agent)).toBe(false)
  })
})

describe('the card never fails: a throw answers the static generic page with the same headers', () => {
  afterEach(() => {
    vi.doUnmock('../api/_headTemplate.js')
    vi.resetModules()
  })

  it('answers 200 with the static generic page when the head writer throws', async () => {
    // A throw in the head writer, so the handler falls back to the static page.
    vi.resetModules()
    vi.doMock('../api/_headTemplate.js', async importOriginal => ({
      ...(await importOriginal<Record<string, unknown>>()),
      applyHead: () => { throw new Error('template unavailable') },
    }))
    const { default: guarded } = await import('../api/join.js')
    stubFetch()
    const res = makeRes()
    await guarded({ method: 'GET', query: { code: CODE } }, res)
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<meta name="robots" content="noindex" />')
    expect(res.body).toContain(TITLE)
    expect(res.body).toContain('<div id="root"><main>')
    expect(res.headers['cache-control']).toBe('no-store')
    expect(res.headers['x-robots-tag']).toBe('noindex')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })
})
