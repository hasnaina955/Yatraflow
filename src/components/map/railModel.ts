// Pure rules for the left rail rows. No React, no store, no provider call.
// A value the trip does not hold stays null, and the row hides that part.
import type { Expense } from '../../data/types'
import type { JourneyPointKind } from '../../lib/engine'
import { windowDurationText } from '../../pages/trip/map/LensRailExtras'

/** The mark a rail row draws in its 24 px slot. */
export type RailMarker = 'number' | 'stay' | 'car' | 'lock' | 'risk'

/**
 * One mark per row, in the board's order of weight. The Fix problem wins, then
 * a fixed booking (the lock is the mark), then the day's own start and end, then
 * a stay, then the stop number.
 */
export function railMarkerKind(input: { kind: JourneyPointKind; category: string; locked: boolean; isFix: boolean }): RailMarker {
  if (input.isFix) return 'risk'
  if (input.locked) return 'lock'
  if (input.kind === 'start' || input.kind === 'destination') return 'car'
  if (input.category === 'hotel') return 'stay'
  return 'number'
}

/** A stop shows the Paid chip only when a paid or booked fact is tied to it. */
export function railStopPaid(
  expenses: readonly Expense[] | undefined,
  stop: { id: string; status: string; notes?: string },
): boolean {
  const paid = (expenses ?? []).some(expense => expense.stopId === stop.id)
  const booked = stop.notes != null && /\b(?:ticket|booking|booked|pnr)\b/i.test(stop.notes)
  return paid || booked || stop.status === 'needs-booking'
}

/** One-based number of a rail row, shared with the map marker for that stop.
 *  The departure anchor and other synthesized endpoints carry no number. */
export function railStopNumber(points: ReadonlyArray<{ kind: JourneyPointKind; synthesized?: boolean }>, index: number): number {
  let number = 0
  for (let position = 0; position <= index; position += 1) {
    const point = points[position]
    if (!point || point.synthesized || point.kind === 'start' || point.kind === 'destination') continue
    number += 1
  }
  return number
}

/** Short rail subtitle for a Fix problem, from the engine's real facts.
 *  An unknown fact keeps its part out. A jetty line names the arrival and the
 *  deadline in the READER's clock: "Jetty 4:37 PM · boarding closed 3:00 PM"
 *  when the boat is missed, "Jetty 2:53 PM · before 3:00 PM" when it is not. */
export function fixProblemSubLine(
  problem: {
    title: string
    evidence: readonly string[]
  } | null,
  clock: (hm: string) => string = hm => hm,
): string | null {
  if (problem == null) return null
  const evidence = problem.evidence.find(line => line.trim() !== '')?.trim() ?? null
  if (evidence == null) return null
  const arrival = /~(\d{1,2}:\d{2})/.exec(evidence)?.[1] ?? null
  // The engine names the deadline it checked: a boarding clock when the
  // booking holds one, else the commitment time.
  const boarding = /after boarding closes at (\d{1,2}:\d{2})/i.exec(evidence)?.[1]?.trim() ?? null
  const closedCommitment = /after the (\d{1,2}:\d{2}) commitment/i.exec(evidence)?.[1]?.trim() ?? null
  const beforeBoarding = /under ~45 min before boarding closes at (\d{1,2}:\d{2})/i.exec(evidence)?.[1]?.trim() ?? null
  const beforeCommitment = /under ~45 min before the (\d{1,2}:\d{2}) commitment/i.exec(evidence)?.[1]?.trim() ?? null
  const deadline = boarding ?? closedCommitment ?? beforeBoarding ?? beforeCommitment
  const jetty = /jetty|boat|boarding/i.test(`${problem.title} ${evidence}`)
  if (arrival != null && deadline != null && jetty) {
    // The arrival has reached or passed a "before" clock: that is no longer a
    // buffer. An equal clock is closed too — the gate is shut at the deadline.
    const closed = boarding != null || closedCommitment != null
      || hmMin(arrival) >= hmMin(deadline)
    return closed
      ? `Jetty ${clock(arrival)} · boarding closed${boarding != null ? ` ${clock(boarding)}` : ''}`
      : `Jetty ${clock(arrival)} · before ${clock(deadline)}`
  }
  return evidence
}

/** "HH:MM" as minutes since midnight. A string that is not a clock reads as 0,
 *  which can only make a "before" line close, never invent a buffer. */
function hmMin(hm: string): number {
  const [hours, minutes] = hm.split(':').map(Number)
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0
}

/** The sub line of a stay header. A part with no fact keeps itself out. */
export function stayRailSub(parts: {
  arriveText: string | null
  commitmentTitle: string | null
  commitmentText: string | null
  freeStartMin: number | null
  freeEndMin: number | null
}): string | null {
  const pieces: string[] = []
  if (parts.arriveText != null && parts.arriveText.trim() !== '') pieces.push(`Arrive ${parts.arriveText}`)
  if (parts.commitmentText != null && parts.commitmentText.trim() !== '') {
    const title = parts.commitmentTitle?.trim()
    const comparisonTitle = title?.toLowerCase()
    if (comparisonTitle === 'boat') pieces.push(`boat at ${parts.commitmentText}`)
    else pieces.push(title ? `${title} at ${parts.commitmentText}` : `fixed at ${parts.commitmentText}`)
  }
  if (parts.freeStartMin != null && parts.freeEndMin != null) {
    const duration = windowDurationText(parts.freeStartMin, parts.freeEndMin)
    if (duration != null) pieces.push(`${duration} free after it`)
  }
  return pieces.length > 0 ? pieces.join(' · ') : null
}

/** The stay header title. The board names the base town, not the hotel. */
export function stayRailTitle(town: string | null, hasEvening: boolean): string | null {
  if (town == null || town.trim() === '') return null
  return `${town.trim()} · ${hasEvening ? 'evening' : 'tonight'}`
}

/** "7 picks" or "1 pick". Zero and unknown show nothing. */
export function picksText(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null
  return `${count} pick${count === 1 ? '' : 's'}`
}

/** The where-on-the-road part of a window row. An unknown km shows nothing. */
export function aroundKmText(targetKm: number | null | undefined): string | null {
  if (targetKm == null || !Number.isFinite(targetKm) || targetKm < 0) return null
  return `around km ${Math.round(targetKm)}`
}

/**
 * The km a window row names. A synthesized window carries a zero target km, so
 * it borrows the road position of its own picks. A real slot target wins; an
 * unknown km stays null and the part leaves the line.
 */
export function windowAroundKm(
  slotKm: number | null | undefined,
  pickKms: readonly (number | null | undefined)[],
): number | null {
  if (slotKm != null && Number.isFinite(slotKm) && slotKm > 0) return slotKm
  for (const km of pickKms) if (km != null && Number.isFinite(km) && km > 0) return km
  return null
}

/**
 * The clock a fixed booking keeps. A locked stop shows its commitment time, not
 * the engine's arrival: the booking is the fact, and the arrival only says how
 * early the traveller reaches the door.
 */
export function lockedClockText(
  commitmentTime: string | null | undefined,
  arrival: string | null | undefined,
): string | null {
  const fixed = commitmentTime?.trim() ?? ''
  if (/^\d{1,2}:\d{2}$/.test(fixed)) return fixed
  return arrival == null || arrival.trim() === '' ? null : arrival
}

/** The time a window row sits at. The engine's arrival counts only inside the window. */
export function windowAtMin(startMin: number, endMin: number, etaMin: number | null | undefined): number {
  if (etaMin == null || !Number.isFinite(etaMin)) return startMin
  return etaMin >= startMin && etaMin <= endMin ? etaMin : startMin
}

/** The caption under the day list. It states what the map does now. */
export function daysCaptionText(allDays: boolean, contextOpacity: number): string {
  const percent = Math.round(contextOpacity * 100)
  return allDays
    ? `Other days draw thin at ${percent}%. Tap one to move the map there.`
    : 'Only this day draws. Choose All to see the other days thin.'
}
