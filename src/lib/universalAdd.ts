// ============ Universal Add (#1064): the one context resolver ============
// Phones get ONE add control. Its label and action follow the screen. This file
// is the only place that decides what the control offers: a pure function from
// (route, trip scope, overlay state) to { state, primary, menu }. No React, no
// store, no DOM, so every row of the spec is a unit test.
//
// The control only opens flows that exist today. A kind here names an existing
// flow, never a new data path:
//   plan-trip     /create (CreateTrip)
//   add-stop      the StopEditor in add mode (Timeline and Board)
//   add-place     the Map search field
//   add-expense   the Budget capture (QuickAdd)
//   add-decision  the Group input decision form
//   invite        the Share tab's "Invite collaborators" card
//   ask-chakra    the trip's AiDrawer
//
// Rules the resolver owns:
// - A read-only role never sees an action it cannot take. When the screen's own
//   action is not allowed, the primary becomes the first ALLOWED item in menu
//   order. A viewer gets Invite people, because any member may invite
//   (`change_trip_access 'invite'` checks `is_member`).
// - The day target comes from the tab that owns the day focus. When that tab has
//   not published one, the label carries no day: the resolver never invents one.
// - A sheet, a dialog, the keyboard or the full-screen phone Map hides it.

import type { WorkspaceTabKey } from './workspaceHeader'

export type AddKind =
  | 'plan-trip'
  | 'add-stop'
  | 'add-place'
  | 'add-expense'
  | 'add-decision'
  | 'invite'
  | 'ask-chakra'

export interface AddAction {
  kind: AddKind
  /** A verb and a noun, starting with a capital letter. */
  label: string
  /** 0-based day, for add-stop only, and only when the owning tab published it. */
  dayIndex?: number
}

/** What the trip workspace and its tab on screen publish. */
export interface TripAddScope {
  tab: WorkspaceTabKey
  /** Owner or editor: the canEdit gate every add flow uses today. */
  canEdit: boolean
  /** Any member role. Invite needs only this. */
  isMember: boolean
  /** The Chakra drawer is mounted for this trip. */
  chakra: boolean
  /** W10: the phone Map tab owns the whole screen. */
  mapFullscreen: boolean
  /** The day the tab on screen targets (Timeline `addTargetDay`, Board focus,
   *  Overview first day that needs work). null: not published. */
  stopDay: number | null
  /** Timeline only: editing is switched on. Today's tl-add-fab showed only then. */
  timelineEditing: boolean
}

export interface AddContextInput {
  /** The app route, query included (`/trip/abc/budget?x=1`). */
  route: string
  signedIn: boolean
  /** A sheet, dialog, drawer or app menu is open. */
  overlayOpen: boolean
  /** A text field has focus, so the phone keyboard is up. */
  keyboardOpen: boolean
  /** Published by the workspace for the trip in the route. null outside a trip,
   *  and while the trip is loading or failed to load. */
  trip: TripAddScope | null
}

/**
 * - `hidden`: draw nothing (an overlay, the keyboard, the full-screen Map, signed out).
 * - `none`: the screen has no add. Native keeps a disabled "+" in the slot.
 * - `ready`: a primary action, and a menu of the other actions.
 */
export type AddState = 'hidden' | 'none' | 'ready'

export interface AddContext {
  state: AddState
  primary: AddAction | null
  /** Every allowed action for the context, in menu order, the primary included
   *  (the owner's menu lists all five inside a trip). One item means no menu. */
  menu: AddAction[]
}

const HIDDEN: AddContext = { state: 'hidden', primary: null, menu: [] }
const NONE: AddContext = { state: 'none', primary: null, menu: [] }

export const ADD_LABELS: Record<AddKind, string> = {
  'plan-trip': 'Plan a trip',
  'add-stop': 'Add stop',
  'add-place': 'Add place',
  'add-expense': 'Add expense',
  'add-decision': 'Add decision',
  invite: 'Invite people',
  'ask-chakra': 'Ask Chakra',
}

/** The menu order inside a trip (owner decision). */
const TRIP_MENU: readonly AddKind[] = ['add-stop', 'add-expense', 'add-decision', 'invite', 'ask-chakra']

/** Each tab's own primary action. Trip settings has none. */
export const TAB_PRIMARY: Record<WorkspaceTabKey, AddKind | null> = {
  overview: 'add-stop',
  timeline: 'add-stop',
  board: 'add-stop',
  map: 'add-place',
  budget: 'add-expense',
  group: 'add-decision',
  share: 'invite',
  settings: null,
}

/** Tabs whose add-stop label names the day the tab targets. */
const DAY_LABEL_TABS: ReadonlySet<WorkspaceTabKey> = new Set(['timeline', 'board'])

function pathSegments(route: string): string[] {
  return route.split('?')[0].split('#')[0].split('/').filter(Boolean)
}

/** True when the scope allows the kind. */
export function isAddAllowed(kind: AddKind, scope: TripAddScope): boolean {
  switch (kind) {
    case 'add-stop':
      // The Timeline in Review mode promises "nothing here changes the plan".
      return scope.canEdit && !(scope.tab === 'timeline' && !scope.timelineEditing)
    case 'add-place':
      return scope.canEdit && scope.tab === 'map'
    case 'add-expense':
    case 'add-decision':
      return scope.canEdit
    case 'invite':
      return scope.isMember
    case 'ask-chakra':
      return scope.chakra
    case 'plan-trip':
      return false
  }
}

function tripAction(kind: AddKind, scope: TripAddScope): AddAction {
  if (kind !== 'add-stop' || scope.stopDay == null || scope.stopDay < 0) return { kind, label: ADD_LABELS[kind] }
  const dayIndex = scope.stopDay
  const label = DAY_LABEL_TABS.has(scope.tab) ? `${ADD_LABELS['add-stop']} · Day ${dayIndex + 1}` : ADD_LABELS['add-stop']
  return { kind, label, dayIndex }
}

export function resolveAddContext(input: AddContextInput): AddContext {
  if (!input.signedIn) return HIDDEN
  if (input.overlayOpen || input.keyboardOpen) return HIDDEN

  const seg = pathSegments(input.route)
  if (seg.length === 0 || (seg.length === 1 && seg[0] === 'trips')) {
    // Chakra needs a trip, so outside one the menu holds nothing else.
    const plan: AddAction = { kind: 'plan-trip', label: ADD_LABELS['plan-trip'] }
    return { state: 'ready', primary: plan, menu: [plan] }
  }
  if (seg[0] !== 'trip') return NONE

  const scope = input.trip
  // Loading or failed: the workspace has not published. Hidden, not "none",
  // so a slow read never flashes a disabled control.
  if (!scope) return HIDDEN
  if (scope.mapFullscreen) return HIDDEN

  const own = TAB_PRIMARY[scope.tab]
  if (own === null) return NONE

  const menuKinds: AddKind[] = own === 'add-place' ? ['add-place', ...TRIP_MENU] : [...TRIP_MENU]
  const permitted = menuKinds.filter(k => isAddAllowed(k, scope))
  const primaryKind = isAddAllowed(own, scope) ? own : permitted[0]
  if (!primaryKind) return NONE

  return {
    state: 'ready',
    primary: tripAction(primaryKind, scope),
    menu: permitted.map(k => tripAction(k, scope)),
  }
}

/** The trip id in a `/trip/<id>/...` route, or null. */
export function tripIdOfRoute(route: string): string | null {
  const seg = pathSegments(route)
  return seg[0] === 'trip' && seg[1] ? seg[1] : null
}

/** Text-entry fields raise the phone keyboard. Buttons, checks and ranges do not. */
const NON_TEXT_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file', 'image', 'hidden'])

export function raisesKeyboard(el: { tagName?: string; type?: string; isContentEditable?: boolean; readOnly?: boolean } | null): boolean {
  if (!el?.tagName) return false
  const tag = el.tagName.toLowerCase()
  if (el.isContentEditable) return true
  if (tag === 'textarea') return !el.readOnly
  if (tag !== 'input') return false
  return !el.readOnly && !NON_TEXT_INPUTS.has((el.type ?? 'text').toLowerCase())
}

const DEAD_BAND = 6
const TOP_RESET_Y = 24

/**
 * The web pill's scroll rule. It shrinks on a scroll down past the first
 * screen edge and grows again on any scroll up. A small dead band keeps a
 * jittery finger from flapping it.
 */
export function nextCompact(compact: boolean, lastY: number, y: number): boolean {
  if (y <= TOP_RESET_Y) return false
  if (y > lastY + DEAD_BAND) return true
  if (y < lastY - DEAD_BAND) return false
  return compact
}

export interface CompactScrollState {
  compact: boolean
  anchorY: number
}

/**
 * Advance the scroll-shrink state with an anchor that moves only on a flip or
 * further travel in the same direction, so small frame steps cross the dead band.
 */
export function stepCompact(state: CompactScrollState, y: number): CompactScrollState {
  if (y <= TOP_RESET_Y) return { compact: false, anchorY: y }
  const compact = nextCompact(state.compact, state.anchorY, y)
  if (compact !== state.compact) return { compact, anchorY: y }
  const anchorY = compact ? Math.max(state.anchorY, y) : Math.min(state.anchorY, y)
  return { compact, anchorY }
}
