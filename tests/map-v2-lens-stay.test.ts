import { describe, expect, it } from 'vitest'
import type { LensPhase, StayLensOutput, StayLensRow } from '../src/lib/mapLensContracts'
import type { Trip } from '../src/data/types'
import {
  resolveStayBase,
  STAY_RINGS,
  WALK_KMH_ASSUMED,
  ROAD_FACTOR_ASSUMED,
  STAY_DAY_END_MIN,
  STAY_DAY_START_MIN,
  ringRadiusKm,
  ringPolygon,
  stayReach,
  stayWindows,
  stayPicks,
} from '../src/pages/trip/map/stayLens'

const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const evening = { startMin: 17 * 60, endMin: 21 * 60 }

type StopLike = { id: string; category: string; status: string; lat: number; lng: number }
type DayLike = { index: number; stops: StopLike[] }

function asTrip(days: DayLike[]): Pick<Trip, 'days'> {
  return { days } as unknown as Pick<Trip, 'days'>
}

function baseStop(over: Partial<StopLike> = {}): StopLike {
  return { id: 'x', category: 'sightseeing', status: 'confirmed', lat: 10, lng: 76, ...over }
}

function rowAt(latitude: number, longitude: number, visitMin: number | null): StayLensRow {
  return { row: { hit: { latitude, longitude }, visitMin }, detourMin: null, freshness: null } as unknown as StayLensRow
}

function viewOf(phase: LensPhase, rows: StayLensRow[]): StayLensOutput {
  return {
    kind: 'view',
    base: { kind: 'stop', stopId: 'h1', dayIndex: 0 },
    view: { phase, rows, degraded: null },
  }
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

describe('rule 1: resolveStayBase', () => {
  it('gives missing when this day has no hotel, even when the previous day has one', () => {
    const trip = asTrip([
      { index: 0, stops: [baseStop({ id: 'hotel-day0', category: 'hotel' })] },
      { index: 1, stops: [baseStop({ id: 'museum', category: 'museum' })] },
    ])
    expect(resolveStayBase(trip, 1)).toEqual({ kind: 'missing' })
  })

  it('skips a rejected hotel', () => {
    const trip = asTrip([
      { index: 0, stops: [baseStop({ id: 'rejected', category: 'hotel', status: 'rejected' })] },
    ])
    expect(resolveStayBase(trip, 0)).toEqual({ kind: 'missing' })
  })

  it('returns the last valid hotel on that day with its stop id', () => {
    const trip = asTrip([
      { index: 2, stops: [
        baseStop({ id: 'first', category: 'hotel' }),
        baseStop({ id: 'second', category: 'hotel', lat: 11, lng: 77 }),
        baseStop({ id: 'museum', category: 'museum' }),
      ] },
    ])
    expect(resolveStayBase(trip, 2)).toEqual({ kind: 'stop', stopId: 'second', dayIndex: 2 })
  })

  it('skips a hotel with no finite lat or lng', () => {
    const trip = asTrip([
      { index: 0, stops: [baseStop({ id: 'bad', category: 'hotel', lat: Number.NaN })] },
    ])
    expect(resolveStayBase(trip, 0)).toEqual({ kind: 'missing' })
  })

  it('reads only the day whose index matches the request', () => {
    const trip = asTrip([
      { index: 0, stops: [baseStop({ id: 'h0', category: 'hotel' })] },
      { index: 2, stops: [baseStop({ id: 'h2', category: 'hotel' })] },
    ])
    expect(resolveStayBase(trip, 0)).toEqual({ kind: 'stop', stopId: 'h0', dayIndex: 0 })
    expect(resolveStayBase(trip, 1)).toEqual({ kind: 'missing' })
    expect(resolveStayBase(trip, 2)).toEqual({ kind: 'stop', stopId: 'h2', dayIndex: 2 })
  })

  it('has no night-halt fallback, so a non-hotel stay stop gives missing', () => {
    const trip = asTrip([
      { index: 0, stops: [baseStop({ id: 'stay-slot', category: 'food' })] },
    ])
    expect(resolveStayBase(trip, 0)).toEqual({ kind: 'missing' })
  })
})

describe('rule 2: STAY_RINGS', () => {
  it('holds the 15 min walk ring and the 30 min drive ring', () => {
    expect(STAY_RINGS).toEqual([
      { id: 'walk-15', mode: 'walk', minutes: 15 },
      { id: 'drive-30', mode: 'drive', minutes: 30 },
    ])
  })
})

describe('rule 3: assumptions and ring radius', () => {
  it('uses the two assumed estimate values', () => {
    expect(WALK_KMH_ASSUMED).toBe(4.8)
    expect(ROAD_FACTOR_ASSUMED).toBe(1.3)
  })

  it('computes speed times minutes over 60 over the road factor', () => {
    expect(ringRadiusKm('walk', 15)).toBeCloseTo((4.8 * 15 / 60) / 1.3, 10)
    expect(ringRadiusKm('drive', 30)).toBeCloseTo((40 * 30 / 60) / 1.3, 10)
  })

  it('gives a positive radius for each declared ring', () => {
    for (const ring of STAY_RINGS) {
      expect(ringRadiusKm(ring.mode, ring.minutes)).toBeGreaterThan(0)
    }
  })
})

describe('rule 4: ringPolygon', () => {
  it('is closed and every point is one radius from the centre', () => {
    const centre = { lat: 10.1, lng: 76.3 }
    const radiusKm = 5
    const ring = ringPolygon(centre, radiusKm, 64)
    expect(ring.length).toBe(65)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    for (const [lng, lat] of ring) {
      const d = distanceKm(centre, { lat, lng })
      expect(Math.abs(d - radiusKm) / radiusKm).toBeLessThanOrEqual(0.005)
    }
  })

  it('honours a custom step count', () => {
    expect(ringPolygon({ lat: 0, lng: 0 }, 2, 12)).toHaveLength(13)
  })
})

describe('rule 5: stayReach', () => {
  it('rounds walk and drive minutes up from the road estimate', () => {
    const base = { lat: 10, lng: 76 }
    const place = { lat: 10, lng: 76.02 }
    const reach = stayReach(base, place)
    const roadKm = distanceKm(base, place) * ROAD_FACTOR_ASSUMED
    expect(reach.estimate).toBe(true)
    expect(reach.walkMin).toBe(Math.ceil((roadKm / WALK_KMH_ASSUMED) * 60))
    expect(reach.driveMin).toBe(Math.ceil((roadKm / 40) * 60))
    expect(Number.isInteger(reach.walkMin)).toBe(true)
    expect(Number.isInteger(reach.driveMin)).toBe(true)
  })

  it('gives zero minutes at the base and marks the result as an estimate', () => {
    const reach = stayReach({ lat: 10, lng: 76 }, { lat: 10, lng: 76 })
    expect(reach.walkMin).toBe(0)
    expect(reach.driveMin).toBe(0)
    expect(reach.estimate).toBe(true)
  })
})

describe('rule 6: stayWindows', () => {
  it('builds the free evening and before-you-leave windows', () => {
    expect(stayWindows({ arriveAtBaseMin: 17 * 60, leaveBaseMin: 9 * 60 + 30 })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: 17 * 60, endMin: STAY_DAY_END_MIN },
      { id: 'morning', label: 'Before you leave', startMin: STAY_DAY_START_MIN, endMin: 9 * 60 + 30 },
    ])
  })

  it('drops a window under 30 min', () => {
    expect(stayWindows({ arriveAtBaseMin: 21 * 60 - 20, leaveBaseMin: 7 * 60 + 20 })).toEqual([])
  })

  it('keeps a window exactly 30 min long', () => {
    expect(stayWindows({ arriveAtBaseMin: 20 * 60 + 30, leaveBaseMin: null })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: 20 * 60 + 30, endMin: STAY_DAY_END_MIN },
    ])
  })

  it('drops a window when its input is null', () => {
    expect(stayWindows({ arriveAtBaseMin: null, leaveBaseMin: null })).toEqual([])
  })

  it('sets the day end at 21:00 and the day start at 07:00', () => {
    expect(STAY_DAY_END_MIN).toBe(1260)
    expect(STAY_DAY_START_MIN).toBe(420)
  })
})

describe('rule 7: stayPicks', () => {
  it('returns needs-base when the output asks for a base', () => {
    const result = stayPicks({ kind: 'needs-base' }, { lat: 10, lng: 76 }, evening, clock)
    expect(result).toEqual({ kind: 'needs-base' })
  })

  it('returns the phase when the view is not ready', () => {
    const result = stayPicks(viewOf('scanning', []), { lat: 10, lng: 76 }, evening, clock)
    expect(result).toEqual({ kind: 'phase', phase: 'scanning' })
  })

  it('keeps the needs-base, phase and ready shapes apart', () => {
    const a = stayPicks({ kind: 'needs-base' }, { lat: 10, lng: 76 }, evening, clock)
    const b = stayPicks(viewOf('failed', []), { lat: 10, lng: 76 }, evening, clock)
    const c = stayPicks(viewOf('ready', [rowAt(10, 76, 60)]), { lat: 10, lng: 76 }, evening, clock)
    expect(a.kind).toBe('needs-base')
    expect(b.kind).toBe('phase')
    expect(c.kind).toBe('ready')
  })

  it('returns a ready shape with a fitting pick and fit text', () => {
    const rows = [rowAt(10, 76, 60)]
    const result = stayPicks(viewOf('ready', rows), { lat: 10, lng: 76 }, evening, clock)
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') {
      expect(result.picks).toHaveLength(1)
      expect(result.alsoCount).toBe(0)
      expect(result.picks[0].letter).toBe('A')
      expect(result.picks[0].fit?.fits).toBe(true)
      expect(result.picks[0].fitText).toMatch(/^Fits /)
    }
  })

  it('gives a null fit and a null fitText for a null visit', () => {
    const rows = [rowAt(10, 76, null)]
    const result = stayPicks(viewOf('ready', rows), { lat: 10, lng: 76 }, evening, clock)
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') {
      expect(result.picks).toHaveLength(1)
      expect(result.picks[0].fit).toBeNull()
      expect(result.picks[0].fitText).toBeNull()
    }
  })

  it('keeps input order and caps picks at 3', () => {
    const rows = [
      rowAt(10.001, 76.001, 30),
      rowAt(10.002, 76.002, 30),
      rowAt(10.003, 76.003, 30),
      rowAt(10.004, 76.004, 30),
      rowAt(10.005, 76.005, 30),
    ]
    const result = stayPicks(viewOf('ready', rows), { lat: 10, lng: 76 }, evening, clock)
    expect(result.kind).toBe('ready')
    if (result.kind === 'ready') {
      expect(result.picks).toHaveLength(3)
      expect(result.alsoCount).toBe(2)
      expect(result.picks.map(p => p.letter)).toEqual(['A', 'B', 'C'])
      expect(result.picks[0].row).toBe(rows[0])
      expect(result.picks[1].row).toBe(rows[1])
      expect(result.picks[2].row).toBe(rows[2])
    }
  })

  it('honours a custom cap', () => {
    const rows = [rowAt(10, 76, 30), rowAt(10.001, 76, 30), rowAt(10.002, 76, 30)]
    const result = stayPicks(viewOf('ready', rows), { lat: 10, lng: 76 }, evening, clock, 2)
    if (result.kind === 'ready') {
      expect(result.picks).toHaveLength(2)
      expect(result.alsoCount).toBe(1)
    }
  })

  it('skips a row with no finite place position', () => {
    const rows = [rowAt(10, 76, 30), rowAt(Number.NaN, 76, 30), rowAt(10.001, 76.001, 30)]
    const result = stayPicks(viewOf('ready', rows), { lat: 10, lng: 76 }, evening, clock)
    if (result.kind === 'ready') {
      expect(result.picks).toHaveLength(2)
      expect(result.alsoCount).toBe(0)
      expect(result.picks[0].row).toBe(rows[0])
      expect(result.picks[1].row).toBe(rows[2])
    }
  })

  it('uses walk minutes for a short walk and drive minutes for a long walk', () => {
    const near = rowAt(10, 76.004, 30)
    const far = rowAt(10, 76.03, 30)
    const result = stayPicks(viewOf('ready', [near, far]), { lat: 10, lng: 76 }, evening, clock)
    if (result.kind === 'ready') {
      const [nearPick, farPick] = result.picks
      expect(nearPick.reach.walkMin).toBeLessThanOrEqual(15)
      expect(nearPick.fit!.arriveMin - evening.startMin).toBe(nearPick.reach.walkMin)
      expect(farPick.reach.walkMin).toBeGreaterThan(15)
      expect(farPick.fit!.arriveMin - evening.startMin).toBe(farPick.reach.driveMin)
    }
  })
})
