// ============ Row 27a: one phone-width rule, and the web tab bar ============
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PHONE_QUERY, showTabBar, tabBarHide } from '../src/lib/phoneChrome'
import { BottomNav } from '../src/components/BottomNav'
import { readCssSource } from '../scripts/css-source-graph.mjs'

const source = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const css = readCssSource('src/styles.css').replace(/\r\n/g, '\n')

describe('the shared phone-width rule', () => {
  it('is 720px', () => {
    expect(PHONE_QUERY).toBe('(max-width: 720px)')
  })

  it('is the one query the bar, the Add control and the Chakra FAB hide read', () => {
    const app = source('src/App.tsx')
    const ws = source('src/pages/TripWorkspace.tsx')
    const ui = source('src/components/ui.tsx')
    expect(ui).toContain('return useMedia(PHONE_QUERY,')
    expect(app).toContain('const phoneWeb = usePhoneWidth() && !isNative')
    expect(ws).toContain('const phoneWidth = usePhoneWidth()')
    expect(ws).toContain('fab={!(isNative || phoneWidth)}')
    // No private copy of the query is left behind.
    expect(app).not.toContain("useMedia('(max-width: 720px)')")
    expect(ws).not.toContain('PHONE_DOCK_QUERY')
  })

  it('matches the CSS that hides the top pill nav at phone width', () => {
    const at = css.indexOf('.nav-links { display: none; }')
    expect(at).toBeGreaterThan(-1)
    const media = css.lastIndexOf('@media', at)
    expect(css.slice(media, css.indexOf('{', media))).toContain('(max-width: 720px)')
  })
})

describe('showTabBar', () => {
  it('shows signed in, in the shell or at phone width', () => {
    expect(showTabBar({ native: true, phoneWidth: false, signedIn: true })).toBe(true)
    expect(showTabBar({ native: false, phoneWidth: true, signedIn: true })).toBe(true)
  })
  it('never shows signed out, or on desktop web', () => {
    expect(showTabBar({ native: false, phoneWidth: true, signedIn: false })).toBe(false)
    expect(showTabBar({ native: true, phoneWidth: true, signedIn: false })).toBe(false)
    expect(showTabBar({ native: false, phoneWidth: false, signedIn: true })).toBe(false)
  })
})

describe('tabBarHide', () => {
  const base = { native: false, mapFullscreen: false, overlayOpen: false, keyboardOpen: false }
  it('shows by default', () => { expect(tabBarHide(base)).toBeNull() })
  it('names the reason, the Map first', () => {
    expect(tabBarHide({ ...base, keyboardOpen: true })).toBe('keyboard')
    expect(tabBarHide({ ...base, overlayOpen: true, keyboardOpen: true })).toBe('overlay')
    expect(tabBarHide({ ...base, mapFullscreen: true, overlayOpen: true })).toBe('map')
  })
  it('never hides the native bar', () => {
    expect(tabBarHide({ native: true, mapFullscreen: true, overlayOpen: true, keyboardOpen: true })).toBeNull()
  })
})

describe('the web bar', () => {
  const render = (props: Record<string, unknown>) =>
    renderToStaticMarkup(createElement(BottomNav, { route: '/trips', onNavigate: () => {}, ...props }))

  it('marks the web skin and stays plain when shown', () => {
    const html = render({ web: true })
    expect(html).toContain('data-web="true"')
    expect(html).not.toContain('data-hide')
    expect(html).not.toMatch(/<nav[^>]*aria-hidden/)
    expect(html).not.toContain('tabindex')
  })

  it('takes a hidden bar out of the tab order and the accessibility tree', () => {
    const html = render({ web: true, hide: 'keyboard' })
    expect(html).toContain('data-hide="keyboard"')
    expect(html).toMatch(/<nav[^>]*aria-hidden="true"/)
    expect(html.match(/tabindex="-1"/g)).toHaveLength(4)
  })

  it('ignores hide on the native bar', () => {
    const html = render({ hide: 'map' })
    expect(html).not.toContain('data-hide')
    expect(html).not.toContain('data-web')
  })

  it('shows the needs-you badge from the same unread count', () => {
    expect(render({ web: true, unread: 3 })).toContain('<span class="bottom-nav-badge" aria-hidden="true">3</span>')
  })

  it('hides with opacity and transform, not display, and clears the page', () => {
    expect(css).toContain("html:has(.bottom-nav[data-web='true']:not([data-hide='map'])) { --shell-nav-h: 58px; }")
    const rule = css.slice(css.indexOf(".bottom-nav[data-web='true'][data-hide] {"))
    const body = rule.slice(0, rule.indexOf('}'))
    expect(body).toContain('opacity: 0;')
    expect(body).toContain('transform: translateY(100%);')
    expect(body).toContain('pointer-events: none;')
    expect(body).not.toMatch(/display|visibility/)
    expect(body).toMatch(/var\(--motion-fast\) var\(--ease-exit\)/)
    expect(css).toContain("@media (prefers-reduced-motion: reduce) { .bottom-nav[data-web='true'] { transition: none; } }")
  })
})
