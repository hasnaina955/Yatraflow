import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { appLink, appLinkHref, shouldHandleAppLink } from '../src/lib/appLink'

const plainClick = {
  button: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, defaultPrevented: false,
}
const routes = ['#/', '#/trips', '#/new', '#/explore', '#/creator-hub', '#/auth', '#/auth?mode=signup', '#/profile', '#/creator/alice'] as const

afterEach(() => vi.unstubAllGlobals())

describe('app link hrefs', () => {
  it.each(routes)('resolves %s at the app root even from a publication', hash => {
    const href = appLinkHref(hash)
    expect(href).toBe(`/${hash}`)
    const target = new URL(href, 'https://app.example.test/i/kerala-trip_1#/pub/kerala-trip_1')
    expect(target.href).toBe(`https://app.example.test/${hash}`)
    expect(target.pathname).toBe('/')
    expect(target.hash).toBe(hash)
  })

  it('matches fragment navigation from a root document', () => {
    const base = 'https://app.example.test/#/explore'
    expect(new URL(appLinkHref('#/auth'), base).href).toBe(new URL('#/auth', base).href)
    expect(appLinkHref('#/auth', false, 'http:')).toBe('/#/auth')
  })

  it.each(['file:', 'capacitor:'])('keeps the document path on %s', protocol => {
    expect(appLinkHref('#/explore', false, protocol)).toBe('#/explore')
  })

  it('keeps native https WebViews fragment-only', () => {
    expect(appLinkHref('#/explore', true, 'https:')).toBe('#/explore')
  })
})

describe('app link click decisions', () => {
  it('handles unmodified left clicks and explicit same-tab targets', () => {
    expect(shouldHandleAppLink(plainClick)).toBe(true)
    expect(shouldHandleAppLink(plainClick, '_self')).toBe(true)
  })

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'defaultPrevented'] as const)('leaves %s clicks to their existing handler', flag => {
    expect(shouldHandleAppLink({ ...plainClick, [flag]: true })).toBe(false)
  })

  it.each([1, 2, 3, 4])('ignores mouse button %s', button => {
    expect(shouldHandleAppLink({ ...plainClick, button })).toBe(false)
  })

  it.each(['_blank', '_parent', '_top', 'other-tab'])('leaves target %s to the browser', target => {
    expect(shouldHandleAppLink(plainClick, target)).toBe(false)
  })

  it('leaves download anchors to the browser', () => {
    expect(shouldHandleAppLink(plainClick, '', true)).toBe(false)
  })

  // URL objects and structural event stubs exercise the adapter, not DOM events,
  // browser tab creation, actual hashchange delivery or document-load counts.
  it('prevents default navigation and only writes the hash for a same-tab click', () => {
    const address = new URL('https://app.example.test/i/one?campaign=share#/pub/one')
    vi.stubGlobal('location', address)
    const link = appLink('#/auth?mode=signup')
    const preventDefault = vi.fn()
    link.onClick({ ...plainClick, preventDefault, currentTarget: { target: '', hasAttribute: () => false } } as unknown as Parameters<typeof link.onClick>[0])
    expect(link.href).toBe('/#/auth?mode=signup')
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(address.href).toBe('https://app.example.test/i/one?campaign=share#/auth?mode=signup')
  })

  it.each([{ ctrlKey: true }, { metaKey: true }, { button: 1 }, { defaultPrevented: true }])('does not navigate or cancel a browser-owned click: %j', override => {
    const address = new URL('https://app.example.test/i/one#/pub/one')
    vi.stubGlobal('location', address)
    const link = appLink('#/explore')
    const preventDefault = vi.fn()
    link.onClick({ ...plainClick, ...override, preventDefault, currentTarget: { target: '', hasAttribute: () => false } } as unknown as Parameters<typeof link.onClick>[0])
    expect(preventDefault).not.toHaveBeenCalled()
    expect(address.hash).toBe('#/pub/one')
  })
})

describe('publication-reachable anchor wiring', () => {
  it.each([['../src/App.tsx', 13], ['../src/pages/PublicItinerary.tsx', 1]] as const)('uses the shared pattern on every route anchor in %s', (path, count) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(source.match(/\{\.\.\.appLink\(/g)).toHaveLength(count)
    expect(source).not.toMatch(/href=\{?["'`]#\//)
  })
})
