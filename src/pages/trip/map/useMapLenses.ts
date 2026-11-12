// One lens model for the Map tab: Drive, Stay, Gap and Fix. The four lenses
// read the shared journey rows and the existing lens models. This file adds no
// second lens type system, no store read and no provider call.
//
// Rules kept here:
//  - A count is null until its lens is ready or empty. A failed read never shows zero.
//  - A missing value stays null. The copy for it says the value is unknown.
//  - The Fix model asks the engine, not the scan. Its phase is ready on a real day.
import { useMemo } from 'react'
import type { Trip } from '../../../data/types'
import type { DaySlot } from '../../../lib/daySlots'
import type { JourneyRow } from '../../../lib/journeyProjection'
import type { DaySchedule, LegEstimate } from '../../../lib/engine'
import { collectWarnings, groupWarnings, hmToMinutes } from '../../../lib/engine'
import { validHM } from '../../../lib/timefmt'
import {
  driveLensRows, gapLensRows, fixLensRows, stayLensRows,
  type DriveLensRow, type FixChangeSet, type FixTarget, type GapLensRow, type LensPhase,
  type LensView,
} from '../../../lib/mapLensContracts'
import type { JourneyStatus } from '../journey/journeyDays'
import { driveTabs, type DriveTabsResult } from './driveLens'
import { gapPicks, gapCount, type GapPicks } from './gapLens'
import { fixesForWarning, fixSummary, formatFixEvidence, warningRefs, type FixSummary } from './fixLens'
import { resolveStayBase, stayPicks, stayWindows, type StayEveningBook, type StayPicksResult, type StayWindow } from './stayLens'

/** The four lens ids, in board order. */
export type MapLensId = 'drive' | 'stay' | 'gap' | 'fix'

/** One lens result plus the rows the deck needs. */
export interface DriveLensDeck {
  phase: LensPhase
  view: LensView<DriveLensRow>
  tabs: DriveTabsResult
}

/** One stay deck. A missing base is its own answer, never an empty list. */
export interface StayLensDeck {
  /** The saved stop the lens measures from. Null when the day has no hotel. */
  base: { lat: number; lng: number; name: string } | null
  /** `needs-base` means the lens cannot run. It is not the empty phase. */
  phase: LensPhase | 'needs-base'
  needsBase: boolean
  /** The free windows the caller's clock facts support. Empty = none known. */
  windows: StayWindow[]
  /** Picks by window id. A window with no picks keeps its own phase result. */
  picks: Readonly<Record<string, StayPicksResult>>
  /** True when a base exists but no free window is known. */
  windowUnknown: boolean
  /** The ready row count, or null when the phase makes it unknown. */
  rowCount: number | null
}

/** One gap part, ready for GapDeck. */
export interface GapLensPart {
  title: string
  windowText: string | null
  picks: GapPicks
}

export interface GapLensDeck {
  phase: LensPhase
  view: LensView<GapLensRow>
  gaps: GapLensPart[]
}

/** The copy for one Fix problem. Every line comes from the engine warning. */
export interface FixProblem {
  title: string
  evidence: string[]
  foundBy: string
}

export interface FixLensDeck {
  phase: LensPhase
  view: LensView<FixChangeSet>
  target: FixTarget | null
  problem: FixProblem | null
  fixes: Array<{ set: FixChangeSet; summary: FixSummary }>
}

export interface MapLenses {
  drive: DriveLensDeck
  stay: StayLensDeck
  gap: GapLensDeck
  fix: FixLensDeck
  counts: Record<MapLensId, number | null>
}

/** The values MapTab already holds. No hook reads a store. */
export interface MapLensesInput {
  trip: Trip
  /** The active day. Null means the lens has no day to work on. */
  dayIndex: number | null
  /** The shared journey status. It comes from the scan, never from the rows. */
  status: JourneyStatus
  /** The active day's projected rows, in the model's order. */
  rows: readonly JourneyRow[]
  /** The active day's slots, in slot order. */
  slots: readonly DaySlot[]
  /** The day's detour budget in minutes. */
  budgetMin: number
  /** The active day's schedule slice, or null when no schedule is known. */
  schedule: Pick<DaySchedule, 'activeStops' | 'arrivalTimes'> | null
  /** The caller's 12h or 24h clock. */
  clock: (min: number) => string
  /** The deck's day line, for example "Day 3". */
  dayLabel: string
  /** The measured legs the rail draws. The Fix lens reads the same ones, so
   *  its warning and the rail's clocks describe one schedule. */
  legCorrections?: Record<string, LegEstimate>
  /** The fixed evening booking the free window must wait for. Absent keeps the
   *  base arrival. */
  eveningBook?: StayEveningBook | null
}

/** A count is the ready row count. An empty search is a real zero. Every other phase is unknown, so null. */
export function phaseCount(phase: LensPhase, rows: number): number | null {
  if (phase === 'ready') return rows
  return phase === 'empty' ? 0 : null
}

/** The pick letters, A first. */
const PICK_LETTERS = ['A', 'B', 'C'] as const

/** One row's along-route km. Null means no road position is known. */
function roadKmOf(row: DriveLensRow): number | null {
  // Both fields are km from the journey origin. The exact leg wins.
  const km = row.row.hit.alongRouteKm ?? row.row.hit.cumKm
  return km != null && Number.isFinite(km) ? Math.max(0, km) : null
}

/**
 * The letters for the shown Drive cards, in road order.
 * A row with no known road position keeps its card order after the placed
 * rows. The map pins, the cards and the peek read this one map. The set
 * stops at C.
 */
export function driveLettersByRoad(
  rows: readonly DriveLensRow[],
): Record<string, 'A' | 'B' | 'C'> {
  const placed = rows.map((row, index) => ({ id: String(row.row.hit.id), km: roadKmOf(row), index }))
  placed.sort((a, b) => {
    if (a.km == null && b.km == null) return a.index - b.index
    if (a.km == null) return 1
    if (b.km == null) return -1
    return a.km - b.km
  })
  const letters: Record<string, 'A' | 'B' | 'C'> = {}
  placed.slice(0, PICK_LETTERS.length).forEach((entry, index) => {
    letters[entry.id] = PICK_LETTERS[index]
  })
  return letters
}

/** A stored clock string as minutes. Null when the string is not a real clock. */
function clockMinOrNull(hm: string | undefined | null): number | null {
  const valid = validHM(hm ?? undefined)
  return valid === undefined ? null : hmToMinutes(valid)
}

/**
 * The Fix model reads the engine, not a place scan. A real day is ready before
 * any scan runs, so it passes this ready status to the contract's day filter.
 */
const FIX_READY: JourneyStatus = { kind: 'ready', source: 'scan' }

/** The first severe warning of the day, else the first warning in engine order.
 *  `legCorrections` is the caller's measured road: without it the warning was
 *  computed on a faster estimate than the rail's schedule, so the Fix card and
 *  the rail named two different arrivals for one plan. */
export function fixProblemFor(
  trip: Trip,
  dayIndex: number,
  legCorrections?: Record<string, LegEstimate>,
  clock: (hm: string) => string = hm => hm,
): { target: FixTarget; problem: FixProblem } | null {
  const { byDay } = groupWarnings(collectWarnings(trip, legCorrections))
  const warnings = byDay.get(dayIndex) ?? []
  if (warnings.length === 0) return null
  const targets = warningRefs(trip, dayIndex, legCorrections)
  const pairs: Array<{ warning: (typeof warnings)[number]; target: FixTarget; severe: boolean }> = []
  warnings.forEach((warning, index) => {
    const target = targets[index]
    if (target) pairs.push({ warning, target, severe: target.severe })
  })
  if (pairs.length === 0) return null
  const chosen = pairs.find(pair => pair.severe) ?? pairs[0]
  return {
    target: chosen.target,
    problem: {
      title: chosen.warning.title,
      evidence: chosen.warning.detail ? [formatFixEvidence(chosen.warning.detail, clock)] : [],
      foundBy: `${chosen.warning.code} check`,
    },
  }
}

/**
 * The four lens decks for one day. Pure: no React state and no store read.
 * An unknown value is null, and each phase keeps its own answer.
 */
export function mapLensesFor(input: MapLensesInput): MapLenses {
  const { trip, dayIndex, status, rows, slots, budgetMin, schedule, clock, legCorrections, eveningBook } = input

  // Drive: corridor suggestions, grouped into the board's three tabs.
  const driveView = driveLensRows({ status, dayIndex, rows, budgetMin })
  const drive: DriveLensDeck = {
    phase: driveView.phase,
    view: driveView,
    tabs: driveTabs(driveView, slots),
  }

  // Stay: the day's saved hotel is the only base. No base means no lens.
  const base = dayIndex == null ? { kind: 'missing' as const } : resolveStayBase(trip, dayIndex)
  let stay: StayLensDeck
  if (base.kind === 'missing' || dayIndex == null) {
    stay = {
      base: null,
      phase: 'needs-base',
      needsBase: true,
      windows: [],
      picks: {},
      windowUnknown: false,
      rowCount: null,
    }
  } else {
    const day = trip.days.find(entry => entry.index === dayIndex)
    const stop = day?.stops.find(entry => entry.id === base.stopId)
    const stopAt = schedule == null
      ? -1
      : schedule.activeStops.findIndex(entry => entry.id === base.stopId)
    const arriveAtBaseMin = stopAt >= 0 ? clockMinOrNull(schedule?.arrivalTimes[stopAt]) : null
    const nextDay = trip.days.find(entry => entry.index === dayIndex + 1)
    const leaveBaseMin = clockMinOrNull(nextDay?.startTime)
    const windows = stayWindows({ arriveAtBaseMin, leaveBaseMin, ...(eveningBook != null ? { eveningBook } : {}) })
    const output = stayLensRows({
      status,
      dayIndex,
      rows,
      base: { kind: 'stop', stopId: base.stopId, dayIndex },
    })
    const picked: Record<string, StayPicksResult> = {}
    if (stop && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)) {
      for (const window of windows) {
        picked[window.id] = stayPicks(output, { lat: stop.lat, lng: stop.lng }, window, clock)
      }
    }
    const phase: LensPhase | 'needs-base' = output.kind === 'needs-base' ? 'needs-base' : output.view.phase
    stay = {
      base: stop && Number.isFinite(stop.lat) && Number.isFinite(stop.lng)
        ? { lat: stop.lat, lng: stop.lng, name: stop.title }
        : null,
      phase,
      needsBase: output.kind === 'needs-base',
      windows,
      picks: picked,
      windowUnknown: windows.length === 0,
      rowCount: output.kind === 'view' ? phaseCount(output.view.phase, output.view.rows.length) : null,
    }
  }

  // Gap: the open parts of the day, with the board's lettered picks.
  const gapView = gapLensRows({ status, dayIndex, rows, slots })
  const gaps: GapLensPart[] = gapView.rows.map(row => {
    const slot = slots.find(entry => entry.key === row.slotKey)
    return {
      title: slot?.label ?? row.slotKey,
      windowText: row.windowMin == null ? null : `${clock(row.windowMin[0])}–${clock(row.windowMin[1])}`,
      picks: gapPicks(row, clock),
    }
  })
  const gap: GapLensDeck = { phase: gapView.phase, view: gapView, gaps }

  // Fix: the first warning of the day, and the fixes the engine verified.
  // Both run on the caller's measured legs, like the rail's own schedule.
  const problem = dayIndex == null ? null : fixProblemFor(trip, dayIndex, legCorrections, hm => clock(hmToMinutes(hm)))
  const dayStops = dayIndex == null ? [] : trip.days.find(day => day.index === dayIndex)?.stops ?? []
  const fixes = problem == null || dayIndex == null
    ? []
    : fixesForWarning(trip, dayIndex, problem.target, Number.POSITIVE_INFINITY, legCorrections).map(set => ({
      set,
      summary: fixSummary(set, stopId => {
        const stop = trip.days.find(day => day.stops.some(entry => entry.id === stopId))
          ?.stops.find(entry => entry.id === stopId)
        return stop?.title ?? stopId
      }, clock, dayStops),
    }))
  const fixPhase: LensPhase = dayIndex == null ? 'unscanned' : 'ready'
  const fixView = fixLensRows({
    status: FIX_READY,
    dayIndex,
    sets: fixes.map(entry => entry.set),
  })
  const fix: FixLensDeck = {
    phase: fixPhase,
    view: fixView,
    target: problem?.target ?? null,
    problem: problem?.problem ?? null,
    fixes,
  }

  const counts: Record<MapLensId, number | null> = {
    drive: phaseCount(drive.phase, drive.view.rows.length),
    stay: stay.phase === 'ready' && stay.windows.length > 0 ? stay.rowCount : null,
    gap: gapCount(gapView),
    fix: fixPhase === 'ready' ? fixes.length : null,
  }

  return { drive, stay, gap, fix, counts }
}

/**
 * The lens model for one render. The memo keeps the engine walk out of a
 * parent re-render that changed nothing the lenses read.
 */
export function useMapLenses(input: MapLensesInput): MapLenses {
  const { trip, dayIndex, status, rows, slots, budgetMin, schedule, clock, dayLabel, legCorrections, eveningBook } = input
  return useMemo(
    () => mapLensesFor({ trip, dayIndex, status, rows, slots, budgetMin, schedule, clock, dayLabel, legCorrections, eveningBook }),
    [trip, dayIndex, status, rows, slots, budgetMin, schedule, clock, dayLabel, legCorrections, eveningBook],
  )
}
