import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import { simulateDay } from '../src/lib/engine'
import { filledStopClock } from '../src/pages/trip/map/driveLens'
import { driveBudgetBarText } from '../src/pages/trip/map/LensRailExtras'
import { FixDeck } from '../src/components/map/lenses/FixDeck'

it('reads the filled stop clock from the actual day schedule', () => {
  const trip = structuredClone(seedData.trips[0])
  const schedule = simulateDay(trip.days[0], trip, { lat: 18.9388, lng: 72.8354 }, trip.days[0].index)
  schedule.activeStops.forEach((stop, index) => expect(filledStopClock(schedule, stop.id)).toBe(schedule.arrivalTimes[index]))
  expect(filledStopClock(schedule, 'missing')).toBeNull()
  expect(filledStopClock(null, 'missing')).toBeNull()
  const source = readFileSync(new URL('../src/pages/trip/MapTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  expect(source).toContain('filledStopClock(journeyDay?.daySchedule')
})

it('names the alternatives total and the amount over the limit', () => {
  expect(driveBudgetBarText({ usedMin: 491, budgetMin: 25, freeStops: 6 }))
    .toBe('All suggestions add 491 min. 466 min over the 25 min limit. 6 picks fit on their own.')
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
