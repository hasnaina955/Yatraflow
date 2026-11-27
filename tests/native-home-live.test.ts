import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('native home live trip', () => {
  it('uses live trip data and keeps read states distinct', () => {
    const home = read('src/pages/NativeHome.tsx')
    expect(home).toContain("trips.find(t => tripPhase(t) === 'live')")
    expect(home).toContain('countdownText(')
    expect(home).toContain('dayStrip(trip, collectWarnings(trip))')
    expect(home).toContain('stop.arrivalTime >= clock')
    expect(home).toContain("tripsRead === 'failed' && !retrying")
    expect(home).toContain("tripsRead === 'ready' && !retrying")
    expect(home).toContain('nh-skeletons')
  })
  it('passes the unread count to the trips badge with reduced motion', () => {
    const nav = read('src/components/BottomNav.tsx')
    expect(read('src/App.tsx')).toContain('isCreator={me.profile.isCreator} unread={unread}')
    expect(nav).toContain("to === '/trips' && unread > 0")
    expect(nav).toContain("unread > 9 ? '9+' : unread")
    expect(nav).toContain('${unread} unread')
    const css = read('src/styles/legacy/06-shell-and-consistency.css')
    expect(css).toContain('var(--ease-settle)')
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{ \.bottom-nav-badge \{ animation: none/)
    const homeCss = read('src/styles/legacy/12-pages.css')
    expect(homeCss).toContain('scale(1.035)')
    expect(homeCss).toContain('var(--motion-slower) var(--ease-glide)')
  })
})
