// ============ Covered Add availability from the measured road grade (#08) ============
// The Workspace grades the road once with the canonical measuredRoadFacts.
// This module maps that grade to one typed reason. It starts no routing call.
// It grades no road and changes no gate, writer or policy. A disabled Add
// stays disabled. The type comes from the canonical grade, not a second one.
import type { MapRoadGrade, RoadUnmeasuredReason } from '../map/mapTabPipeline'

/** Typed reason the covered Add is unavailable. */
export type TimelineAddAvailability =
  | { kind: 'available' }
  | { kind: 'road-unmeasured'; reason: RoadUnmeasuredReason }

/** Map one already-computed grade to a typed availability. This is a
 *  presentation mapping, not a second grader. The measured flag comes only
 *  from measuredRoadFacts. A missing grade reads as no measurement. */
export function timelineAddAvailability(grade: MapRoadGrade | null): TimelineAddAvailability {
  if (grade?.measured) return { kind: 'available' }
  return { kind: 'road-unmeasured', reason: grade?.reason ?? 'no-measurement' }
}

/** Truthful copy per canonical reason. Each line names the road state and the
 *  recovery. No line claims the shared writer is disconnected. */
export const TIMELINE_ADD_UNAVAILABLE_COPY: Record<RoadUnmeasuredReason, string> = {
  'air-journey': 'This trip is by air. You cannot add a place along a drive.',
  'pending': 'The route is still being measured. Add this place after the measurement finishes.',
  'failed': 'The route measurement failed. Measure the route on the Map before adding a place.',
  'no-measurement': 'The road is not measured yet. Measure the route on the Map before adding a place.',
  'estimate-only': 'This drive is only a straight-line estimate. Measure the route on the Map before adding a place.',
  'stale-chain': 'The measured route is out of date. Measure the route again before adding a place.',
  'no-line': 'The measured route has no drawn line. Add this place once the route shows on the Map.',
}

/** The visible typed reason for an unmeasured road, or null when the road is
 *  measured. The panel shows this line when the covered Add is disabled. */
export function timelineAddUnavailableCopy(
  availability: TimelineAddAvailability | null | undefined,
): string | null {
  if (!availability || availability.kind === 'available') return null
  return TIMELINE_ADD_UNAVAILABLE_COPY[availability.reason]
}
