// The places the open deck shows, for its provenance line. Pure: it reads the
// lens state and returns hits. It never searches and it never invents a source.
import type { PlaceHit } from '../../../lib/geocode'
import type { DriveTab } from './driveLens'
import type { MapLenses, MapLensId } from './useMapLenses'

/** The hits of the deck for the active lens. A deck with no cards gives an empty list. */
export function deckHits(
  lens: MapLensId,
  lenses: MapLenses,
  active: { driveTab: DriveTab | null; stayWindow: string | null },
): PlaceHit[] {
  if (lens === 'drive') {
    const groups = lenses.drive.tabs.phase === 'ready' ? lenses.drive.tabs.tabs : []
    const group = groups.find(entry => entry.tab === active.driveTab) ?? groups[0]
    return group ? group.shown.map(row => row.row.hit) : []
  }
  if (lens === 'stay') {
    const stay = lenses.stay
    const window = stay.windows.find(entry => entry.id === active.stayWindow) ?? stay.windows[0]
    const result = window == null ? null : stay.picks[window.id]
    return result != null && result.kind === 'ready' ? result.picks.map(pick => pick.row.row.hit) : []
  }
  if (lens === 'gap') {
    return lenses.gap.gaps.flatMap(gap => gap.picks.picks.map(pick => pick.candidate.hit))
  }
  return []
}

/** The Fix deck reads the plan, so its source line names the plan. */
export const FIX_SOURCE_LINE = "Times from this trip's plan and its fixed bookings"
