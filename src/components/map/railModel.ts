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

/** A stop shows the Paid chip only when an expense that someone paid is tied to it. */
export function railStopPaid(expenses: readonly Pick<Expense, 'stopId' | 'paidBy'>[] | undefined, stopId: string): boolean {
  return (expenses ?? []).some(expense => expense.stopId === stopId && expense.paidBy != null)
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
    pieces.push(title ? `${title} at ${parts.commitmentText}` : `fixed at ${parts.commitmentText}`)
  }
  if (parts.freeStartMin != null && parts.freeEndMin != null) {
    const duration = windowDurationText(parts.freeStartMin, parts.freeEndMin)
    if (duration != null) pieces.push(`${duration} free`)
  }
  return pieces.length > 0 ? pieces.join(' · ') : null
}

/** The stay header title. The base name loses its "Check in · " lead. */
export function stayRailTitle(baseTitle: string | null, hasEvening: boolean): string | null {
  if (baseTitle == null || baseTitle.trim() === '') return null
  const name = baseTitle.replace(/^check[- ]?in\s*[·:-]\s*/i, '').trim()
  return `${name || baseTitle.trim()} · ${hasEvening ? 'evening' : 'tonight'}`
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
