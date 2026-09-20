// ============ The day's slots (the slots-rail engine, plan P1) ============
// A slot view over the halt segmentation: what the day is MISSING (lunch,
// fuel, dinner, stay), filled by search, comparison, or vote. Slots are
// DERIVED, never stored - they are a pure projection of engine output, so
// they can never drift from the engine.
//
// Three slot states (the mockup's grammar):
//   filled - one quiet line; the stop that fills it
//   empty  - candidates inside; tap to compare, source, or vote
//   auto   - engine-managed (stretch halts); a dim line, no work demanded
//
// Data rules this module keeps:
//   - Slots derive from `SegmentHit`s (planRideSegments via planJourneyHalts),
//     the day's itinerary stops, and the already-computed candidate pool.
//   - Every number shown (detour minutes, budget share, arrival) is already
//     computed by the engine - nothing is re-estimated here.
//   - Windows are the engine's own constants (LUNCH_WINDOW, DINNER_WINDOW,
//     BREAKFAST_WINDOW) - never re-declared.
//   - Day slicing walks the journey-ordered segments' `dayEnd` flags: each
//     overnight segment closes its day, so no geometry or day-index plumbing
//     is needed and a segment can never land in the wrong day.
//   - A generic stop only fills a meal/stay slot through its own category,
//     its reported opening hours overlapping the slot's window, or the
//     nearest-window fallback - two slots never claim one stop.
import {
  BREAKFAST_WINDOW,
  DINNER_WINDOW,
  LUNCH_WINDOW,
  fitScoreForPurpose,
  reasonForSegmentHit,
  scoreHitForSegment,
  type RideSegment,
  type SegmentHit,
} from './ridePlan'
import { budgetSharePct, dayDetourBudgetMin } from './detourBudget'
import { asymmetricDetourMinutes, detourKm, type HaltPurpose, type PlaceHit } from './providers/hits'
import { clockHM } from './clockOverlay'
import { MODE_SPEED } from './engine'
import type { ItineraryStop, TransportMode } from '../data/types'

/** How close to its window end an empty slot reads as urgent ("closes 14:30"). */
export const SLOT_URGENCY_MIN = 20

export type SlotKey = 'breakfast' | 'lunch' | 'dinner' | 'fuel' | 'stretch' | 'stay'
export type DaySlotKind = 'meal' | 'fuel' | 'stretch' | 'overnight'
export type MealSlotName = 'lunch' | 'dinner'
export type SlotState = 'filled' | 'empty' | 'auto'

/** One fillable candidate for an empty slot, pre-scored and window-annotated. */
export interface SlotCandidate {
  hit: PlaceHit
  /** door-to-door detour minutes at the trip's speed (asymmetric when geometry is known) */
  detourMin: number
  /** road detour km (null = on route / unknown) */
  detourKm: number | null
  /** whole-percent share of that day's detour budget this candidate spends */
  budgetSharePct: number
  /** along-route km of the candidate (null = unpositionable) */
  posKm: number | null
  /** estimated arrival in minutes-since-midnight (null when the segment has no ETA) */
  arriveMin: number | null
  /** "HH:MM" arrival for the card, when known */
  arriveLabel: string | null
  /** true when the candidate's arrival lands inside the slot's window */
  inWindow: boolean
  /** engine score (lower = better) - the same number the corridor scan computed */
  score: number
  /** the engine's own why-line ("Breaks a 2 h drive · 5 km off-route · near Kochi") */
  reason: string
}

/** One slot of the day: a required halt as the rail renders it. */
export interface DaySlot {
  key: SlotKey
  kind: DaySlotKind
  /** which meal a meal segment became ("lunch" | "dinner"); breakfast keeps its own key */
  mealSlot?: MealSlotName
  /** user-facing name ("Lunch", "Stay") - the UI never shows the word "slot" */
  label: string
  state: SlotState
  /** the slot's clock window in minutes-since-midnight (null = none: fuel/stretch/stay) */
  windowMin: [number, number] | null
  /** "HH:MM - HH:MM" when a window exists; "auto" on the auto state */
  windowLabel: string | null
  /** the engine halt behind the slot (null = the prologue stay of a no-drive day) */
  segment: RideSegment | null
  /** the itinerary stop that fills the slot, when one does */
  filledStop: ItineraryStop | null
  /** stretch halts: engine-managed, quiet */
  auto: boolean
  /** #143 drift proposal on a pinned stretch halt: the Move here / Stay choice */
  drift: { fromKm: number; toKm: number } | null
  /** window end minus ETA; <= SLOT_URGENCY_MIN means "closing", negative = missed (null = no window or no ETA) */
  urgencyMin: number | null
  candidates: SlotCandidate[]
  /** why-line for the auto state ("Engine-managed stretch") */
  reason: string | null
}

/** Per-day fill counts, for day chips and the rail's meter. */
export interface DayReadiness {
  dayIndex: number
  filled: number
  total: number
  auto: number
  /** total minus auto - the work the crew actually owns */
  required: number
}

export interface DaySlotsDeps {
  /** the whole journey's halt segmentation (journey-ordered, dayEnd flags intact) */
  haltSegments: SegmentHit[]
  /** THIS day's itinerary stops (all statuses; rejected never fill) */
  dayStops: ItineraryStop[]
  /** trip anchors (the corridor scan's own anchor list) */
  anchors: { lat: number; lng: number }[]
  /** OSRM route geometry when measured - makes detours asymmetric */
  routePolyline?: { lat: number; lng: number }[] | null
  transportMode?: TransportMode | null
  travelStyle?: string | null
  /** planned-stop count feeding that day's detour budget (MapTab's own input) */
  plannedStops?: number
  /** lowercase titles of stops already on the trip - such hits never re-candidate */
  existingNames?: ReadonlySet<string>
  /** the corridor scan's leftover pool (MapTab's altPool.all) */
  altPool?: PlaceHit[]
  /** max candidates rendered inside one slot (default 3) */
  limit?: number
  /** Day attribution override (the caller's own dayForKm over road-true
   *  per-day km): receives a journey segment, returns the trip day index it
   *  belongs to. When given, day slicing follows IT, not the dayEnd flags -
   *  corridor plans without overnight splits still attribute honestly. */
  dayOfSegment?: (sh: SegmentHit) => number | null
  /** When true, a day with any activity always renders the full day grammar
   *  (breakfast, lunch, dinner, stay) - engine halts fill what they can and
   *  the skeleton supplies the rest, so the rail reads the same on every day.
   */
  fillSkeleton?: boolean
  /** The day's road-km span (start inclusive, end inclusive) for positioning
   *  synthesized slots on the corridor. Absent = the day's own stops only. */
  daySpanKm?: (dayIndex: number) => { fromKm: number; toKm: number } | null
}

const SLOT_LABELS: Record<SlotKey, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  fuel: 'Fuel',
  stretch: 'Stretch',
  stay: 'Stay',
}

const LUNCH_END_MIN = LUNCH_WINDOW[1] // 14:30 - the meal split boundary
const BREAKFAST_END_MIN = BREAKFAST_WINDOW[1] // 9:30

/** Day slicing: the caller's attribution (dayOfSegment) wins when given;
 *  otherwise each `dayEnd` segment closes its day. */
function segmentsForDay(segs: SegmentHit[], dayIndex: number, dayOfSegment?: (sh: SegmentHit) => number | null): SegmentHit[] {
  if (dayOfSegment) return segs.filter(sh => dayOfSegment(sh) === dayIndex)
  const out: SegmentHit[] = []
  let day = 0
  for (const sh of segs) {
    if (day === dayIndex) out.push(sh)
    if (sh.segment.dayEnd) day += 1
    if (day > dayIndex) break
  }
  return out
}

const minute = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** "HH:MM - HH:MM" for a window; null when no window. */
function windowLabelOf(win: [number, number] | null): string | null {
  return win ? `${clockHM(win[0])} - ${clockHM(win[1])}` : null
}

/** The stop's clock span from its reported opening hours, when both ends exist. */
function stopSpanMin(s: ItineraryStop): [number, number] | null {
  const parse = (t?: string): number | null => {
    if (!t) return null
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
    if (!m) return null
    const h = Number(m[1])
    const min = Number(m[2])
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null
    return h * 60 + min
  }
  const open = parse(s.openTime)
  const close = parse(s.closeTime)
  if (open == null || close == null) return null
  return [open, close]
}

interface SlotDraft {
  key: SlotKey
  kind: DaySlotKind
  mealSlot?: MealSlotName
  segments: RideSegment[]
}

/**
 * Route one engine segment to its slot. Meals split by their arrival against
 * the engine's own windows: inside/before the breakfast window's end ->
 * breakfast, inside/before the lunch window's end -> lunch, past it ->
 * dinner. The plan's P0.3 rule holds - the purpose stays `meal`; only the
 * slot view splits it.
 */
function draftForSegment(seg: RideSegment): SlotDraft | null {
  switch (seg.purpose) {
    case 'meal': {
      const eta = minute(seg.etaMinutes) ? seg.etaMinutes : null
      if (eta != null && eta <= BREAKFAST_END_MIN) {
        return { key: 'breakfast', kind: 'meal', segments: [seg] }
      }
      const mealSlot: MealSlotName = eta != null && eta > LUNCH_END_MIN ? 'dinner' : 'lunch'
      return { key: mealSlot, kind: 'meal', mealSlot, segments: [seg] }
    }
    case 'fuel':
      return { key: 'fuel', kind: 'fuel', segments: [seg] }
    case 'stretch':
    case 'rest':
      return { key: 'stretch', kind: 'stretch', segments: [seg] }
    case 'overnight':
      return { key: 'stay', kind: 'overnight', segments: [seg] }
    default:
      return null // sight segments never become slots
  }
}

/** The engine's window for a slot - the constants ridePlan owns, never re-declared. */
function windowFor(draft: SlotDraft): [number, number] | null {
  if (draft.key === 'breakfast') return BREAKFAST_WINDOW
  if (draft.key === 'lunch') return LUNCH_WINDOW
  if (draft.key === 'dinner') return DINNER_WINDOW
  return null // fuel (its hint carries the tank window), stretch, stay
}

/**
 * Which stop fills a slot, if any. Rejected stops never fill. Category
 * claims first (food -> meal slots, hotel -> stay), then a stop's reported
 * hours overlapping an empty slot's window, then the nearest-window
 * fallback for food stops whose hours name no window. One stop fills at
 * most one slot, and a generic stop without a matching time fills nothing.
 */
function fillStopFor(
  drafts: SlotDraft[],
  stops: ItineraryStop[],
): Map<SlotKey, ItineraryStop> {
  const claims = new Map<SlotKey, ItineraryStop>()
  const claimed = new Set<string>()
  const active = stops.filter(s => s.status !== 'rejected')
  const takeLatest = (list: ItineraryStop[]): ItineraryStop | null =>
    list.length > 0 ? list[list.length - 1] : null

  const foodStops = active.filter(s => s.category === 'food')
  const hotelStops = active.filter(s => s.category === 'hotel')

  // Pass 1 - meals: a food stop whose hours overlap the slot's window.
  for (const d of drafts) {
    if (d.kind !== 'meal') continue
    const win = windowFor(d)
    if (!win) continue
    const matching = foodStops.filter(s => {
      if (claimed.has(String(s.id))) return false
      const span = stopSpanMin(s)
      return span != null && span[0] < win[1] && span[1] > win[0]
    })
    const pick = takeLatest(matching)
    if (pick) {
      claims.set(d.key, pick)
      claimed.add(String(pick.id))
    }
  }

  // Pass 1b - fuel: a transport-hub stop claims it. Fuel has no clock
  // window, so category is the only honest claim.
  const fuelDraft = drafts.find(d => d.kind === 'fuel')
  if (fuelDraft) {
    const pick = takeLatest(active.filter(s => !claimed.has(String(s.id)) && s.category === 'transport-hub'))
    if (pick) {
      claims.set(fuelDraft.key, pick)
      claimed.add(String(pick.id))
    }
  }

  // Pass 2 - stay: the hotel-category stop claims it.
  const stayDraft = drafts.find(d => d.kind === 'overnight')
  if (stayDraft) {
    const pick = takeLatest(hotelStops.filter(s => !claimed.has(String(s.id))))
    if (pick) {
      claims.set(stayDraft.key, pick)
      claimed.add(String(pick.id))
    }
  }

  // Pass 3 - meals still empty: remaining food stops. One with hours goes to
  // the window nearest its span start; one without goes to the first empty
  // meal slot in the day's natural order (lunch before dinner).
  const emptyMeals = drafts.filter(d => d.kind === 'meal' && !claims.has(d.key))
  if (emptyMeals.length > 0) {
    const remaining = foodStops.filter(s => !claimed.has(String(s.id)))
    for (const d of emptyMeals) {
      const win = windowFor(d)
      if (!win) continue
      const withHours = remaining.filter(s => {
        if (claimed.has(String(s.id))) return false
        return stopSpanMin(s) != null
      })
      if (withHours.length > 0) {
        const nearest = withHours.reduce((a, b) => {
          const sa = stopSpanMin(a)
          const sb = stopSpanMin(b)
          const da = sa ? Math.abs(sa[0] - win[0]) : Number.MAX_SAFE_INTEGER
          const db = sb ? Math.abs(sb[0] - win[0]) : Number.MAX_SAFE_INTEGER
          return db < da ? b : a
        }, withHours[0])
        claims.set(d.key, nearest)
        claimed.add(String(nearest.id))
      }
    }
    const untimed = remaining.filter(s => !claimed.has(String(s.id)) && stopSpanMin(s) == null)
    for (const d of emptyMeals) {
      if (claims.has(d.key)) continue
      const pick = takeLatest(untimed.filter(s => !claimed.has(String(s.id))))
      if (pick) {
        claims.set(d.key, pick)
        claimed.add(String(pick.id))
      }
    }
  }

  // Pass 4 - a non-food, non-hotel stop whose hours overlap an empty slot's
  // window fills that window (a 12:30 'travel' stop reads as lunch). Without
  // matching hours it fills nothing - two slots never claim one stop.
  for (const d of drafts) {
    if (claims.has(d.key)) continue
    const win = windowFor(d)
    if (!win) continue
    const matching = active.filter(s => {
      if (claimed.has(String(s.id))) return false
      if (s.category === 'food' || s.category === 'hotel') return false
      const span = stopSpanMin(s)
      return span != null && span[0] < win[1] && span[1] > win[0]
    })
    const pick = takeLatest(matching)
    if (pick) {
      claims.set(d.key, pick)
      claimed.add(String(pick.id))
    }
  }

  return claims
}

/** Slot engine speed: the trip mode's own door-to-door figure, 40 as fallback. */
function speedFor(mode: TransportMode | null | undefined): number {
  const v = mode != null ? MODE_SPEED[mode] : undefined
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 40
}

/** The engine purpose a slot scores its pool against. */
function purposeFor(kind: DaySlotKind): HaltPurpose {
  switch (kind) {
    case 'overnight': return 'overnight'
    case 'fuel': return 'fuel'
    case 'stretch': return 'stretch'
    default: return 'meal'
  }
}

/** A synthetic segment scores pool candidates when the slot has no engine halt. */
function synthSegment(draft: SlotDraft, seg: RideSegment | null): RideSegment {
  if (seg) return seg
  return {
    index: 0,
    purpose: purposeFor(draft.kind),
    label: SLOT_LABELS[draft.key],
    targetKm: 0,
    minKm: 0,
    maxKm: Number.MAX_SAFE_INTEGER,
    kmFromPrev: 0,
    minutesFromPrev: 0,
    hint: '',
  }
}

/**
 * Candidates for an empty slot. The segment's own engine-scored hit leads;
 * the corridor pool (altPool) is scored with the engine's own scorer. Pool
 * gating stays honest: meals accept food-grade places or real towns, fuel
 * wants fuel-grade places, stretch wants break-grade ones (fit >= 2), and a
 * stay needs hotel-grade or town-grade. The day's detour budget culls the
 * tail exactly as the see-&-do rail spends its budget.
 */
function candidatesFor(
  draft: SlotDraft,
  seg: RideSegment | null,
  segHits: SegmentHit[],
  deps: DaySlotsDeps,
): SlotCandidate[] {
  const limit = deps.limit ?? 3
  const win = windowFor(draft)
  const speed = speedFor(deps.transportMode)
  const purpose = purposeFor(draft.kind)
  const seen = new Set<string>()
  const rows: Array<{ hit: PlaceHit; score: number }> = []

  for (const sh of segHits) {
    if (!sh.hit) continue
    const id = String(sh.hit.id)
    if (seen.has(id)) continue
    if (deps.existingNames?.has(sh.hit.name.toLowerCase())) continue
    seen.add(id)
    rows.push({ hit: sh.hit, score: sh.score })
  }

  for (const h of deps.altPool ?? []) {
    const id = String(h.id)
    if (seen.has(id)) continue
    if (deps.existingNames?.has(h.name.toLowerCase())) continue
    // Pool gating: meals take food-grade places or real towns, fuel wants
    // fuel-grade, stretch break-grade, stays hotel/town-grade (fit >= 2).
    if (fitScoreForPurpose(h, purpose) < 2) continue
    const score = scoreHitForSegment(h, synthSegment(draft, seg), deps.anchors, {
      routePolyline: deps.routePolyline ?? undefined,
      speedKmph: speed,
    })
    if (score == null) continue
    seen.add(id)
    rows.push({ hit: h, score })
  }

  // Engine score orders (lower = better); ties keep corridor order.
  rows.sort((a, b) => a.score - b.score)

  const budget = dayDetourBudgetMin({
    travelStyle: deps.travelStyle ?? undefined,
    plannedStops: deps.plannedStops,
  })
  const out: SlotCandidate[] = []
  let spent = 0
  for (const row of rows) {
    if (out.length >= limit) break
    const dKm = detourKm(row.hit, deps.anchors)
    const dMin = asymmetricDetourMinutes(row.hit, deps.anchors, deps.routePolyline ?? null, speed)
    // Budget honesty: the same rule the see-&-do rail spends by. Zero-detour
    // (on-route) candidates never spend.
    if (dMin > 0) {
      if (spent + dMin > budget) continue
      spent += dMin
    }
    const eta = seg && minute(seg.etaMinutes) ? (seg.etaMinutes as number) : null
    const arriveMin = eta != null ? Math.round(eta + dMin) : null
    const inWindow = arriveMin != null && win != null && arriveMin >= win[0] && arriveMin <= win[1]
    out.push({
      hit: row.hit,
      detourMin: dMin,
      detourKm: dKm,
      budgetSharePct: budgetSharePct(dMin, budget),
      posKm: row.hit.alongRouteKm ?? null,
      arriveMin,
      arriveLabel: arriveMin != null ? clockHM(arriveMin) : null,
      inWindow,
      score: row.score,
      reason: reasonForSegmentHit({ segment: synthSegment(draft, seg), hit: row.hit, score: row.score }, dKm),
    })
  }
  return out
}

/** Canonical rail order (the mockup's grammar): breakfast, lunch, fuel,
 *  stretch, dinner, stay. Stable for equal ranks. */
const KIND_RANK: Record<SlotKey, number> = { breakfast: 0, lunch: 1, fuel: 2, stretch: 3, dinner: 4, stay: 5 }

/**
 * Supply the missing parts of the day's grammar. Every day with any activity
 * gets lunch; a day that ends at a stay gets dinner; a day that begins after
 * a night (or holds its own stay) gets breakfast. Fuel and stretch stay
 * engine-only: a need the engine has not derived is not invented.
 */
function addSkeleton(drafts: SlotDraft[], deps: DaySlotsDeps, dayIndex: number): void {
  const hasStay = drafts.some(d => d.key === 'stay')
  const hasActivity = drafts.length > 0 || deps.dayStops.some(s => s.status !== 'rejected')
  if (!hasActivity) return
  const span = deps.daySpanKm?.(dayIndex) ?? null
  const midKm = span ? span.fromKm + (span.toKm - span.fromKm) * 0.45 : 0
  const synth = (key: SlotKey, purpose: RideSegment['purpose'], targetKm: number, mealSlot?: MealSlotName): SlotDraft => ({
    key,
    kind: key === 'stay' ? 'overnight' : 'meal',
    ...(mealSlot ? { mealSlot } : {}),
    segments: [{
      index: -1,
      purpose,
      label: SLOT_LABELS[key],
      targetKm,
      minKm: Math.max(0, targetKm - 60),
      maxKm: targetKm + 60,
      kmFromPrev: 0,
      minutesFromPrev: 0,
      hint: '',
      // A hint of arrival so candidates get honest times: breakfast reads as
      // eaten at the day's start, lunch in its window, dinner at its window.
      ...(key === 'breakfast' ? { etaMinutes: BREAKFAST_WINDOW[0] + 30 }
        : key === 'lunch' ? { etaMinutes: LUNCH_WINDOW[0] + 30 }
        : key === 'dinner' ? { etaMinutes: DINNER_WINDOW[0] + 30 }
        : {}),
    }],
  })
  if (!drafts.some(d => d.key === 'breakfast') && (hasStay || dayIndex > 0)) {
    drafts.push(synth('breakfast', 'meal', span ? span.fromKm : 0))
  }
  if (!drafts.some(d => d.key === 'lunch')) {
    drafts.push(synth('lunch', 'meal', midKm, 'lunch'))
  }
  if (hasStay && !drafts.some(d => d.key === 'dinner')) {
    drafts.push(synth('dinner', 'meal', span ? span.toKm : 0, 'dinner'))
  }
}

/**
 * The day's slots, derived from engine output alone. Order follows the
 * journey; with fillSkeleton the missing parts of the day's grammar are
 * supplied so every day reads the same; the canonical kind order keeps the
 * rail identical to the design on every day.
 */
export function daySlots(dayIndex: number, deps: DaySlotsDeps): DaySlot[] {
  const daySegs = segmentsForDay(deps.haltSegments, dayIndex, deps.dayOfSegment)

  const drafts: SlotDraft[] = []
  const pushDraft = (d: SlotDraft) => {
    const existing = drafts.find(x => x.key === d.key)
    if (existing) existing.segments.push(...d.segments)
    else drafts.push(d)
  }
  for (const sh of daySegs) {
    const d = draftForSegment(sh.segment)
    if (d) pushDraft(d)
  }

  // Prologue: a no-drive day whose hotel stop exists still owns its stay.
  if (!drafts.some(d => d.key === 'stay')) {
    const hotelStop = deps.dayStops.find(s => s.category === 'hotel' && s.status !== 'rejected')
    if (hotelStop) drafts.unshift({ key: 'stay', kind: 'overnight', segments: [] })
  }

  if (deps.fillSkeleton) addSkeleton(drafts, deps, dayIndex)

  // Canonical rail order (the mockup's grammar) - stable for equal ranks.
  drafts.sort((a, b) => (KIND_RANK[a.key] - KIND_RANK[b.key]))

  if (drafts.length === 0) return []

  const claims = fillStopFor(drafts, deps.dayStops)

  return drafts.map(draft => {
    const seg = draft.segments[0] ?? null
    const win = windowFor(draft)
    const filledStop = claims.get(draft.key) ?? null
    const isStretch = draft.kind === 'stretch'
    const drift =
      isStretch && seg?.haltPinned && minute(seg.haltDriftToKm)
        ? { fromKm: seg.targetKm, toKm: seg.haltDriftToKm as number }
        : null
    const auto = isStretch && drift == null
    const eta = seg && minute(seg.etaMinutes) ? (seg.etaMinutes as number) : null
    const urgencyMin = win && eta != null ? win[1] - eta : null
    return {
      key: draft.key,
      kind: draft.kind,
      ...(draft.mealSlot ? { mealSlot: draft.mealSlot } : {}),
      label: SLOT_LABELS[draft.key],
      state: filledStop ? 'filled' : auto ? 'auto' : 'empty',
      windowMin: win,
      windowLabel: auto ? 'auto' : windowLabelOf(win),
      segment: seg,
      filledStop,
      auto,
      drift,
      urgencyMin,
      candidates:
        filledStop || auto
          ? []
          : candidatesFor(draft, seg, daySegs.filter(sh => sh.segment.purpose === draft.segments[0]?.purpose), deps),
      reason: auto ? 'Engine-managed stretch' : null,
    }
  })
}

/** The rail's meter for one day. */
export function dayReadiness(dayIndex: number, deps: DaySlotsDeps): DayReadiness {
  const slots = daySlots(dayIndex, deps)
  const filled = slots.filter(s => s.state === 'filled').length
  const auto = slots.filter(s => s.auto).length
  return {
    dayIndex,
    filled,
    total: slots.length,
    auto,
    required: slots.length - auto,
  }
}

/** Trip-wide readiness, one entry per day that has any slot (chip row / Overview matrix). */
export function tripReadiness(
  haltSegments: SegmentHit[],
  days: Array<{ index: number; stops: ItineraryStop[] }>,
  base: Omit<DaySlotsDeps, 'haltSegments' | 'dayStops'>,
): DayReadiness[] {
  const out: DayReadiness[] = []
  let maxDay = 0
  if (base.dayOfSegment) {
    for (const sh of haltSegments) {
      const d = base.dayOfSegment(sh)
      if (d != null && d > maxDay) maxDay = d
    }
  } else {
    let day = 0
    for (const sh of haltSegments) {
      maxDay = Math.max(maxDay, day)
      if (sh.segment.dayEnd) day += 1
    }
  }
  // A corridor plan with no dayEnd flags (short / single-blob plans) is one
  // driving day: without this fallback every non-zero dayIndex rendered the
  // empty-day state and the rail looked unredesigned there.
  if (maxDay === 0 && haltSegments.length > 0) {
    const dayEntry = days.find(x => x.index === 0)
    out.push(dayReadiness(0, { ...base, haltSegments, dayStops: dayEntry?.stops ?? [] }))
    return out
  }
  for (let d = 0; d <= maxDay; d++) {
    const dayEntry = days.find(x => x.index === d)
    out.push(
      dayReadiness(d, {
        ...base,
        haltSegments,
        dayStops: dayEntry?.stops ?? [],
      }),
    )
  }
  return out
}
