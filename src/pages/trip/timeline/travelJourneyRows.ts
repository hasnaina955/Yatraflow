// ============ Timeline rows over the shared journey projection (#08 S4) ============
// The panel renders the same covered rows the Map reads: the producer's
// `JourneyRow` objects. This adapter adds no fact. It filters out planned stops
// (the Timeline already draws them) and formats the existing fields truthfully.
//
// It never calls `projectJourney`, `daySlots`, `buildDayPlan`, `driveRowsFromSegments`,
// a provider, a router or a store. Unknown stays unknown; a known zero stays zero.
// The covered Add path is the #841 writer in `timelineProjectedWriter.ts`; it is
// not a km-halt conversion.
import type { JourneyRow } from '../../../lib/journeyProjection'
import { cap } from '../shared'
import type { JourneyDay } from '../journey/journeyDays'
import { detourDisplay } from '../map/driveSuggestionView'

/** The covered suggestion rows: no stop id means it is not already a Timeline stop. */
export function travelJourneyRows(day: JourneyDay): readonly JourneyRow[] {
  return day.projection.rows.filter(row => row.stopId == null)
}

export interface JourneyRowMeta {
  /** Always present, so the row never reads as if it had no clock. */
  arrival: string
  detour: string
  budget: string | null
  offRoute: string | null
  window: string | null
  source: string | null
  freshness: string | null
}

/**
 * Format the row's own facts. Missing values are omitted or named "unknown";
 * a missing detour is never `0`, a stored arrival is disclosed as `(saved)`,
 * and `freshness: 'unknown'` shows no chip.
 */
export function journeyRowMeta(
  row: JourneyRow,
  format: { clock: (clock: string) => string; minute: (minutes: number) => string },
): JourneyRowMeta {
  const saved = row.arriveSource === 'stored' ? ' (saved)' : ''
  const arrival = row.arriveMin != null
    ? `Arrive ${format.minute(row.arriveMin)}${saved}`
    : row.arriveLabel
      ? `Arrive ${format.clock(row.arriveLabel)}${saved}`
      : 'Arrival unknown'
  const shown = detourDisplay(row.detourMin)
  const detour = shown.kind === 'unknown'
    ? 'Detour unknown'
    : shown.kind === 'on-route'
      ? 'On the route'
      : `Detour +${shown.minutes} min`
  const budget = row.budgetSharePct == null ? null : `Budget ${Math.round(row.budgetSharePct)}%`
  const offRoute = row.detourKm == null ? null : `~${Math.round(row.detourKm)} km off route`
  const window = row.inWindow === false && row.windowMin
    ? `Outside ${format.minute(row.windowMin[0])}–${format.minute(row.windowMin[1])}`
    : null
  const source = row.source ? `Source: ${cap(row.source)}` : null
  const freshness = row.freshness === 'retained'
    ? 'Retained result'
    : row.freshness === 'stale'
      ? 'Older result'
      : row.freshness === 'live'
        ? 'Live result'
        : null
  return { arrival, detour, budget, offRoute, window, source, freshness }
}
