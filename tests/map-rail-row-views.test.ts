import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ON_ROUTE_SPUR_KM } from '../src/lib/providers/hits'
import { altKmLabel, GapRow, LedgerRow } from '../src/pages/trip/map/RailRowViews'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const mapTab = read('../src/pages/trip/MapTab.tsx')
const views = read('../src/pages/trip/map/RailRowViews.tsx')

// #08 AC5: an alternative with no measured km is unknown. Unknown never reads
// as "on route". The shelf prints the km through altKmLabel.
describe('#08 AC5: an unknown alternative km never reads as on route', () => {
  it('a null km prints the unknown copy', () => {
    expect(altKmLabel(null)).toBe('km unknown')
  })

  it('a known zero prints on route', () => {
    expect(altKmLabel(0)).toBe('on route')
  })

  it('a spur at the on-route threshold reads on route, and a real spur prints its km', () => {
    expect(altKmLabel(ON_ROUTE_SPUR_KM)).toBe('on route')
    expect(altKmLabel(2.0038)).toBe('2.0 km off')
  })

  it('the shelf prints the km through the helper', () => {
    expect(views).toContain('{altKmLabel(dKm)}')
  })
})

describe('#420 slice 16 — the rail rows render outside the page', () => {
  it('exports the two row components', () => {
    expect(typeof LedgerRow).toBe('function')
    expect(typeof GapRow).toBe('function')
  })

  it('the page no longer defines the row renderers', () => {
    expect(mapTab).not.toContain('function renderLedgerRow')
    expect(mapTab).not.toContain('function renderGapRow')
    expect(mapTab).toContain("from './map/RailRowViews'")
  })

  it('widening stays a page callback', () => {
    expect(views).toContain('onWiden')
    expect(views).not.toMatch(/setScopeIdx|SCOPE_KM_STEPS/)
    expect(mapTab).toContain('widenScope')
  })

  it('gaps keep their honest row through the ledger', () => {
    expect(views).toContain('<GapRow')
  })
})
