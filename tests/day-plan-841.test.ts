// ============ #841 — one stable day, one effective candidate list ============
//
// These tests exercise the ACTUAL production derivations (`daySlots` and
// `buildDayPlan`), not a replacement helper: the slots are derived by the
// engine, the poll join is the one the rail reads, and the effective list is
// the one the vote and the batch select from. The known-bad controls reproduce
// the pre-repair rules (kind-only poll join, raw-id candidate merge) so a
// green test cannot hide the defect it exists to pin.
//
// Scope: day identity, day-scoped poll association, manual/engine parity,
// vote and batch selection, and the refusal of an invalid day ref. Placement
// order and per-operation reservation are a separate lease and are not claimed
// here.
import { describe, expect, it } from 'vitest'
import {
  daySlots,
  slotRefFor,
  type DaySlotsDeps,
  type SlotCandidate,
  type SlotKey,
} from '../src/lib/daySlots'
import {
  batchSelection,
  buildDayPlan,
  planCounts,
  voteSelection,
  type DayPlan,
} from '../src/lib/dayPlan'
import { mergeSlotCandidates } from '../src/pages/trip/map/slotFiling'
import { placeIdentity } from '../src/lib/placeIdentity'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { RideSegment, SegmentHit } from '../src/lib/ridePlan'
import type {
  DecisionOption,
  DecisionPlacePayload,
  ItineraryStop,
  TripDecision,
} from '../src/data/types'

const TRIP = 'trip-1'
const DAY_A = 'day-a'
const DAY_C = 'day-c'

function seg(purpose: RideSegment['purpose'], over: Partial<RideSegment> = {}): RideSegment {
  return {
    index: 0,
    purpose,
    label: purpose,
    targetKm: 100,
    minKm: 80,
    maxKm: 130,
    kmFromPrev: 100,
    minutesFromPrev: 120,
    hint: '',
    ...over,
  }
}

function sh(segment: RideSegment, hit: PlaceHit | null, score = 12): SegmentHit {
  return { segment, hit, score }
}

function hit(id: string, name: string, over: Partial<PlaceHit> = {}): PlaceHit {
  return {
    id,
    name,
    latitude: 10,
    longitude: 76,
    kind: 'poi',
    category: 'food',
    offRouteKm: 8,
    alongRouteKm: 100,
    ...over,
  }
}

function stop(id: string, title: string, over: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id,
    title,
    category: 'food',
    locationName: title,
    lat: 10,
    lng: 76,
    visitMinutes: 45,
    entryFeeInrPerPerson: 0,
    transportCostInrTotal: 0,
    priority: 'nice-to-have',
    status: 'confirmed',
    orderInDay: 0,
    ...over,
  }
}

/** The manual row MapTab's `makeManualCandidate` produces (engine-less). */
function manual(h: PlaceHit): SlotCandidate {
  return {
    hit: h,
    detourMin: null,
    detourKm: null,
    budgetSharePct: 100,
    posKm: null,
    arriveMin: null,
    arriveLabel: null,
    inWindow: false,
    score: Number.MAX_SAFE_INTEGER,
    reason: 'added from this slot’s search',
  }
}

function place(over: Partial<DecisionPlacePayload> = {}): DecisionPlacePayload {
  return {
    title: 'Grand Hotel',
    category: 'food',
    locationName: 'Ernakulam',
    lat: 10.01,
    lng: 76.3,
    visitMinutes: 45,
    ...over,
  }
}

function option(
  id: string,
  dayEvidence: DecisionPlacePayload | null,
  label = id,
): DecisionOption {
  return dayEvidence ? { id, label, place: dayEvidence } : { id, label }
}

function poll(
  id: string,
  options: DecisionOption[],
  over: Partial<TripDecision> = {},
): TripDecision {
  return {
    id,
    tripId: TRIP,
    question: `${id} - where?`,
    options,
    votesByUserId: {},
    comments: [],
    status: 'open',
    raisedBy: 'u1',
    createdAt: 1,
    ...over,
  }
}

/** Two meal halts on two non-contiguous trip days (0 and 2 after a deletion). */
const twoDayHalts = [
  sh(seg('meal', { index: 0, etaMinutes: 735 }), null),
  sh(seg('meal', { index: 1, etaMinutes: 735, dayEnd: true }), null),
]
const dayOfSegment = (row: SegmentHit): number => (row.segment.index === 0 ? 0 : 2)

function deps(over: Partial<DaySlotsDeps> = {}): DaySlotsDeps {
  return {
    haltSegments: twoDayHalts,
    dayStops: [],
    anchors: [{ lat: 10, lng: 76 }],
    tripId: TRIP,
    dayOfSegment,
    ...over,
  }
}

function planForDay(
  dayId: string,
  dayIndex: number,
  decisions: TripDecision[],
  opts: {
    manual?: Record<string, SlotCandidate[]>
    identity?: ReturnType<typeof placeIdentity>
    haltSegments?: SegmentHit[]
    memberCount?: number
  } = {},
): DayPlan {
  const slots = daySlots(dayIndex, deps({
    dayId,
    decisions,
    ...(opts.haltSegments ? { haltSegments: opts.haltSegments } : {}),
    ...(opts.memberCount != null ? { memberCount: opts.memberCount } : {}),
  }))
  return buildDayPlan({
    dayIndex,
    slots,
    tripId: TRIP,
    dayId,
    ...(opts.manual ? { manual: opts.manual } : {}),
    ...(opts.identity ? { identity: opts.identity } : {}),
  })
}

function slotOf(plan: DayPlan, key: SlotKey) {
  const slot = plan.slots.find(s => s.key === key)
  if (!slot) throw new Error(`no ${key} slot on day ${plan.dayIndex}`)
  return slot
}

const ids = (plan: DayPlan, key: SlotKey) => slotOf(plan, key).candidates.map(c => c.hit.id)

/** KNOWN-BAD replica of the pre-#841 join: the first open poll whose option id
 *  names the kind, with no day evidence read at all. Asserted against, never
 *  used by production. */
function legacyKindFirst(decisions: readonly TripDecision[], key: SlotKey): TripDecision | undefined {
  const prefix = `slot:${key}:`
  return decisions.find(d => d.status === 'open'
    && d.options.some(o => String(o.id).startsWith(prefix)))
}

describe('#841 stable slot identity', () => {
  it('is trip + persisted day id + slot key, never the array position', () => {
    const slots = daySlots(2, deps({ dayId: DAY_C }))
    const lunch = slots.find(s => s.key === 'lunch')!
    expect(lunch.ref).toEqual({ tripId: TRIP, dayId: DAY_C, key: 'lunch' })

    const plan = buildDayPlan({ dayIndex: 2, slots })
    expect(plan.ref).toEqual({ tripId: TRIP, dayId: DAY_C })
    expect(slotOf(plan, 'lunch').ref).toEqual(lunch.ref)
  })

  it('refuses a partial trip/day context instead of inventing an identity', () => {
    expect(slotRefFor(2, { tripId: TRIP, dayId: DAY_C }, 'lunch'))
      .toEqual({ tripId: TRIP, dayId: DAY_C, key: 'lunch' })
    expect(slotRefFor(2, { tripId: TRIP }, 'lunch')).toBeNull()
    expect(slotRefFor(2, { dayId: DAY_C }, 'lunch')).toBeNull()
    expect(slotRefFor(2, { tripId: '  ', dayId: '  ' }, 'lunch')).toBeNull()
  })

  it('keeps an unknown day explicit and prevents a write from the null ref', () => {
    const slots = daySlots(0, deps({ tripId: undefined }))
    const lunch = slots.find(s => s.key === 'lunch')!
    expect(lunch.ref).toBeNull()

    const plan = buildDayPlan({
      dayIndex: 0,
      slots,
      manual: { lunch: [manual(hit('m1', 'One')), manual(hit('m2', 'Two'))] },
    })
    expect(plan.ref).toBeNull()
    expect(plan.slots.every(s => s.ref === null)).toBe(true)
    // The list is still readable; only the write is refused.
    expect(slotOf(plan, 'lunch').count).toBe(2)
    expect(voteSelection(slotOf(plan, 'lunch'))).toMatchObject({
      canRaise: false,
      refusal: 'invalid-day-ref',
    })
    expect(batchSelection(plan).refusal).toBe('invalid-day-ref')
  })
})

describe('#841 a poll binds to its day, not its kind', () => {
  const pollA = poll('poll-a', [option('slot:lunch:h1', place({ dayId: DAY_A }))])
  const pollC = poll('poll-c', [option('slot:lunch:h9', place({ dayId: DAY_C }))])

  it('rejects another trip poll even when its day identity matches', () => {
    const slot = slotOf(planForDay(DAY_A, 0, [{ ...pollA, tripId: 'other-trip' }]), 'lunch')
    expect(slot.vote).toBeUndefined()
    expect(slot.voteUnbound ?? []).toEqual([])
  })

  it('two days with the same slot kind each read their own poll', () => {
    const a = planForDay(DAY_A, 0, [pollA, pollC])
    const c = planForDay(DAY_C, 2, [pollA, pollC])
    expect(slotOf(a, 'lunch').vote?.decisionId).toBe('poll-a')
    expect(slotOf(c, 'lunch').vote?.decisionId).toBe('poll-c')
    expect(slotOf(a, 'lunch').voteUnbound).toBeUndefined()
    expect(slotOf(c, 'lunch').voteUnbound).toBeUndefined()

    // KNOWN BAD: the old kind-only join hands day A's poll to both days.
    expect(legacyKindFirst([pollA, pollC], 'lunch')?.id).toBe('poll-a')
  })

  it('switching away and back keeps the same day candidates and poll', () => {
    const pickedA = [manual(hit('m-a', 'Cafe A'))]
    const pickedC = [manual(hit('m-c', 'Cafe C'))]
    const first = planForDay(DAY_A, 0, [pollA, pollC], { manual: { lunch: pickedA } })
    planForDay(DAY_C, 2, [pollA, pollC], { manual: { lunch: pickedC } })
    const again = planForDay(DAY_A, 0, [pollA, pollC], { manual: { lunch: pickedA } })

    expect(ids(again, 'lunch')).toEqual(ids(first, 'lunch'))
    expect(ids(again, 'lunch')).toEqual(['m-a'])
    expect(slotOf(again, 'lunch').vote?.decisionId).toBe('poll-a')
  })

  it('a stable day id wins over a stale index after a reorder', () => {
    // Day C used to sit at index 0; the poll still carries that stale index.
    const stale = poll('poll-stale', [
      option('slot:lunch:h1', place({ dayId: DAY_C, dayIndex: 0 })),
    ])
    expect(slotOf(planForDay(DAY_C, 2, [stale]), 'lunch').vote?.decisionId).toBe('poll-stale')
    const wrongDay = planForDay(DAY_A, 0, [stale])
    expect(slotOf(wrongDay, 'lunch').vote).toBeUndefined()
    // Positively another day, not ambiguous: it must not clutter day A.
    expect(slotOf(wrongDay, 'lunch').voteUnbound).toBeUndefined()
  })

  it('an index-only legacy poll attaches only by the actual day index', () => {
    const indexTwo = poll('poll-index-2', [option('slot:lunch:h1', place({ dayIndex: 2 }))])
    expect(slotOf(planForDay(DAY_C, 2, [indexTwo]), 'lunch').vote?.decisionId).toBe('poll-index-2')
    expect(slotOf(planForDay(DAY_A, 0, [indexTwo]), 'lunch').vote).toBeUndefined()

    const missingDay = poll('poll-index-1', [option('slot:lunch:h1', place({ dayIndex: 1 }))])
    expect(slotOf(planForDay(DAY_C, 2, [missingDay]), 'lunch').vote).toBeUndefined()
    expect(slotOf(planForDay(DAY_A, 0, [missingDay]), 'lunch').vote).toBeUndefined()
  })

  it('unscoped evidence is not evidence, even when the kind is unique', () => {
    const unscoped = poll('poll-unscoped', [option('slot:lunch:h1', null)])
    const plan = planForDay(DAY_A, 0, [unscoped])
    expect(slotOf(plan, 'lunch').vote).toBeUndefined()
    expect(slotOf(plan, 'lunch').voteUnbound).toEqual([
      { decisionId: 'poll-unscoped', reason: 'ambiguous-day-evidence' },
    ])
    // KNOWN BAD: the old join attached this poll to every lunch slot it met.
    expect(legacyKindFirst([unscoped], 'lunch')?.id).toBe('poll-unscoped')
  })

  it('mixed or conflicting evidence never picks a day', () => {
    const mixed = poll('poll-mixed', [
      option('slot:lunch:h1', place({ dayId: DAY_A })),
      option('slot:lunch:h2', place({ dayIndex: 0 })),
    ])
    const conflicting = poll('poll-conflict', [
      option('slot:lunch:h1', place({ dayId: DAY_A })),
      option('slot:lunch:h2', place({ dayId: DAY_C })),
    ])
    for (const decision of [mixed, conflicting]) {
      const plan = planForDay(DAY_A, 0, [decision])
      expect(slotOf(plan, 'lunch').vote).toBeUndefined()
      expect(slotOf(plan, 'lunch').voteUnbound).toEqual([
        { decisionId: decision.id, reason: 'ambiguous-day-evidence' },
      ])
    }
  })

  it('two matching open polls are reported, never silently chosen between', () => {
    const first = poll('poll-1', [option('slot:lunch:h1', place({ dayId: DAY_A }))])
    const second = poll('poll-2', [option('slot:lunch:h2', place({ dayId: DAY_A }))])
    const plan = planForDay(DAY_A, 0, [first, second])
    expect(slotOf(plan, 'lunch').vote).toBeUndefined()
    expect(slotOf(plan, 'lunch').voteUnbound).toEqual([
      { decisionId: 'poll-1', reason: 'multiple-open-polls' },
      { decisionId: 'poll-2', reason: 'multiple-open-polls' },
    ])
  })

  it('one valid poll still shows when another poll is ambiguous', () => {
    const valid = poll('poll-valid', [option('slot:lunch:h1', place({ dayId: DAY_A }))])
    const unscoped = poll('poll-unscoped', [option('slot:lunch:h2', null)])
    const plan = planForDay(DAY_A, 0, [valid, unscoped])
    expect(slotOf(plan, 'lunch').vote?.decisionId).toBe('poll-valid')
    expect(slotOf(plan, 'lunch').voteUnbound).toEqual([
      { decisionId: 'poll-unscoped', reason: 'ambiguous-day-evidence' },
    ])
  })

  it('the tally and the crew denominator are unchanged', () => {
    const voted = poll('poll-voted', [
      option('slot:lunch:h1', place({ dayId: DAY_A }), 'Grand Hotel'),
      option('slot:lunch:h2', place({ dayId: DAY_A }), 'Halais'),
    ], {
      votesByUserId: { u1: 'slot:lunch:h2', u2: 'slot:lunch:h2', u3: 'slot:lunch:h1' },
    })
    const plan = planForDay(DAY_A, 0, [voted], { memberCount: 4 })
    expect(slotOf(plan, 'lunch').vote).toMatchObject({
      decisionId: 'poll-voted',
      optionCount: 2,
      votesCast: 3,
      voters: 4,
      leadingLabel: 'Halais',
    })
  })

  it('a filled slot carries no poll and no candidates', () => {
    const slots = daySlots(0, deps({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayId: DAY_A,
      dayStops: [stop('s1', 'Lunch Place', { slotKey: 'lunch' })],
      decisions: [poll('poll-a', [option('slot:lunch:h1', place({ dayId: DAY_A }))])],
    }))
    const plan = buildDayPlan({
      dayIndex: 0,
      slots,
      manual: { lunch: [manual(hit('m1', 'One'))] },
    })
    const lunch = slotOf(plan, 'lunch')
    expect(lunch.state).toBe('filled')
    expect(lunch.count).toBe(0)
    expect(lunch.filledStopId).toBe('s1')
    expect(lunch.vote).toBeUndefined()
    expect(voteSelection(lunch).refusal).toBe('slot-not-empty')
  })
})

describe('#841 one effective candidate list', () => {
  it('a manual-only pair can vote and is the batch target', () => {
    const plan = planForDay(DAY_A, 0, [], {
      manual: {
        lunch: [manual(hit('m1', 'Cafe One')), manual(hit('m2', 'Cafe Two'))],
      },
    })
    const lunch = slotOf(plan, 'lunch')
    expect(lunch.candidates.map(c => [c.hit.id, c.origin])).toEqual([
      ['m1', 'manual'],
      ['m2', 'manual'],
    ])
    expect(lunch.count).toBe(2)

    const selection = voteSelection(lunch)
    expect(selection.canRaise).toBe(true)
    expect(selection.refusal).toBeNull()
    expect(selection.options.map(c => c.hit.id)).toEqual(['m1', 'm2'])

    const batch = batchSelection(plan)
    expect(batch.ref).toEqual({ tripId: TRIP, dayId: DAY_A })
    expect(batch.refusal).toBeNull()
    expect(batch.items).toHaveLength(1)
    expect(batch.items[0].candidate.hit.id).toBe('m1')
    expect(planCounts(plan)).toMatchObject({
      slots: 1,
      empty: 1,
      candidates: 2,
      fillable: 1,
      unsourced: 0,
      openVotes: 0,
    })
  })

  it('merges manual and engine copies of one place through provider identity', () => {
    const engineHit = hit('e-1', 'Grand Hotel', { placeId: 'P-1', source: 'google' })
    const plan = planForDay(DAY_A, 0, [], {
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), engineHit)],
      manual: { lunch: [manual(hit('m-1', 'The Grand', { placeId: 'P-1', source: 'google' }))] },
    })
    const lunch = slotOf(plan, 'lunch')
    expect(lunch.count).toBe(1)
    expect(lunch.candidates[0].origin).toBe('manual')
    expect(lunch.candidates[0].hit.id).toBe('m-1')
  })

  it('merges by normalized name and coordinates when neither has a key', () => {
    const engineHit = hit('e-2', 'Same Cafe')
    const plan = planForDay(DAY_A, 0, [], {
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), engineHit)],
      manual: { lunch: [manual(hit('m-2', '  same cafe '))] },
    })
    expect(slotOf(plan, 'lunch').count).toBe(1)
    expect(slotOf(plan, 'lunch').candidates[0].origin).toBe('manual')
  })

  it('keeps conflicting provider keys as two places even under one raw id', () => {
    const engineHit = hit('7', 'Twin Cafe', { placeId: 'P-B', source: 'google' })
    const manualHit = hit('7', 'Twin Cafe', { placeId: 'P-A', source: 'google' })
    const plan = planForDay(DAY_A, 0, [], {
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), engineHit)],
      manual: { lunch: [manual(manualHit)] },
    })
    const lunch = slotOf(plan, 'lunch')
    expect(lunch.count).toBe(2)
    expect(lunch.candidates.map(c => c.origin)).toEqual(['manual', 'engine'])

    // KNOWN BAD: the old raw-id merge collapsed two provider-conflicting places
    // that happened to share an id.
    expect(mergeSlotCandidates([manual(manualHit)], [manual(engineHit)])).toHaveLength(1)
  })

  it('drops a manual pick the plan already contains, at derive time', () => {
    const already = stop('s1', 'Already Here', { placeId: 'P-X', placeSource: 'google' })
    const identity = placeIdentity({ days: [{ id: DAY_A, index: 0, stops: [already] }] })
    const pick = manual(hit('m-x', 'Already Here Elsewhere', { placeId: 'P-X', source: 'google' }))
    const plan = planForDay(DAY_A, 0, [], { identity, manual: { lunch: [pick] } })
    const lunch = slotOf(plan, 'lunch')
    expect(lunch.count).toBe(0)
    expect(lunch.droppedManualCount).toBe(1)
  })

  it('reports two slots that would select the same place instead of hiding one', () => {
    const bothMeals = [
      sh(seg('meal', { index: 0, etaMinutes: 735 }), null),
      sh(seg('meal', { index: 1, etaMinutes: 1170, dayEnd: true }), null),
    ]
    const slots = daySlots(0, deps({ haltSegments: bothMeals, dayId: DAY_A, dayOfSegment: undefined }))
    const shared = manual(hit('shared-1', 'Shared Cafe'))
    const plan = buildDayPlan({
      dayIndex: 0,
      slots,
      tripId: TRIP,
      dayId: DAY_A,
      manual: { lunch: [shared], dinner: [shared] },
    })
    const batch = batchSelection(plan)
    expect(batch.items.map(item => item.slotKey)).toEqual(['lunch', 'dinner'])
    expect(batch.items[1].duplicateOfSlotKey).toBe('lunch')
    expect(batch.distinctCount).toBe(1)
  })
})
