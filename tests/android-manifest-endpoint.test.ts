// The APK update feed, served from the release page instead of a committed file.
//
// The failure this pins: a static `public/android/manifest.json` has to be
// rewritten on every release, and the tag workflow cannot commit one. So the
// feed went stale, and the installed app kept saying the check was not
// configured. `api/android-manifest.js` derives the document from the newest
// release that carries an APK asset, which makes a release cut the only step.
//
// Four things are load-bearing and only one of them is obvious: the order of the
// rewrites in `vercel.json` (a later catch-all would answer the path with
// index.html), the shape of the six fields, the approved host on the download
// URL, and a fail-closed answer when the read breaks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createUpdateChecker, type FetchOutcome, type InstalledApp } from '../src/lib/apkUpdates'

const fetchMock = vi.fn<typeof fetch>()

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

const APK_ASSET = 'https://github.com/hasnaina955/Yatraflow/releases/download/v0.83.0/YatraFlow-v0.83.0-native-debug.apk'

/** One release page, in the shape the GitHub API answers. */
function release(over: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.83.0',
    name: 'YatraFlow v0.83.0',
    draft: false,
    prerelease: false,
    assets: [{ name: 'YatraFlow-v0.83.0-native-debug.apk', browser_download_url: APK_ASSET }],
    ...over,
  }
}

function stubReleases(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  }))
}

async function run(req: Record<string, unknown> = {}) {
  const res = makeRes()
  const { default: handler } = await import('../api/android-manifest.js')
  await handler({ method: 'GET', headers: {}, ...req }, res)
  return { res, json: res.body ? JSON.parse(res.body) : undefined }
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new Error('Unexpected fetch'))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('PUBLIC_ORIGIN', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GET /android/manifest.json', () => {
  it('serves the six fields the client parses, from the newest APK release', async () => {
    stubReleases([release()])
    const { res, json } = await run()

    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['cache-control']).toContain('s-maxage=300')
    expect(json).toEqual({
      packageId: 'app.yatraflow.mobile',
      channel: 'production',
      versionCode: 8300,
      versionName: '0.83.0-native',
      notes: 'YatraFlow v0.83.0',
      downloadUrl: 'https://www.yatraflow.in/android/latest.apk',
    })
  })

  it('keeps the download on the one approved host', async () => {
    stubReleases([release()])
    const { json } = await run()
    // The host list the app is built with holds exactly this name.
    expect(new URL(json.downloadUrl).host).toBe('www.yatraflow.in')
    expect(new URL(json.downloadUrl).protocol).toBe('https:')
  })

  it('skips a release with no APK, and any draft, prerelease or odd tag', async () => {
    stubReleases([
      release({ tag_name: 'v0.84.0', assets: [] }),
      release({ tag_name: 'v0.83.1', draft: true }),
      release({ tag_name: 'v0.83.2', prerelease: true }),
      release({ tag_name: 'nightly-2026-11-03' }),
      release({ tag_name: 'v0.82.0', name: 'YatraFlow v0.82.0' }),
    ])
    const { json } = await run()
    expect(json.versionCode).toBe(8200)
    expect(json.versionName).toBe('0.82.0-native')
  })

  it('answers the download path with a 302 to the release asset', async () => {
    stubReleases([release()])
    const { res } = await run({ query: { apk: '1' } })
    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe(APK_ASSET)
    expect(res.ended).toBe(true)
    expect(res.body).toBe('')
  })

  it('fails closed when the release read breaks', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'))
    const { res, json } = await run()
    expect(res.statusCode).toBe(503)
    expect(res.headers['cache-control']).toBe('no-store')
    expect(json.error).toContain('unavailable')
  })

  it('fails closed when no release carries an APK', async () => {
    stubReleases([release({ assets: [] })])
    const { res } = await run()
    expect(res.statusCode).toBe(503)
  })

  it('fails closed on a non-200 from the release list', async () => {
    stubReleases({ message: 'rate limited' }, 403)
    const { res } = await run()
    expect(res.statusCode).toBe(503)
  })

  it('answers a write method with 405 and its allow list', async () => {
    const { res } = await run({ method: 'POST' })
    expect(res.statusCode).toBe(405)
    expect(res.headers.allow).toBe('GET, HEAD')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the release list without a token, and uses one when it is offered', async () => {
    stubReleases([release()])
    await run()
    const first = fetchMock.mock.calls[0]
    expect(first[0]).toContain('api.github.com/repos/hasnaina955/Yatraflow/releases')
    expect((first[1] as RequestInit).headers).not.toHaveProperty('authorization')

    vi.stubEnv('GITHUB_TOKEN', 'ghp_example')
    stubReleases([release()])
    await run()
    const second = fetchMock.mock.calls.at(-1)
    expect((second?.[1] as RequestInit & { headers: Record<string, string> }).headers.authorization).toBe('Bearer ghp_example')
  })
})

describe('the served document drives the installed app', () => {
  const INSTALLED: InstalledApp = {
    packageId: 'app.yatraflow.mobile',
    channel: 'production',
    versionCode: 8200,
    versionName: '0.82.0-native',
  }

  function checkerFor(installed: InstalledApp, feed: FetchOutcome) {
    return createUpdateChecker({
      installed,
      manifestUrl: 'https://www.yatraflow.in/android/manifest.json',
      approvedHosts: ['www.yatraflow.in'],
      now: () => 1_700_000_000_000,
      fetchManifest: () => Promise.resolve(feed),
      store: { read: () => null, write: () => {} },
      intervalMs: 24 * 60 * 60 * 1000,
      suppressionMs: 24 * 60 * 60 * 1000,
    })
  }

  it('offers the release to an older installed build', async () => {
    stubReleases([release()])
    const { json } = await run()
    const state = await checkerFor(INSTALLED, { ok: true, body: json }).check({ manual: true })
    expect(state.phase).toBe('newer')
    expect(state.manifest?.versionName).toBe('0.83.0-native')
  })

  it('reports the newest build as current when the codes match', async () => {
    stubReleases([release()])
    const { json } = await run()
    const installed: InstalledApp = { ...INSTALLED, versionCode: 8300, versionName: '0.83.0-native' }
    const state = await checkerFor(installed, { ok: true, body: json }).check({ manual: true })
    expect(state.phase).toBe('current')
  })
})

describe('vercel.json routes the feed ahead of the SPA catch-all', () => {
  const config = JSON.parse(
    readFileSync(fileURLToPath(new URL('../vercel.json', import.meta.url)), 'utf8'),
  ) as { rewrites: Array<{ source: string; destination: string }> }

  const indexOf = (source: string) => config.rewrites.findIndex((r) => r.source === source)

  it('sends the manifest path to the handler', () => {
    const at = indexOf('/android/manifest.json')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(config.rewrites[at].destination).toBe('/api/android-manifest')
  })

  it('sends the download path to the handler, flagged', () => {
    const at = indexOf('/android/latest.apk')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(config.rewrites[at].destination).toBe('/api/android-manifest?apk=1')
  })

  it('places both ahead of the catch-all that answers index.html', () => {
    const catchAll = config.rewrites.findIndex((r) => r.destination === '/index.html')
    expect(catchAll).toBeGreaterThan(indexOf('/android/manifest.json'))
    expect(catchAll).toBeGreaterThan(indexOf('/android/latest.apk'))
  })
})
