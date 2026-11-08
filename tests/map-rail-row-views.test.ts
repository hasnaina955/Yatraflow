import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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

// The see-rail row uses the same cutoff as the shared detour sentence: a detour
// of half a minute or less reads "on route", never "+0 min".
function ledgerMeta(detourMin: number | null): string {
  const hit = { id: 'h-detour', name: 'Detour place', latitude: 10, longitude: 76, kind: 'poi', category: 'sightseeing' }
  const segment = { index: 0, purpose: 'sight', label: 'Sight', targetKm: 20, minKm: 10, maxKm: 30, kmFromPrev: 10, minutesFromPrev: 15, hint: 'Hint' }
  const noop = () => {}
  return renderToStaticMarkup(createElement(LedgerRow, {
    sh: { segment, hit, score: 1 },
    dismissed: false,
    added: false,
    detourMin,
    hitDay: null,
    chips: [],
    altPool: { all: [], byPurpose: new Map(), byCategory: new Map() },
    chipFilter: null,
    editable: false,
    shortlisted: false,
    onSelectChip: noop,
    onAdd: noop,
    onDismiss: noop,
    onToggleShortlist: noop,
    onOpenAlt: noop,
    onWiden: noop,
  } as never))
}

describe('the see-rail row reads a sub-half-minute detour as on route', () => {
  it('a 0.3 min detour prints on route, never +0 min', () => {
    const html = ledgerMeta(0.3)
    expect(html).toContain('on route')
    expect(html).not.toContain('+0 min')
  })

  it('exactly half a minute still prints on route', () => {
    expect(ledgerMeta(0.5)).toContain('on route')
  })

  it('a real detour keeps its copy, and an unknown position stays unknown', () => {
    expect(ledgerMeta(0.6)).toContain('+1 min detour')
    expect(ledgerMeta(26)).toContain('+26 min detour')
    expect(ledgerMeta(null)).toContain('position unknown')
  })
})
