// Drive lens board data. Pure functions over the shared Drive lens rows.
import type { DriveLensRow, LensView } from '../../../lib/mapLensContracts'
import type { DaySlot, DaySlotKind } from '../../../lib/daySlots'
import { scopeCounts } from './minuteScope'
import { detourDisplayText } from './detourRule'
import { detourDisplay } from './driveSuggestionView'
import type { DaySchedule } from '../../../lib/engine'
import type { DriveBudget } from './LensRailExtras'

/** A planned stop reads the same arrival as the day rail. */
export function filledStopClock(schedule: Pick<DaySchedule, 'activeStops' | 'arrivalTimes'> | null, stopId: string): string | null {
  const times = schedule?.arrivalTimes
  const index = schedule?.activeStops.findIndex(stop => stop.id === stopId) ?? -1
  // The guard proves the index owns a slot before the lookup runs.
  if (times == null || index < 0 || !Object.prototype.hasOwnProperty.call(times, index)) return null
  return times[index]
}

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

/** Unknown cost stays separate from scope and budget decisions. */
export function scopeBandOf(
  row: DriveLensRow,
  scopeMinutes: number,
  heldBackIds: ReadonlySet<string>,
): ScopeBand {
  const counts = scopeCounts([{ detourMin: row.detourMin }], scopeMinutes)
  if (counts.unknown === 1) return 'unknown'
  const placeId = String(row.row.hit.id)
  if (heldBackIds.has(placeId) || (row.budgetSharePct != null && row.budgetSharePct > 100)) {
    return 'over-budget'
  }
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
  const budget = display.kind === 'unknown' || row.budgetSharePct == null ? null : `${Math.round(row.budgetSharePct)}%`
  return { arrive, detour, budget }
}

/** The deck intro line. Null when the pass time or window is unknown. */
export function driveDeckIntro(
  row: DriveLensRow,
  clock: (min: number) => string,
  roadKm?: number | null,
): string | null {
  const r = row.row
  const w = r.windowMin
  if (typeof r.arriveMin !== 'number' || w == null || r.inWindow == null) return null
  const word = r.inWindow === false ? 'Outside' : 'Inside'
  // The km shows when the pick's road position is known: "You pass km 57 at 12:05".
  const km = roadKm ?? r.hit.alongRouteKm ?? r.hit.cumKm
  const at = typeof km === 'number' && Number.isFinite(km) && km >= 0 ? `km ${Math.round(km)} at ` : ''
  return `Pass ${at}${clock(r.arriveMin)} · ${word} ${clock(w[0])}–${clock(w[1])}`
}

/** Alternatives are independent choices. Their order cannot spend the budget. */
export function overBudgetAlternativeIds(rows: readonly { id: string; detourMin: number | null }[], budgetMin: number, plannedMin: number | null = null): Set<string> {
  const remaining = budgetMin - (plannedMin ?? 0)
  return new Set(rows.filter(row => row.detourMin != null && Number.isFinite(row.detourMin) && row.detourMin >= 0 && row.detourMin > remaining).map(row => row.id))
}

/** One day's alternatives with the day's budget and its planned detour spend. */
export interface DayBudgetWalk {
  budgetMin: number
  planned: DriveBudget
  rows: readonly { id: string; detourMin: number | null }[]
}

/** The ids of alternatives that the budget left after planned detours cannot
 *  hold. When a day's planned spend is unknown, the day makes no budget claim
 *  and holds nothing back: the count then states the scope only. */
export function budgetHeldAlternativeIds(days: readonly DayBudgetWalk[]): Set<string> {
  const held = new Set<string>()
  for (const day of days) {
    if (day.planned.kind === 'unknown') continue
    for (const id of overBudgetAlternativeIds(day.rows, day.budgetMin, day.planned.usedMin ?? 0)) held.add(id)
  }
  return held
}

/** Scope counts by place: one place listed under several tabs counts once. */
export function distinctPlaceBands<T>(rows: readonly { id: string; band: T }[]): T[] {
  const byPlace = new Map<string, T>()
  for (const row of rows) if (!byPlace.has(row.id)) byPlace.set(row.id, row.band)
  return [...byPlace.values()]
}
