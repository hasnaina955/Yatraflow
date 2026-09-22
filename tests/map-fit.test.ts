// ============ Map fit: the viewport frames the DRAWING, not just the pins ============
// The reported bug (measured in a browser, 2026-09-22): clicking Day 2 of the
// sample Rajasthan trip glued the camera to a zoom-12 cluster of the day's two
// Jodhpur stops while the day's actual road — 280 km back to the previous
// night's town — ran 16,000 px outside the canvas, endpoint flag and all. The
// fit used to bounds ONLY the plotted stops; it now bounds every point the
// view draws (stops ∪ journey chain ∪ shown return-home pin), through the one
// helper both the auto-fit and the Recentre button call.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boundsOf } from '../src/lib/mapFit'
import { seedData } from '../src/data/seed'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tripMapSrc = readFileSync(join(root, 'src', 'components', 'TripMap.tsx'), 'utf8')

// The reported case as it really is (corrected seed coordinates): BOTH stops
// of Day 2 sit inside Jodhpur, ~700 m apart, while the drawn journey opens at
// the previous night's town near Jaipur — buildJourney's synthesized start.
const DAY2_STOPS = [
  { lat: 26.2980, lng: 73.0184 }, // Mehrangarh Fort
  { lat: 26.2935, lng: 73.0270 }, // Toorji ka Jhalra stepwell café hop
]
const DAY2_JOURNEY_START = { lat: 26.759, lng: 75.808 } // Chowki Dhani (synthesized "Day start")

describe('boundsOf', () => {
  it('stop-only bounds are the bug: a 0.01° cluster that would frame at maxZoom', () => {
    const b = boundsOf(DAY2_STOPS)!
    expect(b[1][0] - b[0][0]).toBeLessThan(0.02) // ~1.7 km of longitude
  })

  it('the drawn extent includes the journey origin 280 km away (the regression)', () => {
    const drawn = boundsOf([DAY2_JOURNEY_START, ...DAY2_STOPS])!
    expect(drawn[1][0]).toBeCloseTo(75.808, 4) // Jaipur side inside the box
    expect(drawn[1][0] - drawn[0][0]).toBeGreaterThan(2.7) // Jaipur → Jodhpur span
  })

  it('empty (or all-non-finite) is null; a single point gets the ~0.08° pad', () => {
    expect(boundsOf([])).toBeNull()
    expect(boundsOf([{ lat: NaN, lng: NaN }, { lat: Infinity, lng: 73 }])).toBeNull()
    const single = boundsOf([{ lat: 26.3, lng: 73.0 }])!
    expect(single[1][0] - single[0][0]).toBeCloseTo(0.16, 5)
    expect(single[1][1] - single[0][1]).toBeCloseTo(0.16, 5)
    // a non-finite coordinate is skipped, not allowed to poison the comparisons
    expect(boundsOf([{ lat: 26.3, lng: 73.0 }, { lat: NaN, lng: NaN }])).toEqual(single)
  })
})

describe('TripMap fits through the one helper', () => {
  it('both fit paths call boundsOf(fitPoints); the old inline min/max walk is gone', () => {
    expect(tripMapSrc).toContain("from '../lib/mapFit'")
    expect(tripMapSrc.match(/boundsOf\(fitPoints\)/g)?.length, 'auto-fit effect + Recentre button').toBe(2)
    expect(tripMapSrc).not.toContain('maxLng - minLng < 1e-4')
    expect(tripMapSrc).not.toContain('let minLng = Infinity')
  })

  it('the fit extent composes stops with the journey chain (not stops alone)', () => {
    // Scoped to the fitPoints memo: dayRoutePoints also appears in the
    // Directions URL, so a bare toContain passes even if the fit drops the
    // journey (falsified — the first version of this pin did exactly that).
    const memo = /const fitPoints = useMemo\(\(\) => \{[\s\S]*?\}, \[allPoints/.exec(tripMapSrc)
    expect(memo, 'fitPoints memo missing or reshaped').not.toBeNull()
    expect(memo![0], 'fitPoints must fold the day\u2019s journey chain in').toContain('dayRoutePoints[String(dayFilter)]')
  })

  it('a plane badge only appears for a flight trip — a road start is an origin dot, not an airport', () => {
    const lines = tripMapSrc.split(/\r?\n/)
    const planes = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.includes('<PlaneTakeoff'))
    expect(planes.length, 'both badges (auto stop + day-start flag) are gated').toBe(2)
    for (const { l, i } of planes) {
      // the gate sits on this line or the one directly above it
      expect([lines[i - 1] ?? '', l].join(' '), `ungated PlaneTakeoff: ${l.trim()}`).toContain("'flight'")
    }
    expect(tripMapSrc).toContain('<CircleDot size={13} aria-hidden />')
  })
})

describe('the seeded Mehrangarh sits on the fort', () => {
  // The shipped seed carried lng 73.0351 — 1.6 km EAST of the fort, outside
  // its OSM way's bbox, reverse-geocoding to a road in Paota. A pin drawn
  // there reads as "in a weird spot" against any basemap the reader knows.
  it('is inside OSM way 31725311 (26.2961–26.2999 / 73.0160–73.0201)', () => {
    const trip = seedData.trips.find(t => t.name.includes('Rajasthan'))
    expect(trip, 'sample Rajasthan trip missing from the seed').toBeTruthy()
    const fort = trip!.days.flatMap(d => d.stops).find(s => s.title === 'Mehrangarh Fort')
    expect(fort, 'Mehrangarh stop missing from the sample trip').toBeTruthy()
    expect(fort!.lat).toBeGreaterThanOrEqual(26.2961)
    expect(fort!.lat).toBeLessThanOrEqual(26.2999)
    expect(fort!.lng).toBeGreaterThanOrEqual(73.0160)
    expect(fort!.lng).toBeLessThanOrEqual(73.0201)
  })
})
