// ============ Stop status: one wording for the activity line ============
// A stop status change reaches the activity log by two routes: the direct
// write in the store, and the phone sheet's staged preview, which logs when
// the person keeps the change. Both build the line here, so the two routes
// cannot drift apart. Pure: no store, no DOM.

import type { ItineraryStop } from '../data/types'

/** The activity entry for one stop status change: the verb names the stop and
 *  the new status, the target names the day (zero-based index, shown 1-based). */
export function stopStatusActivity(
  title: string,
  status: ItineraryStop['status'],
  dayIndex: number,
): { verb: string; target: string } {
  return { verb: `marked “${title}” as ${status}`, target: `Day ${dayIndex + 1}` }
}
