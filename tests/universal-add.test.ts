// #1064 · the Universal Add context resolver. One row of the spec per case.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  resolveAddContext, tripIdOfRoute, raisesKeyboard, nextCompact, stepCompact, mapFabBottom, ADD_LABELS,
  type AddContextInput, type TripAddScope,
} from '../src/lib/universalAdd'

function scope(over: Partial<TripAddScope> = {}): TripAddScope {
  return { tab: 'overview', canEdit: true, isMember: true, chakra: true, mapFullscreen: false, stopDay: null, timelineEditing: true, ...over }
}

function ctx(route: string, trip: TripAddScope | null = null, over: Partial<AddContextInput> = {}) {
  return resolveAddContext({ route, signedIn: true, overlayOpen: false, keyboardOpen: false, trip, ...over })
}

const labels = (c: ReturnType<typeof ctx>) => c.menu.map(a => a.label)

describe('outside a trip', () => {
  it('Home and My trips plan a trip, with no Chakra (it needs a trip)', () => {
    for (const route of ['/', '/trips', '/trips?view=past']) {
      const c = ctx(route)
      expect(c.state).toBe('ready')
      expect(c.primary).toEqual({ kind: 'plan-trip', label: 'Plan a trip' })
      expect(c.menu).toEqual([c.primary])
    }
  })

  it('Profile, Explore, notifications and other routes have no add', () => {
    for (const route of ['/profile', '/explore', '/explore?style=beach', '/creator-hub', '/create', '/pub/x']) {
      expect(ctx(route)).toEqual({ state: 'none', primary: null, menu: [] })
    }
  })

  it('a signed-out visitor gets nothing', () => {
    expect(ctx('/', null, { signedIn: false }).state).toBe('hidden')
  })
})

describe('inside a trip, as an editor', () => {
  it('Overview adds a stop for the published first day that needs work, without a day in the label', () => {
    const c = ctx('/trip/t1', scope({ tab: 'overview', stopDay: 2 }))
    expect(c.primary).toEqual({ kind: 'add-stop', label: 'Add stop', dayIndex: 2 })
    expect(labels(c)).toEqual(['Add stop', 'Add expense', 'Add decision', 'Invite people', 'Ask Chakra'])
  })

  it('Timeline names the day it targets', () => {
    const c = ctx('/trip/t1/timeline', scope({ tab: 'timeline', stopDay: 1 }))
    expect(c.primary).toEqual({ kind: 'add-stop', label: 'Add stop · Day 2', dayIndex: 1 })
  })

  it('Board names its focused day', () => {
    const c = ctx('/trip/t1/board', scope({ tab: 'board', stopDay: 0 }))
    expect(c.primary?.label).toBe('Add stop · Day 1')
  })

  it('never invents a day: no published day means no day in the label', () => {
    const c = ctx('/trip/t1/timeline', scope({ tab: 'timeline', stopDay: null }))
    expect(c.primary).toEqual({ kind: 'add-stop', label: 'Add stop' })
    const b = ctx('/trip/t1/board', scope({ tab: 'board', stopDay: null }))
    expect(b.primary).toEqual({ kind: 'add-stop', label: 'Add stop' })
  })

  it('the menu add-stop from another tab carries the day but not the day label', () => {
    const c = ctx('/trip/t1/budget', scope({ tab: 'budget', stopDay: 3 }))
    expect(c.primary?.label).toBe('Add expense')
    expect(c.menu[0]).toEqual({ kind: 'add-stop', label: 'Add stop', dayIndex: 3 })
    expect(c.menu[1]).toEqual(c.primary)
  })

  it('Map adds a place on both wide native screens and the full-screen phone Map', () => {
    for (const mapFullscreen of [false, true]) {
      const c = ctx('/trip/t1/map', scope({ tab: 'map', mapFullscreen }))
      expect(c.state).toBe('ready')
      expect(c.primary).toEqual({ kind: 'add-place', label: 'Add place' })
      expect(labels(c)).toEqual(['Add place', 'Add stop', 'Add expense', 'Add decision', 'Invite people', 'Ask Chakra'])
    }
  })

  it('Budget, Group input and Share map to their own add', () => {
    expect(ctx('/trip/t1/budget', scope({ tab: 'budget' })).primary?.label).toBe('Add expense')
    expect(ctx('/trip/t1/group', scope({ tab: 'group' })).primary?.label).toBe('Add decision')
    expect(ctx('/trip/t1/share', scope({ tab: 'share' })).primary?.label).toBe('Invite people')
  })

  it('the menu lists every allowed action in the owner order, the primary included', () => {
    const c = ctx('/trip/t1/share', scope({ tab: 'share' }))
    expect(labels(c)).toEqual(['Add stop', 'Add expense', 'Add decision', 'Invite people', 'Ask Chakra'])
  })

  it('trip settings has no add', () => {
    expect(ctx('/trip/t1/settings', scope({ tab: 'settings' })).state).toBe('none')
  })

  it('the Timeline in Review mode offers no Add stop and falls to the next allowed action', () => {
    const c = ctx('/trip/t1/timeline', scope({ tab: 'timeline', timelineEditing: false, stopDay: 0 }))
    expect(c.primary?.kind).toBe('add-expense')
    expect(c.menu.some(a => a.kind === 'add-stop')).toBe(false)
  })
})

describe('permissions', () => {
  const viewer = { canEdit: false, isMember: true }

  it('a read-only viewer gets only Invite people and Ask Chakra, on every tab', () => {
    for (const tab of ['overview', 'timeline', 'board', 'map', 'budget', 'group', 'share'] as const) {
      const c = ctx(`/trip/t1/${tab}`, scope({ tab, ...viewer, stopDay: 1 }))
      expect(c.primary).toEqual({ kind: 'invite', label: 'Invite people' })
      expect(labels(c)).toEqual(['Invite people', 'Ask Chakra'])
    }
  })

  it('no edit and no Chakra still leaves Invite people', () => {
    const c = ctx('/trip/t1/group', scope({ tab: 'group', ...viewer, chakra: false }))
    expect(c.primary?.kind).toBe('invite')
    expect(labels(c)).toEqual(['Invite people'])
  })

  it('nothing allowed at all reads as no add', () => {
    const c = ctx('/trip/t1/group', scope({ tab: 'group', canEdit: false, isMember: false, chakra: false }))
    expect(c.state).toBe('none')
  })
})

describe('hidden cases', () => {
  it('a sheet, dialog or the keyboard hides it, in and out of a trip', () => {
    expect(ctx('/', null, { overlayOpen: true }).state).toBe('hidden')
    expect(ctx('/trip/t1/timeline', scope({ tab: 'timeline' }), { keyboardOpen: true }).state).toBe('hidden')
  })

  it('a map sheet or the keyboard hides it on the full-screen phone Map', () => {
    expect(ctx('/trip/t1/map', scope({ tab: 'map', mapFullscreen: true, mapSheetOpen: true })).state).toBe('hidden')
    expect(ctx('/trip/t1/map', scope({ tab: 'map', mapFullscreen: true }), { keyboardOpen: true }).state).toBe('hidden')
  })

  it('a trip that is loading or failed (no scope yet) hides it, never a disabled flash', () => {
    expect(ctx('/trip/t1', null).state).toBe('hidden')
  })
})

describe('labels', () => {
  it('every label is a verb and a noun starting with a capital', () => {
    for (const label of Object.values(ADD_LABELS)) {
      expect(label).toMatch(/^[A-Z][a-z]+ (a )?[A-Z]?[a-z]+$/)
    }
  })
})

describe('helpers', () => {
  it('reads the trip id from the route', () => {
    expect(tripIdOfRoute('/trip/abc/budget?x=1')).toBe('abc')
    expect(tripIdOfRoute('/trips')).toBeNull()
  })

  it('treats text fields as the keyboard and buttons as not', () => {
    expect(raisesKeyboard({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(raisesKeyboard({ tagName: 'INPUT', type: 'search' })).toBe(true)
    expect(raisesKeyboard({ tagName: 'TEXTAREA' })).toBe(true)
    expect(raisesKeyboard({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    expect(raisesKeyboard({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(raisesKeyboard({ tagName: 'INPUT', type: 'range' })).toBe(false)
    expect(raisesKeyboard({ tagName: 'INPUT', type: 'text', readOnly: true })).toBe(false)
    expect(raisesKeyboard({ tagName: 'BUTTON' })).toBe(false)
    expect(raisesKeyboard(null)).toBe(false)
  })

  it('shrinks the web pill on a scroll down and grows it on a scroll up', () => {
    expect(nextCompact(false, 100, 140)).toBe(true)
    expect(nextCompact(true, 140, 100)).toBe(false)
    expect(nextCompact(true, 140, 143)).toBe(true) // inside the dead band
    expect(nextCompact(true, 40, 10)).toBe(false) // back at the top
  })

  it('accumulates small frame scroll steps across the dead band', () => {
    let s = { compact: false, anchorY: 100 }
    for (const y of [103, 106, 109]) s = stepCompact(s, y)
    expect(s).toEqual({ compact: true, anchorY: 109 })
    s = stepCompact(s, 140)
    expect(s).toEqual({ compact: true, anchorY: 140 })
    for (const y of [137, 134, 131]) s = stepCompact(s, y)
    expect(s).toEqual({ compact: false, anchorY: 131 })
  })
})

describe('the add store', async () => {
  const store = await import('../src/lib/universalAddStore')
  const ws = (over: Partial<import('../src/lib/universalAddStore').WorkspaceAddState> = {}) => ({
    tripId: 't1', tab: 'timeline' as const, canEdit: true, isMember: true, chakra: true, mapFullscreen: false, overviewDay: 2, go: () => {}, ...over,
  })

  it('runs the tab on screen first, and routes anything else through the workspace', () => {
    store.resetAddStore()
    const calls: string[] = []
    store.publishWorkspace(ws({ go: (k, d) => calls.push(`go:${k}:${d ?? ''}`) }))
    store.publishTab({ tripId: 't1', tab: 'timeline', stopDay: 1, timelineEditing: true, kinds: ['add-stop'], run: (k, d) => calls.push(`tab:${k}:${d ?? ''}`) })
    store.runTripAdd('add-stop', 1)
    store.runTripAdd('add-expense')
    expect(calls).toEqual(['tab:add-stop:1', 'go:add-expense:'])
  })

  it('ignores a tab registration for another trip or tab', () => {
    store.resetAddStore()
    const calls: string[] = []
    store.publishWorkspace(ws({ tab: 'budget', go: k => calls.push(`go:${k}`) }))
    store.publishTab({ tripId: 't1', tab: 'timeline', stopDay: 1, timelineEditing: true, kinds: ['add-stop'], run: () => calls.push('stale') })
    store.runTripAdd('add-stop')
    expect(calls).toEqual(['go:add-stop'])
    expect(store.tripScopeOf(store.readAddSnapshot(), 't1')?.stopDay).toBeNull()
  })

  it('a one-shot request is consumed by its own tab only, once', () => {
    store.resetAddStore()
    store.requestTabAdd({ tripId: 't1', tab: 'budget', kind: 'add-expense' })
    expect(store.consumeTabRequest('t1', 'budget')?.kind).toBe('add-expense')
    expect(store.consumeTabRequest('t1', 'budget')).toBeNull()
  })

  it('a request for another tab or trip is dropped, so it cannot fire on a later visit', () => {
    store.resetAddStore()
    store.requestTabAdd({ tripId: 't1', tab: 'budget', kind: 'add-expense' })
    expect(store.consumeTabRequest('t1', 'timeline')).toBeNull()
    expect(store.consumeTabRequest('t1', 'budget')).toBeNull()
    store.requestTabAdd({ tripId: 't1', tab: 'budget', kind: 'add-expense' })
    store.dropTripRequests('t1')
    expect(store.consumeTabRequest('t1', 'budget')).toBeNull()
  })

  it('reads the scope only for the trip in the route', () => {
    store.resetAddStore()
    store.publishWorkspace(ws({ tab: 'overview' }))
    expect(store.tripScopeOf(store.readAddSnapshot(), 't2')).toBeNull()
    expect(store.tripScopeOf(store.readAddSnapshot(), 't1')).toMatchObject({ tab: 'overview', stopDay: 2, mapSheetOpen: false })
    store.publishWorkspace(ws({ tab: 'map', mapFullscreen: true }))
    store.publishTab({ tripId: 't1', tab: 'map', stopDay: null, timelineEditing: false, mapSheetOpen: true, kinds: ['add-place'], run: () => {} })
    expect(store.tripScopeOf(store.readAddSnapshot(), 't1')?.mapSheetOpen).toBe(true)
  })

  it('an unpublish only clears its own registration', () => {
    store.resetAddStore()
    const offA = store.publishWorkspace(ws())
    store.publishWorkspace(ws({ tab: 'board' }))
    offA()
    expect(store.readAddSnapshot().workspace?.tab).toBe('board')
  })

  it('refuses disallowed actions, mismatched trips, and declined same-tab adds', () => {
    store.resetAddStore()
    const calls: string[] = []
    store.publishWorkspace(ws({ tab: 'budget', canEdit: false, isMember: true, go: k => calls.push(`go:${k}`) }))
    store.runTripAdd('add-expense', undefined, 't1')
    store.runTripAdd('invite', undefined, 't2')
    expect(calls).toEqual([])
    store.runTripAdd('invite', undefined, 't1')
    expect(calls).toEqual(['go:invite'])

    calls.length = 0
    store.publishWorkspace(ws({ tab: 'budget', canEdit: true, isMember: true, go: k => calls.push(`go:${k}`) }))
    store.publishTab({ tripId: 't1', tab: 'budget', stopDay: null, timelineEditing: false, kinds: [], run: () => calls.push('tab') })
    store.runTripAdd('add-expense', undefined, 't1')
    expect(calls).toEqual([])
  })

  it('registers and clears the open Add menu closer once', () => {
    store.resetAddStore()
    let closedA = 0
    let closedB = 0
    const offA = store.registerAddMenuClose(() => { closedA += 1 })
    const offB = store.registerAddMenuClose(() => { closedB += 1 })
    offA()
    expect(store.closeOpenAddMenu()).toBe(true)
    expect(closedA).toBe(0)
    expect(closedB).toBe(1)
    expect(store.closeOpenAddMenu()).toBe(false)
    offB()
  })
})

describe('full-screen phone Map FAB', () => {
  it('places the button 12 px above the peek sheet handle top', () => {
    expect(mapFabBottom(844, 770)).toBe(86)
    expect(mapFabBottom(844, 860)).toBe(12)
  })

  it('renders a 56px round "+" with no visible label or chevron and keeps the attribution clear', () => {
    const comp = readFileSync(new URL('../src/components/UniversalAdd.tsx', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/styles/components/universal-add.css', import.meta.url), 'utf8')
    expect(comp).toContain("const mapFab = variant === 'pill' && !!scope?.mapFullscreen")
    expect(comp).toContain("data-map-fab={mapFab ? 'true' : undefined}")
    expect(comp).toContain('{!mapFab && primary && <AddLabel')
    expect(comp).toContain('{hasMenu && !mapFab && (')
    expect(css).toMatch(/\.ua-pill\[data-map-fab='true'\]\s*\{[\s\S]*?width:\s*56px;[\s\S]*?height:\s*56px;[\s\S]*?border-radius:\s*50%;/)
    expect(css).toContain('.mv2-workspace[data-snap=\'peek\'] .maplibregl-ctrl-bottom-right')
  })
})
