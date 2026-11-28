// ============ Creator hub in the phone bottom navigation and Profile ============
// Everyone sees the four destinations (Home, My trips, Explore, Profile) with
// the Add slot in the centre. A creator reaches Creator hub from the top row of
// Profile, and /creator-hub highlights Profile in the bottom bar.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BottomNav, areaOf, navDestinations } from '../src/components/BottomNav'

const markup = (route: string) =>
  renderToStaticMarkup(createElement(BottomNav, { route, onNavigate: () => {} }))

/** The visible labels, in bar order. */
function labels(html: string): string[] {
  return Array.from(html.matchAll(/<span class="bottom-nav-label">([^<]*)<\/span>/g)).map((m) => m[1])
}

/** The labels that carry aria-current="page". */
function current(html: string): string[] {
  const items = Array.from(html.matchAll(/<button[^>]*>.*?<span class="bottom-nav-label">([^<]*)<\/span>/g))
  return items.filter((m) => m[0].includes('aria-current="page"')).map((m) => m[1])
}

describe('destinations', () => {
  it('gives everyone the four primary items, Profile last', () => {
    expect(navDestinations().map((d) => d.label)).toEqual(['Home', 'My trips', 'Explore', 'Profile'])
    expect(navDestinations().some((d) => d.to === '/creator-hub')).toBe(false)
  })
})

describe('route to destination', () => {
  it('maps the hub, and only the hub, to the profile tab', () => {
    expect(areaOf('/creator-hub')).toBe('profile')
    // The public creator page is not the hub, and a stray query must not change that.
    expect(areaOf('/creator/1250e5c4-7d87-4813')).toBe(null)
    expect(areaOf('/creator-hub?tab=links')).toBe('profile')
  })

  it('keeps the existing mappings', () => {
    expect(areaOf('/')).toBe('home')
    expect(areaOf('/trips')).toBe('trips')
    expect(areaOf('/trip/abc?day=2')).toBe('trips')
    expect(areaOf('/explore?style=beach')).toBe('explore')
    expect(areaOf('/profile')).toBe('profile')
    expect(areaOf('/new')).toBe(null)
  })
})

describe('rendered navigation', () => {
  it('shows four items and no creator shortcut in the bottom bar', () => {
    const html = markup('/profile')
    expect(labels(html)).toEqual(['Home', 'My trips', 'Explore', 'Profile'])
    expect(html).not.toContain('aria-label="Creator hub"')
    expect(html).not.toContain('data-destinations')
    expect(current(html)).toEqual(['Profile'])
  })

  it('marks Profile current on the creator hub route', () => {
    const html = markup('/creator-hub')
    expect(current(html)).toEqual(['Profile'])
  })

  it('keeps other routes unlit or on their own tab', () => {
    expect(current(markup('/trips'))).toEqual(['My trips'])
    expect(current(markup('/new'))).toEqual([])
  })

  it('removes the five-destination CSS rules', () => {
    const legacy = readFileSync(new URL('../src/styles/legacy/13-phone-polish-and-guided-create.css', import.meta.url), 'utf8')
    const uaCss = readFileSync(new URL('../src/styles/components/universal-add.css', import.meta.url), 'utf8')
    expect(legacy).not.toContain('data-destinations')
    expect(uaCss).not.toContain('data-destinations')
  })

  it('places the Creator hub row at the top of Profile for creators, with no Account duplicate', () => {
    const profile = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    const main = profile.slice(profile.indexOf('<div className="prof-main">'))
    const hubRow = main.indexOf('className="yf-surface prof-hub-row"')
    const firstSection = main.indexOf('<Section id="details"')
    expect(hubRow).toBeGreaterThan(-1)
    expect(hubRow).toBeLessThan(firstSection)
    expect(main.slice(hubRow, firstSection)).toContain("onNavigate('/creator-hub')")
    expect(main.slice(hubRow, firstSection)).toContain('<Sparkles')
    expect(main.slice(hubRow, firstSection)).toContain('<ChevronRight')
    const account = main.slice(main.indexOf('<Section id="account"'))
    expect(account).not.toContain("'/creator-hub'")
  })
})
