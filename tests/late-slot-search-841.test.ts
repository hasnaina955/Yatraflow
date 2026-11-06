// ============ #841 - a late slot search never lands in another context ============
//
// A query is typed in one trip, day and part. The user may leave before the
// answer arrives. These tests drive the REAL pieces the page composes:
//   createSlotSearchGuard + runSlotSearchFlow   the captured-context flow
//   slotSearchScopeKey + slotSearchResetKey     what scope the page is on
//   visibleSlotSearch + isSlotSearchCurrent      what the page shows and accepts
//   useSlotSearch + createManualSlotStore        the filing writer and its picks
//
// Only the provider transport (a promise the test settles late) and the toast
// sink are controlled. The small `Page` model below applies the same render and
// effect order as MapTab: reset the cell when the reset key changes (during
// render), then reset the guard (in the effect).
//
// Each scenario also runs a known-bad control that reproduces the rule the
// wiring replaced, so a green run cannot hide the defect.
import { describe, expect, it, vi } from 'vitest'
import type { DaySlot } from '../src/lib/daySlots'
import type { PlaceHit } from '../src/lib/providers/hits'
import { createManualSlotStore, createSlotSearchGuard } from '../src/pages/trip/map/manualSlotContexts'
import { runSlotSearchFlow, slotSearchScopeKey, type SlotSearchPatch } from '../src/pages/trip/map/mapTabPipeline'
import { isSlotSearchCurrent, slotSearchResetKey, visibleSlotSearch } from '../src/pages/trip/map/slotSearchView'
import { STALE_SEARCH_REFUSAL, useSlotSearch, type SlotSearchState } from '../src/pages/trip/map/useSlotSearch'

const toasts = vi.hoisted(() => [] as string[])
vi.mock('../src/components/ui', () => ({ toast: (message: string) => { toasts.push(message) } }))

const FOUND = [{ id: 'f-1', name: 'Found Cafe', latitude: 10, longitude: 70, kind: 'poi', category: 'food' } as PlaceHit]
const identity = {
  names: new Set<string>(), keys: new Set<string>(), places: [], added: new Set<string>(),
  dismissed: new Set<string>(), staged: new Map<string, string>(),
} as never

function slotFor(tripId: string, dayId: string, key: 'lunch' | 'dinner'): DaySlot {
  return {
    key, kind: 'meal', label: key === 'lunch' ? 'Lunch' : 'Dinner', state: 'empty',
    windowMin: [720, 900], windowLabel: '12:00 - 15:00', segment: null, filledStop: null,
    auto: false, drift: null, urgencyMin: null, ref: { tripId, dayId, key }, reason: null, candidates: [],
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** The page's search cells, composed from the real rules. */
function createPage(start: { tripId: string; dayId: string; openSlotKey: string | null }) {
  toasts.length = 0
  const store = createManualSlotStore()
  const guard = createSlotSearchGuard()
  const page = {
    tripId: start.tripId,
    dayId: start.dayId,
    openSlotKey: start.openSlotKey,
    cell: null as SlotSearchState | null,
    cellScope: null as string | null,
    resetSeen: '',
    rowsFiledIntoCell: 0,
  }
  const scopeNow = () => slotSearchScopeKey(page.tripId, page.dayId)
  /** The render the page does after a navigation: the cell reset first, the guard
   *  reset in the effect after. Only a changed reset key drops the cell. */
  function navigate(next: Partial<Pick<typeof page, 'tripId' | 'dayId' | 'openSlotKey'>>) {
    Object.assign(page, next)
    const key = slotSearchResetKey(scopeNow(), page.openSlotKey)
    if (page.resetSeen !== key) {
      page.resetSeen = key
      page.cell = null
    }
    guard.reset()
  }
  navigate({})
  const shown = () => visibleSlotSearch(page.cell, page.cellScope, scopeNow())
  const writer = useSlotSearch({
    setSlotManual: () => {},
    setSlotSearch: update => { page.cell = typeof update === 'function' ? update(page.cell) : update },
    identity,
    store,
    isSearchCurrent: slotKey => isSlotSearchCurrent(page.cell, page.cellScope, scopeNow(), slotKey),
  })
  /** The runner as the page calls it: record the typed cell and scope, then run
   *  the flow, whose commit patches the cell for that slot only. */
  function search(slot: DaySlot, transport: ReturnType<typeof deferred<PlaceHit[]>>) {
    page.cellScope = scopeNow()
    page.cell = { key: slot.key, q: 'cafe', busy: true, hits: [], err: null }
    return runSlotSearchFlow({
      guard,
      slot,
      query: 'cafe',
      controller: new AbortController(),
      search: () => transport.promise,
      rank: hits => hits,
      isQuotaError: () => false,
      commit: (patch: SlotSearchPatch) => {
        page.cell = page.cell && page.cell.key === slot.key ? { ...page.cell, ...patch } : page.cell
        page.rowsFiledIntoCell += patch.hits ? patch.hits.length : 0
      },
    })
  }
  return { page, store, guard, writer, navigate, shown, search, scopeNow }
}

describe('#841 a late slot search never lands in another context', () => {
  it('commits and shows rows when the user stayed put', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    transport.resolve(FOUND)
    await expect(flow).resolves.toBe('found')
    expect(h.shown()?.hits).toEqual(FOUND)
  })

  it('a day switch drops the late rows (same slot key on another day)', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    h.navigate({ dayId: 'day-b' })
    transport.resolve(FOUND)
    await expect(flow).resolves.toBe('stale')
    expect(h.page.rowsFiledIntoCell).toBe(0)
    expect(h.shown()).toBeNull()
  })

  it('a trip switch drops the late rows (same day id and slot key in another trip)', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    h.navigate({ tripId: 'trip-2' })
    transport.resolve(FOUND)
    await expect(flow).resolves.toBe('stale')
    expect(h.page.rowsFiledIntoCell).toBe(0)
    expect(h.shown()).toBeNull()
  })

  it('a slot switch on the same day drops the late rows of the old part', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    h.navigate({ openSlotKey: 'dinner' })
    transport.resolve(FOUND)
    await expect(flow).resolves.toBe('stale')
    expect(h.page.rowsFiledIntoCell).toBe(0)
    expect(h.shown()).toBeNull()
  })

  it('a late error from the old day sets no error and does not clear the new day busy state', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const oldTransport = deferred<PlaceHit[]>()
    const newTransport = deferred<PlaceHit[]>()
    const oldFlow = h.search(slotFor('trip-1', 'day-a', 'lunch'), oldTransport)
    h.navigate({ dayId: 'day-b' })
    const newFlow = h.search(slotFor('trip-1', 'day-b', 'lunch'), newTransport)
    // The new query is still in flight when the old one fails.
    oldTransport.reject(new Error('boom'))
    await expect(oldFlow).resolves.toBe('stale')
    expect(h.shown()).toMatchObject({ busy: true, err: null })
    newTransport.resolve(FOUND)
    await expect(newFlow).resolves.toBe('found')
    expect(h.shown()).toMatchObject({ busy: false, err: null, hits: FOUND })
  })

  it('returning to the first day does not bring the old query back', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    transport.resolve(FOUND)
    await flow
    expect(h.shown()?.hits).toEqual(FOUND)
    h.navigate({ dayId: 'day-b' })
    expect(h.shown()).toBeNull()
    h.navigate({ dayId: 'day-a' })
    // The scope matches the stored one again, but the cell was dropped on the way out.
    expect(h.shown()).toBeNull()
  })

  it('the render before the reset already hides a cell from another day', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    transport.resolve(FOUND)
    await flow
    // The page is on Day B but has not yet applied the reset.
    expect(visibleSlotSearch(h.page.cell, h.page.cellScope, slotSearchScopeKey('trip-1', 'day-b'))).toBeNull()
    expect(isSlotSearchCurrent(h.page.cell, h.page.cellScope, slotSearchScopeKey('trip-1', 'day-b'), 'lunch')).toBe(false)
  })
})

describe('#841 a pick from a search of another context is refused at filing time', () => {
  it('a result shown for Day A cannot be filed after the page moved to Day B', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    transport.resolve(FOUND)
    await flow
    // A click handler captured before the move runs after it.
    h.navigate({ dayId: 'day-b' })
    h.writer.addManualCandidate(slotFor('trip-1', 'day-b', 'lunch'), FOUND[0]!)
    expect(toasts).toContain(STALE_SEARCH_REFUSAL)
    expect(h.store.size()).toBe(0)
  })

  it('files under the day the search was typed on, and nowhere else', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'lunch' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'lunch'), transport)
    transport.resolve(FOUND)
    await flow
    h.writer.addManualCandidate(slotFor('trip-1', 'day-a', 'lunch'), FOUND[0]!)
    expect(h.store.picksFor({ tripId: 'trip-1', dayId: 'day-a', slotKey: 'lunch' }).map(pick => pick.id)).toEqual(['f-1'])
    expect(h.store.picksFor({ tripId: 'trip-1', dayId: 'day-b', slotKey: 'lunch' })).toEqual([])
    expect(h.store.picksFor({ tripId: 'trip-2', dayId: 'day-a', slotKey: 'lunch' })).toEqual([])
    // The filing clears only its own search query.
    expect(h.shown()).toMatchObject({ key: 'lunch', q: '', hits: [] })
  })

  it('a search typed in the dinner part cannot file into lunch', async () => {
    const h = createPage({ tripId: 'trip-1', dayId: 'day-a', openSlotKey: 'dinner' })
    const transport = deferred<PlaceHit[]>()
    const flow = h.search(slotFor('trip-1', 'day-a', 'dinner'), transport)
    transport.resolve(FOUND)
    await flow
    h.writer.addManualCandidate(slotFor('trip-1', 'day-a', 'lunch'), FOUND[0]!)
    expect(toasts).toContain(STALE_SEARCH_REFUSAL)
    expect(h.store.size()).toBe(0)
    expect(h.shown()).toMatchObject({ key: 'dinner', hits: FOUND })
  })
})

describe('#841 known-bad controls for the rules this wiring replaced', () => {
  it('a sequence-only guard, reset only when the part changes, files Day A rows into Day B', async () => {
    // The old rule: bump a counter when the open part changes. A day switch keeps
    // the same part key, so nothing moved and the late answer was filed.
    let seq = 0
    let rowsOnScreen: string[] = []
    const mySeq = ++seq
    const answer = deferred<string[]>()
    const oldRunner = answer.promise.then(rows => { if (mySeq === seq) rowsOnScreen = rows })
    // Day switch with the same open part: the counter is not bumped.
    answer.resolve(['Day A cafe'])
    await oldRunner
    expect(rowsOnScreen).toEqual(['Day A cafe'])
  })

  it('the scope check alone would bring the old query back on return, which is why the cell is also dropped', () => {
    const cell: SlotSearchState = { key: 'lunch', q: 'cafe', busy: false, hits: FOUND, err: null }
    const scopeA = slotSearchScopeKey('trip-1', 'day-a')
    const scopeB = slotSearchScopeKey('trip-1', 'day-b')
    expect(visibleSlotSearch(cell, scopeA, scopeB)).toBeNull()
    // Back on Day A the stored scope matches again: without the reset the stale cell shows.
    expect(visibleSlotSearch(cell, scopeA, scopeA)).toBe(cell)
    // The reset key moves on every trip, day and part change, so the page drops it.
    expect(slotSearchResetKey(scopeA, 'lunch')).not.toBe(slotSearchResetKey(scopeB, 'lunch'))
    expect(slotSearchResetKey(scopeA, 'lunch')).not.toBe(slotSearchResetKey(scopeA, 'dinner'))
    expect(slotSearchResetKey(scopeA, null)).not.toBe(slotSearchResetKey(scopeA, 'lunch'))
  })
})
