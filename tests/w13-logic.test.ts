// W13 package logic: known cells, one letter source, fact labels, the sheet
// handle keys, the Stay widen offer and the viewer add rule.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { knownCostCells } from '../src/components/map/lenses/LensPlaceCard'
import { StayDeck, stayPicksInRing, stayWidenOffer } from '../src/components/map/lenses/StayDeck'
import { sheetSnapKeepsHandleFocus } from '../src/components/map/MapPhoneSheetHandle'
import { MapStopSymbol } from '../src/components/map/MapWorkspaceMarks'
import { fixMarkFactsLabel } from '../src/lib/mapStyles/lensMarks'
import { layoutMarks } from '../src/lib/mapStyles/placeMarks'
import { fixRailLine } from '../src/pages/trip/map/LensRailExtras'
import type { StayPick } from '../src/pages/trip/map/stayLens'

const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

function pick(letter: 'A' | 'B' | 'C', walkMin: number, driveMin: number): StayPick {
  return {
    letter,
    row: { row: { hit: { name: `Place ${letter}`, category: 'hotel' } } },
    reach: { walkMin, driveMin, estimate: true },
    fit: null,
    fitText: null,
  } as unknown as StayPick
}

function stayHtml(picks: StayPick[], ringId: 'walk-15' | 'drive-30'): string {
  return renderToStaticMarkup(createElement(StayDeck, {
    dayNumber: 1,
    dayLabel: 'Day 1',
    baseName: 'Hotel Ashoka',
    windows: [{ id: 'evening', label: 'Free evening', startMin: 1020, endMin: 1260 } as never],
    activeWindowId: 'evening',
    onWindow: () => {},
    result: { kind: 'ready', picks, alsoCount: 0 },
    ringId,
    onRing: () => {},
    onOpenPick: () => {},
    onAddPick: () => {},
    onSetStay: () => {},
    clock,
  } as never))
}

describe('known cost cells', () => {
  it('drops a cell with no known value', () => {
    expect(knownCostCells([
      { key: 'arrive', label: 'Arrive', value: null },
      { key: 'detour', label: 'Detour', value: '+6 min' },
      { key: 'budget', label: 'Budget', value: '  ' },
    ])).toEqual([{ key: 'detour', label: 'Detour', value: '+6 min' }])
  })

  it('returns no cell when every value is unknown', () => {
    expect(knownCostCells([{ key: 'arrive', label: 'Arrive', value: null }])).toEqual([])
  })
})

describe('fix facts', () => {
  it('builds the mark label from the commitment and the arrival', () => {
    expect(fixMarkFactsLabel('Boat', '15:30', '15:05')).toBe('Boat 15:30 · jetty 15:05')
  })

  it('keeps the mark bare when one time is unknown', () => {
    expect(fixMarkFactsLabel('Boat', null, '15:05')).toBeNull()
    expect(fixMarkFactsLabel('Boat', '15:30', null)).toBeNull()
  })

  it('shows the engine problem title and keeps an unknown problem out', () => {
    expect(fixRailLine('Jetty 15:05 · boarding closed')).toBe('Jetty 15:05 · boarding closed')
    expect(fixRailLine(null)).toBeNull()
    expect(fixRailLine('   ')).toBeNull()
  })
})

describe('fix tag and badge', () => {
  it('draws the warning badge on the stop symbol', () => {
    const html = renderToStaticMarkup(createElement(MapStopSymbol, { order: 4, warn: true }))
    expect(html).toContain('mv2-stop-warn')
  })

  it('hides the fix tag when its first free place is off the clear map area', () => {
    const spots = layoutMarks([
      { id: 'stop', layer: 'stop', x: 150, y: 100, w: 36, h: 36 },
      { id: 'fix-tag', layer: 'clock', follows: 'stop', x: 150, y: 100, w: 60, h: 20, alternates: [[50, 0], [-50, 0], [0, 30], [0, -30]] },
    ], { bounds: { left: 0, top: 0, right: 215, bottom: 200 } })
    const tag = spots.get('fix-tag')!
    // The bounds only hide a tag. They never move it, so a pan cannot flip it.
    expect(tag.hidden).toBe(true)
  })

  it('moves the fix tag to its first free alternate when the stop covers its own place', () => {
    const spots = layoutMarks([
      { id: 'stop', layer: 'stop', x: 100, y: 100, w: 36, h: 36 },
      { id: 'fix-tag', layer: 'clock', follows: 'stop', x: 100, y: 100, w: 120, h: 20, alternates: [[80, 0], [-80, 0], [0, 30], [0, -30]] },
    ])
    const tag = spots.get('fix-tag')!
    expect(tag.hidden).toBe(false)
    expect(tag.dx).toBe(80)
  })
})

describe('stay ring', () => {
  it('keeps only the picks inside the active ring', () => {
    const picks = [pick('A', 8, 4), pick('B', 20, 6)]
    expect(stayPicksInRing(picks, 'walk-15').map(p => p.letter)).toEqual(['A'])
    expect(stayPicksInRing(picks, 'drive-30').map(p => p.letter)).toEqual(['A', 'B'])
  })

  it('offers the drive ring only when it holds a pick', () => {
    expect(stayWidenOffer([pick('A', 20, 6)], 'walk-15')).toBe(true)
    expect(stayWidenOffer([pick('A', 20, 40)], 'walk-15')).toBe(false)
    expect(stayWidenOffer([pick('A', 8, 4)], 'drive-30')).toBe(false)
  })

  it('draws the widen button in the empty walk body', () => {
    const html = stayHtml([pick('A', 20, 6)], 'walk-15')
    expect(html).toContain('Nothing open around the stay in this window.')
    expect(html).toContain('Try ≤30 min drive')
  })

  it('draws no button when the drive ring is empty too', () => {
    const html = stayHtml([pick('A', 20, 40)], 'walk-15')
    expect(html).toContain('Nothing open around the stay in this window.')
    expect(html).not.toContain('Try ≤30 min drive')
  })
})

describe('keyboard sheet handle', () => {
  it('keeps focus on the handle for a keyboard snap', () => {
    expect(sheetSnapKeepsHandleFocus('keyboard')).toBe(true)
    expect(sheetSnapKeepsHandleFocus('pointer')).toBe(false)
  })
})

describe('viewer', () => {
  it('hides the deck add action for a viewer', () => {
    const css = readFileSync(new URL('../src/styles/components/map-v2-rail.css', import.meta.url), 'utf8')
    expect(css).toContain('.mv2-workspace[data-role="viewer"] .mv2-lens-place-add')
  })
})
