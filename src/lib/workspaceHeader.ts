import type { Trip } from '../data/types'
import { canFocusDay, focusDayRequest } from './tripFocus'
import { normalizeMapTarget, type MapTarget } from './mapTarget'

export type WorkspaceTabKey =
  | 'overview'
  | 'board'
  | 'map'
  | 'timeline'
  | 'group'
  | 'budget'
  | 'share'
  | 'settings'

export const WORKSPACE_TABS: readonly [WorkspaceTabKey, string][] = [
  ['overview', 'Overview'],
  ['board', 'Board'],
  ['map', 'Map'],
  ['timeline', 'Timeline'],
  ['group', 'Group input'],
  ['budget', 'Budget'],
  ['share', 'Share'],
  ['settings', 'Settings'],
]

/** The header folds only on the two canvas tabs. */
export function foldWorkspaceHeader(tab: WorkspaceTabKey): boolean {
  return tab === 'board' || tab === 'map'
}

export function workspaceTabId(tab: WorkspaceTabKey): string {
  return `tab-${tab}`
}

export function workspacePanelId(tab: WorkspaceTabKey): string {
  return `panel-${tab}`
}

export type TimelineFocusTarget = {
  dayIndex?: number
  stopId?: string
  block?: 'trip-wide'
}

export type ResolvedTimelineFocus = {
  dayIndex: number | null
  stopId: string | null
  block: 'trip-wide' | null
}

export type WorkspaceTrip = Pick<Trip, 'id' | 'days'>

const EMPTY_TIMELINE_FOCUS: ResolvedTimelineFocus = {
  dayIndex: null,
  stopId: null,
  block: null,
}

/** Resolve an Overview request to one Timeline target for this trip. */
export function resolveTimelineFocus(
  trip: WorkspaceTrip,
  target?: TimelineFocusTarget | null,
): ResolvedTimelineFocus {
  if (!target) return EMPTY_TIMELINE_FOCUS
  if (target.block === 'trip-wide') return { ...EMPTY_TIMELINE_FOCUS, block: 'trip-wide' }

  const hasDay = target.dayIndex !== undefined
  if (hasDay && !canFocusDay(focusDayRequest(target.dayIndex!), trip)) {
    return EMPTY_TIMELINE_FOCUS
  }

  const day = hasDay
    ? trip.days.find(d => d.index === target.dayIndex)
    : target.stopId
      ? trip.days.find(d => d.stops.some(stop => stop.id === target.stopId))
      : undefined
  if (!day) return EMPTY_TIMELINE_FOCUS

  const stopId = target.stopId && day.stops.some(stop => stop.id === target.stopId)
    ? target.stopId
    : null
  return { dayIndex: day.index, stopId, block: null }
}

export type ResolvedMapFocus = {
  dayIndex: number | null
  target: MapTarget | null
}

const EMPTY_MAP_FOCUS: ResolvedMapFocus = { dayIndex: null, target: null }

/** Resolve a Map request. A stop selects its day. A point or bounds clears it. */
export function resolveMapFocus(
  trip: WorkspaceTrip,
  target?: MapTarget | null,
): ResolvedMapFocus {
  if (!target) return EMPTY_MAP_FOCUS
  const normalized = normalizeMapTarget(target)
  if (!normalized) return EMPTY_MAP_FOCUS
  if (normalized.kind !== 'stop') return { dayIndex: null, target: normalized }

  const day = trip.days.find(d => d.stops.some(stop => stop.id === normalized.stopId))
  if (!day) return EMPTY_MAP_FOCUS
  const stop = day.stops.find(candidate => candidate.id === normalized.stopId)
  const plottable = stop
    && Number.isFinite(stop.lat)
    && Number.isFinite(stop.lng)
    && stop.lat !== 0
    && Math.abs(stop.lat) <= 90
    && Math.abs(stop.lng) <= 180
  if (!plottable) return { dayIndex: day.index, target: null }
  return { dayIndex: day.index, target: normalized }
}
