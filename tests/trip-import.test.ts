// ============ Trip import: the two formats ============
// The bug this pins: a gallery file is `{ trip, publication }`, and the old
// import check looked for `days` on the OUTER object — so every shelf itinerary
// the repo's own gates had certified was rejected as "not a valid trip export".
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseTripImport, TripImportError } from '../src/lib/tripImport'

const SHELF = 'docs/examples/itineraries'

/** A minimal bare-Trip export, the v1 shape `downloadTripJson` writes. */
function bareExport() {
  return {
    id: 'trip-1',
    name: 'Goa weekend',
    startLocation: 'Panaji',
    destinations: ['Panaji', 'Palolem'],
    startDate: '2026-11-01',
    endDate: '2026-11-02',
    travellers: 2,
    transportMode: 'car',
    budgetPerPersonInr: 12000,
    travelStyle: 'balanced',
    coverEmoji: '🏖️',
    fixedCommitments: [{ id: 'fc1', dayIndex: 0, title: 'Ferry', time: '09:00' }],
    expenses: [{ id: 'e1', label: 'Fuel', amountInr: 2000 }],
    days: [
      { id: 'd1', index: 0, stops: [{ id: 's1', title: 'Fort', lat: 15.5, lng: 73.9 }] },
      { id: 'd2', index: 1, stops: [] },
    ],
  }
}

describe('parseTripImport — format detection', () => {
  it('accepts a bare trip export (v1)', () => {
    const r = parseTripImport(JSON.stringify(bareExport()))
    expect(r.format).toBe('trip')
    expect(r.publication).toBeUndefined()
    expect(r.trip.name).toBe('Goa weekend')
    expect(r.trip.days).toHaveLength(2)
    expect(r.summary).toContain('2-day trip')
  })

  it('accepts a gallery file and keeps the publication block (v2)', () => {
    const r = parseTripImport(JSON.stringify({
      trip: bareExport(),
      publication: { id: 'goa-north-to-south', title: 'Goa, North to the Quiet South', premiumPriceInr: 199 },
    }))
    expect(r.format).toBe('gallery')
    expect(r.publication?.id).toBe('goa-north-to-south')
    expect(r.publication?.premiumPriceInr).toBe(199)
    expect(r.summary).toContain('gallery itinerary')
  })

  it('never lets the file decide visibility', () => {
    const trip = { ...bareExport(), visibility: 'public' }
    expect(parseTripImport(JSON.stringify(trip)).trip.visibility).toBe('private')
    expect(parseTripImport(JSON.stringify({ trip, publication: {} })).trip.visibility).toBe('private')
  })

  it('supplies the collections buildTripCopy maps over', () => {
    // `buildTripCopy` calls `.map()` on both — a missing key is a crash, not a
    // cosmetic gap, and hand-written exports routinely omit them.
    const { expenses: _e, fixedCommitments: _f, ...without } = bareExport()
    const r = parseTripImport(JSON.stringify(without))
    expect(r.trip.expenses).toEqual([])
    expect(r.trip.fixedCommitments).toEqual([])
  })

  it('drops tool-managed fields the file should not carry', () => {
    const r = parseTripImport(JSON.stringify({ ...bareExport(), inviteCode: 'GOA-K7QF', members: [{ userId: 'x' }] }))
    expect(r.trip.inviteCode).toBeUndefined()
    expect(r.trip.members).toBeUndefined()
    expect(r.trip.id).toBe('import-pending')
  })
})

describe('parseTripImport — every shelf file the repo ships', () => {
  const files = readdirSync(SHELF).filter(f => f.endsWith('.golden.json'))

  it('finds the shelf', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const f of files) {
    it(`imports ${f}`, () => {
      const r = parseTripImport(readFileSync(join(SHELF, f), 'utf8'))
      expect(r.format).toBe('gallery')
      expect(r.trip.days.length).toBeGreaterThan(0)
      expect(r.trip.name).toBeTruthy()
      expect(r.publication?.id).toMatch(/^[a-z0-9-]+$/)
      // the publication's own contract: these two must agree with the trip
      expect(r.publication?.durationDays).toBe(r.trip.days.length)
      expect(r.publication?.estimatedBudgetPerPersonInr).toBe(r.trip.budgetPerPersonInr)
    })
  }
})

describe('parseTripImport — refusals say what is actually wrong', () => {
  const cases: [string, string, RegExp][] = [
    ['empty file', '   ', /empty/i],
    ['not JSON', 'name,destinations\nGoa,Panaji', /not JSON/i],
    ['a bare array', '[1,2,3]', /not a YatraFlow trip export/i],
    ['a snapshot payload', 'yf1_eJyrVkrLz1', /snapshot-link payload/i],
    ['a publication row', JSON.stringify({ id: 'p', title: 'X', tagline: 'y', routeSummary: ['A'], premiumPriceInr: 199 }), /published-itinerary row/i],
    ['publication but no trip', JSON.stringify({ publication: { title: 'X' } }), /no `trip` block/i],
    ['no days', JSON.stringify({ name: 'X', destinations: [] }), /no itinerary days/i],
    ['a truncated day', JSON.stringify({ name: 'X', days: [{ id: 'd1' }] }), /Day 1 .* truncated/i],
    ['an empty day list', JSON.stringify({ name: 'X', days: [] }), /no itinerary days/i],
  ]

  for (const [label, input, pattern] of cases) {
    it(`rejects ${label}`, () => {
      expect(() => parseTripImport(input)).toThrow(TripImportError)
      expect(() => parseTripImport(input)).toThrow(pattern)
    })
  }

  it('reports the day number of a truncated file', () => {
    const days = [{ id: 'd1', stops: [] }, { id: 'd2', stops: [] }, { id: 'd3' }]
    expect(() => parseTripImport(JSON.stringify({ name: 'X', days }))).toThrow(/Day 3/)
  })
})
