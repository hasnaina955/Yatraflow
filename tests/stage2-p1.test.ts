import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const group = source('pages/trip/GroupInputTab.tsx')
const editor = source('components/StopEditor.tsx')
const travel = source('pages/trip/timeline/TravelPanel.tsx')

// Execute the shipped handlers in node, with their UI/provider boundaries injected.
// This is not a browser render test; reverting a handler changes the code exercised.
function evaluate(code: string, bindings: Record<string, unknown>, result: string) {
  const js = ts.transpile(code, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None })
  return new Function(...Object.keys(bindings), `${js}\nreturn ${result}`)(...Object.values(bindings))
}
function handler(text: string, name: string, bindings: Record<string, unknown>) {
  const file = ts.createSourceFile('component.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let code = ''
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) code = node.getText(file)
    ts.forEachChild(node, visit)
  }
  visit(file)
  expect(code).not.toBe('')
  return evaluate(code, bindings, name)
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

describe('Stage 2 P1 regressions', () => {
  it('parks a filtered digest target, then scrolls and focuses only after render', () => {
    let pending: string | null = null
    let filter = 'resolved'
    let effect = () => {}
    const card = { scrollIntoView: vi.fn(), focus: vi.fn() }
    const document = { getElementById: vi.fn(() => filter === 'all' ? card : null) }
    const start = group.indexOf('  const [pendingTarget, setPendingTarget]')
    expect(start).toBeGreaterThan(-1)
    const code = group.slice(start, group.indexOf('\n  return (', start))
    const render = (shown: { id: string }[]) => evaluate(code, {
      useState: () => [pending, (id: string | null) => { pending = id }],
      useEffect: (fn: () => void) => { effect = fn },
      document, scrollBehavior: () => 'auto', shown,
      itemId: (item: { id: string }) => item.id,
      setFilter: (value: string) => { filter = value },
    }, 'focusItem')
    render([])('idea-1')
    expect(pending).toBe('idea-1')
    expect(filter).toBe('all')
    expect(card.scrollIntoView).not.toHaveBeenCalled()
    render([{ id: 'idea-1' }])
    effect()
    expect(document.getElementById).toHaveBeenCalledWith('gi-item-idea-1')
    expect(card.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
    expect(card.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(card.scrollIntoView.mock.invocationCallOrder[0]).toBeLessThan(card.focus.mock.invocationCallOrder[0])
    expect(pending).toBeNull()
    render([{ id: 'idea-1' }])
    effect()
    expect(card.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(group.match(/tabIndex=\{-1\} className=\{`card gi-item/g)).toHaveLength(2)
  })

  it('keeps the cross-day append target outside the collapsed body, including empty days', () => {
    const day = source('pages/trip/timeline/DaySection.tsx')
    const header = day.slice(day.indexOf('<div className={`day-header'), day.indexOf('<SmoothCollapse open='))
    expect(header).toContain('editable ? dayDropHandlers(ordered.length) : {}')
    expect(day).toContain('onClick={() => onMoveBetweenDays(s)}')
  })

  it('places the existing narrow reset after all desktop folded rules and uses only ring ink', () => {
    const css = source('styles.css')
    expect(css.match(/@media \(max-width: 1500px\)/g)).toHaveLength(1)
    expect(css.indexOf('@media (max-width: 1500px)')).toBeGreaterThan(css.lastIndexOf('grid-template-columns: 48px minmax(0, 1fr) 48px'))
    expect(css).toContain('.gi-item:focus, .day-header.foreign-over { outline: none; box-shadow: var(--ring); }')
  })

  it('discards an old road lookup before it can fill a newer stop or start an hours lookup', async () => {
    const road = deferred<unknown>()
    const placeRequest = { current: 0 }
    const setV = vi.fn()
    const hours = vi.fn()
    const setLegState = vi.fn()
    const pick = handler(editor, 'onPlacePicked', {
      open: true, placeRequest, invalidatePlaceRequest: () => { ++placeRequest.current },
      set: vi.fn(), setV, setLegState, setHoursState: vi.fn(), v: { openTime: '' },
      legContext: { fromPoint: {}, transportMode: 'car', dayStart: '08:00' },
      roadLegBetween: () => road.promise, getAssumptions: () => ({}), fetchOpeningHours: hours,
    })
    const work = pick({ name: 'Old place', kind: 'poi', latitude: 10, longitude: 76 })
    ++placeRequest.current // stop/reset/close ownership invalidation
    road.resolve({ distanceKm: 10, durationMinutes: 20 })
    await work
    expect(setV).not.toHaveBeenCalled()
    expect(hours).not.toHaveBeenCalled()
    expect(setLegState).toHaveBeenCalledTimes(1) // stale finally cannot clear a newer spinner
    expect(editor).toContain('return () => { ++placeRequest.current }')
    expect(editor).toContain('}, [open, resetKey])')
  })

  it('discards stale opening hours after another pick', async () => {
    const hours = deferred<unknown>()
    const placeRequest = { current: 0 }
    const set = vi.fn()
    const setHoursState = vi.fn()
    const pick = handler(editor, 'onPlacePicked', {
      open: true, placeRequest, invalidatePlaceRequest: () => { ++placeRequest.current },
      set, setHoursState, legContext: undefined, v: { openTime: '' },
      fetchOpeningHours: () => hours.promise,
    })
    const work = pick({ name: 'Old place', kind: 'poi', latitude: 10, longitude: 76 })
    ++placeRequest.current
    set.mockClear()
    hours.resolve({ openTime: '09:00', closeTime: '17:00' })
    await work
    expect(set).not.toHaveBeenCalled()
    expect(setHoursState).toHaveBeenCalledTimes(1)
  })

  it('removing all halts invalidates the search without restoring them or writing stale cache', async () => {
    const spots = deferred<never[]>()
    const spotRequest = { current: 0 }
    const setPlan = vi.fn()
    const setHaltCache = vi.fn()
    const setResolving = vi.fn()
    const setSearched = vi.fn()
    const bindings = {
      spotRequest, setPlan, setHaltCache, setResolving, setSearched,
      journey: { points: [{ lat: 10, lng: 76 }], distanceKm: 100, driveMinutes: 120 },
      day: { index: 0 }, segmentsFromPlan: () => [],
    }
    const commitPlan = handler(travel, 'commitPlan', bindings)
    const resolve = handler(travel, 'resolveSpots', {
      ...bindings, editable: true, plan: [{ id: 'halt', km: 50, minutes: 20, purpose: 'meal' }],
      roadPolyline: null, trip: { transportMode: 'car' }, corridorAnchors: () => [],
      searchNearbyPoisMulti: () => spots.promise, googleEnabled: () => false,
      searchCitiesAlong: async () => [], commitPlan, toast: vi.fn(),
    })
    const work = resolve()
    commitPlan([])
    spots.resolve([])
    await work
    expect(setPlan).toHaveBeenCalledExactlyOnceWith([])
    expect(setHaltCache).toHaveBeenCalledExactlyOnceWith(0, [], [])
    expect(setSearched).not.toHaveBeenCalled()
    expect(setResolving.mock.calls).toEqual([[true], [false]])
    expect(travel).toContain('return () => { ++spotRequest.current }')
  })
})
