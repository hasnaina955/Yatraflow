import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  isActualTripDay, livePositionAllowed, deriveLiveLocationState,
  drawsLiveDot, resolveLiveCamera, LIVE_LOCATION_COPY, LIVE_FIX_STALE_MS,
  addDaysISO, toISODate,
  type LiveLocationState,
} from '../src/lib/liveLocation'

// Source guards read both line endings, per the source-contract rule.
const ROOT = new URL('../', import.meta.url)
function read(rel: string): string {
  return readFileSync(new URL(rel, ROOT), 'utf8').replace(/\r\n/g, '\n')
}

describe('ticket 23 AC1: opt-in and actual trip day', () => {
  const startDate = '2026-11-09'
  const endDate = '2026-11-12'

  it('accepts only dates inside the inclusive trip range', () => {
    expect(isActualTripDay(startDate, endDate, '2026-11-08')).toBe(false)
    expect(isActualTripDay(startDate, endDate, '2026-11-09')).toBe(true)
    expect(isActualTripDay(startDate, endDate, '2026-11-12')).toBe(true)
    expect(isActualTripDay(startDate, endDate, '2026-11-13')).toBe(false)
    expect(isActualTripDay(startDate, startDate, startDate)).toBe(true)
  })

  it('rejects malformed dates instead of drawing a dot', () => {
    expect(isActualTripDay('', endDate, '2026-11-09')).toBe(false)
    expect(isActualTripDay(startDate, endDate, '2026-11-09T10:00')).toBe(false)
    expect(isActualTripDay('2026-02-30', '2026-03-02', '2026-02-30')).toBe(false)
  })

  it('needs an opt-in', () => {
    expect(livePositionAllowed({ optedIn: false, startDate, endDate, today: '2026-11-10', focusDay: 'all' })).toBe(false)
  })
})

describe('ticket 23 AC3: future-day maps draw no position', () => {
  const base = { optedIn: true, startDate: '2026-11-09', endDate: '2026-11-12', today: '2026-11-10' }

  it('blocks a trip that has not started', () => {
    expect(livePositionAllowed({ ...base, startDate: '2026-12-01', endDate: '2026-12-04', focusDay: 'all' })).toBe(false)
  })

  it('blocks a focus on a future day', () => {
    // Day 2 starts 2026-11-11, after today 2026-11-10.
    expect(livePositionAllowed({ ...base, focusDay: 2 })).toBe(false)
    expect(livePositionAllowed({ ...base, focusDay: 3 })).toBe(false)
  })

  it('draws on the whole trip, on today, and on a past day', () => {
    expect(livePositionAllowed({ ...base, focusDay: 'all' })).toBe(true)
    expect(livePositionAllowed({ ...base, focusDay: undefined })).toBe(true)
    expect(livePositionAllowed({ ...base, focusDay: 1 })).toBe(true)
    expect(livePositionAllowed({ ...base, focusDay: 0 })).toBe(true)
  })
})

describe('ticket 23 AC2: distinguishable states', () => {
  const ok = {
    optedIn: true, dayAllowed: true, supported: true,
    hasFix: false, fixAgeMs: null as number | null,
    staleAfterMs: LIVE_FIX_STALE_MS, error: null as 'denied' | 'failed' | null,
  }

  it('keeps off, unavailable, locating, denied, failed, stale and live apart', () => {
    expect(deriveLiveLocationState({ ...ok, optedIn: false })).toBe('off')
    expect(deriveLiveLocationState({ ...ok, dayAllowed: false })).toBe('off')
    expect(deriveLiveLocationState({ ...ok, supported: false })).toBe('unavailable')
    expect(deriveLiveLocationState({ ...ok })).toBe('locating')
    expect(deriveLiveLocationState({ ...ok, error: 'denied' })).toBe('denied')
    expect(deriveLiveLocationState({ ...ok, error: 'failed', hasFix: true, fixAgeMs: 0 })).toBe('failed')
    expect(deriveLiveLocationState({ ...ok, hasFix: true, fixAgeMs: LIVE_FIX_STALE_MS + 1 })).toBe('stale')
    expect(deriveLiveLocationState({ ...ok, hasFix: true, fixAgeMs: LIVE_FIX_STALE_MS - 1 })).toBe('live')
  })

  it('gives denied, unavailable and stale different status lines', () => {
    const lines = [LIVE_LOCATION_COPY.denied, LIVE_LOCATION_COPY.unavailable, LIVE_LOCATION_COPY.stale]
    expect(new Set(lines).size).toBe(3)
    expect(lines.every(Boolean)).toBe(true)
  })

  it('gives every non-off state its own status line', () => {
    const states: LiveLocationState[] = ['unavailable', 'locating', 'denied', 'failed', 'stale', 'live']
    expect(new Set(states.map(s => LIVE_LOCATION_COPY[s])).size).toBe(states.length)
  })

  it('never draws a dot without a fix', () => {
    const empty: LiveLocationState[] = ['off', 'unavailable', 'locating', 'denied']
    for (const s of empty) expect(drawsLiveDot(s)).toBe(false)
    expect(drawsLiveDot('live')).toBe(true)
    expect(drawsLiveDot('stale')).toBe(true)
    expect(drawsLiveDot('failed')).toBe(true)
  })
})

describe('ticket 23 AC4: manual recenter restores the view', () => {
  it('stops the follow after a pan and starts it again on recenter', () => {
    expect(resolveLiveCamera({ hasFix: true, userPanned: false, recentered: false })).toEqual({ follow: true, clearPan: false })
    expect(resolveLiveCamera({ hasFix: true, userPanned: true, recentered: false })).toEqual({ follow: false, clearPan: false })
    expect(resolveLiveCamera({ hasFix: true, userPanned: true, recentered: true })).toEqual({ follow: true, clearPan: true })
    expect(resolveLiveCamera({ hasFix: false, userPanned: false, recentered: true })).toEqual({ follow: false, clearPan: false })
  })
})

describe('ticket 23: date helpers', () => {
  it('adds days across a month and a leap day without clock drift', () => {
    expect(addDaysISO('2026-11-09', 0)).toBe('2026-11-09')
    expect(addDaysISO('2026-11-09', 3)).toBe('2026-11-12')
    expect(addDaysISO('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysISO('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDaysISO('2026-11-12', -3)).toBe('2026-11-09')
  })

  it('reads a local calendar date', () => {
    expect(toISODate(new Date(2026, 10, 9, 23, 30))).toBe('2026-11-09')
  })
})

describe('ticket 23 AC5: private and no persistence', () => {
  const src = read('src/components/TripMap.tsx')
  const start = src.indexOf('function LiveLocationLayer(')
  const end = src.indexOf('\nfunction ', start + 1)
  const layer = src.slice(start, end === -1 ? undefined : end)
  const helpers = read('src/lib/liveLocation.ts')

  it('uses the gate, the state derivation and the camera rule in the layer', () => {
    expect(start).toBeGreaterThanOrEqual(0)
    expect(layer).toContain('livePositionAllowed(')
    expect(layer).toContain('deriveLiveLocationState(')
    expect(layer).toContain('resolveLiveCamera(')
    expect(layer).toContain('drawsLiveDot(')
  })

  it('writes no position to a store, a network, a log or a URL', () => {
    const forbidden = [
      /\bfetch\s*\(/, /\bconsole\./, /\blocalStorage\b/, /\bsessionStorage\b/,
      /\bsendBeacon\b/, /\buseStore\b/, /\bsetTrip\b/, /\bpersist\b/,
      /\bXMLHttpRequest\b/, /https?:\/\//,
    ]
    for (const re of forbidden) {
      expect(re.test(layer)).toBe(false)
      expect(re.test(helpers)).toBe(false)
    }
  })

  it('stops the watch when the gate closes', () => {
    expect(layer).toContain('handle.stop()')
    expect(layer).toMatch(/if\s*\(!active\s*\|\|\s*!dayAllowed/)
  })

  it('wires manual recenter to the live layer at the call site', () => {
    expect(src).toMatch(/<LiveLocationLayer[^>]*recenterSignal=/)
    expect(src).toMatch(/setLiveRecenterNonce\(/)
  })
})
