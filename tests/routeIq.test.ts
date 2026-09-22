// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { measurableLegs, legMinutes, durationLabel, routeIq, routeIqLine, estimateLunchStop } from '../src/lib/routeIq'

const kochi = { name: 'Kochi, Kerala', lat: 9.9312, lng: 76.2673 }
const munnar = { name: 'Munnar, Kerala', lat: 10.0889, lng: 77.0595 }
const alleppey = { name: 'Alleppey, Kerala', lat: 9.4981, lng: 76.3388 }

describe('route IQ - what the road says while you are still choosing', () => {
  it('measures only the legs whose ends are both geocoded', () => {
    const legs = measurableLegs([kochi, { name: 'Somewhere typed', }, munnar])
    expect(legs).toHaveLength(0)          // the typed-only stop breaks the chain
    expect(measurableLegs([kochi, munnar, alleppey])).toHaveLength(2)
    expect(measurableLegs([kochi])).toHaveLength(0)
  })

  it('a leg is straight-line distance times the same road factor the bill uses', () => {
    const legs = measurableLegs([kochi, munnar])
    expect(legs).toHaveLength(1)
    // Kochi-Munnar is ~88 km as the crow flies; the road factor scales it
    expect(legs[0].km).toBeGreaterThan(90)
    expect(legs[0].km).toBeLessThan(140)
  })

  it('minutes come from the mode, and a nonsense mode cannot divide by zero', () => {
    expect(legMinutes(120, 'car')).toBe(Math.round((120 / 42) * 60))
    expect(legMinutes(120, 'motorcycle')).toBeGreaterThan(0)
    expect(legMinutes(120, 'nonsense' as never)).toBeGreaterThan(0)
  })

  it('durations read like the rest of the app', () => {
    expect(durationLabel(0)).toBe('0m')
    expect(durationLabel(45)).toBe('45m')
    expect(durationLabel(60)).toBe('1h')
    expect(durationLabel(220)).toBe('3h 40m')
  })

  it('reports the LONGEST hop, not a wall of numbers', () => {
    const iq = routeIq([kochi, munnar, alleppey], 'car')!
    expect(iq).not.toBeNull()
    expect(iq.longest.km).toBeGreaterThan(0)
    // the longer of the two hops is the one it names
    const hops = measurableLegs([kochi, munnar, alleppey]).map(l => l.km)
    expect(Math.max(...hops) - Math.min(...hops)).toBeGreaterThan(0)
    expect(iq.longest.km).toBe(Math.max(...hops))
  })

  it('says nothing when there is nothing to measure, or the hop is trivial', () => {
    expect(routeIq([], 'car')).toBeNull()
    expect(routeIq([kochi], 'car')).toBeNull()
    expect(routeIq([{ name: 'a', lat: 9.93, lng: 76.27 }, { name: 'b', lat: 9.931, lng: 76.271 }], 'car')).toBeNull()
  })

  it('notices when the day drive runs through lunch', () => {
    // a long hop starting at 8am crosses the window
    const far = { name: 'Udaipur, Rajasthan', lat: 24.5854, lng: 73.7125 }
    const iq = routeIq([kochi, far], 'car')!
    expect(iq.coversLunch).toBe(true)
    expect(routeIqLine(iq)).toContain('lunch')
    // a hop that clears the 30-minute floor but does not reach lunch
    const short = routeIq([{ name: 'A', lat: 9.93, lng: 76.27 }, { name: 'B', lat: 10.2, lng: 76.45 }], 'car')!
    expect(short).not.toBeNull()
    expect(short.coversLunch).toBe(false)
    expect(routeIqLine(short)).not.toContain('lunch')
  })

  it('lunch is where the clock lands, and names the leg destination', () => {
    const lunch = estimateLunchStop([kochi, munnar, alleppey], 'car')!
    expect(lunch).not.toBeNull()
    expect(lunch.title).toBe('Alleppey, Kerala')
    expect(lunch.atMin).toBeGreaterThanOrEqual(11 * 60 + 30)
    expect(lunch.atMin).toBeLessThanOrEqual(14 * 60 + 30)
    // a run whose clock never reaches the window says nothing
    expect(estimateLunchStop([{ name: 'A', lat: 9.93, lng: 76.27 }, { name: 'B', lat: 10.05, lng: 76.35 }], 'car')).toBeNull()
  })

  it('the line is honest about being an estimate - never a stated road time', () => {
    const line = routeIqLine(routeIq([kochi, munnar, alleppey], 'car')!)
    expect(line).toContain('Munnar')
    expect(line).toContain('rough')
    expect(line.toLowerCase()).toContain('straight-line')
    expect(line).not.toMatch(/exactly|precisely|guaranteed/)
  })
})
