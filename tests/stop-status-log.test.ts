// The stop status activity line has one wording and one writer per route.
// The direct write (store) and the phone sheet's staged preview (logged when
// Keep is acknowledged) must produce the same named line, with no second write.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { stopStatusActivity } from '../src/lib/stopStatusLog'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('stopStatusActivity', () => {
  it('names the stop and the status, and shows the day 1-based', () => {
    expect(stopStatusActivity('Rohtang Pass', 'confirmed', 2)).toEqual({
      verb: 'marked “Rohtang Pass” as confirmed',
      target: 'Day 3',
    })
  })

  it('keeps the raw status in the line', () => {
    expect(stopStatusActivity('Hotel', 'needs-booking', 0).verb).toBe('marked “Hotel” as needs-booking')
  })
})

describe('both routes use the one formatter', () => {
  const store = read('../src/store/store.ts')
  const tab = read('../src/pages/trip/TimelineTab.tsx')

  it('the direct write builds its line with the formatter', () => {
    const direct = store.slice(store.indexOf('export function setStopStatus'), store.indexOf('// The per-day 1..n invariant'))
    expect(direct).toContain('stopStatusActivity(before.title, status, dayIdx)')
    expect(direct).toContain('{ log: entry.verb, target: entry.target }')
    expect(direct).not.toContain('marked “')
  })

  it('the preview route logs once, inside the Keep callback, with the same line', () => {
    const preview = tab.slice(tab.indexOf('const handleStatusWithPreview'), tab.indexOf('// --- Plan / Inspect'))
    expect(preview).toContain('stopStatusActivity(stop.title, status, day.index)')
    expect(preview.match(/addActivity\(/g)).toHaveLength(1)
    // The line is written inside the fourth argument of applyChange (onKept),
    // never while the change is only staged.
    const keptAt = preview.indexOf("}, 'edit', day.index, () => {")
    expect(keptAt).toBeGreaterThan(-1)
    expect(preview.indexOf('addActivity(')).toBeGreaterThan(keptAt)
  })

  it('the preview route makes no direct write of its own', () => {
    const preview = tab.slice(tab.indexOf('const handleStatusWithPreview'), tab.indexOf('// --- Plan / Inspect'))
    expect(preview).not.toContain('setStopStatus')
    expect(preview).not.toContain('persistTripField')
    expect(preview).not.toContain('updateTrip(')
  })
})

describe('phone Map keyboard rings', () => {
  const css = read('../src/styles/components/map-v2-rail.css')

  it('draws the ring inside the lens pill, the sheet buttons and the canvas, which clip it', () => {
    expect(css).toMatch(/\.mv2-workspace \.mv2-lens-pill > button:focus-visible, \.mv2-workspace \.mv2-deck-footer > button:focus-visible, \.mv2-workspace \.maplibregl-canvas:focus-visible \{ outline-offset: -3px; \}/)
  })

  it('keeps a pressed chip ring visible against its own fill', () => {
    expect(css).toContain(".mv2-workspace .mv2-lens-pill > button[aria-pressed='true']:focus-visible { outline-color: var(--color-primary-foreground); }")
  })
})
