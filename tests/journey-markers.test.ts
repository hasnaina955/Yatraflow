// ============ journeyMarkers — pins for a day's synthesized endpoints ============
// A single day's drawn line follows the engine's journey, which can begin at the
// previous night's place and end at a synthesized destination (the ride home, or
// the next planned stop). Pins, however, come only from that day's stored stops —
// so the line could start or end at a spot with no marker and read as "the route
// stops". These cases pin that the extra endpoint markers are produced, labelled
// honestly, and suppressed when a real stop already covers the place.
import { describe, expect, it } from 'vitest'
import { extraJourneyMarkers } from '../src/lib/journeyMarkers'
import type { JourneyPoint } from '../src/lib/engine'

/** Only kind/title/lat/lng/synthesized are read; the rest of JourneyPoint is irrelevant here. */
const pt = (over: Partial<JourneyPoint> & { lat: number; lng: number }): JourneyPoint =>
  ({ kind: 'visit', title: 'A place', synthesized: false, ...over }) as unknown as JourneyPoint

// Real coordinates from the trip this was reported against: Day 1 is the Jodhpur
// day, and its journey opens at the previous day's last stop near Jaipur.
const CHOWKI_DHANI = { lat: 26.759, lng: 75.808 }
const MEHRANGARH = { lat: 26.2980, lng: 73.0184 }

describe('extraJourneyMarkers', () => {
  it('pins a synthesized day-start that no stop covers', () => {
    const points = [
      pt({ ...CHOWKI_DHANI, kind: 'start', title: 'Chowki Dhani village evening', synthesized: true }),
      pt({ ...MEHRANGARH, kind: 'visit', title: 'Mehrangarh Fort' }),
    ]
    expect(extraJourneyMarkers(points, [MEHRANGARH])).toEqual([
      { kind: 'start', label: 'Day start — Chowki Dhani village evening', position: CHOWKI_DHANI },
    ])
  })

  it('adds nothing when a plotted stop already covers the same place (under 1 km)', () => {
    const nearStop = { lat: CHOWKI_DHANI.lat + 0.004, lng: CHOWKI_DHANI.lng } // ~0.44 km
    const points = [
      pt({ ...CHOWKI_DHANI, kind: 'start', title: 'Chowki Dhani', synthesized: true }),
      pt({ ...MEHRANGARH, kind: 'visit' }),
    ]
    expect(extraJourneyMarkers(points, [nearStop, MEHRANGARH])).toEqual([])
  })

  it('still pins an endpoint a stop does not cover (past the 1 km rule)', () => {
    const farStop = { lat: CHOWKI_DHANI.lat + 0.03, lng: CHOWKI_DHANI.lng } // ~3.3 km
    const points = [pt({ ...CHOWKI_DHANI, kind: 'start', title: 'Chowki Dhani', synthesized: true })]
    expect(extraJourneyMarkers(points, [farStop])).toHaveLength(1)
  })

  it('labels a synthesized destination as the ride home only when the journey returns', () => {
    const home = { lat: 15.499, lng: 73.8282 }
    const points = [pt({ ...MEHRANGARH, kind: 'start' }), pt({ ...home, kind: 'destination', title: 'Home', synthesized: true })]
    expect(extraJourneyMarkers(points, [MEHRANGARH], 'return')).toEqual([
      { kind: 'destination', label: 'Ride home — Home', position: home },
    ])
    expect(extraJourneyMarkers(points, [MEHRANGARH], 'outbound')[0]?.label).toBe('Day destination — Home')
  })

  it('ignores synthesized points that are not the journey endpoints', () => {
    const mid = { lat: 26.5, lng: 74.5 }
    const points = [
      pt({ ...CHOWKI_DHANI, kind: 'start', title: 'Start' }),
      pt({ ...mid, kind: 'waypoint', title: 'Synthesized waypoint', synthesized: true }),
      pt({ ...MEHRANGARH, kind: 'visit' }),
    ]
    expect(extraJourneyMarkers(points, [CHOWKI_DHANI, MEHRANGARH])).toEqual([])
  })

  it('leaves stored (non-synthesized) endpoints to the normal pin layer', () => {
    const points = [
      pt({ ...CHOWKI_DHANI, kind: 'start', title: 'Real anchor' }),
      pt({ ...MEHRANGARH, kind: 'visit' }),
    ]
    expect(extraJourneyMarkers(points, [])).toEqual([])
  })

  it.each([
    ['the Null-Island sentinel', { lat: 0, lng: 0 }],
    ['a non-finite latitude', { lat: Number.NaN, lng: 74 }],
    ['an out-of-range latitude', { lat: 91, lng: 74 }],
  ])('refuses to pin a synthesized start with %s', (_name, bad) => {
    const points = [pt({ ...bad, kind: 'start', title: 'Bad', synthesized: true })]
    expect(extraJourneyMarkers(points, [])).toEqual([])
  })

  it('returns nothing for an empty journey', () => {
    expect(extraJourneyMarkers([], [])).toEqual([])
  })
})
