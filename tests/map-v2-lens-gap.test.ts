// ============ Map v2 lens: the Gap lens (package L) ============
// The Gap lens turns empty parts of a day into lettered picks, a fit line and a reason.
import { describe, expect, it } from 'vitest'
import { GAP_NO_FIT_TEXT, gapCount, gapOpenSlots, gapPeek, gapPicks } from '../src/pages/trip/map/gapLens'
import { fitCopy, lensFit } from '../src/pages/trip/map/lensFit'
import { gapLensRows, type GapLensRow, type GapNoFitReason } from '../src/lib/mapLensContracts'
import type { DaySlot, SlotKey, SlotState } from '../src/lib/daySlots'
import type { JourneyRow } from '../src/lib/journeyProjection'
import type { ItineraryStop } from '../src/data/types'
import type { JourneyStatus } from '../src/pages/trip/journey/journeyDays'

const READY: JourneyStatus = { kind: 'ready', source: 'scan' }

const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** The window 11:30 to 14:30, the lunch gap of the board. */
const LUNCH: [number, number] = [690, 870]

// Only the null check reads this value, so the rest of the stop is absent.
const STOP = { id: 'stop-1' } as unknown as ItineraryStop

function candidate(key: string, over: Partial<JourneyRow> = {}): JourneyRow {
  return {
    key, tripId: 't', dayId: 'd', dayIndex: 0, lens: 'gap', purpose: 'meal', slotRef: null, slotKey: 'lunch',
    stopId: null, hit: { id: key, name: key, latitude: 1, longitude: 2, kind: 'poi' }, placeKeys: [],
    origin: 'drive', detourMin: 10, detourKm: null, budgetSharePct: 0, visitMin: 30, bufferMin: null,
    netAddedMin: null, arriveMin: null, arriveLabel: null, arriveSource: 'none', windowMin: LUNCH,
    inWindow: true, reason: null, source: 'osm', freshness: 'retained', vote: null,
    actions: { preview: true, add: true, shortlist: true, vote: false, navigate: true }, ...over,
  }
}

function slot(key: SlotKey, state: SlotState, over: Partial<DaySlot> = {}): DaySlot {
  return {
    key, kind: 'meal', label: key, state, windowMin: LUNCH, windowLabel: null, segment: null,
    filledStop: null, auto: false, drift: null, urgencyMin: null, ref: null, candidates: [], reason: null,
    ...over,
  }
}

/** One gap row, built by the real contract function, never by hand. */
function gapRow(key: SlotKey, rows: readonly JourneyRow[], windowMin: DaySlot['windowMin'] = LUNCH): GapLensRow {
  const view = gapLensRows({ status: READY, dayIndex: 0, slots: [slot(key, 'empty', { windowMin })], rows })
  const row = view.rows[0]
  if (row === undefined) throw new Error('fixture: no gap row')
  return row
}

function firstOf<T>(list: readonly T[]): T {
  const value = list[0]
  if (value === undefined) throw new Error('fixture: empty list')
  return value
}

describe('gapOpenSlots', () => {
  it('drops a filled, auto or window-less part and keeps the order', () => {
    const slots = [
      slot('lunch', 'empty'),
      slot('breakfast', 'filled', { filledStop: STOP }),
      slot('stretch', 'auto', { auto: true }),
      slot('fuel', 'empty', { windowMin: null }),
      slot('breakfast', 'empty', { filledStop: STOP }),
      slot('stretch', 'empty', { auto: true }),
      slot('dinner', 'empty', { windowMin: [1170, 1260] }),
    ]
    expect(gapOpenSlots(slots).map(s => s.key)).toEqual(['lunch', 'dinner'])
  })
})

describe('gapPicks', () => {
  it('halves the detour for one-way travel and uses the shared fit rule', () => {
    const row = gapRow('lunch', [candidate('temple', { detourMin: 50, visitMin: 60 })])
    const picks = gapPicks(row, clock)
    const pick = firstOf(picks.picks)
    expect(pick.letter).toBe('A')
    expect(picks.window).toEqual(LUNCH)
    expect(pick.travelOneWayMin).toBe(25)
    const fit = pick.fit
    if (fit === null) throw new Error('expected a fit')
    expect(fit).toEqual(lensFit({ startMin: LUNCH[0], endMin: LUNCH[1] }, null, 25, 60))
    expect(pick.fitText).toBe(fitCopy({ startMin: LUNCH[0], endMin: LUNCH[1] }, fit, 25, 60, clock))
    expect(pick.fitText).toContain('25 min away')
  })

  it('returns a null fit for an unknown detour or visit', () => {
    const noDetour = firstOf(gapPicks(gapRow('lunch', [candidate('a', { detourMin: null })]), clock).picks)
    expect(noDetour.travelOneWayMin).toBeNull()
    expect(noDetour.fit).toBeNull()
    expect(noDetour.fitText).toBeNull()
    const noVisit = firstOf(gapPicks(gapRow('lunch', [candidate('b', { detourMin: 20, visitMin: null })]), clock).picks)
    expect(noVisit.travelOneWayMin).toBe(10)
    expect(noVisit.fit).toBeNull()
    expect(noVisit.fitText).toBeNull()
  })

  it('gives no fit when the part has no window', () => {
    const pump = candidate('pump', { slotKey: 'fuel', visitMin: 10 })
    const picks = gapPicks(gapRow('fuel', [pump], null), clock)
    expect(picks.window).toBeNull()
    expect(firstOf(picks.picks).fit).toBeNull()
    expect(firstOf(picks.picks).fitText).toBeNull()
  })

  it('keeps candidate order, caps at three and counts the rest', () => {
    const rows = ['c1', 'c2', 'c3', 'c4', 'c5'].map(key => candidate(key))
    const picks = gapPicks(gapRow('lunch', rows), clock)
    expect(picks.picks.map(p => p.letter)).toEqual(['A', 'B', 'C'])
    expect(picks.picks.map(p => p.candidate.key)).toEqual(['c1', 'c2', 'c3'])
    expect(picks.moreCount).toBe(2)
  })

  it('honours a smaller cap and reports a null reason when a pick fits', () => {
    const picks = gapPicks(gapRow('lunch', [candidate('c1'), candidate('c2')]), clock, 1)
    expect(picks.picks).toHaveLength(1)
    expect(picks.moreCount).toBe(1)
    expect(picks.noFit).toBeNull()
    expect(picks.noFitText).toBeNull()
  })

  it('names the reason when nothing fits', () => {
    expect(gapPicks(gapRow('lunch', []), clock).noFitText).toBe(GAP_NO_FIT_TEXT['no-candidates'])
    const outside = gapPicks(gapRow('lunch', [candidate('x', { inWindow: false })]), clock)
    expect(outside.noFit).toBe('outside-window')
    expect(outside.noFitText).toBe(GAP_NO_FIT_TEXT['outside-window'])
    const unproven = gapPicks(gapRow('lunch', [candidate('x', { inWindow: null })]), clock)
    expect(unproven.noFitText).toBe(GAP_NO_FIT_TEXT['window-unproven'])
  })
})

describe('GAP_NO_FIT_TEXT', () => {
  // This record fails to compile when a member is added without a text.
  const ALL_REASONS: Record<GapNoFitReason, true> = {
    'no-candidates': true,
    'outside-window': true,
    'window-unproven': true,
  }

  it('gives every reason one plain sentence', () => {
    const reasons = Object.keys(ALL_REASONS) as GapNoFitReason[]
    expect(reasons).toHaveLength(3)
    for (const reason of reasons) {
      expect(GAP_NO_FIT_TEXT[reason].length).toBeGreaterThan(0)
      expect(GAP_NO_FIT_TEXT[reason].endsWith('.')).toBe(true)
    }
    expect(GAP_NO_FIT_TEXT['no-candidates']).toBe('No open place of this kind was found near the road for this window.')
    expect(GAP_NO_FIT_TEXT['outside-window']).toBe('The places found are open, but none can be reached inside this window.')
    expect(GAP_NO_FIT_TEXT['window-unproven']).toBe('This part of the day has no proven time window yet.')
  })
})

describe('gapPeek and gapCount', () => {
  const labelOf = (key: SlotKey) => key.charAt(0).toUpperCase() + key.slice(1)

  it('keeps a failed read as a phase, never as none', () => {
    const view = gapLensRows({ status: { kind: 'failed' }, dayIndex: 0, slots: [], rows: [] })
    expect(gapPeek(view, clock, labelOf)).toEqual({ kind: 'phase', phase: 'failed' })
    expect(gapCount(view)).toBeNull()
  })

  it('shows none for a ready read with no rows', () => {
    const view = gapLensRows({ status: READY, dayIndex: 0, slots: [slot('lunch', 'filled', { filledStop: STOP })], rows: [] })
    expect(view.phase).toBe('empty')
    expect(gapPeek(view, clock, labelOf)).toEqual({ kind: 'none' })
    expect(gapCount(view)).toBeNull()
  })

  it('shows the first gap: title, window, count and pick A', () => {
    const view = gapLensRows({ status: READY, dayIndex: 0, slots: [slot('lunch', 'empty')], rows: [candidate('c1'), candidate('c2'), candidate('c3')] })
    const peek = gapPeek(view, clock, labelOf)
    if (peek.kind !== 'gap') throw new Error('expected a gap peek')
    expect(peek.title).toBe('Lunch')
    expect(peek.windowText).toBe('11:30–14:30')
    expect(peek.countText).toBe('3 picks')
    expect(peek.best?.letter).toBe('A')
    expect(gapCount(view)).toBe(1)
  })

  it('says one pick, and the no-fit sentence for none', () => {
    const one = gapPeek(gapLensRows({ status: READY, dayIndex: 0, slots: [slot('lunch', 'empty')], rows: [candidate('c1')] }), clock, labelOf)
    if (one.kind !== 'gap') throw new Error('expected a gap peek')
    expect(one.countText).toBe('1 pick')
    const none = gapPeek(gapLensRows({ status: READY, dayIndex: 0, slots: [slot('lunch', 'empty')], rows: [] }), clock, labelOf)
    if (none.kind !== 'gap') throw new Error('expected a gap peek')
    expect(none.countText).toBe(GAP_NO_FIT_TEXT['no-candidates'])
    expect(none.best).toBeNull()
  })
})
