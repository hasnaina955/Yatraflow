// Static-render tests for the shared deck header, the place card and the decks.
// The node test env has no DOM, so every check reads the markup string.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  DriveTabs, driveAddLabel, driveDeckKicker, driveDeckTitle,
} from '../src/components/map/lenses/DriveTabs'
import { FixDeck, fixDeckKicker } from '../src/components/map/lenses/FixDeck'
import { GapDeck, gapDeckKicker, gapDeckTitle } from '../src/components/map/lenses/GapDeck'
import { LensDeckHeader } from '../src/components/map/lenses/LensDeckHeader'
import { LensPlaceCard, type LensCostCell } from '../src/components/map/lenses/LensPlaceCard'
import {
  StayDeck, stayAddLabel, stayDeckKicker, stayDeckTitle,
} from '../src/components/map/lenses/StayDeck'
import type { DriveCardStrip, DriveTabGroup } from '../src/pages/trip/map/driveLens'
import type { FixChangeSet } from '../src/lib/mapLensContracts'
import type { FixSummary } from '../src/pages/trip/map/fixLens'
import type { GapPick, GapPicks } from '../src/pages/trip/map/gapLens'
import type { StayPick, StayWindow } from '../src/pages/trip/map/stayLens'

const noop = () => undefined
const clock = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const decode = (html: string): string => html
  .replace(/&#x27;/g, "'")
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&amp;/g, '&')

const CELLS: LensCostCell[] = [
  { key: 'arrive', label: 'Arrive', value: '12:05' },
  { key: 'detour', label: 'Detour', value: '+6 min' },
  { key: 'budget', label: 'Budget', value: '4%' },
]

function card(over: Record<string, unknown> = {}): string {
  return decode(renderToStaticMarkup(createElement(LensPlaceCard, {
    name: 'Periyar boat',
    cells: CELLS,
    addLabel: 'Add as Day 3 lunch',
    onAdd: noop,
    ...over,
  } as never)))
}

// ------------------------------------------------------------------ header

describe('LensDeckHeader', () => {
  it('draws the kicker, the title and one close button named for screen readers', () => {
    const html = renderToStaticMarkup(createElement(LensDeckHeader, {
      kicker: 'Along the drive · lunch gap',
      title: '3 places for lunch',
      sub: 'You pass at 12:05, inside the 11:30–14:30 window',
      onClose: noop,
    }))
    expect(html).toContain('Along the drive · lunch gap')
    expect(html).toContain('3 places for lunch')
    expect(html).toContain('aria-label="Close panel"')
    expect(html).not.toContain('Fold suggestions')
  })

  it('omits the sub line when the fact is unknown', () => {
    const html = renderToStaticMarkup(createElement(LensDeckHeader, {
      kicker: 'Gap', title: '1 open window on this day', sub: null, onClose: noop,
    }))
    expect(html).not.toContain('mv2-lens-deck-sub')
  })
})

describe('deck kicker and title per lens', () => {
  it('names the drive slot in the kicker and the places for that slot in the title', () => {
    expect(driveDeckKicker('Lunch gap')).toBe('Along the drive · lunch gap')
    expect(driveDeckTitle({ label: 'Lunch gap', total: 3 } as DriveTabGroup))
      .toBe('3 places for lunch')
    expect(driveDeckTitle({ label: 'Sights', total: 1 } as DriveTabGroup))
      .toBe('1 place for sights')
    expect(driveAddLabel(3, 'Lunch gap')).toBe('Add as Day 3 lunch')
  })

  it('names the stay letter in the kicker and the base in the title', () => {
    expect(stayDeckKicker('A')).toBe('Around the stay · A')
    expect(stayDeckKicker(null)).toBe('Around the stay')
    expect(stayDeckTitle(3, 'Hotel Ashoka')).toBe('3 picks near Hotel Ashoka')
    expect(stayDeckTitle(1, 'Hotel Ashoka')).toBe('1 pick near Hotel Ashoka')
    expect(stayDeckTitle(0, null)).toBe('Around the stay')
    expect(stayAddLabel(2, 1020, clock)).toBe('Add to Day 2 · 17:00')
    expect(stayAddLabel(2, null, clock)).toBe('Add to Day 2')
  })

  it('names the gap window in the kicker and the open windows in the title', () => {
    expect(gapDeckKicker('Lunch', '11:30–14:30')).toBe('Gap · 11:30–14:30')
    expect(gapDeckKicker('Lunch', null)).toBe('Gap · Lunch')
    expect(gapDeckTitle(2)).toBe('2 open windows on this day')
    expect(gapDeckTitle(1)).toBe('1 open window on this day')
  })

  it('names the problem count and the day in the fix kicker', () => {
    expect(fixDeckKicker(1, 3)).toBe('Fix · 1 problem on Day 3')
    expect(fixDeckKicker(0, 3)).toBe('Fix · 0 problems on Day 3')
  })

  it('never writes an unknown day into a label', () => {
    expect(driveAddLabel(Number.NaN, 'Lunch gap')).toBe('Add')
    expect(stayAddLabel(Number.NaN, 1020, clock)).toBe('Add')
    expect(fixDeckKicker(1, Number.NaN)).toBe('Fix · 1 problem')
    for (const text of [
      driveAddLabel(Number.NaN, 'Lunch gap'),
      stayAddLabel(Number.NaN, null, clock),
      fixDeckKicker(2, Number.NaN),
    ]) {
      expect(text).not.toContain('undefined')
      expect(text).not.toContain('NaN')
    }
  })
})

// -------------------------------------------------------------------- card

describe('LensPlaceCard', () => {
  it('shows the rating and the count only when the hit has a rating', () => {
    const rated = card({ hit: { rating: 4.5, ratingCount: 2100 } })
    expect(rated).toContain('mv2-lens-place-rating')
    expect(rated).toContain('4.5')
    expect(rated).toContain('2100')
    expect(card({ hit: { ratingCount: 2100 } })).not.toContain('mv2-lens-place-rating')
    expect(card({ hit: {} })).not.toContain('mv2-lens-place-rating')
  })

  it('renders a dash with the unknown label for a missing cost value', () => {
    const html = card({
      cells: [
        { key: 'arrive', label: 'Arrive', value: null },
        { key: 'detour', label: 'Detour', value: '+6 min' },
        { key: 'budget', label: 'Budget', value: null },
      ],
    })
    expect(html).toContain('aria-label="unknown"')
    expect((html.match(/—/g) ?? []).length).toBe(2)
  })

  it('draws the letter badge only when the pick has a letter', () => {
    expect(card({ letter: 'B' })).toContain('mv2-lens-place-letter')
    expect(card({ letter: null })).not.toContain('mv2-lens-place-letter')
  })

  it('draws the area and kind line from the hit', () => {
    expect(card({ hit: { admin1: 'Kerala', category: 'waterfall' } })).toContain('Kerala · waterfall')
    expect(card({ hit: {} })).not.toContain('mv2-lens-place-sub')
  })

  it('renders no heart and no swap button when their handlers are absent', () => {
    const html = card()
    expect(html).not.toContain('Add to shortlist')
    expect(html).not.toContain('Remove from shortlist')
    expect(html).not.toContain('Swap this stop')
    expect(html).not.toContain('mv2-lens-round')
  })

  it('renders the heart and the swap button when real handlers exist', () => {
    const html = card({ onShortlist: noop, onSwap: noop })
    expect(html).toContain('aria-label="Add to shortlist"')
    expect(html).toContain('aria-label="Swap this stop"')
    expect((html.match(/mv2-lens-round/g) ?? []).length).toBe(2)
  })

  it('marks the selected card with the raised outline class', () => {
    expect(card({ selected: true })).toContain('is-selected')
    expect(card()).not.toContain('is-selected')
  })
})

// ------------------------------------------------------------------- decks

const ROW = { row: { hit: { name: 'Periyar boat', category: 'boat' } } } as unknown as DriveTabGroup['shown'][number]
const STRIP: DriveCardStrip = { arrive: '12:05', detour: '+6 min', budget: '4%' }

function driveHtml(over: Record<string, unknown> = {}): string {
  return decode(renderToStaticMarkup(createElement(DriveTabs, {
    result: { phase: 'ready', tabs: [{ tab: 'meal', label: 'Lunch gap', total: 3, shown: [ROW], moreCount: 0 }] },
    activeTab: null,
    onTab: noop,
    intro: null,
    stripOf: () => STRIP,
    bandOf: () => 'inside',
    nameOf: () => 'Periyar boat',
    onOpen: noop,
    onAdd: noop,
    dayNumber: 3,
    ...over,
  } as never)))
}

function stayPick(letter: 'A' | 'B' | 'C', fitText: string | null = null): StayPick {
  return {
    letter,
    row: { row: { hit: { name: `Place ${letter}`, category: 'hotel' } } },
    reach: { walkMin: 8, driveMin: 4, estimate: true },
    fit: null,
    fitText,
  } as unknown as StayPick
}

const WINDOW = { id: 'evening', label: 'Free evening', startMin: 1020, endMin: 1260 } as StayWindow

function stayHtml(over: Record<string, unknown> = {}): string {
  return decode(renderToStaticMarkup(createElement(StayDeck, {
    dayNumber: 2,
    dayLabel: 'Day 2',
    baseName: 'Hotel Ashoka',
    windows: [WINDOW],
    activeWindowId: 'evening',
    onWindow: noop,
    result: { kind: 'ready', picks: [stayPick('A')], alsoCount: 0 },
    ringId: 'walk-15',
    onRing: noop,
    onOpenPick: noop,
    onAddPick: noop,
    onSetStay: noop,
    clock,
    ...over,
  } as never)))
}

function gapPick(): GapPick {
  return {
    letter: 'A',
    candidate: { hit: { name: 'Gap A', category: 'waterfall' }, detourMin: 12 },
    travelOneWayMin: 6,
    fit: null,
    fitText: null,
  } as unknown as GapPick
}

function gapPicks(): GapPicks {
  return {
    slotKey: 'lunch', window: [690, 870], noFit: null, noFitText: null,
    picks: [gapPick()], moreCount: 0,
  } as unknown as GapPicks
}

function gapHtml(over: Record<string, unknown> = {}): string {
  return decode(renderToStaticMarkup(createElement(GapDeck, {
    dayNumber: 1,
    phase: 'ready',
    gaps: [{ title: 'Lunch', windowText: '11:30–14:30', picks: gapPicks() }],
    onOpenPick: noop,
    onAddPick: noop,
    clock,
    ...over,
  } as never)))
}

const SUMMARY: FixSummary = {
  title: 'Go to the jetty first',
  change: 'Reorder: boat before check-in',
  result: 'Clears it · at the jetty 14:45, 15 min to spare',
}

function fixSet(): FixChangeSet {
  return {
    id: 'a', dayIndex: 0, target: { code: 'hours', stopId: null },
    changes: [], verification: { kind: 'unverified' },
  }
}

function fixHtml(over: Record<string, unknown> = {}): string {
  return decode(renderToStaticMarkup(createElement(FixDeck, {
    phase: 'ready',
    dayNumber: 3,
    problem: { title: 'You reach the boat late', evidence: ['Boarding closes at 15:00.'], foundBy: 'opening-hours check' },
    fixes: [{ set: fixSet(), summary: SUMMARY }],
    onApply: noop,
    onPreview: noop,
    ...over,
  } as never)))
}

describe('decks draw the shared header', () => {
  it('draws the drive kicker, the title and the close button', () => {
    const html = driveHtml()
    expect(html).toContain('Along the drive · lunch gap')
    expect(html).toContain('3 places for lunch')
    expect(html).toContain('aria-label="Close panel"')
    expect(html).toContain('Add as Day 3 lunch')
  })

  it('keeps every drive tab sized to its text and its count in muted ink', () => {
    const html = driveHtml({
      result: {
        phase: 'ready',
        tabs: [
          { tab: 'meal', label: 'Lunch gap', total: 3, shown: [ROW], moreCount: 0 },
          { tab: 'sights', label: 'Sights', total: 9, shown: [ROW], moreCount: 0 },
          { tab: 'breaks', label: 'Breaks', total: 1, shown: [ROW], moreCount: 0 },
        ],
      },
    })
    expect(html.match(/role="tab"/g)).toHaveLength(3)
    expect(html).toContain('mv2-lens-tab-total">3<')
    expect(html).toContain('mv2-lens-tab-total">9<')
    expect(html).toContain('mv2-lens-tab-total">1<')
  })

  it('draws the stay kicker with the first letter and the base in the title', () => {
    const html = stayHtml()
    expect(html).toContain('Around the stay · A')
    expect(html).toContain('1 pick near Hotel Ashoka')
    expect(html).toContain('Add to Day 2 · 17:00')
    expect(html).toContain('Walk')
    expect(html).toContain('aria-label="unknown"')
  })

  it('shows no pick count while the stay is still waiting', () => {
    const html = stayHtml({ result: { kind: 'phase', phase: 'scanning' } })
    expect(html).not.toContain('picks near')
    expect(html).not.toContain('1 pick near')
    expect(html).toContain('Looking around the stay…')
  })

  it('lists the picks past the third card under the cards', () => {    const picks = [stayPick('A'), stayPick('B'), stayPick('C'), stayPick('A')]
    const html = stayHtml({ result: { kind: 'ready', picks, alsoCount: 1 } })
    expect(html.match(/<article/g)).toHaveLength(3)
    expect(html).toContain('Also in this window')
    expect(html).toContain('mv2-lens-also-row')
  })

  it('draws the gap kicker with the window and the open window count', () => {
    const html = gapHtml()
    expect(html).toContain('Gap · 11:30–14:30')
    expect(html).toContain('1 open window on this day')
    expect(html).toContain('Add as Day 1 lunch')
  })

  it('draws the fix kicker and the verified clearing line with a check icon', () => {
    const html = fixHtml()
    expect(html).toContain('Fix · 1 problem on Day 3')
    expect(html).toContain('You reach the boat late')
    expect(html).toContain('Clears it · at the jetty 14:45, 15 min to spare')
    expect(html).toContain('mv2-lens-fix is-first')
    expect(html).toContain('Preview on map')
  })

  it('keeps the problem title and the evidence in the problem box', () => {
    const html = fixHtml()
    expect(html).toContain('Boarding closes at 15:00.')
    expect(html).toContain('Found by the opening-hours check')
  })
})
