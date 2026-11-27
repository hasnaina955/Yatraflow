// ============ Build-time prerender of the static copy pages (#1042) ============
// The driver (scripts/prerender-static-pages.mjs) writes one HTML file per page
// from the built shell. These tests pin what that file must contain, using the
// same head writer and checks the driver runs, plus the wiring that makes
// `npm run build` and `npm run verify` run it.
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { applyHead, headTags, jsonForScript, singleHeadTags } from '../api/_headTemplate.js'
import { DEFAULT_ORIGIN } from '../api/_origin.js'
import { HOME_PAGE, STATIC_PAGES } from '../src/prerender/static-pages'
import { ABOUT_DESCRIPTION, FOR_CREATORS_DESCRIPTION, pageMeta, SITE_DESCRIPTION } from '../src/lib/pageTitle'
import { appLink } from '../src/lib/appLink'
import {
  assertPrerenderedHome, assertPrerenderedPage, homeHead, homeJsonLd, pageHead, SHELL_FILE, SHELL_MARKER,
  shouldSkipPrerender, stripShellMarker,
} from '../scripts/prerender-static-pages.mjs'
import pageCards from '../scripts/page-cards.json' with { type: 'json' }

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

/** A stand-in for the built shell: the managed head tags, the hashed assets the
 *  build writes, and the #root the shell ships with. */
const SHELL = [
  '<!doctype html>',
  '<html lang="en-IN">',
  '  <head>',
  '    <meta charset="UTF-8" />',
  '    <meta name="description" content="Site description." />',
  '    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F8F5F0" />',
  '    <meta property="og:title" content="Site title" />',
  '    <meta name="twitter:card" content="summary_large_image" />',
  '    <link rel="canonical" href="https://www.yatraflow.in/" />',
  '    <title>Site title</title>',
  '    <script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '    <link rel="stylesheet" crossorigin href="/assets/index-def456.css">',
  '  </head>',
  '  <body>',
  '    <div id="root"><noscript><p>Calculators</p></noscript></div>',
  '  </body>',
  '</html>',
].join('\n')

const sample = {
  title: 'About · YatraFlow',
  description: 'A description with a $& and $$ in it.',
  canonical: 'https://www.yatraflow.in/about',
  url: 'https://www.yatraflow.in/about',
  image: { url: 'https://www.yatraflow.in/og/page-about.png', width: 1200, height: 630, type: 'image/png', alt: 'About YatraFlow' },
}

describe('applyHead replaces the shell head, never appends to it', () => {
  it('leaves exactly one of each tag a crawler reads', () => {
    const html = applyHead(SHELL, sample, '<h1>About</h1>')
    expect(singleHeadTags(html)).toEqual({ title: 1, description: 1, canonical: 1, ogUrl: 1 })
    expect(html).toContain('<title>About · YatraFlow</title>')
    expect(html).toContain('<link rel="canonical" href="https://www.yatraflow.in/about" />')
    expect(html).not.toContain('Site title')
    expect(html).not.toContain('https://www.yatraflow.in/" />')
  })

  it('keeps the tags it does not own, and the hashed app assets', () => {
    const html = applyHead(SHELL, sample, '<h1>About</h1>')
    expect(html).toContain('<meta name="theme-color" media="(prefers-color-scheme: light)" content="#F8F5F0" />')
    expect(html).toContain('<script type="module" crossorigin src="/assets/index-abc123.js"></script>')
    expect(html).toContain('<link rel="stylesheet" crossorigin href="/assets/index-def456.css">')
    expect(html).toContain('<meta charset="UTF-8" />')
  })

  it('splices the body into #root and keeps the closing tags', () => {
    const html = applyHead(SHELL, sample, '<h1>About</h1>')
    expect(html).toContain('<div id="root"><h1>About</h1></div>')
    expect(html).not.toContain('Calculators')
    expect(html.trimEnd().endsWith('</html>')).toBe(true)
  })

  it('writes $& and $$ in copy as literal text, in the head and in the body', () => {
    const html = applyHead(SHELL, sample, '<p>Cost $& tax $$ fee</p>')
    expect(html).toContain('A description with a $&amp; and $$ in it.')
    expect(html).toContain('<div id="root"><p>Cost $& tax $$ fee</p></div>')
  })

  it('refuses a shell it cannot read, rather than writing a page without its app', () => {
    expect(() => applyHead(SHELL.replace('</head>', '</head>\n</head>'), sample, '<h1>x</h1>')).toThrow(/exactly one <\/head>/)
    expect(() => applyHead(SHELL.replace('<div id="root">', '<div id="app">'), sample, '<h1>x</h1>')).toThrow(/div id="root"/)
  })

  it('escapes every attribute value, so a quote in a title cannot break the tag', () => {
    const html = headTags({ ...sample, title: 'A "quoted" <b>title</b>' })
    expect(html).toContain('<title>A &quot;quoted&quot; &lt;b&gt;title&lt;/b&gt;</title>')
    expect(html).not.toContain('<b>')
  })
})

describe('JSON-LD inside a script element cannot end the element', () => {
  it('escapes <, > and & to unicode escapes that still parse', () => {
    const value = { text: '</script><script>alert(1)</script> & more' }
    const encoded = jsonForScript(value)
    expect(encoded).not.toContain('<')
    expect(encoded).not.toContain('>')
    expect(encoded).not.toContain('&')
    expect(JSON.parse(encoded)).toEqual(value)
  })
})

describe('the four pages render in node, with their own copy', () => {
  it('lists exactly the four copy pages, each with a slug and a title and description', () => {
    expect(STATIC_PAGES.map(page => page.slug)).toEqual(['faq', 'how-it-works', 'about', 'for-creators'])
    for (const page of STATIC_PAGES) {
      expect(page.title.length).toBeGreaterThan(0)
      expect(page.description.length).toBeGreaterThan(0)
    }
  })

  it('renders each page with a heading, and no loader text', () => {
    for (const page of STATIC_PAGES) {
      const markup = renderToStaticMarkup(createElement(page.component))
      expect(markup, page.slug).toContain('<h1')
      expect(markup, page.slug).not.toContain('Loading')
      expect(markup, page.slug).not.toContain('<script')
    }
  })

  it('takes the title and description from the same source the router applies after boot', () => {
    for (const page of STATIC_PAGES) {
      const meta = pageMeta([page.slug])
      expect(page.title).toBe(meta.title)
      expect(page.description).toBe(meta.description)
    }
  })

  it('carries the FAQPage block on /faq only, built from the same list the page renders', () => {
    const faq = STATIC_PAGES.find(page => page.slug === 'faq')
    expect(faq?.jsonLd?.['@type']).toBe('FAQPage')
    for (const page of STATIC_PAGES.filter(item => item.slug !== 'faq')) expect(page.jsonLd, page.slug).toBeUndefined()
  })

  it('gives about and for-creators their approved descriptions', () => {
    expect(pageMeta(['about']).description).toBe(ABOUT_DESCRIPTION)
    expect(pageMeta(['for-creators']).description).toBe(FOR_CREATORS_DESCRIPTION)
    expect(ABOUT_DESCRIPTION).toBe('YatraFlow helps groups plan Indian trips together, with every stop, hour and rupee in one shared plan. See what it does today and what comes next.')
    expect(FOR_CREATORS_DESCRIPTION).toBe('Turn your India travel content into timed itineraries that your audience can copy and change. See what YatraFlow gives creators today and what is next.')
  })
})

describe('the head the driver writes for each page', () => {
  it('uses the production origin, an absolute canonical, and the page card', () => {
    for (const page of STATIC_PAGES) {
      const head = pageHead(page)
      expect(head.canonical).toBe(`${DEFAULT_ORIGIN}/${page.slug}`)
      expect(head.url).toBe(head.canonical)
      expect(head.image.url).toBe(`${DEFAULT_ORIGIN}/og/${pageCards[page.slug].file}`)
      expect(head.image.alt).toBe(pageCards[page.slug].headline)
      expect(head.image.width).toBe(1200)
      expect(head.image.height).toBe(630)
    }
  })

  it('names no preview origin, even when the build runs on a preview', () => {
    const origins = STATIC_PAGES.map(page => pageHead(page).canonical.split('/').slice(0, 3).join('/'))
    expect(new Set(origins)).toEqual(new Set([DEFAULT_ORIGIN]))
  })

  it('passes the checks on a page written from the shell', () => {
    for (const page of STATIC_PAGES) {
      const html = applyHead(SHELL, pageHead(page), renderToStaticMarkup(createElement(page.component)))
      expect(() => assertPrerenderedPage(html, page), page.slug).not.toThrow()
    }
  })

  it('fails a page with a missing heading, loader text, or no app assets', () => {
    const page = STATIC_PAGES[2]
    const head = pageHead(page)
    expect(() => assertPrerenderedPage(applyHead(SHELL, head, '<p>no heading</p>'), page)).toThrow(/heading/)
    expect(() => assertPrerenderedPage(applyHead(SHELL, head, '<h1>x</h1><p>Loading…</p>'), page)).toThrow(/loader/)
    const noAssets = applyHead(SHELL, head, '<h1>x</h1>').replace(/<script type="module"[^>]*><\/script>/, '')
    expect(() => assertPrerenderedPage(noAssets, page)).toThrow(/script/)
  })
})

describe('the build skips the prerender for the file and native targets', () => {
  it('runs for the web build, which has no target set', () => {
    expect(shouldSkipPrerender({})).toBe(false)
    expect(shouldSkipPrerender({ VITE_BUILD_TARGET: '' })).toBe(false)
  })

  it('skips for the file and native targets, in any letter case', () => {
    expect(shouldSkipPrerender({ VITE_BUILD_TARGET: 'file' })).toBe(true)
    expect(shouldSkipPrerender({ VITE_BUILD_TARGET: ' Native ' })).toBe(true)
  })
})

describe('the app link works without a window (the prerender runs in node)', () => {
  it('builds the path form of a copy page link with no location object', () => {
    expect(typeof (globalThis as { location?: unknown }).location).toBe('undefined')
    expect(appLink('/about').href).toContain('/about')
    expect(appLink('/how-it-works').href).toContain('/how-it-works')
  })
})

describe('the wiring that runs the prerender', () => {
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> }

  it('runs the driver after the Vite build in npm run build', () => {
    expect(pkg.scripts.build).toContain('vite build')
    expect(pkg.scripts.build).toContain('node scripts/prerender-static-pages.mjs')
    expect(pkg.scripts.build.indexOf('node scripts/prerender-static-pages.mjs'))
      .toBeGreaterThan(pkg.scripts.build.indexOf('vite build'))
  })

  it('ends npm run verify with a build that runs the driver too', () => {
    expect(pkg.scripts.verify).toMatch(/vite build && node scripts\/prerender-static-pages\.mjs$/)
  })

  it('serves each copy page from its prerendered file, with and without the slash, before the SPA catch-all', () => {
    const vercel = JSON.parse(read('vercel.json')) as { rewrites: { source: string; destination: string }[] }
    const sources = vercel.rewrites.map(rule => rule.source)
    const catchAll = sources.findIndex(source => source.startsWith('/((?!'))
    expect(catchAll).toBe(vercel.rewrites.length - 1)
    for (const slug of ['faq', 'how-it-works', 'about', 'for-creators']) {
      for (const source of [`/${slug}`, `/${slug}/`]) {
        const index = vercel.rewrites.findIndex(rule => rule.source === source)
        expect(index, source).toBeGreaterThanOrEqual(0)
        expect(index, source).toBeLessThan(catchAll)
        expect(vercel.rewrites[index].destination).toBe(`/${slug}/index.html`)
      }
    }
  })

  it('adds no trailing-slash redirect for the copy pages', () => {
    const vercel = JSON.parse(read('vercel.json')) as { redirects?: { source: string }[] }
    const redirected = (vercel.redirects ?? []).map(rule => rule.source)
    for (const slug of ['faq', 'how-it-works', 'about', 'for-creators']) {
      expect(redirected).not.toContain(`/${slug}`)
      expect(redirected).not.toContain(`/${slug}/`)
    }
  })

  it('keeps the FAQ schema block identifiable, so the page replaces it rather than doubling it', () => {
    const faq = read('src/pages/FaqPage.tsx')
    expect(faq).toContain("script[data-faq-schema]")
    expect(faq).toContain("script.setAttribute('data-faq-schema', '')")
  })
})

describe('the prerendered home page', () => {
  it('carries the router title, the site description, the home canonical and the site card', () => {
    const head = homeHead(HOME_PAGE)
    expect(head.title).toBe(pageMeta([]).title)
    expect(head.description).toBe(SITE_DESCRIPTION)
    expect(head.canonical).toBe(`${DEFAULT_ORIGIN}/`)
    expect(head.url).toBe(head.canonical)
    expect(head.image.url).toBe(`${DEFAULT_ORIGIN}/og-default.png`)
    expect(head.image.width).toBe(1200)
    expect(head.image.height).toBe(630)
  })

  it('uses the description that the shell ships', () => {
    expect(read('index.html')).toContain(`<meta name="description" content="${SITE_DESCRIPTION}" />`)
  })

  it('names the Organization and the WebSite at the production origin', () => {
    const schema = homeJsonLd() as { '@context': string; '@graph': { '@type': string; url: string }[] }
    expect(schema['@context']).toBe('https://schema.org')
    expect(schema['@graph'].map(node => node['@type'])).toEqual(['Organization', 'WebSite'])
    for (const node of schema['@graph']) expect(node.url).toBe(`${DEFAULT_ORIGIN}/`)
  })

  it('passes the checks when the landing page is rendered into the shell', () => {
    const html = applyHead(SHELL, homeHead(HOME_PAGE), renderToStaticMarkup(createElement(HOME_PAGE.component)))
    expect(() => assertPrerenderedHome(html)).not.toThrow()
    expect(html).toContain('data-site-schema')
    expect(singleHeadTags(html)).toEqual({ title: 1, description: 1, canonical: 1, ogUrl: 1 })
  })

  it('fails a home page with no heading', () => {
    expect(() => assertPrerenderedHome(applyHead(SHELL, homeHead(HOME_PAGE), '<p>no heading</p>'))).toThrow(/heading/)
  })
})

describe('the bare shell stays at its own address', () => {
  const vercel = JSON.parse(read('vercel.json')) as {
    rewrites: { source: string; destination: string }[]
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }

  it('serves every other route from the bare shell, not from the home page', () => {
    const catchAll = vercel.rewrites.find(rule => rule.source.startsWith('/((?!'))
    expect(catchAll?.destination).toBe(`/${SHELL_FILE}`)
  })

  it('keeps the shell address out of the index', () => {
    const rule = vercel.headers.find(entry => entry.source === `/${SHELL_FILE}`)
    expect(rule?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' })
  })

  it('gives the service worker the bare shell as its offline copy, and never the home page', () => {
    const sw = read('public/sw.js')
    expect(sw).toContain(`const SHELL = '/${SHELL_FILE}'`)
    expect(sw).toMatch(/const OWN_HTML = new Set\(\[\s*'\/',/)
    expect(read('index.html')).toContain(SHELL_MARKER)
    const stripped = stripShellMarker(read('index.html'))
    expect(stripped).not.toContain(SHELL_MARKER)
    const home = applyHead(
      stripped.replace('</head>', '    <script type="module" src="/assets/index-abc123.js"></script><link rel="stylesheet" href="/assets/index-def456.css">\n  </head>'),
      homeHead(HOME_PAGE),
      renderToStaticMarkup(createElement(HOME_PAGE.component)),
    )
    expect(() => assertPrerenderedHome(home)).not.toThrow()
    expect(() => assertPrerenderedHome(home.replace('</head>', `    ${SHELL_MARKER}\n  </head>`))).toThrow(/bare shell marker/)
  })

  it('builds the invite card from the bare shell', () => {
    expect(read('api/join.js')).toContain(`/${SHELL_FILE}\``)
  })
})
