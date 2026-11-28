// ============ App-only routes carry no homepage canonical, and are noindex (#1042) ============
// Every app route is served the same shell, so the shell cannot name a different
// canonical or robots tag per route. The fix is split three ways: the shell names
// no canonical; the home page's canonical is an HTTP Link header; the app-only
// paths get an X-Robots-Tag header; and App sets each route's own canonical and
// robots tag after boot. These tests pin each part, and the paths they must match.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canonicalPath, isPrivateRoute, routeParts } from '../src/lib/pageTitle'

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('the route helpers name the private pages and the canonical pages', () => {
  it.each([
    '/trip/11111111-2222-3333-4444-555555555555', '/trip/abc/map', '/trips', '/new', '/profile', '/purchases',
    '/creator-hub', '/admin', '/auth?mode=signup', '/created/abc', '/share/payload', '/join/GOA-K7QFH3WT',
    '/invite/11111111-2222-3333-4444-555555555555', '/claim',
  ])('marks %s as private, so it is noindex', route => {
    expect(isPrivateRoute(routeParts(route))).toBe(true)
  })

  it.each(['/', '/faq', '/how-it-works', '/about', '/for-creators', '/explore', '/creators', '/pub/abc', '/creator/x', '/dmca'])(
    'leaves %s public, so it is not marked private',
    route => {
      expect(isPrivateRoute(routeParts(route))).toBe(false)
    },
  )

  it('names the home page and the four copy pages as their own canonical', () => {
    expect(canonicalPath(routeParts('/'))).toBe('/')
    expect(canonicalPath(routeParts('/faq'))).toBe('/faq')
    expect(canonicalPath(routeParts('/how-it-works'))).toBe('/how-it-works')
    expect(canonicalPath(routeParts('/about'))).toBe('/about')
    expect(canonicalPath(routeParts('/for-creators'))).toBe('/for-creators')
  })

  it('names no canonical for any other route, so none inherits the home page', () => {
    for (const route of ['/trip/abc', '/trips', '/new', '/explore', '/creators', '/pub/abc', '/faq/x?section=codes']) {
      const expected = route.startsWith('/faq') ? '/faq' : null
      expect(canonicalPath(routeParts(route)), route).toBe(expected)
    }
  })
})

describe('App sets each route its own canonical and robots tag after boot', () => {
  const app = read('src/App.tsx')

  it('reads the canonical and the private-route rule from the same helpers the tests pin', () => {
    expect(app).toContain("import { canonicalPath, isPrivateRoute, pageMeta, routeParts } from './lib/pageTitle'")
    expect(app).toContain('canonicalPath(routeParts(route))')
    expect(app).toContain('isPrivateRoute(routeParts(route))')
  })

  it('creates the canonical only where a route names one, and removes it elsewhere', () => {
    expect(app).toContain("link.setAttribute('href', `${PUBLIC_ORIGIN}${canonicalTo}`)")
    expect(app).toContain('canonical?.remove()')
  })

  it('sets noindex on a private route and removes the tag elsewhere', () => {
    expect(app).toContain("robots.setAttribute('content', routeParts(route)[0] === 'claim' ? 'noindex, nofollow, noarchive' : 'noindex')")
    expect(app).toContain('robotsTag?.remove()')
  })

  it('no longer restores a homepage canonical from a stored original', () => {
    expect(app).not.toContain("getAttribute('data-site-canonical')")
  })
})

describe('the shell and the headers carry no homepage canonical on app routes', () => {
  const vercel = JSON.parse(read('vercel.json')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }

  it('the shell names no canonical', () => {
    expect(read('index.html')).not.toContain('rel="canonical"')
  })

  it('the home page names its canonical in an HTTP Link header, the form Google reads for any document', () => {
    const rule = vercel.headers.find(entry => entry.source === '/')
    expect(rule?.headers).toContainEqual({ key: 'Link', value: '<https://www.yatraflow.in/>; rel="canonical"' })
  })

  it('sends X-Robots-Tag noindex for the app-only paths, and for nothing public', () => {
    const rule = vercel.headers.find(entry => entry.source.startsWith('/(trip|'))
    expect(rule?.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex' })
    // Vercel matches a source as a path pattern. The same expression, anchored, is used
    // here: a path the header must reach matches it, and a public path does not.
    const matcher = new RegExp(`^${rule?.source}$`)
    for (const path of [
      '/trip/11111111-2222-3333-4444-555555555555', '/trip/abc/map', '/trips', '/new', '/profile',
      '/purchases', '/creator-hub', '/admin', '/auth', '/created/abc', '/share/payload', '/join/GOA-K7QFH3WT',
      '/invite/11111111-2222-3333-4444-555555555555', '/trips/',
    ]) {
      expect(matcher.test(path), path).toBe(true)
    }
    for (const path of [
      '/', '/faq', '/how-it-works', '/about', '/for-creators', '/explore', '/creators', '/pub/abc',
      '/creator/x', '/dmca', '/newsletter', '/tripsy', '/trip-cost-calculators/', '/goa-trip-cost-calculator/',
    ]) {
      expect(matcher.test(path), path).toBe(false)
    }
  })

  it('keeps the robots file disallowing the id-bearing prefixes, and leaves /join open to the preview bots', () => {
    const robots = read('public/robots.txt')
    for (const prefix of ['/trip/', '/share/', '/pub/', '/creator/', '/created/']) {
      expect(robots, prefix).toMatch(new RegExp(`^Disallow: ${prefix}$`, 'm'))
    }
    // The preview bots must fetch the invite card. Its noindex keeps it out of search.
    expect(robots).not.toMatch(/^Disallow: \/join\/?$/m)
  })
})
