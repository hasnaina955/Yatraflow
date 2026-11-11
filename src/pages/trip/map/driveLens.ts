// Drive lens board data. Pure functions over the shared Drive lens rows.
import type { DriveLensRow, LensView } from '../../../lib/mapLensContracts'
import type { DaySlot, DaySlotKind } from '../../../lib/daySlots'
import { scopeCounts } from './minuteScope'
import { detourDisplayText } from './detourRule'
import { detourDisplay } from './driveSuggestionView'

/** The three sub-tabs of the Along the drive deck. */
export type DriveTab = 'meal' | 'sights' | 'breaks'

// Tab map for DaySlotKind. Every member is listed.
// 'meal' gives 'meal'.
// 'fuel' gives 'breaks'.
// 'stretch' gives 'breaks'. Rest halts use 'stretch'.
// 'overnight' gives 'sights'. The stay kind uses 'overnight'.
function tabOfKind(kind: DaySlotKind): DriveTab {
  switch (kind) {
    case 'meal': return 'meal'
    case 'fuel': return 'breaks'
    case 'stretch': return 'breaks'
    case 'overnight': return 'sights'
    default: {
      const exhaust: never = kind
      return exhaust
    }
  }
}

/** The tab of one row. A missing slot key or slot gives 'sights'. */
export function driveTabOf(row: DriveLensRow, slots: readonly DaySlot[]): DriveTab {
  const key = row.row.slotKey
  if (key == null) return 'sights'
  const slot = slots.find(s => s.key === key)
  return slot ? tabOfKind(slot.kind) : 'sights'
}

export interface DriveTabGroup {
  tab: DriveTab
  label: string
  total: number
  shown: DriveLensRow[]
  moreCount: number
}

export interface DriveTabsResult {
  phase: LensView<DriveLensRow>['phase']
  tabs: DriveTabGroup[]
}

const TAB_ORDER: readonly DriveTab[] = ['meal', 'sights', 'breaks']

function mealLabel(rows: readonly DriveLensRow[], slots: readonly DaySlot[]): string {
  const first = rows[0]?.row.slotKey
  if (first != null && rows.every(r => r.row.slotKey === first)) {
    const slot = slots.find(s => s.key === first)
    if (slot) return `${slot.label} gap`
  }
  return 'Meals'
}

function tabLabel(tab: DriveTab, rows: readonly DriveLensRow[], slots: readonly DaySlot[]): string {
  if (tab === 'sights') return 'Sights'
  if (tab === 'breaks') return 'Breaks'
  return mealLabel(rows, slots)
}

/** Group ready rows into tabs. Engine row order stays. Empty tabs are omitted. */
export function driveTabs(
  view: LensView<DriveLensRow>,
  slots: readonly DaySlot[],
  cap = 3,
): DriveTabsResult {
  if (view.phase !== 'ready') return { phase: view.phase, tabs: [] }
  const groups = new Map<DriveTab, DriveLensRow[]>()
  for (const row of view.rows) {
    const tab = driveTabOf(row, slots)
    const list = groups.get(tab)
    if (list) list.push(row)
    else groups.set(tab, [row])
  }
  const tabs: DriveTabGroup[] = []
  for (const tab of TAB_ORDER) {
    const rows = groups.get(tab)
    if (!rows || rows.length === 0) continue
    const shown = rows.slice(0, cap)
    tabs.push({
      tab,
      label: tabLabel(tab, rows, slots),
      total: rows.length,
      shown,
      moreCount: rows.length - shown.length,
    })
  }
  return { phase: view.phase, tabs }
}

export type ScopeBand = 'inside' | 'just-past' | 'outside' | 'over-budget' | 'unknown'

/** Band of one row. Held-back ids and a spent budget come first. */
export function scopeBandOf(
  row: DriveLensRow,
  scopeMinutes: number,
  heldBackIds: ReadonlySet<string>,
): ScopeBand {
  const placeId = String(row.row.hit.id)
  if (heldBackIds.has(placeId) || (row.budgetSharePct != null && row.budgetSharePct > 100)) {
    return 'over-budget'
  }
  const counts = scopeCounts([{ detourMin: row.detourMin }], scopeMinutes)
  if (counts.unknown === 1) return 'unknown'
  if (counts.inside === 1) return 'inside'
  if (counts.justPast === 1) return 'just-past'
  return 'outside'
}

export interface DriveCardStrip {
  arrive: string | null
  detour: string | null
  budget: string | null
}

/** The three card cells. A missing fact gives null text. */
export function driveCardStrip(
  row: DriveLensRow,
  clock: (min: number) => string,
): DriveCardStrip {
  const r = row.row
  const arrive = r.arriveLabel ?? (typeof r.arriveMin === 'number' ? clock(r.arriveMin) : null)
  const display = detourDisplay(row.detourMin)
  const detour = display.kind === 'unknown' ? null : detourDisplayText(row.detourMin)
  const budget = row.budgetSharePct == null ? null : `${Math.round(row.budgetSharePct)}%`
  return { arrive, detour, budget }
}

/** The deck intro line. Null when the pass time or window is unknown. */
export function driveDeckIntro(
  row: DriveLensRow,
  clock: (min: number) => string,
): string | null {
  const r = row.row
  const w = r.windowMin
  if (typeof r.arriveMin !== 'number' || w == null || r.inWindow == null) return null
  const word = r.inWindow === false ? 'outside' : 'inside'
  // The km shows when the pick's road position is known: "You pass km 57 at 12:05".
  const km = r.hit.alongRouteKm ?? r.hit.cumKm
  const at = typeof km === 'number' && Number.isFinite(km) && km >= 0 ? `km ${Math.round(km)} at ` : ''
  return `You pass ${at}${clock(r.arriveMin)}, ${word} the ${clock(w[0])}–${clock(w[1])} window`
}
