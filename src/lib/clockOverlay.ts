// ============ Clock milestone LABELS on the trip road (requested redesign) ============
// Clean text labels, no pins, no circles, no dots: each planned clock anchor
// sits ON the road with its wall-clock time + calendar date on the LEFT of the
// route and its road km ("Km 500") on the RIGHT, so a traveller reads when and
// how far at the exact point they belong to. Pure + node-testable: geometry in,
// labels out, no React, no MapLibre, no time-preference formatting (the view
// composes copy).
//
// The clock walk's planned anchors become labels on the road:
//   · breakfast / lunch  → mealtime label
//   · dinner / overnight → overnight label
//   · final destination   → destination label
// The Milestones toggle keeps working: when off, no labels. The suggestion
// engine's placed places keep their own distance-only "Km N" labels on the
// same road (also dotless).
//
// Round trips: the clock walk returns a directed `returnDays` pass, and the
// return km (> outboundKm) anchor back along the reversed outbound road — the
// trip chain's own return geometry stays with the workspace. Every label is
// tagged `leg`; the Map tab shows return-leg labels ONLY while its Return home
// toggle is on (the same gate as the dashed return line), so the map never
// shows going-home readings the traveller hasn't asked for.
import { haversineKm, pointAtKm } from './geo'
import { type AnchorOpts, type RoadProfilePoint, type TravelClockDay, type TravelClockVerdict } from './ridePlan'
import { isoAddDays } from './weather'
import type { PlaceHit } from './providers/hits'

/** Minutes-since-midnight → "HH:MM" (wall clock, not a duration). */
export function clockHM(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** A planned-clock milestone label on the road. */
export interface ClockMilestone {
  /** road km within its own leg (0 = origin outbound, turnaround on the return) */
  kmIn: number
  /** {lat,lng} on the road at that kmIn */
  lat: number
  lng: number
  /** 1-based driving day */
  dayNo: number
  /** wall clock the milestone fires (minutes since midnight) */
  etaMin: number
  /** map-side label: "HH:MM" */
  timeLabel: string
  /** map-side date: "17 Sep" — empty when the caller has no trip start date */
  dateLabel: string
  /** map-side label: "Km N" outbound, "Km N ↩" on the drive home (per-leg km —
   *  the number is driven-since-the-leg-start, the ↩ says which leg) */
  kmLabel: string
  /** semantic kind (for label styling / tooltip detail) */
  kind: 'mealtime' | 'overnight' | 'destination'
  /** which half of the journey the label sits on — the return half only
   *  renders when the Return home toggle is on (Map tab gate) */
  leg: 'outbound' | 'return'
  /** where the label's day falls against "now" (Phase 1, the living plan):
   *  the day BEHIND the device date is driven history, the day ON it is the
   *  active one, everything later is plan. Undated overlays are all `future`. */
  dayState: 'past' | 'today' | 'future'
  /** the itinerary day index this label's plan lives in (Phase 3): outbound
   *  drive day i IS itinerary day i, and a return drive day anchors at the
   *  trip's tail. Absent when there is no honest itinerary day — the walk's
   *  split ran past the trip's own days, or no day count was given to anchor
   *  the return pass — and such a label is decorative: not tappable, undated. */
  itineraryDay?: number
  /** Phase 2: the named town at an overnight halt, joined from the corridor's
   *  night-halt suggestions — null when nothing honest was found (the chip
   *  stays a bare time+km label, never a guess). Return labels join against
   *  the ORIGIN-scale position (their km mirrored off the turnaround). */
  haltName: string | null
}


/**
 * The clock walk turned into road labels. Feed it the walk MapTab already ran
 * (the banner's verdict: its days, its directed `returnDays` pass from the
 * destination on a round trip #145) plus the OUTBOUND road geometry — each
 * label is tagged `leg` and positioned on its own leg's road. Empty means
 * nothing to pin: no geometry, or an honest defer verdict.
 */
export function deriveClockMilestones(input: {
  /** the travel-clock walk MapTab already ran for the banner — the single
   *  source of truth, never re-walked here (FIX-1: a walk twice with identical
   *  inputs returning different labels must be impossible, not unlikely) */
  verdict: TravelClockVerdict
  /** outbound road geometry in {lat,lng}; null while OSRM hasn't resolved */
  polyline: { lat: number; lng: number }[] | null
  /** trip start (ISO date) — drives each label's calendar date; omit for
   *  undated fixtures / callers without a start date (date label stays empty) */
  tripStartDate?: string
  /** the itinerary's day count (trip.days.length) — anchors the return pass's
   *  calendar dates at the trip's TAIL (the drive home occupies the last
   *  returnDays.length days: drive out → stay → drive home) and decides which
   *  labels have an honest itinerary day behind them. Omit and return labels
   *  carry no date and no tap target. */
  tripDaysCount?: number
  /** ISO calendar day that counts as "now" for the living-plan treatment
   *  (Phase 1) — the device date in production, an injected fixture date in
   *  tests. Omit for a timeless overlay (all `future`). */
  todayISO?: string
  /** Phase 2: corridor night-halt suggestions (`planJourneyHalts` hits with
   *  haltPurpose/cumKm set) to name overnight labels — omit for bare halts. */
  haltCandidates?: PlaceHit[]
}): ClockMilestone[] {
  const { polyline, verdict } = input
  if (!polyline || polyline.length < 2) return []
  if (verdict.verdict === 'defer') return []

  const milestones: ClockMilestone[] = []
  // The road's own length, from the geometry the labels are pinned to — the
  // scale the return leg's km are mirrored against (the walk numbers return km
  // from the turnaround; the corridor scan's candidate cumKm count from the
  // origin).
  let outboundKm = 0
  for (let i = 1; i < polyline.length; i++) {
    outboundKm += haversineKm(polyline[i - 1].lat, polyline[i - 1].lng, polyline[i].lat, polyline[i].lng)
  }
  const dateFor = (dayIndex: number) => {
    if (!input.tripStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.tripStartDate)) return ''
    const d = new Date(`${isoAddDays(input.tripStartDate, dayIndex)}T00:00:00`)
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  }
  const isoFor = (dayIndex: number) => {
    if (!input.tripStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.tripStartDate)) return null
    return isoAddDays(input.tripStartDate, dayIndex)
  }
  // Phase 1: "today" is the device date in production, an injected fixture date
  // in tests — compared as ISO calendar strings, never Date objects, so
  // timezone offsets can't flip a day boundary at midnight.
  const today = /^\d{4}-\d{2}-\d{2}$/.test(input.todayISO ?? '') ? input.todayISO! : null
  const dayStateFor = (dayIndex: number): ClockMilestone['dayState'] => {
    const iso = isoFor(dayIndex)
    if (!iso || !today) return 'future'
    return iso < today ? 'past' : iso > today ? 'future' : 'today'
  }
  // Phase 2: overnight labels get the town at their km when the corridor scan
  // already found one — a named halt is actionable ("where do we sleep"), a
  // bare km is not. Same 120 km honesty bound as the plan's own halt guard
  // (a name further away than that would lie about where the stop is). The
  // join is LEG-AWARE: candidates' cumKm are stamped from the ORIGIN (the
  // corridor scan measured the outbound direction), while a return label's km
  // counts from the TURNAROUND — so the return km is mirrored onto the origin
  // scale first. Comparing them directly would name a town near the START for
  // a halt hundreds of km away.
  const haltNameFor = (km: number, leg: ClockMilestone['leg']): string | null => {
    const candidates = input.haltCandidates ?? []
    const originKm = leg === 'return' ? outboundKm - km : km
    let name: string | null = null
    let best = 121
    for (const c of candidates) {
      if (c.haltPurpose !== 'overnight' || c.cumKm == null || !c.name) continue
      const d = Math.abs(c.cumKm - originKm)
      if (d < best) { best = d; name = c.name }
    }
    return name
  }
  // Each walk's km is per-leg (0 → outboundKm). The outbound maps forward along
  // the road; a return label maps forward along the REVERSED road from the
  // destination (km 0 = the turnaround), because that's the road it drives.
  const pointAt = (km: number, leg: ClockMilestone['leg']) =>
    leg === 'return' ? pointAtKm([...polyline].reverse(), km) : pointAtKm(polyline, km)
  // Return legs anchor at the trip's TAIL: the drive home occupies the last
  // returnDays.length itinerary days (drive out → stay → drive home), so its
  // calendar dates count back from the trip's end. Continuing the walk's own
  // day numbering from the START would date the homecoming beside the last
  // outbound drive whenever stay days sit between the legs. null = no day
  // count to anchor with — return labels stay honest and undated.
  const returnBase = verdict.verdict === 'ok' && verdict.returnDays && input.tripDaysCount != null
    ? input.tripDaysCount - verdict.returnDays.length
    : null
  const pushLabel = (km: number, dayIndex: number, etaMin: number, kind: ClockMilestone['kind'], leg: ClockMilestone['leg'], calDay: number | null = dayIndex) => {
    const p = pointAt(km, leg)
    if (!p) return
    milestones.push({
      kmIn: Math.round(km),
      lat: p.lat, lng: p.lng,
      etaMin,
      dayNo: dayIndex + 1,
      timeLabel: clockHM(etaMin),
      dateLabel: calDay != null ? dateFor(calDay) : '',
      // FIX-2: per-leg km is ambiguous across the turnaround ("Km 500" twice),
      // so the drive-home chips carry their own ↩ — no renumbering, no silent
      // collision with the outbound half.
      kmLabel: leg === 'return' ? `Km ${Math.round(km)} ↩` : `Km ${Math.round(km)}`,
      kind,
      leg,
      dayState: calDay != null ? dayStateFor(calDay) : 'future',
      itineraryDay: calDay ?? undefined,
      haltName: kind === 'overnight' ? haltNameFor(km, leg) : null,
    })
  }
  const walkDay = (d: TravelClockDay, leg: ClockMilestone['leg']) => {
    // The itinerary day this label's plan lives in: an outbound drive day i IS
    // itinerary day i (drives start at the trip's first day); a return drive
    // day anchors at the trip's tail (returnBase above). null = no honest
    // itinerary day — the walk's split ran past the trip's own days, or no day
    // count was given — and such a label is decorative and undated.
    let calDay: number | null
    if (leg === 'return' && verdict.verdict === 'ok') {
      calDay = returnBase != null && verdict.returnDays
        ? returnBase + (d.dayIndex - verdict.days.length)
        : null
    } else {
      calDay = input.tripDaysCount != null && d.dayIndex >= input.tripDaysCount ? null : d.dayIndex
    }
    for (const a of d.anchors) {
      if (a.name === 'tea') continue // no tea labels, per the agreed design
      pushLabel(a.km, d.dayIndex, a.etaMin, 'mealtime', leg, calDay)
    }
    if (d.nightHaltKm != null && d.nightHaltEtaMin != null) pushLabel(d.nightHaltKm, d.dayIndex, d.nightHaltEtaMin, 'overnight', leg, calDay)
    // arrivalEtaMin is set only on the final day of a walk (see TravelClockDay),
    // so a non-null value IS that walk's destination label (the homecoming on
    // the return walk).
    if (d.arrivalEtaMin != null) pushLabel(d.kmCovered, d.dayIndex, d.arrivalEtaMin, 'destination', leg, calDay)
  }

  if (verdict.verdict === 'hop') {
    // A late start: one short hop to a night halt, nothing else is honest.
    pushLabel(verdict.hopKm, 0, verdict.nightHaltEtaMin, 'overnight', 'outbound')
    return milestones
  }

  for (const d of verdict.days) walkDay(d, 'outbound')
  // #145: a round trip's return is its own directed walk from the destination —
  // the same road back, its own day numbering, and its arrival is the homecoming
  // label. Every label it yields is tagged `return` and only renders while the
  // map's Return home toggle is on.
  for (const d of verdict.returnDays ?? []) walkDay(d, 'return')
  return milestones
}
