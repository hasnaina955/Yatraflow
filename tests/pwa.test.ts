// ============ PWA contract (phase 1: the installable shell) ============
// Source-level pins for the pieces a browser ignores SILENTLY: a manifest with
// a missing or wrong-sized icon, a service worker registered inside the native
// shell, or a cache rule that starts keeping /api responses. Every one of those
// fails quietly in production and loudly here.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

const manifest = JSON.parse(read('public/manifest.webmanifest')) as {
  name?: string
  short_name?: string
  start_url?: string
  scope?: string
  display?: string
  background_color?: string
  theme_color?: string
  icons: { src: string; sizes: string; type: string; purpose: string }[]
}
const vercel = JSON.parse(read('vercel.json')) as {
  headers?: { source: string; headers: { key: string; value: string }[] }[]
}
const sw = read('public/sw.js')
const html = read('index.html')
const main = read('src/main.tsx')

describe('the manifest makes the app installable', () => {
  it('carries the members installability actually requires', () => {
    expect(manifest.name).toBeTruthy()
    expect(manifest.short_name).toBeTruthy()
    // A hash-routed SPA installs as one document, so scope and start are '/'.
    expect(manifest.start_url).toBe('/')
    expect(manifest.scope).toBe('/')
    expect(manifest.display).toBe('standalone')
    expect(manifest.background_color).toMatch(/^#[0-9A-F]{6}$/i)
    expect(manifest.theme_color).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('ships 192 + 512 "any" icons and a maskable one — each file present at its declared size', () => {
    expect(manifest.icons.filter(i => i.purpose === 'any').map(i => i.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    )
    expect(manifest.icons.filter(i => i.purpose === 'maskable').length).toBeGreaterThan(0)

    for (const icon of manifest.icons) {
      const png = readFileSync(new URL('../public' + icon.src, import.meta.url))
      // PNG signature, then the IHDR width/height: a wrong-sized file is an
      // installability failure the manifest alone cannot reveal.
      expect(png.subarray(0, 8).toString('hex'), icon.src).toBe('89504e470d0a1a0a')
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.src).toBe(icon.sizes)
    }
  })
})

describe('the service worker caches the shell and nothing private', () => {
  it('keeps /api, the crawler cards, the sitemap and the mappls proxy out of the cache', () => {
    for (const prefix of ["'/api/'", "'/i/'", "'/c/'", "'/sitemap.xml'", "'/mappls/'"]) {
      expect(sw, `${prefix} must stay in the NEVER list`).toContain(prefix)
    }
    // Cross-origin is left to the network too: Supabase, tiles, fonts. A cached
    // auth/rest response is a correctness bug, not a performance win.
    expect(sw).toContain('url.origin !== self.location.origin')
  })

  it('serves navigations network-first with the cached shell as the offline fallback', () => {
    expect(sw).toContain("request.mode === 'navigate'")
    expect(sw).toContain('caches.match(SHELL)')
  })

  it('never skipWaiting — a running session must not have its shell swapped underneath it', () => {
    // The comment above the install handler legitimately NAMES it, so strip
    // comment lines before asserting on code (the repo's own source-scan rule).
    const code = sw
      .split('\n')
      .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n')
    expect(code).not.toContain('skipWaiting')
  })
})

describe('registration and update plumbing', () => {
  it('registers only on the web and only from a production build', () => {
    expect(main).toContain("if (!isNative && import.meta.env.PROD && 'serviceWorker' in navigator)")
    expect(main).toContain("navigator.serviceWorker.register('/sw.js')")
  })

  it('index.html links the manifest and an opaque apple-touch-icon', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
  })

  it('serves sw.js uncached — a cached worker is a worker that never updates', () => {
    const rule = (vercel.headers ?? []).find(entry => entry.source === '/sw.js')
    expect(rule, 'a /sw.js header rule must exist').toBeTruthy()
    const cacheControl = rule?.headers.find(header => header.key === 'Cache-Control')?.value ?? ''
    expect(cacheControl).toContain('no-cache')
  })
})

describe('the asset branch refuses rewritten answers (#575 Face A)', () => {
  // The host's catch-all rewrite answers a MISSING hashed asset with 200 + the
  // HTML shell. Caching that would file markup under a .js URL and serve it
  // cache-first until a version bump — the durable poison this guards against.
  const assetsBranch = () => sw.slice(sw.indexOf("startsWith('/assets/')"))

  it('bumps the version — the policy changed, so activate sweeps poisoned v1 caches', () => {
    expect(sw).toContain("const SW_VERSION = 'v7'")
  })

  it('refuses to cache a text/html response under an asset URL', () => {
    expect(assetsBranch()).toContain("type.includes('text/html')")
    expect(assetsBranch()).toContain('return Response.error()')
  })

  it('resolves an offline asset miss as a network error, not a rejected respondWith', () => {
    expect(assetsBranch()).toContain('.catch(() => Response.error())')
  })
})

describe('the prerendered copy pages never take the shell key (#1042)', () => {
  // Each copy page is its own HTML document. A navigation to one that wrote the
  // SHELL key would make that page the offline fallback for every route.
  const code = sw
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')

  it('lists the four pages with and without the trailing slash and direct index.html URLs', () => {
    expect(code, "'/index.html'").toContain("'/index.html'")
    for (const slug of ['faq', 'how-it-works', 'about', 'for-creators']) {
      expect(code, `'/${slug}'`).toContain(`'/${slug}'`)
      expect(code, `'/${slug}/'`).toContain(`'/${slug}/'`)
      expect(code, `'/${slug}/index.html'`).toContain(`'/${slug}/index.html'`)
    }
  })

  it('skips the SHELL write for those pages, and keeps the network-first navigation', () => {
    expect(code).toContain('!isOwnDocument(url.pathname)')
    expect(code).toContain("OWN_HTML.has(pathname) || pathname.startsWith('/join/')")
    expect(code).toContain('cache.put(SHELL, copy)')
    expect(code).toContain('fetch(request)')
  })

  it('confirms the bare app shell positively before writing the SHELL key', async () => {
    expect(code).toContain('isBareAppShell(html)')
    expect(html).toContain('<meta name="yatraflow-shell" content="app" />')

    const putCalls: string[] = []
    const cacheStore = new Map<string, Response>()
    const listeners = new Map<string, (event: unknown) => void>()
    const fakeCache = {
      addAll: async () => undefined,
      put: async (key: unknown, value: Response) => {
        const k = String(key)
        putCalls.push(k)
        cacheStore.set(k, value)
      },
      match: async (key: unknown) => cacheStore.get(String(key)),
    }
    let nextFetch: (request: { url: string }) => Promise<Response> = async () =>
      new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })

    const context = vm.createContext({
      URL,
      Response,
      self: {
        location: { origin: 'https://www.yatraflow.in' },
        addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
        clients: { claim: async () => undefined },
      },
      caches: {
        open: async () => fakeCache,
        match: async (key: unknown) => cacheStore.get(String(key)),
        keys: async () => [],
        delete: async () => true,
      },
      fetch: (request: { url: string }) => nextFetch(request),
    })
    vm.runInContext(sw, context)
    const onFetch = listeners.get('fetch')
    expect(onFetch).toBeTypeOf('function')

    const runNavigate = async (pathname: string) => {
      let pending: Promise<Response> | undefined
      onFetch!({
        request: { method: 'GET', mode: 'navigate', url: `https://www.yatraflow.in${pathname}` },
        respondWith: (promise: Promise<Response>) => {
          pending = promise
        },
      })
      const response = await pending
      await new Promise(resolve => setTimeout(resolve, 0))
      return response
    }

    nextFetch = async () =>
      new Response('User-agent: *\nDisallow: /trip/\n', {
        status: 200,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    await runNavigate('/robots.txt')

    nextFetch = async () =>
      new Response('<html><head><link rel="canonical" href="https://www.yatraflow.in/faq" /></head><body>faq</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    for (const pathname of ['/index.html', '/faq', '/faq/index.html', '/how-it-works/index.html', '/about/index.html', '/for-creators/index.html']) {
      await runNavigate(pathname)
    }

    nextFetch = async () =>
      new Response('<html><body>unknown 200 page</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    await runNavigate('/unknown-200-page')
    expect(putCalls).toEqual([])
    expect(cacheStore.has('/app.html')).toBe(false)

    nextFetch = async () =>
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    await runNavigate('/trips')
    expect(putCalls).toEqual(['/app.html'])

    nextFetch = async () => {
      throw new Error('offline')
    }
    const offlineTrips = await runNavigate('/trips')
    expect(offlineTrips?.status).toBe(200)
    expect(await offlineTrips?.text()).toBe(html)
  })

  it('precaches the startup JS and CSS during v5-to-current install, keeps v5 on failure, and boots offline /trips after activate', async () => {
    const origin = 'https://www.yatraflow.in'
    const v5Shell = html.replace(
      '<script type="module" src="/src/main.tsx"></script>',
      '<script type="module" crossorigin src="/assets/index-old555.js"></script>',
    )
    const v6Shell = html
      .replace(
        '</head>',
        '    <link rel="stylesheet" crossorigin href="/assets/index-new222.css" />\n    <link rel="modulepreload" crossorigin href="/assets/vendor-new333.js" />\n  </head>',
      )
      .replace(
        '<script type="module" src="/src/main.tsx"></script>',
        '<script type="module" crossorigin src="/assets/index-new111.js"></script>',
      )

    const cacheStores = new Map<string, Map<string, Response>>()
    const normalizeKey = (key: unknown) => {
      const raw = typeof key === 'string' ? key : String((key as { url?: string })?.url ?? key)
      return new URL(raw, origin).pathname
    }
    const openStore = (name: string) => {
      let map = cacheStores.get(name)
      if (!map) {
        map = new Map<string, Response>()
        cacheStores.set(name, map)
      }
      return {
        put: async (key: unknown, value: Response) => {
          map!.set(normalizeKey(key), value)
        },
        match: async (key: unknown) => {
          const hit = map!.get(normalizeKey(key))
          return hit ? hit.clone() : undefined
        },
      }
    }
    cacheStores.set(
      'yatraflow-v5',
      new Map([
        ['/app.html', new Response(v5Shell, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })],
        ['/assets/index-old555.js', new Response('console.log("v5")', { status: 200, headers: { 'content-type': 'application/javascript' } })],
      ]),
    )

    const listeners = new Map<string, (event: unknown) => void>()
    let fetchImpl: (input: string | { url: string }) => Promise<Response> = async () => {
      throw new Error('unexpected')
    }
    const context = vm.createContext({
      URL,
      Response,
      self: {
        location: { origin },
        addEventListener: (type: string, fn: (event: unknown) => void) => listeners.set(type, fn),
        clients: { claim: async () => undefined },
      },
      caches: {
        open: async (name: string) => openStore(name),
        match: async (key: unknown) => {
          const normalized = normalizeKey(key)
          for (const map of cacheStores.values()) {
            const hit = map.get(normalized)
            if (hit) return hit.clone()
          }
          return undefined
        },
        keys: async () => [...cacheStores.keys()],
        delete: async (name: string) => cacheStores.delete(name),
      },
      fetch: (input: string | { url: string }) => fetchImpl(input),
    })
    vm.runInContext(sw, context)

    const dispatchLifecycle = async (name: 'install' | 'activate') => {
      let waited: Promise<unknown> | undefined
      listeners.get(name)!({
        waitUntil: (promise: Promise<unknown>) => {
          waited = promise
        },
      })
      await waited
    }

    // Failed install: missing CSS returns rewritten 200 HTML -> install must reject and keep v5 intact.
    fetchImpl = async input => {
      const pathname = normalizeKey(input)
      if (pathname === '/app.html') return new Response(v6Shell, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      if (pathname === '/manifest.webmanifest') return new Response('{}', { status: 200, headers: { 'content-type': 'application/manifest+json' } })
      if (pathname.startsWith('/icons/')) return new Response('png', { status: 200, headers: { 'content-type': 'image/png' } })
      if (pathname === '/assets/index-new111.js') return new Response('console.log("v6")', { status: 200, headers: { 'content-type': 'application/javascript' } })
      if (pathname === '/assets/vendor-new333.js') return new Response('export const v = 6', { status: 200, headers: { 'content-type': 'application/javascript' } })
      if (pathname === '/assets/index-new222.css') return new Response(v6Shell, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      return new Response('missing', { status: 404 })
    }
    await expect(dispatchLifecycle('install')).rejects.toThrow(/Asset precache failed/)
    expect([...cacheStores.keys()]).toEqual(['yatraflow-v5'])

    // Successful install: v6 cache is populated, and v5 stays until activate runs.
    fetchImpl = async input => {
      const pathname = normalizeKey(input)
      if (pathname === '/app.html') return new Response(v6Shell, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
      if (pathname === '/manifest.webmanifest') return new Response('{}', { status: 200, headers: { 'content-type': 'application/manifest+json' } })
      if (pathname.startsWith('/icons/')) return new Response('png', { status: 200, headers: { 'content-type': 'image/png' } })
      if (pathname === '/assets/index-new111.js') return new Response('console.log("v6")', { status: 200, headers: { 'content-type': 'application/javascript' } })
      if (pathname === '/assets/vendor-new333.js') return new Response('export const v = 6', { status: 200, headers: { 'content-type': 'application/javascript' } })
      if (pathname === '/assets/index-new222.css') return new Response('body{color:#000}', { status: 200, headers: { 'content-type': 'text/css' } })
      return new Response('missing', { status: 404 })
    }
    await dispatchLifecycle('install')
    expect([...cacheStores.keys()].sort()).toEqual(['yatraflow-v5', 'yatraflow-v7'])

    await dispatchLifecycle('activate')
    expect([...cacheStores.keys()]).toEqual(['yatraflow-v7'])

    // Go offline and boot /trips: shell HTML, module script, modulepreload chunk, and stylesheet all hit v6.
    fetchImpl = async () => {
      throw new Error('offline')
    }
    const fetchResource = async (pathname: string, mode?: string) => {
      let pending: Promise<Response> | undefined
      listeners.get('fetch')!({
        request: { method: 'GET', mode, url: `${origin}${pathname}` },
        respondWith: (promise: Promise<Response>) => {
          pending = promise
        },
      })
      return await pending
    }

    const offlineShell = await fetchResource('/trips', 'navigate')
    expect(offlineShell?.status).toBe(200)
    expect(await offlineShell?.text()).toBe(v6Shell)

    const offlineJs = await fetchResource('/assets/index-new111.js')
    expect(offlineJs?.status).toBe(200)
    expect(await offlineJs?.text()).toBe('console.log("v6")')

    const offlineChunk = await fetchResource('/assets/vendor-new333.js')
    expect(offlineChunk?.status).toBe(200)
    expect(await offlineChunk?.text()).toBe('export const v = 6')

    const offlineCss = await fetchResource('/assets/index-new222.css')
    expect(offlineCss?.status).toBe(200)
    expect(await offlineCss?.text()).toBe('body{color:#000}')
  })
})
