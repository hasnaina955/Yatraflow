// ============ Map v2 package G, item 1: honest preview before add (#905) ============
// The preview is a pure result of the existing engine. These tests pin four
// promises: the new road and the clocks are computed, unknown facts stay
// unknown, the five outcomes stay apart, and Undo restores the prior plan.
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { ItineraryStop, Trip } from '../src/data/types'
import { legKey } from '../src/lib/engine'
import { computeImpact } from '../src/lib/impact'
import { withCandidateInserted } from '../src/lib/netAddedMin'
import { previewAdd } from '../src/pages/trip/map/editing/addPreview'
import { outcomeFromKeep, outcomeMessage } from '../src/pages/trip/map/editing/outcomes'
import { editSessionReducer, IDLE_SESSION, type EditSession } from '../src/pages/trip/map/editing/editSession'
import { captureUndo, undoMutator, undoState } from '../src/pages/trip/map/editing/undoPlan'

function freshTrip(): Trip {
  return structuredClone(seedData.trips[0]) as Trip
}

function pick(trip: Trip, overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  const day = trip.days[0]
  const a = day.stops[0]
  const b = day.stops[1] ?? a
  return {
    id: 'st_preview_pick',
    title: 'Preview pick',
    category: 'sightseeing',
    locationName: 'Between two stops',
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
    visitMinutes: 45,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'suggested',
    orderInDay: 2,
    ...overrides,
  }
}

describe('previewAdd: the proposed journey', () => {
  it('inserts the stop where asked and reports its order and neighbours', () => {
    const trip = freshTrip()
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    expect(result.kind).toBe('ready')
    if (result.kind !== 'ready') return
    expect(result.insertion.index).toBe(1)
    expect(result.insertion.order).toBe(2)
    expect(result.insertion.afterTitle).toBe(trip.days[0].stops[0].title)
    expect(result.insertion.beforeTitle).toBe(trip.days[0].stops[1].title)
    expect(result.proposedTrip.days[0].stops.map(s => s.id)).toContain('st_preview_pick')
    expect(trip.days[0].stops.some(s => s.id === 'st_preview_pick')).toBe(false)
  })

  it('reports the directed new road into and out of the new stop', () => {
    const trip = freshTrip()
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.road.legIn?.fromTitle).toBe(trip.days[0].stops[0].title)
    expect(result.road.legIn?.toTitle).toBe('Preview pick')
    expect(result.road.legOut?.fromTitle).toBe('Preview pick')
    expect(result.road.legOut?.toTitle).toBe(trip.days[0].stops[1].title)
    expect(result.road.replaced?.fromTitle).toBe(trip.days[0].stops[0].title)
    expect(result.road.replaced?.toTitle).toBe(trip.days[0].stops[1].title)
    expect(result.road.legIn?.measured).toBe(false)
  })

  it('marks a leg measured only when a correction names that exact direction', () => {
    const trip = freshTrip()
    const stop = pick(trip)
    const a = trip.days[0].stops[0]
    const forward = legKey(a, stop)
    const reverse = legKey(stop, a)
    const measuredFacts = { distanceKm: 11, durationMinutes: 17, kind: 'road' as const }
    const result = previewAdd({ trip, dayIndex: 0, stop, insertAt: 1, legCorrections: { [forward]: measuredFacts } })
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.road.legIn).toMatchObject({ measured: true, distanceKm: 11, durationMin: 17 })
    // The reverse direction is not this leg. It must not read as measured.
    const wrong = previewAdd({ trip, dayIndex: 0, stop, insertAt: 1, legCorrections: { [reverse]: measuredFacts } })
    if (wrong.kind !== 'ready') throw new Error('expected ready')
    expect(wrong.road.legIn?.measured).toBe(false)
    // A haversine fallback is an estimate, never a measurement.
    const estimated = previewAdd({ trip, dayIndex: 0, stop, insertAt: 1, legCorrections: { [forward]: { ...measuredFacts, estimated: true } } })
    if (estimated.kind !== 'ready') throw new Error('expected ready')
    expect(estimated.road.legIn?.measured).toBe(false)
  })

  it('gives old and new clock times for every later stop, unchanged ones included', () => {
    const trip = freshTrip()
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    const later = trip.days[0].stops.slice(1).map(s => s.id)
    expect(result.clocks.map(c => c.stopId)).toEqual(expect.arrayContaining(later))
    for (const clock of result.clocks) {
      expect(clock.from).toMatch(/^\d\d:\d\d$/)
      expect(clock.to).toMatch(/^\d\d:\d\d$/)
      expect(clock.deltaMin).toBeGreaterThanOrEqual(0)
    }
    expect(result.dayEnd.from).toMatch(/^\d\d:\d\d$/)
    expect(result.dayEnd.to).toMatch(/^\d\d:\d\d$/)
    expect(result.clocks.some(c => (c.deltaMin ?? 0) > 0)).toBe(true)
  })

  it('uses the existing impact engine: net added minutes equal the impact time delta', () => {
    const trip = freshTrip()
    const stop = pick(trip)
    const proposedDay = withCandidateInserted(trip.days[0], { key: 'k', stop, insertAt: 1 })
    const proposed: Trip = { ...trip, days: trip.days.map(d => (d.index === 0 ? proposedDay! : d)) }
    const expected = computeImpact(trip, proposed, 'add', 0).timeDeltaMin
    const result = previewAdd({ trip, dayIndex: 0, stop, insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.netAddedMin).toBe(expected)
  })

  it('lists a warning the add introduces and one it clears, with severity', () => {
    const trip = freshTrip()
    // A 14-hour visit overruns the day. The engine decides which warning appears.
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip, { visitMinutes: 840 }), insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.warnings.added.length).toBe(result.impact.newWarnings.length)
    expect(result.warnings.cleared.length).toBe(result.impact.clearedWarnings.length)
    for (const w of result.warnings.added) {
      expect(typeof w.severe).toBe('boolean')
      expect(typeof w.title).toBe('string')
    }
  })

  it('keeps unknown facts unknown: no hours and no price evidence', () => {
    const trip = freshTrip()
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    expect(result.unknownFacts).toEqual(expect.arrayContaining(['opening-hours', 'admission-price']))
    const known = previewAdd({
      trip, dayIndex: 0, insertAt: 1, priceEvidence: true,
      stop: pick(trip, { openTime: '09:00', closeTime: '17:00' }),
    })
    if (known.kind !== 'ready') throw new Error('expected ready')
    expect(known.unknownFacts).toEqual([])
  })

  it('returns unknown, not a guess, when the position or the facts are missing', () => {
    const trip = freshTrip()
    expect(previewAdd({ trip, dayIndex: 99, stop: pick(trip), insertAt: 0 })).toEqual({ kind: 'unknown', reason: 'day-missing' })
    expect(previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: null })).toEqual({ kind: 'unknown', reason: 'position-unknown' })
    expect(previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 999 })).toEqual({ kind: 'unknown', reason: 'position-unknown' })
    expect(previewAdd({ trip, dayIndex: 0, stop: pick(trip, { lat: 0, lng: 0 }), insertAt: 1 })).toEqual({ kind: 'unknown', reason: 'coordinates-unknown' })
    expect(previewAdd({ trip, dayIndex: 0, stop: pick(trip, { visitMinutes: Number.NaN }), insertAt: 1 })).toEqual({ kind: 'unknown', reason: 'visit-unknown' })
  })

  it('does not mutate the trip it was given', () => {
    const trip = freshTrip()
    const before = JSON.stringify(trip)
    previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    expect(JSON.stringify(trip)).toBe(before)
  })
})

describe('outcomes: keep, reject, forbidden, failure and conflict stay apart', () => {
  const receipt = { kind: 'acknowledged', revision: 'r1', writeVersion: 3 } as const

  it('maps each keep outcome to one distinct kind', () => {
    expect(outcomeFromKeep(receipt).kind).toBe('kept')
    expect(outcomeFromKeep({ kind: 'forbidden' }).kind).toBe('forbidden')
    expect(outcomeFromKeep({ kind: 'conflict' }).kind).toBe('conflict')
    expect(outcomeFromKeep({ kind: 'stale' }).kind).toBe('conflict')
    expect(outcomeFromKeep({ kind: 'superseded' }).kind).toBe('conflict')
    expect(outcomeFromKeep({ kind: 'refused' }).kind).toBe('failed')
    expect(outcomeFromKeep({ kind: 'unavailable' }).kind).toBe('failed')
    expect(outcomeFromKeep({ kind: 'none' }).kind).toBe('failed')
  })

  it('treats a receipt without a revision as a failure, never as success', () => {
    expect(outcomeFromKeep({ kind: 'acknowledged', revision: '', writeVersion: 1 } as never).kind).toBe('failed')
    expect(outcomeFromKeep(undefined as never).kind).toBe('failed')
  })

  it('carries the uncertain flag and the words differ for every kind', () => {
    const uncertain = outcomeFromKeep({ kind: 'unavailable', uncertain: true })
    expect(uncertain).toMatchObject({ kind: 'failed', uncertain: true })
    const lines = [
      outcomeMessage(outcomeFromKeep(receipt)),
      outcomeMessage({ kind: 'rejected' }),
      outcomeMessage(outcomeFromKeep({ kind: 'forbidden' })),
      outcomeMessage(outcomeFromKeep({ kind: 'unavailable' })),
      outcomeMessage(outcomeFromKeep({ kind: 'conflict' })),
    ]
    expect(new Set(lines).size).toBe(5)
  })
})

describe('edit session: success needs the writer’s acknowledgement', () => {
  const trip = freshTrip()
  const ready = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
  if (ready.kind !== 'ready') throw new Error('expected ready')
  const receipt = { kind: 'acknowledged', revision: 'r1', writeVersion: 3 } as const

  function previewing() {
    return editSessionReducer(IDLE_SESSION, { type: 'preview', preview: ready })
  }

  it('moves idle → previewing → saving and stays saving until the writer answers', () => {
    const saving = editSessionReducer(previewing(), { type: 'keep' })
    expect(saving.phase).toBe('saving')
    expect(editSessionReducer(saving, { type: 'keep' })).toBe(saving)
  })

  it('lands only on an acknowledged receipt', () => {
    const saving = editSessionReducer(previewing(), { type: 'keep' })
    const done = editSessionReducer(saving, { type: 'settle', outcome: outcomeFromKeep(receipt) })
    expect(done.phase).toBe('done')
  })

  it('keeps the preview open after forbidden, failure and conflict', () => {
    for (const kind of ['forbidden', 'unavailable', 'conflict'] as const) {
      const saving = editSessionReducer(previewing(), { type: 'keep' })
      const next = editSessionReducer(saving, { type: 'settle', outcome: outcomeFromKeep({ kind }) })
      expect(next.phase).toBe('previewing')
      expect(next.lastOutcome?.kind).toBe(outcomeFromKeep({ kind }).kind)
    }
  })

  it('reject returns to idle and writes nothing', () => {
    const next = editSessionReducer(previewing(), { type: 'reject' })
    expect(next.phase).toBe('idle')
    expect(next.lastOutcome?.kind).toBe('rejected')
  })

  it('ignores a keep or a settle that arrives in the wrong phase', () => {
    expect(editSessionReducer(IDLE_SESSION, { type: 'keep' })).toBe(IDLE_SESSION)
    expect(editSessionReducer(previewing(), { type: 'settle', outcome: outcomeFromKeep(receipt) })).toEqual(previewing())
  })
})

describe('exact Undo', () => {
  it('restores the prior plan exactly after an add', () => {
    const trip = freshTrip()
    const before = JSON.stringify(trip.days)
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    const record = captureUndo(trip, result.proposedTrip, [0])
    const kept = structuredClone(result.proposedTrip)
    expect(undoState(kept, record)).toBe('available')
    undoMutator(record)(kept)
    expect(JSON.stringify(kept.days)).toBe(before)
  })

  it('refuses Undo as a conflict when the day changed after the save', () => {
    const trip = freshTrip()
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    const record = captureUndo(trip, result.proposedTrip, [0])
    const later = structuredClone(result.proposedTrip)
    later.days[0].stops[0].visitMinutes += 15
    expect(undoState(later, record)).toBe('conflict')
  })

  it('does not alias the captured plan: a later edit cannot corrupt the record', () => {
    const trip = freshTrip()
    const result = previewAdd({ trip, dayIndex: 0, stop: pick(trip), insertAt: 1 })
    if (result.kind !== 'ready') throw new Error('expected ready')
    const record = captureUndo(trip, result.proposedTrip, [0])
    trip.days[0].stops[0].title = 'Changed after capture'
    const kept = structuredClone(result.proposedTrip)
    undoMutator(record)(kept)
    expect(kept.days[0].stops[0].title).not.toBe('Changed after capture')
  })
})
