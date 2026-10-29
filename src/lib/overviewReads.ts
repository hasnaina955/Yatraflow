export type OverviewReadKey = 'elevation' | 'decisions' | 'activity' | 'weather'

/**
 * Page order, top to bottom. The route card's height profile sits in the main
 * column, above the quiet blocks, so a failed elevation read is the first
 * failed block on the page. Keeping this list in DOM order is what lets exactly
 * one block carry the alert role.
 */
export const OVERVIEW_READ_ORDER: readonly OverviewReadKey[] = [
  'elevation',
  'decisions',
  'activity',
  'weather',
]

/** The first failed read in page order carries the one alert role. */
export function firstFailedOverviewRead(
  failed: ReadonlySet<OverviewReadKey>,
): OverviewReadKey | null {
  return OVERVIEW_READ_ORDER.find(key => failed.has(key)) ?? null
}

/** A failed read gets the alert only when it is the first failed block on the page. */
export function overviewReadRole(
  key: OverviewReadKey,
  firstFailed: OverviewReadKey | null,
): 'alert' | 'status' | undefined {
  if (!firstFailed) return undefined
  return key === firstFailed ? 'alert' : 'status'
}
