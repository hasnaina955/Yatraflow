// ============ Map v2 lens decks: rendered states ============
// Server render only: the project's tests run in node with no DOM.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LensPhase } from '../src/lib/mapLensContracts'
import type { StayPick, StayPicksResult, StayWindow } from '../src/pages/trip/map/stayLens'
import type { GapPick, GapPicks } from '../src/pages/trip/map/gapLens'
import { StayDeck, STAY_PHASE_TEXT, type StayDeckProps } from '../src/components/map/lenses/StayDeck'
import { GapDeck, GAP_PHASE_TEXT, GAP_EMPTY_TEXT, type GapDeckProps } from '../src/components/map/lenses/GapDeck'

const noop = () => {}
const clock = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const decode = (html: string): string => html
  .replace(/&#x27;/g, "'")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')

function stayPick(letter: 'A' | 'B' | 'C', fitText: string | null = null): StayPick {
  return {
    letter,
    row: { row: { hit: { name: `Place ${letter}` } } },
    reach: { walkMin: 8, driveMin: 4, estimate: true },
    fit: null,
    fitText,
  } as unknown as StayPick
}

function readyStay(picks: StayPick[], alsoCount = 0): StayPicksResult {
  return { kind: 'ready', picks, alsoCount }
}

function windowFixture(): StayWindow {
  return { id: 'evening', label: 'Free evening', startMin: 1020, endMin: 1260 } as StayWindow
}

function stayProps(over: Partial<StayDeckProps> = {}): StayDeckProps {
  return {
    dayNumber: 2,
    dayLabel: 'Day 2',
    baseName: 'Hotel Ashoka',
    windows: [windowFixture()],
    activeWindowId: 'evening',
    onWindow: noop,
    result: readyStay([]),
    ringId: 'walk-15',
    onRing: noop,
    onOpenPick: noop,
    onAddPick: noop,
    onSetStay: noop,
    clock,
    ...over,
  }
}

const stayHtml = (over: Partial<StayDeckProps> = {}): string =>
  decode(renderToStaticMarkup(createElement(StayDeck, stayProps(over))))

function gapPick(letter: 'A' | 'B' | 'C', fitText: string | null = null): GapPick {
  return {
    letter,
    candidate: { hit: { name: `Gap ${letter}` }, detourMin: 12 },
    travelOneWayMin: 6,
    fit: null,
    fitText,
  } as unknown as GapPick
}

function gapPicks(picks: GapPick[], over: Partial<GapPicks> = {}): GapPicks {
  return {
    slotKey: 'lunch',
    window: [690, 870],
    noFit: null,
    noFitText: null,
    picks,
    moreCount: 0,
    ...over,
  } as unknown as GapPicks
}

function gapEntry(picks: GapPicks, title = 'Lunch', windowText: string | null = '11:30–14:30') {
  return { title, windowText, picks }
}

function gapProps(over: Partial<GapDeckProps> = {}): GapDeckProps {
  return {
    dayNumber: 1,
    phase: 'ready',
    gaps: [gapEntry(gapPicks([gapPick('A')]))],
    onOpenPick: noop,
    onAddPick: noop,
    clock,
    ...over,
  }
}

const gapHtml = (over: Partial<GapDeckProps> = {}): string =>
  decode(renderToStaticMarkup(createElement(GapDeck, gapProps(over))))

describe('StayDeck', () => {
  it('shows each stay phase text and keeps them distinct', () => {
    const phases: LensPhase[] = ['unscanned', 'scanning', 'failed', 'quota', 'empty']
    const seen = phases.map(phase => {
      const html = stayHtml({ result: { kind: 'phase', phase } })
      expect(html).toContain(STAY_PHASE_TEXT[phase])
      return STAY_PHASE_TEXT[phase]
    })
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('shows the set button and no card for needs-base', () => {
    const html = stayHtml({ result: { kind: 'needs-base' } })
    expect(html).toContain("Set tonight's stay")
    expect(html).not.toContain('<article')
  })

  it('draws no fit line when fitText is null', () => {
    expect(stayHtml({ result: readyStay([stayPick('A', null)]) })).not.toContain('mv2-lens-reason')
    const withText = stayHtml({ result: readyStay([stayPick('A', 'Fits 17:00–18:00')]) })
    expect(withText).toContain('mv2-lens-reason')
    expect(withText).toContain('Fits 17:00–18:00')
  })

  it('draws letters A, B and C in order, at most 3 cards', () => {
    const picks = [stayPick('A'), stayPick('B'), stayPick('C'), stayPick('A')]
    const html = stayHtml({ result: readyStay(picks) })
    const letters = [...html.matchAll(/mv2-lens-place-letter"[^>]*>([A-C])<\/span>/g)].map(m => m[1])
    expect(letters).toEqual(['A', 'B', 'C'])
    expect((html.match(/<article/g) ?? []).length).toBe(3)
  })

  it('shows alsoCount only when greater than 0', () => {
    expect(stayHtml({ result: readyStay([stayPick('A')], 0) })).not.toContain('Also in this window')
    const also = stayHtml({ result: readyStay([stayPick('A')], 2) })
    expect(also).toContain('Also in this window')
    expect(also).toContain('2 more')
  })

  it('has a radiogroup with two radios', () => {
    const html = stayHtml()
    expect(html).toContain('role="radiogroup"')
    expect((html.match(/role="radio"/g) ?? []).length).toBe(2)
    expect(html).toContain('15 min walk')
    expect(html).toContain('30 min drive')
  })

  it('formats the window chip from the label and the clock', () => {
    expect(stayHtml()).toContain('Free evening 17:00–21:00')
  })

  it('shows no chip when there are no windows', () => {
    expect(stayHtml({ windows: [] })).not.toContain('mv2-lens-chip')
  })
})

describe('GapDeck', () => {
  it('shows each gap phase text and keeps them distinct', () => {
    const phases: LensPhase[] = ['unscanned', 'scanning', 'failed', 'quota']
    const seen = phases.map(phase => {
      const html = gapHtml({ phase })
      expect(html).toContain(GAP_PHASE_TEXT[phase])
      return GAP_PHASE_TEXT[phase]
    })
    expect(gapHtml({ phase: 'empty' })).toContain(GAP_EMPTY_TEXT)
    seen.push(GAP_EMPTY_TEXT)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('draws letters A, B and C in order, at most 3 cards', () => {
    const picks = gapPicks([gapPick('A'), gapPick('B'), gapPick('C'), gapPick('A')])
    const html = gapHtml({ gaps: [gapEntry(picks)] })
    const letters = [...html.matchAll(/mv2-lens-place-letter"[^>]*>([A-C])<\/span>/g)].map(m => m[1])
    expect(letters).toEqual(['A', 'B', 'C'])
    expect((html.match(/<article/g) ?? []).length).toBe(3)
  })

  it('draws no fit line when fitText is null', () => {
    expect(gapHtml({ gaps: [gapEntry(gapPicks([gapPick('A', null)]))] })).not.toContain('mv2-lens-reason')
    const withText = gapHtml({ gaps: [gapEntry(gapPicks([gapPick('A', 'Fits 12:00–13:00')]))] })
    expect(withText).toContain('Fits 12:00–13:00')
  })

  it('shows moreCount only when greater than 0', () => {
    const zero = gapHtml({ gaps: [gapEntry(gapPicks([gapPick('A')], { moreCount: 0 }))] })
    expect(zero).not.toContain('mv2-lens-more')
    const three = gapHtml({ gaps: [gapEntry(gapPicks([gapPick('A')], { moreCount: 3 }))] })
    expect(three).toContain('3 more')
  })

  it('shows the no-fit sentence when there are no picks', () => {
    const picks = gapPicks([], { noFitText: 'No open place of this kind was found.' })
    expect(gapHtml({ gaps: [gapEntry(picks)] })).toContain('No open place of this kind was found.')
  })

  it('shows the empty text when phase is ready and gaps is empty', () => {
    expect(gapHtml({ phase: 'ready', gaps: [] })).toContain(GAP_EMPTY_TEXT)
  })
})
