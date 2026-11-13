import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import { simulateDay } from '../src/lib/engine'
import { filledStopClock } from '../src/pages/trip/map/driveLens'
import { driveBudgetBarText, driveBudgetDetailText } from '../src/pages/trip/map/LensRailExtras'
import { FixDeck } from '../src/components/map/lenses/FixDeck'

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

it('names the alternatives total and the amount over the limit', () => {
  expect(driveBudgetBarText({ usedMin: 491, budgetMin: 25, freeStops: 6 }))
    .toBe('466 min over the 25 min limit')
  expect(driveBudgetDetailText({ usedMin: 491, budgetMin: 25, freeStops: 6 })).toContain('All suggestions add 491 min.')
})

it('offers route advice in Fix instead of claiming no fix exists', () => {
  const html = renderToStaticMarkup(createElement(FixDeck, {
    phase: 'ready', dayNumber: 1, problem: { title: 'Needs 3 travel days', evidence: [], foundBy: 'travel check' },
    fixes: [], onApply: () => undefined, onPreview: () => undefined,
    routeAdvice: createElement('button', null, 'Preview added days'),
  }))
  expect(html).toContain('Preview added days')
  expect(html).not.toContain('No safe fix was found')
})

it('keeps the clock out of the phone sheet and route advice in Fix', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const page = read('../src/pages/trip/MapTab.tsx')
  expect(page).not.toContain('Search settings and route advice')
  expect(page).not.toContain('ribbonSheet')
  expect(page).toContain("loadFlag('map_ribbon', false)")
  expect(page).toContain('ribbonOpen || openPreview != null || activeFixPreview != null || splitPreview')
  const tools = read('../src/components/TripMap.tsx')
  expect(tools).toContain('aria-label="Layers"')
  expect(tools).toContain('aria-label="More map tools"')
  expect(tools).toContain('bearing !== 0')
  expect(tools).not.toContain('<MapPhoneLocate')
})
