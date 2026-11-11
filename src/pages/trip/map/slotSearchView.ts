// What the page shows and accepts for the open part's search (#841).
//
// The page keeps one search cell and the scope (trip + stable day) it was typed
// in. These rules are pure so a node test can drive them with the real guard,
// the real flow and the real filing hook, not a look-alike.

/** The cell, but only when it was typed on the scope the page is on now. A cell
 *  from another trip or day reads as no search, even for the render before the
 *  reset runs. */
export function visibleSlotSearch<Cell>(
  cell: Cell | null,
  cellScope: string | null,
  scopeNow: string,
): Cell | null {
  return cell !== null && cellScope === scopeNow ? cell : null
}

/** True when a place found by `slotKey` may be filed: the visible search is the
 *  one typed in that part, on this trip and day. */
export function isSlotSearchCurrent(
  cell: { key: string } | null,
  cellScope: string | null,
  scopeNow: string,
  slotKey: string,
): boolean {
  return visibleSlotSearch(cell, cellScope, scopeNow)?.key === slotKey
}

/** The key that retires the search. It changes when the trip, the day or the
 *  open part changes, and the page then drops the cell once. Going back to an
 *  earlier part does not bring the old query back, because the cell was dropped
 *  on the way out. */
export function slotSearchResetKey(scopeNow: string, openSlotKey: string | null): string {
  return `${scopeNow}|${openSlotKey ?? ''}`
}
