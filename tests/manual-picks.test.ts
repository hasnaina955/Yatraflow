// ============ Manual picks: one store read, one pure merge (#08 S2) ============
// Uses the REAL manual slot store and the same candidate shape the writer used.
// Equivalence is behavioral: the split builder must produce the plan the old
// inline writer path produced for the same captured data.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDayPlan, type DayPlan } from '../src/lib/dayPlan'
import type { DaySlot } from '../src/lib/daySlots'
import type { PlaceIdentity } from '../src/lib/placeIdentity'
import type { PlaceHit } from '../src/lib/providers/hits'
import { createManualSlotStore, type ManualSlotStore } from '../src/pages/trip/map/manualSlotContexts'
import { manualCandidateFor } from '../src/pages/trip/map/slotFiling'
import { buildDayPlanForDay, readManualPicksForDay } from '../src/pages/trip/map/manualPicks'
import { makeHit, makeSlot } from './helpers/journeyProjectionFixture'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const tripId = 'trip-manual'
const dayA = 'day-a'
const dayB = 'day-b'
const hitA = makeHit({ id: 'a', name: 'Alpha Cafe', source: 'google', placeId: 'g-a' })
const hitB = makeHit({ id: 'b', name: 'Beta Tea', source: 'osm' })

function slotFor(key: 'lunch' | 'dinner', dayId: string): DaySlot {
  return makeSlot({
    key,
    kind: 'meal',
    label: key === 'lunch' ? 'Lunch' : 'Dinner',
    ref: { tripId, dayId, key },
  })
}

const deps = {
  detourMinFor: (_hit: PlaceHit): number | null => 5,
  detourKmFor: (_hit: PlaceHit): number | null => 2,
}

function previousPlanForDay(
  store: ManualSlotStore,
  dayIndex: number,
  dayId: string | null,
  slots: readonly DaySlot[],
  slotManual: Readonly<Record<string, readonly PlaceHit[]>>,
  presence: PlaceIdentity | null,
): DayPlan {
  const manual: Record<string, ReturnType<typeof manualCandidateFor>[]> = {}
  const shapes = { detourMin: deps.detourMinFor, detourKm: deps.detourKmFor }
  if (dayId) {
    const fromStore = store.candidatesBySlot({ tripId, dayId }, shapes)
    for (const [key, candidates] of Object.entries(fromStore)) manual[key] = [...candidates]
  }
  for (const [key, hits] of Object.entries(slotManual)) {
    const bound = dayId ? store.legacyPicksFor(key, { tripId, dayId }) : []
    if (bound.length === 0) continue
    const rows = hits.map(item => manualCandidateFor({
      hit: item,
      detourMin: deps.detourMinFor?.(item) ?? null,
      detourKm: deps.detourKmFor?.(item) ?? null,
      budgetMin: 1,
      sharePct: () => 100,
    }))
    manual[key] = [...(manual[key] ?? []), ...rows]
  }
  return buildDayPlan({
    dayIndex,
    slots,
    tripId,
    ...(dayId ? { dayId } : {}),
    manual,
    ...(presence ? { identity: presence } : {}),
  })
}

describe('the store read adapter', () => {
  it('captures stable candidates and the bound legacy bucket as plain data', () => {
    const store = createManualSlotStore()
    store.file({ tripId, dayId: dayA, slotKey: 'lunch' }, hitA)
    const picks = readManualPicksForDay({
      store, tripId, dayId: dayA, slotManual: { lunch: [hitA] }, ...deps,
    })
    expect(picks.stable.lunch).toHaveLength(1)
    expect(picks.stable.lunch?.[0]?.hit).toBe(hitA)
    expect(picks.stable.lunch?.[0]?.detourMin).toBe(5)
    expect(picks.legacy.lunch).toHaveLength(1)
    expect(picks.legacy.lunch?.[0]?.hit).toBe(hitA)
  })

  it('keeps Day A legacy picks off Day B', () => {
    const store = createManualSlotStore()
    store.file({ tripId, dayId: dayA, slotKey: 'lunch' }, hitA)
    const picks = readManualPicksForDay({
      store, tripId, dayId: dayB, slotManual: { lunch: [hitA] }, ...deps,
    })
    expect(picks.stable).toEqual({})
    expect(picks.legacy).toEqual({})
  })

  it('reads no store when the day has no stable id', () => {
    const store = createManualSlotStore()
    store.file({ tripId, dayId: dayA, slotKey: 'lunch' }, hitA)
    const picks = readManualPicksForDay({
      store, tripId, dayId: null, slotManual: { lunch: [hitA] }, ...deps,
    })
    expect(picks.stable).toEqual({})
    expect(picks.legacy).toEqual({})
  })
})

describe('the pure builder matches the previous writer path', () => {
  it('produces the same plan for Day A and Day B', () => {
    const store = createManualSlotStore()
    store.file({ tripId, dayId: dayA, slotKey: 'lunch' }, hitA)
    store.file({ tripId, dayId: dayB, slotKey: 'dinner' }, hitB)
    const slotsA = [slotFor('lunch', dayA)]
    const slotsB = [slotFor('dinner', dayB)]
    const manualA = { lunch: [hitA] }
    const manualB = { lunch: [hitA], dinner: [hitB] }

    const nextA = buildDayPlanForDay({
      tripId, dayIndex: 0, dayId: dayA, slots: slotsA,
      manual: readManualPicksForDay({ store, tripId, dayId: dayA, slotManual: manualA, ...deps }),
      identity: null,
    })
    const beforeA = previousPlanForDay(store, 0, dayA, slotsA, manualA, null)
    expect(nextA).toEqual(beforeA)

    const nextB = buildDayPlanForDay({
      tripId, dayIndex: 1, dayId: dayB, slots: slotsB,
      manual: readManualPicksForDay({ store, tripId, dayId: dayB, slotManual: manualB, ...deps }),
      identity: null,
    })
    const beforeB = previousPlanForDay(store, 1, dayB, slotsB, manualB, null)
    expect(nextB).toEqual(beforeB)
    // Day A's lunch never reaches Day B through the legacy bucket.
    expect(nextB.slots[0]?.candidates.some(candidate => candidate.hit === hitA)).toBe(false)
  })

  it('merges stable first, legacy second, and dedupes one entity', () => {
    const store = createManualSlotStore()
    store.file({ tripId, dayId: dayA, slotKey: 'lunch' }, hitA)
    const picks = readManualPicksForDay({
      store, tripId, dayId: dayA, slotManual: { lunch: [hitA] }, ...deps,
    })
    const plan = buildDayPlanForDay({
      tripId, dayIndex: 0, dayId: dayA, slots: [slotFor('lunch', dayA)], manual: picks, identity: null,
    })
    expect(plan.slots[0]?.candidates).toHaveLength(1)
    expect(plan.slots[0]?.candidates[0]?.hit).toBe(hitA)
    expect(plan.slots[0]?.candidates[0]?.origin).toBe('manual')
  })

  it('does not read the store after the picks were captured', () => {
    const store = createManualSlotStore()
    store.file({ tripId, dayId: dayA, slotKey: 'lunch' }, hitA)
    const picks = readManualPicksForDay({
      store, tripId, dayId: dayA, slotManual: { lunch: [hitA] }, ...deps,
    })
    const input = { tripId, dayIndex: 0, dayId: dayA, slots: [slotFor('lunch', dayA)], manual: picks, identity: null }
    const before = buildDayPlanForDay(input)
    store.clear()
    expect(buildDayPlanForDay(input)).toEqual(before)
  })

  it('drops a manual pick the plan already contains', () => {
    const store = createManualSlotStore()
    store.file({ tripId, dayId: dayA, slotKey: 'lunch' }, hitA)
    const presence: PlaceIdentity = {
      names: new Set([hitA.name.toLowerCase()]),
      keys: [],
      places: [],
      added: new Set(),
      dismissed: new Set(),
    }
    const picks = readManualPicksForDay({
      store, tripId, dayId: dayA, slotManual: {}, ...deps,
    })
    const plan = buildDayPlanForDay({
      tripId, dayIndex: 0, dayId: dayA, slots: [slotFor('lunch', dayA)], manual: picks, identity: presence,
    })
    expect(plan.slots[0]?.candidates).toHaveLength(0)
    expect(plan.slots[0]?.droppedManualCount).toBe(1)
  })
})

describe('ownership pins', () => {
  it('keeps the module-global store out of the pure builder module', () => {
    const source = readFileSync(join(root, 'src', 'pages', 'trip', 'map', 'manualPicks.ts'), 'utf8')
    expect(source).not.toMatch(/mapManualSlotStore/)
    expect(source).toMatch(/export function readManualPicksForDay/)
    expect(source).toMatch(/export function buildDayPlanForDay/)
  })

  it('keeps the writer on the same read adapter and builder', () => {
    const writer = readFileSync(join(root, 'src', 'pages', 'trip', 'map', 'useMapWriters.ts'), 'utf8')
    expect(writer).toMatch(/readManualPicksForDay\(\{/)
    expect(writer).toMatch(/buildDayPlanForDay\(\{/)
    expect(writer).not.toMatch(/manualCandidateFor\(/)
  })
})
