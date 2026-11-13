import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'
import { deriveDrivingPlan } from '../src/lib/ridePlan'
import type { ApplyChange } from '../src/lib/mutationLifecycle'
import { splitByDetourBudget } from '../src/lib/detourBudget'
import { seedData } from '../src/data/seed'
import { simulateDay } from '../src/lib/engine'
import { filledStopClock } from '../src/pages/trip/map/driveLens'
import { driveBudgetBarText, driveBudgetStep, plannedDriveBudget } from '../src/pages/trip/map/LensRailExtras'
import { TravelDayAdvice, travelDayAdviceFor, applyTravelDays } from '../src/components/map/lenses/TravelDayAdvice'
import { MapItinerary } from '../src/components/map/MapWorkspaceChrome'
import { MapLensPanel, type MapLensPanelProps } from '../src/pages/trip/map/MapLensPanel'
import { mapLensesFor } from '../src/pages/trip/map/useMapLenses'
import { projectJourney } from '../src/lib/journeyProjection'
import { journeyFixture } from './helpers/journeyProjectionFixture'
import { bandCounts, MapScopeBand, scopeCountText } from '../src/pages/trip/map/MapScopeBand'
import { scopeBandOf, overBudgetAlternativeIds, driveTabs, driveCardStrip, budgetHeldAlternativeIds, distinctPlaceBands } from '../src/pages/trip/map/driveLens'
import { DriveTabs } from '../src/components/map/lenses/DriveTabs'

it('reads the filled stop clock from the actual day schedule', () => {
  const trip = structuredClone(seedData.trips[0])
  const schedule = simulateDay(trip.days[0], trip, { lat: 18.9388, lng: 72.8354 }, trip.days[0].index)
  expect(schedule.activeStops.length).toBeGreaterThan(0)
  schedule.activeStops.forEach((stop, index) => expect(filledStopClock(schedule, stop.id)).toBe(schedule.arrivalTimes[index]))
  expect(filledStopClock(schedule, 'missing')).toBeNull()
  expect(filledStopClock(null, 'missing')).toBeNull()
  const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  expect(source).toContain('filledStopClock(journeyDay?.daySchedule')
})

const noop = () => undefined
const clock = (minutes: number) => String(minutes)
function model() {
  const fixture = journeyFixture()
  const trip = structuredClone(seedData.trips[0])
  trip.fixedCommitments = []
  trip.startLocationCoords = { lat: 18.9388, lng: 72.8354 }
  trip.days = [{ id: fixture.dayId, index: fixture.dayIndex, startTime: '05:00', stops: [fixture.stops.fuel, fixture.stops.stay] }]
  const projection = projectJourney({
    dayPlan: fixture.dayPlan,
    driveRows: [...fixture.driveRows, { ...fixture.driveRows[0], hit: fixture.hits.stay, detourMin: 8 }],
    budgetMin: 25, editable: true, presence: fixture.presence, contextKey: fixture.contextKey,
  })
  const slots = fixture.dayPlan.slots.map(slot => slot.source)
  const lenses = mapLensesFor({ trip, dayIndex: fixture.dayIndex, status: { kind: 'ready', source: 'scan' }, rows: projection.rows, slots, budgetMin: 25, schedule: null, clock, dayLabel: 'Day 3' })
  return { fixture, trip, projection, slots, lenses }
}

it('the rail spends only the known detours of planned stops from the real projection', () => {
  const { trip, projection } = model()
  const day = trip.days[0]
  const budget = plannedDriveBudget(day.stops, projection.rows, 25)
  // The stay carries an 8 min corridor detour, but a stay is a destination, so only the fuel stop spends.
  expect(budget).toEqual({ kind: 'known', usedMin: 4, budgetMin: 25 })
  expect(budget?.usedMin).toBe(projection.rows.filter(row => row.stopId === String(day.stops[0].id)).reduce((sum, row) => sum + (row.detourMin ?? 0), 0))
  const text = driveBudgetBarText(budget)
  expect(text).toBe('Detour 4 / 25 min')
  const html = renderToStaticMarkup(createElement(MapItinerary, { trip, journey: null, activeDay: day.index, budgetMin: 25, selectedStop: null, allDays: false, onShowAll: noop, onDayChange: noop, onSelect: noop, onFold: noop, budgetBar: { text: text ?? '', step: 2 } }))
  expect(html).toContain('aria-valuetext="Detour 4 / 25 min"')
  expect(plannedDriveBudget(day.stops, projection.rows.filter(row => row.stopId !== day.stops[0].id), 25)).toEqual({ kind: 'unknown', usedMin: null, budgetMin: 25 })
  expect(plannedDriveBudget([], projection.rows, 25)).toEqual({ kind: 'empty', usedMin: null, budgetMin: 25 })
})

it('the real route advice reaches the real Fix panel with Apply and Keep, without a false preview', () => {
  const { trip, lenses } = model()
  const props: MapLensPanelProps = {
    lens: 'fix', lenses, dayLabel: 'Day 3', dayNumber: 3, clock,
    activeDriveTab: null, onDriveTab: noop, stripOf: row => driveCardStrip(row, clock), bandOf: () => 'inside', introOf: () => null,
    onOpenDrive: noop, onAddDrive: noop, activeStayWindow: null, onStayWindow: noop, stayRing: 'walk-15', onStayRing: noop,
    onOpenStayPick: noop, onAddStayPick: noop, onSetStay: noop, onOpenGapPick: noop, onAddGapPick: noop, onApplyFix: noop, onPreviewFix: noop,
    routeAdvice: travelDayAdviceFor(advicePlan(), trip.days.length, { onApply: noop, onKeep: noop }),
  }
  const html = renderToStaticMarkup(createElement(MapLensPanel, props))
  expect(html).toContain(`>Add ${advicePlan().dayCount - trip.days.length} days<`)
  expect(html).not.toContain('Apply - add')
  expect(html).toContain('Keep my 1-day plan')
  expect(html).toContain('New days · Empty · Existing dates unchanged')
  expect(html).not.toContain('Preview added days')
  expect(html).not.toContain('No safe fix was found')
  expect(renderToStaticMarkup(createElement(TravelDayAdvice, { currentDays: 3, neededDays: 3, onApply: noop, onKeep: noop }))).toBe('')
  const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  expect(source).not.toContain('splitPreview')
  expect(source).toContain('travelDayAdviceFor(drivingPlan, trip.days.length')
})

it('the scope count equals in-scope picks rendered from the real lens producer across its tabs', () => {
  const { lenses, slots } = model()
  const held = new Set<string>()
  const bands = lenses.drive.view.rows.map(row => scopeBandOf(row, 30, held))
  const counts = bandCounts(bands)
  const result = driveTabs(lenses.drive.view, slots, 100)
  const html = result.tabs.map(tab => renderToStaticMarkup(createElement(DriveTabs, {
    result, activeTab: tab.tab, onTab: noop, intro: null, stripOf: row => driveCardStrip(row, clock),
    bandOf: row => scopeBandOf(row, 30, held), nameOf: row => row.row.hit.name, onOpen: noop, onAdd: noop, dayNumber: 3,
  }))).join('')
  expect(counts.inside).toBeGreaterThan(0)
  expect((html.match(/data-scope-band="inside"/g) ?? []).length).toBe(counts.inside)
  expect(renderToStaticMarkup(createElement(MapScopeBand, { minutes: 30, onMinutes: noop, counts }))).toContain(`Fits: ${counts.inside}`)
})

it('keeps the clock out of the phone sheet and route advice in Fix', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const page = read('../src/pages/trip/MapTab.tsx')
  expect(page).not.toContain('Search settings and route advice')
  expect(page).not.toContain('ribbonSheet')
  expect(page).toContain("loadFlag('map_ribbon', false)")
  expect(page).toContain('ribbonOpen || openPreview != null || activeFixPreview != null')
  const tools = read('../src/components/TripMap.tsx')
  expect(tools).toContain('aria-label="Layers"')
  expect(tools).toContain('aria-label="More map tools"')
  expect(tools).toContain('bearing !== 0')
  expect(tools).not.toContain('<MapPhoneLocate')
})

it('counts independent alternatives the same when provider order changes', () => {
  const rows = [20, 10, 10, 0, 0, 0, 0, 0].map((detourMin, index) => ({ id: String(index), detourMin }))
  expect(splitByDetourBudget(rows, 25).within).toHaveLength(6)
  expect(splitByDetourBudget([rows[1], rows[2], rows[0], ...rows.slice(3)], 25).within).toHaveLength(7)
  const forward = overBudgetAlternativeIds(rows, 25)
  const reversed = overBudgetAlternativeIds([...rows].reverse(), 25)
  expect(forward).toEqual(reversed)
  expect(rows.filter(row => !forward.has(row.id))).toHaveLength(8)
  expect(overBudgetAlternativeIds([{ id: 'unknown', detourMin: null }, { id: 'too-far', detourMin: 26 }], 25)).toEqual(new Set(['too-far']))
})

function advicePlan() {
  return deriveDrivingPlan({ totalKm: 1800, driveMinutes: 1800, dayStart: '05:00', travelStyle: 'balanced', transportMode: 'car' })
}

it('compares each known candidate with the budget left after planned stops', () => {
  const held = overBudgetAlternativeIds([{ id: 'ten', detourMin: 10 }, { id: 'four', detourMin: 4 }], 25, 20)
  expect(held).toEqual(new Set(['ten']))
  const base = model().lenses.drive.view.rows[0]
  expect(scopeBandOf({ ...base, row: { ...base.row, hit: { ...base.row.hit, id: 'ten' } }, detourMin: 10 }, 30, held)).toBe('over-budget')
  expect(scopeBandOf({ ...base, row: { ...base.row, hit: { ...base.row.hit, id: 'four' } }, detourMin: 4 }, 30, held)).toBe('inside')
})

it('keeps an unknown detour separate, visible and available to add', () => {
  const { lenses, slots } = model()
  const row = { ...lenses.drive.view.rows[0], detourMin: null, budgetSharePct: 150 }
  const held = overBudgetAlternativeIds([{ id: String(row.row.hit.id), detourMin: null }], 25, 20)
  const band = scopeBandOf(row, 30, held)
  expect(band).toBe('unknown')
  expect(bandCounts([band])).toMatchObject({ inside: 0, justPast: 0, worthDetour: 0 })
  const result = driveTabs({ ...lenses.drive.view, rows: [row] }, slots, 100)
  const html = result.tabs.map(tab => renderToStaticMarkup(createElement(DriveTabs, {
    result, activeTab: tab.tab, onTab: noop, intro: null, stripOf: item => driveCardStrip(item, clock),
    bandOf: item => scopeBandOf(item, 30, held), nameOf: item => item.row.hit.name, onOpen: noop, onAdd: noop, dayNumber: 3,
  }))).join('')
  expect(html).toContain('Detour · Not measured')
  expect(html).not.toContain('disabled=')
  expect(html).not.toContain('over today')
  expect(html).not.toContain('150%')
})

it('names known, unknown, empty and over-limit planned budgets', () => {
  const { trip, projection } = model()
  const day = trip.days[0]
  expect(driveBudgetBarText(plannedDriveBudget(day.stops, projection.rows, 25))).toBe('Detour 4 / 25 min')
  expect(driveBudgetBarText(plannedDriveBudget(day.stops, [], 25))).toBe('Detour · Not measured')
  expect(driveBudgetBarText(plannedDriveBudget([], [], 25))).toBe('Detour · No stops')
  expect(driveBudgetBarText({ kind: 'known', usedMin: 78, budgetMin: 25 })).toBe('Detour 78 / 25 min · 53 min over')
})

it('applies real driving advice through the writer and restores the old days on Undo', () => {
  const { trip } = model()
  const original = structuredClone(trip)
  const writes: Parameters<ApplyChange>[] = []
  const writer: ApplyChange = (...args) => { writes.push(args) }
  const ready = vi.fn<(undo: () => void) => void>()
  expect(applyTravelDays(trip, advicePlan(), writer, ready)).toBe(true)
  expect(writes[0][1]).toBe('add')
  writes[0][0](trip)
  expect(trip.days.length).toBe(advicePlan().dayCount)
  expect(ready).not.toHaveBeenCalled()
  writes[0][3]?.()
  expect(ready).not.toHaveBeenCalled()
  writes[0][3]?.({ kind: 'acknowledged', revision: 'saved', writeVersion: 1 })
  const added = trip.days[1]
  trip.days[1] = { stops: added.stops, startTime: added.startTime, title: added.title, index: added.index, id: added.id }
  ready.mock.calls[0][0]()
  expect(writes[1][1]).toBe('edit')
  writes[1][0](trip)
  expect(trip).toEqual(original)
})

it('keeps changed added days when Undo would remove later work', () => {
  const { trip } = model()
  const writes: Parameters<ApplyChange>[] = []
  const writer: ApplyChange = (...args) => { writes.push(args) }
  const ready = vi.fn<(undo: () => void) => void>()
  applyTravelDays(trip, advicePlan(), writer, ready)
  writes[0][0](trip)
  writes[0][3]?.({ kind: 'acknowledged', revision: 'saved', writeVersion: 1 })
  trip.days[1].title = 'Changed after Apply'
  ready.mock.calls[0][0]()
  const beforeUndo = structuredClone(trip)
  expect(() => writes[1][0](trip)).toThrow('The added days changed')
  expect(trip).toEqual(beforeUndo)
})

it('renders explicit unknown and empty rail text without a progress bar', () => {
  const { trip } = model()
  for (const [stops, message] of [[trip.days[0].stops, 'Detour · Not measured'], [[], 'Detour · No stops']] as const) {
    const budget = plannedDriveBudget(stops, [], 25)
    const text = driveBudgetBarText(budget) ?? ''
    const html = renderToStaticMarkup(createElement(MapItinerary, {
      trip, journey: null, activeDay: trip.days[0].index, budgetMin: 25, selectedStop: null, allDays: false,
      onShowAll: noop, onDayChange: noop, onSelect: noop, onFold: noop,
      budgetBar: { text, step: driveBudgetStep(budget.usedMin, budget.budgetMin) },
    }))
    expect(html).toContain(message)
    expect(html).not.toContain('role="progressbar"')
  }
})


it.each(['flight', 'commitment'] as const)('keeps added days referenced by a later %s', kind => {
  const { trip } = model()
  const writes: Parameters<ApplyChange>[] = []
  const writer: ApplyChange = (...args) => { writes.push(args) }
  const ready = vi.fn<(undo: () => void) => void>()
  applyTravelDays(trip, advicePlan(), writer, ready)
  writes[0][0](trip)
  writes[0][3]?.({ kind: 'acknowledged', revision: 'saved', writeVersion: 1 })
  const dayIndex = trip.days[1].index
  if (kind === 'flight') trip.flights = [{ id: 'new-flight', dayIndex, fromAirport: 'GOI', toAirport: 'BOM' }]
  else trip.fixedCommitments.push({ id: 'new-event', dayIndex, title: 'Event', type: 'event', time: '12:00' })
  ready.mock.calls[0][0]()
  const beforeUndo = structuredClone(trip)
  expect(() => writes[1][0](trip)).toThrow('The added days changed')
  expect(trip).toEqual(beforeUndo)
})


it('keeps measured Fix travel evidence as compact labels with both original facts', async () => {
  const { formatFixEvidence } = await import('../src/pages/trip/map/fixLens')
  expect(formatFixEvidence('About 10h 25m of driving/transit across 626 km.', value => value)).toBe('Travel 10h 25m · Distance 626 km')
})

it('spends the detour budget only on planned detour stops', () => {
  const stop = (id: string, extra: Record<string, unknown> = {}) => ({ id, status: 'confirmed' as const, ...extra })
  const row = (stopId: string, detourMin: number | null, onCorridor?: boolean) => ({ stopId, detourMin, ...(onCorridor == null ? {} : { onCorridor }) })
  // A stay, an anchor and an on-route stop are destinations, not detours.
  expect(plannedDriveBudget(
    [stop('start', { auto: true }), stop('lonavala'), stop('pick'), stop('hotel', { category: 'hotel' })],
    [row('start', null, false), row('lonavala', null, false), row('pick', 8, true), row('hotel', null, false)],
    25,
  )).toEqual({ kind: 'known', usedMin: 8, budgetMin: 25 })
  // Only destinations: no detour stops yet.
  expect(plannedDriveBudget([stop('lonavala'), stop('hotel', { category: 'hotel' })], [row('lonavala', null, false), row('hotel', null, false)], 25))
    .toEqual({ kind: 'empty', usedMin: null, budgetMin: 25 })
  // A detour stop without its cost makes the spend unknown.
  expect(plannedDriveBudget([stop('pick')], [row('pick', null, true)], 25)).toEqual({ kind: 'unknown', usedMin: null, budgetMin: 25 })
})

it('holds back alternatives against the budget left, and claims nothing when the spend is unknown', () => {
  const rows = [{ id: 'ten', detourMin: 10 }, { id: 'four', detourMin: 4 }, { id: 'open', detourMin: null }]
  expect([...budgetHeldAlternativeIds([{ budgetMin: 25, planned: { kind: 'known', usedMin: 20, budgetMin: 25 }, rows }])]).toEqual(['ten'])
  expect([...budgetHeldAlternativeIds([{ budgetMin: 25, planned: { kind: 'empty', usedMin: null, budgetMin: 25 }, rows }])]).toEqual([])
  expect([...budgetHeldAlternativeIds([{ budgetMin: 25, planned: { kind: 'unknown', usedMin: null, budgetMin: 25 }, rows: [{ id: 'big', detourMin: 40 }] }])]).toEqual([])
})

it('counts one place once and states the scope only when the spend is unknown', () => {
  expect(distinctPlaceBands([{ id: 'a', band: 'inside' }, { id: 'a', band: 'inside' }, { id: 'a', band: 'inside' }, { id: 'b', band: 'outside' }]))
    .toEqual(['inside', 'outside'])
  expect(scopeCountText({ inside: 4, justPast: 0, worthDetour: 0 }, 30, true)).toBe('Fits: 4')
  expect(scopeCountText({ inside: 4, justPast: 0, worthDetour: 0 }, 30, false)).toBe('Within 30 min: 4')
})

it('wires MapTab through the tested budget walk, the distinct count and the travel-day writer', () => {
  const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  expect(source).toContain('const heldIds = budgetHeldAlternativeIds(walks)')
  expect(source).toContain('planned: plannedDriveBudget(day?.dayStops ?? [], day?.projection.rows ?? [], budget, corridorReady)')
  expect(source).toContain('bandCounts(distinctPlaceBands(')
  expect(source).toContain("budgetKnown={driveBudget.kind !== 'unknown'}")
  expect(source).toContain('applyTravelDays(trip, drivingPlan, applyChange')
  expect(source).not.toContain('overBudgetAlternativeIds(')
})

it('treats a stop with no corridor row as on the route only after the scan answered', () => {
  const stops = [{ id: 'karla', status: 'confirmed' as const }]
  expect(plannedDriveBudget(stops, [], 25, true)).toEqual({ kind: 'empty', usedMin: null, budgetMin: 25 })
  expect(plannedDriveBudget(stops, [], 25, false)).toEqual({ kind: 'unknown', usedMin: null, budgetMin: 25 })
  const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  expect(source).toContain("const corridorReady = corridorStatusFor({ quota: scanQuotaOut, scanFailed, loading: loadingPois }) === 'ready'")
  expect(source).toContain('plannedDriveBudget(activeDayStops, journeyDay?.projection.rows ?? [], mapBudget, corridorReady)')
})
