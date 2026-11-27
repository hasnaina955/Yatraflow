// ============ Universal Add (#1064): who can add what, right now ============
// The one control lives in the app shell (BottomNav on native, a pill on phone
// web), but the flows it opens live inside the trip workspace and its tabs. This
// store is the bridge, and it holds only two registrations:
//
//   workspace  the trip, the tab on screen, the role gates, and `go`: the one
//              router that switches to the tab owning a flow.
//   tab        the tab on screen: its day target and its same-tab handlers.
//
// Pages register handlers. They never draw their own phone add button.
//
// A cross-tab action (Add expense from the Timeline) is a ONE-SHOT request, the
// same idea as the workspace's timelineFocusDay + onFocusConsumed: `go` sets the
// tab and leaves a request for it. The next tab to register consumes it, or drops
// it when the tab is another one, so a request can never fire on a later visit.
// Every registration and every request carries the trip id, because the
// workspace is not keyed by trip and must not leak a request into the next trip.

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { AddKind, TripAddScope } from './universalAdd'
import type { WorkspaceTabKey } from './workspaceHeader'

export interface WorkspaceAddState {
  tripId: string
  tab: WorkspaceTabKey
  canEdit: boolean
  isMember: boolean
  chakra: boolean
  mapFullscreen: boolean
  /** Overview's target: the first day that needs work. */
  overviewDay: number | null
  go: (kind: AddKind, dayIndex?: number) => void
}

export interface TabAddState {
  tripId: string
  tab: WorkspaceTabKey
  stopDay: number | null
  timelineEditing: boolean
  kinds: readonly AddKind[]
  run: (kind: AddKind, dayIndex?: number) => void
}

export interface AddSnapshot {
  workspace: WorkspaceAddState | null
  tab: TabAddState | null
}

interface PendingRequest { tripId: string; tab: WorkspaceTabKey; kind: AddKind; dayIndex?: number }

let snapshot: AddSnapshot = { workspace: null, tab: null }
let pending: PendingRequest | null = null
const listeners = new Set<() => void>()

function emit(next: AddSnapshot) {
  snapshot = next
  for (const l of listeners) l()
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
const read = () => snapshot
/** The current registrations, for a press handler (and tests). */
export const readAddSnapshot = read

export function useAddSnapshot(): AddSnapshot {
  return useSyncExternalStore(subscribe, read, read)
}

/** Leave a one-shot request for the tab `go` is about to open. */
export function requestTabAdd(req: PendingRequest): void {
  pending = req
}

/**
 * Run an action. The tab on screen runs its own flow when it has one. Anything
 * else goes through the workspace router, which opens the owning tab.
 */
export function runTripAdd(kind: AddKind, dayIndex?: number): void {
  const { workspace, tab } = snapshot
  if (!workspace) return
  if (tab && tab.tripId === workspace.tripId && tab.tab === workspace.tab && tab.kinds.includes(kind)) {
    tab.run(kind, dayIndex)
    return
  }
  workspace.go(kind, dayIndex)
}

/** Publish the workspace scope. Returns the matching unpublish. */
export function publishWorkspace(state: WorkspaceAddState): () => void {
  emit({ ...snapshot, workspace: state })
  return () => { if (snapshot.workspace === state) emit({ ...snapshot, workspace: null }) }
}

/** Publish the tab on screen. Returns the matching unpublish. */
export function publishTab(state: TabAddState): () => void {
  emit({ ...snapshot, tab: state })
  return () => { if (snapshot.tab === state) emit({ ...snapshot, tab: null }) }
}

/**
 * Take the request left for this tab, once. A request for another tab or trip
 * is dropped as well, so it can never fire on a later visit.
 */
export function consumeTabRequest(tripId: string, tab: WorkspaceTabKey): PendingRequest | null {
  const req = pending
  pending = null
  if (!req || req.tripId !== tripId || req.tab !== tab) return null
  return req
}

/** When you leave a trip, this drops a request left for it. */
export function dropTripRequests(tripId: string): void {
  if (pending?.tripId === tripId) pending = null
}

/** The workspace publishes its scope. `null` while the trip is not readable. */
export function useWorkspaceAdd(input: WorkspaceAddState | null): void {
  const goRef = useRef(input?.go)
  // The latest router, read at press time. Synced before any effect below runs.
  useLayoutEffect(() => { goRef.current = input?.go })
  const tripId = input?.tripId ?? null
  const tab = input?.tab ?? null
  const canEdit = input?.canEdit ?? false
  const isMember = input?.isMember ?? false
  const chakra = input?.chakra ?? false
  const mapFullscreen = input?.mapFullscreen ?? false
  const overviewDay = input?.overviewDay ?? null
  useEffect(() => {
    if (tripId === null || tab === null) return
    return publishWorkspace({
      tripId, tab, canEdit, isMember, chakra, mapFullscreen, overviewDay,
      go: (kind, dayIndex) => goRef.current?.(kind, dayIndex),
    })
  }, [tripId, tab, canEdit, isMember, chakra, mapFullscreen, overviewDay])
  useEffect(() => () => { if (tripId !== null) dropTripRequests(tripId) }, [tripId])
}

export interface TabAddInput {
  tripId: string
  tab: WorkspaceTabKey
  stopDay?: number | null
  timelineEditing?: boolean
  /** The flows this tab opens itself. A missing kind goes through the workspace. */
  handlers: Partial<Record<AddKind, (dayIndex?: number) => void>>
}

/** A tab registers its own flows and its day target while it is on screen. */
export function useTabAdd(input: TabAddInput): void {
  const handlersRef = useRef(input.handlers)
  // The latest handlers, read at press time. Synced before the one-shot below.
  useLayoutEffect(() => { handlersRef.current = input.handlers })
  const { tripId, tab } = input
  const stopDay = input.stopDay ?? null
  const timelineEditing = input.timelineEditing ?? false
  const kindsKey = (Object.keys(input.handlers) as AddKind[]).filter(k => input.handlers[k]).sort().join(',')
  useEffect(() => {
    const kinds = kindsKey ? (kindsKey.split(',') as AddKind[]) : []
    return publishTab({
      tripId, tab, stopDay, timelineEditing, kinds,
      run: (kind, dayIndex) => handlersRef.current[kind]?.(dayIndex),
    })
  }, [tripId, tab, stopDay, timelineEditing, kindsKey])
  // One-shot, on mount: the request `go` left for this tab.
  useEffect(() => {
    const req = consumeTabRequest(tripId, tab)
    if (req) handlersRef.current[req.kind]?.(req.dayIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot on mount; tripId and tab only stamp the guard
  }, [])
}

/**
 * The resolver's trip scope, read from the two registrations. A workspace for
 * another trip (the route moved on) reads as no scope, and a tab registration
 * that is not the tab on screen is ignored, so a stale day never reaches a label.
 */
export function tripScopeOf(s: AddSnapshot, routeTripId: string | null): TripAddScope | null {
  const ws = s.workspace
  if (!ws || !routeTripId || ws.tripId !== routeTripId) return null
  const tab = s.tab && s.tab.tripId === ws.tripId && s.tab.tab === ws.tab ? s.tab : null
  return {
    tab: ws.tab,
    canEdit: ws.canEdit,
    isMember: ws.isMember,
    chakra: ws.chakra,
    mapFullscreen: ws.mapFullscreen,
    stopDay: ws.tab === 'overview' ? ws.overviewDay : tab?.stopDay ?? null,
    timelineEditing: tab?.timelineEditing ?? false,
  }
}

/** Test seam: forget every registration and request. */
export function resetAddStore(): void {
  pending = null
  emit({ workspace: null, tab: null })
}
