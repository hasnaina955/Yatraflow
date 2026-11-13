import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { splitByDetourBudget } from '../src/lib/detourBudget'
import { seedData } from '../src/data/seed'
import { simulateDay } from '../src/lib/engine'
import { filledStopClock } from '../src/pages/trip/map/driveLens'
import { driveBudgetBarText, plannedDriveBudget } from '../src/pages/trip/map/LensRailExtras'
import { TravelDayAdvice } from '../src/components/map/lenses/TravelDayAdvice'
import { MapItinerary } from '../src/components/map/MapWorkspaceChrome'
import { MapLensPanel, type MapLensPanelProps } from '../src/pages/trip/map/MapLensPanel'
import { mapLensesFor } from '../src/pages/trip/map/useMapLenses'
import { projectJourney } from '../src/lib/journeyProjection'
import { journeyFixture } from './helpers/journeyProjectionFixture'
import { bandCounts, MapScopeBand } from '../src/pages/trip/map/MapScopeBand'
import { scopeBandOf, overBudgetAlternativeIds, driveTabs, driveCardStrip } from '../src/pages/trip/map/driveLens'
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
  expect(budget).toEqual({ usedMin: 12, budgetMin: 25 })
  expect(budget?.usedMin).toBe(projection.rows.filter(row => row.stopId != null).reduce((sum, row) => sum + (row.detourMin ?? 0), 0))
  const text = driveBudgetBarText(budget)
  expect(text).toBe('12 of 25 min detour used')
  const html = renderToStaticMarkup(createElement(MapItinerary, { trip, journey: null, activeDay: day.index, budgetMin: 25, selectedStop: null, allDays: false, onShowAll: noop, onDayChange: noop, onSelect: noop, onFold: noop, budgetBar: { text: text ?? '', step: 2 } }))
  expect(html).toContain('aria-valuetext="12 of 25 min detour used"')
  expect(plannedDriveBudget(day.stops, projection.rows.filter(row => row.stopId !== day.stops[1].id), 25)).toBeNull()
  expect(plannedDriveBudget([], projection.rows, 25)).toEqual({ usedMin: 0, budgetMin: 25 })
})

it('the real route advice reaches the real Fix panel with Apply and Keep, without a false preview', () => {
  const { trip, lenses } = model()
  const props: MapLensPanelProps = {
    lens: 'fix', lenses, dayLabel: 'Day 3', dayNumber: 3, clock,
    activeDriveTab: null, onDriveTab: noop, stripOf: row => driveCardStrip(row, clock), bandOf: () => 'inside', introOf: () => null,
    onOpenDrive: noop, onAddDrive: noop, activeStayWindow: null, onStayWindow: noop, stayRing: 'walk-15', onStayRing: noop,
    onOpenStayPick: noop, onAddStayPick: noop, onSetStay: noop, onOpenGapPick: noop, onAddGapPick: noop, onApplyFix: noop, onPreviewFix: noop,
    routeAdvice: createElement(TravelDayAdvice, { currentDays: trip.days.length, neededDays: 3, onApply: noop, onKeep: noop }),
  }
  const html = renderToStaticMarkup(createElement(MapLensPanel, props))
  expect(html).toContain('Apply - add 2 days')
  expect(html).toContain('Keep my 1-day plan')
  expect(html).toContain('Existing stops keep their dates.')
  expect(html).not.toContain('Preview added days')
  expect(html).not.toContain('No safe fix was found')
  expect(renderToStaticMarkup(createElement(TravelDayAdvice, { currentDays: 3, neededDays: 3, onApply: noop, onKeep: noop }))).toBe('')
  const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  expect(source).not.toContain('splitPreview')
  expect(source).toContain('onApply={applySplitDays}')
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
  expect(renderToStaticMarkup(createElement(MapScopeBand, { minutes: 30, onMinutes: noop, counts }))).toContain(`${counts.inside} fit`)
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
  expect(overBudgetAlternativeIds([{ id: 'unknown', detourMin: null }, { id: 'too-far', detourMin: 26 }], 25)).toEqual(new Set(['unknown', 'too-far']))
})
