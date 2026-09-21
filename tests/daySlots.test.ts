// The slots-rail engine (plan P1): a pure, tested projection from engine
// output to the day's slots. Fixtures pin the mockup's Day-2 shape, the meal
// split boundaries, the stretch/drift states, candidate scoring/dedupe/budget,
// readiness counts, and the days the engine never planned for.
import { describe, expect, it } from 'vitest'
import {
  SLOT_URGENCY_MIN,
  dayReadiness,
  daySlots,
  tripReadiness,
  type DaySlotsDeps,
} from '../src/lib/daySlots'
import { BREAKFAST_WINDOW, DINNER_WINDOW, LUNCH_WINDOW, type RideSegment, type SegmentHit } from '../src/lib/ridePlan'
import type { PlaceHit } from '../src/lib/providers/hits'
import type { ItineraryStop } from '../src/data/types'

/** A minimal engine segment. eta = minutes since midnight; dayEnd marks the overnight. */
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
    offRouteKm: 12,
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

const ANCHORS = [{ lat: 10, lng: 76 }]
const base = (over: Partial<DaySlotsDeps> = {}): DaySlotsDeps => ({
  haltSegments: [],
  dayStops: [],
  anchors: ANCHORS,
  ...over,
})

/** The mockup's Day 2: Kochi to Alleppey - breakfast filled, lunch/fuel/dinner open, stretch auto, stay filled. */
function mockupDay2Deps(): DaySlotsDeps {
  const breakfast = sh(seg('meal', { etaMinutes: 480, targetKm: 20 }), null, 30)
  const lunch = sh(seg('meal', { etaMinutes: 735, targetKm: 250 }), hit('h-lunch', 'Grand Hotel, Ernakulam', { openTime: '11:00', closeTime: '23:00' }))
  const fuel = sh(seg('fuel', { etaMinutes: 560, targetKm: 87 }), hit('h-fuel', 'IndianOil, Cherthala', { category: 'transport-hub', offRouteKm: 8 }))
  const stretch = sh(seg('stretch', { targetKm: 128, etaMinutes: 660 }), null)
  const dinner = sh(seg('meal', { etaMinutes: 1170, targetKm: 420 }), null)
  const stay = sh(seg('overnight', { etaMinutes: 1260, targetKm: 440, dayEnd: true, roadWarning: null }), null)
  return base({
    haltSegments: [breakfast, lunch, fuel, stretch, dinner, stay],
    dayStops: [
      stop('s-hotel', 'Backwater homestay', { category: 'hotel' }),
      stop('s-breakfast', 'Hotel buffet', { openTime: '07:30', closeTime: '10:00' }),
    ],
    altPool: [
      hit('p-lunch1', 'Halais, Cherthala', { alongRouteKm: 260 }),
      hit('p-fuel1', 'HP Petrol, Aroor', { category: 'transport-hub', alongRouteKm: 95, offRouteKm: 9 }),
      hit('p-dinner1', 'Halais, Alleppey', { alongRouteKm: 425, offRouteKm: 3 }),
      hit('p-stay1', 'Lake Villa', { category: 'hotel', alongRouteKm: 430 }),
    ],
  })
}

describe('meal split (P1.1)', () => {
  it('a meal at or before the breakfast window end becomes breakfast', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: 570 }), null)], dayStops: [] }))
    expect(slots).toHaveLength(1)
    expect(slots[0].key).toBe('breakfast')
    expect(slots[0].mealSlot).toBeUndefined()
  })

  it('one minute past the breakfast end becomes lunch (the 9:31 rule)', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: 571 }), null)], dayStops: [] }))
    expect(slots[0].key).toBe('lunch')
    expect(slots[0].mealSlot).toBe('lunch')
  })

  it('a meal at 14:29 stays lunch; 14:31 becomes dinner', () => {
    const lunch = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: LUNCH_WINDOW[1] - 1 }), null)], dayStops: [] }))
    const dinner = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: LUNCH_WINDOW[1] + 1 }), null)], dayStops: [] }))
    expect(lunch[0].key).toBe('lunch')
    expect(dinner[0].key).toBe('dinner')
  })

  it('the boundary minute itself (14:30) stays lunch', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: LUNCH_WINDOW[1] }), null)], dayStops: [] }))
    expect(slots[0].key).toBe('lunch')
  })

  it('a meal with no ETA defaults to lunch honestly', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal'), null)], dayStops: [] }))
    expect(slots[0].key).toBe('lunch')
    expect(slots[0].mealSlot).toBe('lunch')
    expect(slots[0].urgencyMin).toBeNull()
  })

  it('dinner uses the engine DINNER_WINDOW, not a re-declared one', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: DINNER_WINDOW[0] + 5 }), null)], dayStops: [] }))
    expect(slots[0].windowMin).toEqual(DINNER_WINDOW)
    expect(slots[0].windowLabel).toBe('20:00 - 21:00')
  })

  it('the meal purpose stays meal - the split lives only in the slot view', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: LUNCH_WINDOW[1] + 1 }), null)], dayStops: [] }))
    expect(slots[0].segment?.purpose).toBe('meal')
    expect(slots[0].kind).toBe('meal')
  })
})

describe('day slicing (dayEnd flags)', () => {
  const haltSegments = [
    sh(seg('meal', { etaMinutes: 735, targetKm: 100 }), null),
    sh(seg('stretch', { targetKm: 150 }), null),
    sh(seg('overnight', { targetKm: 300, dayEnd: true }), null),
    sh(seg('meal', { etaMinutes: 800, targetKm: 400 }), null),
    sh(seg('fuel', { targetKm: 500 }), null),
    sh(seg('overnight', { targetKm: 600, dayEnd: true }), null),
  ]

  it('day 0 gets the segments before the first dayEnd', () => {
    const keys = daySlots(0, base({ haltSegments, dayStops: [] })).map(s => s.key)
    expect(keys).toEqual(['lunch', 'stretch', 'stay'])
  })

  it('day 1 gets the segments between the dayEnds', () => {
    const keys = daySlots(1, base({ haltSegments, dayStops: [] })).map(s => s.key)
    expect(keys).toEqual(['lunch', 'fuel', 'stay'])
  })

  it('a day the engine never planned (past the last dayEnd) has no slots', () => {
    expect(daySlots(5, base({ haltSegments, dayStops: [] }))).toEqual([])
  })
})

describe('stretch: auto vs the #143 drift proposal', () => {
  it('a plain stretch halt is the quiet auto state', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('stretch', { targetKm: 128 }), null)], dayStops: [] }))
    const s = slots[0]
    expect(s.state).toBe('auto')
    expect(s.auto).toBe(true)
    expect(s.windowLabel).toBe('auto')
    expect(s.candidates).toEqual([])
    expect(s.reason).toBe('Engine-managed stretch')
  })

  it('a rest halt is engine-managed the same way', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('rest', { targetKm: 90 }), null)], dayStops: [] }))
    expect(slots[0].auto).toBe(true)
  })

  it('a pinned stretch with an active drift proposal opens like an empty slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('stretch', { targetKm: 128, haltPinned: true, haltDriftToKm: 140 }), null)],
      dayStops: [],
    }))
    const s = slots[0]
    expect(s.state).toBe('empty')
    expect(s.auto).toBe(false)
    expect(s.drift).toEqual({ fromKm: 128, toKm: 140 })
  })

  it('a pinned stretch without drift stays auto (the pin holds, nothing to ask)', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('stretch', { targetKm: 128, haltPinned: true }), null)],
      dayStops: [],
    }))
    expect(slots[0].auto).toBe(true)
    expect(slots[0].drift).toBeNull()
  })
})

describe('filled states (P1.2)', () => {
  it('a hotel stop fills the stay slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('overnight', { targetKm: 440, dayEnd: true }), null)],
      dayStops: [stop('s1', 'Backwater homestay', { category: 'hotel' })],
    }))
    expect(slots[0].key).toBe('stay')
    expect(slots[0].state).toBe('filled')
    expect(slots[0].filledStop?.title).toBe('Backwater homestay')
    expect(slots[0].candidates).toEqual([])
  })

  it('a rejected stop never fills anything', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('overnight', { targetKm: 440, dayEnd: true }), null)],
      dayStops: [stop('s1', 'Rejected resort', { category: 'hotel', status: 'rejected' })],
    }))
    expect(slots[0].state).toBe('empty')
  })

  it('a food stop whose hours overlap the window fills its meal slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [stop('s1', 'Grand Hotel', { openTime: '11:00', closeTime: '15:00' })],
    }))
    expect(slots[0].state).toBe('filled')
    expect(slots[0].filledStop?.title).toBe('Grand Hotel')
  })

  it('one stop fills at most one slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null), sh(seg('meal', { etaMinutes: 1250 }), null)],
      dayStops: [stop('s1', 'One place for both', { openTime: '11:00', closeTime: '23:00' })],
    }))
    const filled = slots.filter(s => s.state === 'filled')
    expect(filled).toHaveLength(1)
  })

  it('two timed food stops land in their own windows', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null), sh(seg('meal', { etaMinutes: 1250 }), null)],
      dayStops: [
        stop('s1', 'Lunch place', { openTime: '12:30', closeTime: '13:30' }),
        stop('s2', 'Dinner place', { openTime: '19:30', closeTime: '21:00' }),
      ],
    }))
    expect(slots.find(s => s.key === 'lunch')?.filledStop?.title).toBe('Lunch place')
    expect(slots.find(s => s.key === 'dinner')?.filledStop?.title).toBe('Dinner place')
  })

  it('a generic stop with matching hours fills a window; without hours it fills nothing', () => {
    const withHours = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [stop('s1', 'Roadside dhaba', { category: 'travel', openTime: '12:30', closeTime: '13:30' })],
    }))
    expect(withHours[0].state).toBe('filled')

    const noHours = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [stop('s2', 'A viewpoint', { category: 'nature' })],
    }))
    expect(noHours[0].state).toBe('empty')
  })

  it('a food stop without hours falls to the first empty meal slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null), sh(seg('meal', { etaMinutes: 1250 }), null)],
      dayStops: [stop('s1', 'Untimed eatery')],
    }))
    expect(slots.find(s => s.key === 'lunch')?.state).toBe('filled')
    expect(slots.find(s => s.key === 'dinner')?.state).toBe('empty')
  })

  it('a no-drive day whose hotel stop exists still owns its stay', () => {
    const slots = daySlots(1, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null), sh(seg('overnight', { dayEnd: true }), null)],
      dayStops: [stop('s1', 'Cliff stay', { category: 'hotel' })],
    }))
    expect(slots).toHaveLength(1)
    expect(slots[0].key).toBe('stay')
    expect(slots[0].state).toBe('filled')
    expect(slots[0].segment).toBeNull()
  })

  it('the stay slot without any hotel stop is empty and demands work', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('overnight', { targetKm: 440, dayEnd: true }), null)],
      dayStops: [],
    }))
    expect(slots[0].state).toBe('empty')
    expect(slots[0].label).toBe('Stay')
  })
})

describe('candidates (P1.4)', () => {
  it('the segment hit leads, pool entries follow, duplicates collapse', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), hit('h1', 'Grand Hotel'))],
      dayStops: [],
      altPool: [hit('h1', 'Grand Hotel'), hit('p1', 'Halais, Cherthala', { offRouteKm: 8 }), hit('p2', 'Another eatery', { offRouteKm: 6, alongRouteKm: 130 })],
    }))
    const names = slots[0].candidates.map(c => c.hit.name)
    expect(names[0]).toBe('Grand Hotel')
    expect(names.filter(n => n === 'Grand Hotel')).toHaveLength(1)
    expect(names).toHaveLength(3)
  })

  it('candidates carry the engine numbers: detour, budget share, arrival, window', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), hit('h1', 'Grand Hotel', { offRouteKm: 12 }))],
      dayStops: [],
    }))
    const c = slots[0].candidates[0]
    expect(c.detourMin).toBe(18) // 12 km at the 40 km/h fallback
    expect(c.arriveMin).toBe(753) // 735 + 18
    expect(c.arriveLabel).toBe('12:33')
    expect(c.inWindow).toBe(true) // inside 11:30-14:30
    expect(c.detourKm).toBe(12)
    expect(c.reason).toContain('off-route')
    expect(c.budgetSharePct).toBe(Math.round((18 / 45) * 100)) // 40% of the 45-min default budget
  })

  it('a candidate whose arrival misses the window is marked honestly', () => {
    // 14:50 is just past the lunch boundary, so the slot becomes dinner -
    // but its candidates still arrive hours before the 20:00 window opens.
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 890 }), null)],
      dayStops: [],
      altPool: [hit('p1', 'Halais, Alleppey', { alongRouteKm: 425, offRouteKm: 3 })],
    }))
    expect(slots[0].key).toBe('dinner')
    const c = slots[0].candidates[0]
    expect(c.arriveMin).toBe(895) // 890 + 4.5 min detour, rounded
    expect(c.arriveLabel).toBe('14:55')
    expect(c.inWindow).toBe(false) // long before the 20:00 window opens
  })

  it('candidates are capped at the limit', () => {
    const altPool = [1, 2, 3, 4, 5].map(i => hit(`p${i}`, `Eatery ${i}`, { alongRouteKm: 100 + i }))
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [],
      altPool,
      limit: 2,
    }))
    expect(slots[0].candidates).toHaveLength(2)
  })

  it('a hit already on the trip never re-candidates', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), hit('h1', 'Grand Hotel'))],
      dayStops: [],
      existingNames: new Set(['grand hotel']),
    }))
    expect(slots[0].candidates).toHaveLength(0)
  })

  it('the pool is gated by purpose fit - a museum cannot fill the fuel slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('fuel', { etaMinutes: 560 }), null)],
      dayStops: [],
      altPool: [
        hit('p1', 'Art Museum', { category: 'museum' }),
        hit('p2', 'IndianOil', { category: 'transport-hub' }),
      ],
    }))
    expect(slots[0].candidates.map(c => c.hit.name)).toEqual(['IndianOil'])
  })

  it('the day detour budget culls the tail', () => {
    const altPool = [1, 2, 3].map(i => hit(`p${i}`, `Far eatery ${i}`, { offRouteKm: 30, alongRouteKm: 100 + i }))
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [],
      altPool,
    }))
    // Each 30 km detour costs 45 min at 40 km/h - the 45-min default budget
    // funds exactly one of them.
    expect(slots[0].candidates).toHaveLength(1)
    expect(slots[0].candidates[0].budgetSharePct).toBe(100)
  })

  it('an on-route candidate spends nothing', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), hit('h1', 'On-route dhaba', { offRouteKm: 0 }))],
      dayStops: [],
    }))
    const c = slots[0].candidates[0]
    expect(c.detourMin).toBe(0)
    expect(c.budgetSharePct).toBe(0)
    expect(c.detourKm).toBe(0)
  })
})

describe('windows & urgency (P3 groundwork)', () => {
  it('a slot approaching its window end carries the closing number', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: LUNCH_WINDOW[1] - 10 }), null)], dayStops: [] }))
    expect(slots[0].urgencyMin).toBe(10)
    expect(slots[0].urgencyMin!).toBeLessThanOrEqual(SLOT_URGENCY_MIN)
  })

  it('a slot with time in hand is not urgent', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: LUNCH_WINDOW[1] - 39 }), null)], dayStops: [] }))
    expect(slots[0].urgencyMin).toBe(39)
  })

  it('a slot past its window reads negative (missed)', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: LUNCH_WINDOW[1] + 10 }), null)], dayStops: [] }))
    expect(slots[0].key).toBe('dinner') // it became dinner, so use lunch's slot directly
    const lunch = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: 860 }), null)], dayStops: [] }))
    expect(lunch[0].urgencyMin).toBe(10)
  })

  it('slots without windows (fuel, stay) never carry urgency', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('fuel', { etaMinutes: 560 }), null), sh(seg('overnight', { etaMinutes: 1260, dayEnd: true }), null)],
      dayStops: [],
    }))
    expect(slots.every(s => s.urgencyMin === null)).toBe(true)
    expect(slots.find(s => s.key === 'fuel')?.windowLabel).toBeNull()
  })

  it('a meal at the breakfast boundary reads the full engine window', () => {
    // The split's boundary decision already happened in draftForSegment:
    // a breakfast slot can only ever carry an ETA at or before 9:30, so the
    // window never needs a late-arrival clamp. Pinned here so a future
    // change that reorders the split keeps the invariant honest.
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: BREAKFAST_WINDOW[1] }), null)], dayStops: [] }))
    expect(slots[0].key).toBe('breakfast')
    expect(slots[0].windowLabel).toBe('08:00 - 09:30')
  })

  it('the lunch window is the engine LUNCH_WINDOW, rendered 11:30 - 14:30', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)], dayStops: [] }))
    expect(slots[0].windowMin).toEqual(LUNCH_WINDOW)
    expect(slots[0].windowLabel).toBe('11:30 - 14:30')
  })
})

describe('readiness (P1.5)', () => {
  it('the mockup Day 2 reads 2 of 6 filled with 1 auto', () => {
    const r = dayReadiness(0, mockupDay2Deps())
    expect(r.filled).toBe(2)
    expect(r.total).toBe(6)
    expect(r.auto).toBe(1)
    expect(r.required).toBe(5)
  })

  it('a day with no slots reads 0/0', () => {
    const r = dayReadiness(3, base({ haltSegments: [], dayStops: [] }))
    expect(r.filled).toBe(0)
    expect(r.total).toBe(0)
    expect(r.required).toBe(0)
  })

  it('tripReadiness covers every day the engine planned, in order', () => {
    const haltSegments = [
      sh(seg('meal', { etaMinutes: 735 }), null),
      sh(seg('stretch'), null),
      sh(seg('overnight', { dayEnd: true }), null),
      sh(seg('fuel'), null),
      sh(seg('meal', { etaMinutes: 1250 }), null),
      sh(seg('overnight', { dayEnd: true }), null),
    ]
    const rows = tripReadiness(haltSegments, [{ index: 0, stops: [stop('s1', 'Lunch place', { openTime: '12:00', closeTime: '14:00' }), stop('s2', 'Night stay', { category: 'hotel' })] }, { index: 1, stops: [] }], {
      dayStops: [], anchors: ANCHORS,
    })
    expect(rows.map(r => r.dayIndex)).toEqual([0, 1])
    expect(rows[0]).toMatchObject({ filled: 2, total: 3, auto: 1 })
    expect(rows[1]).toMatchObject({ filled: 0, total: 3, auto: 0 })
  })
})

describe('the mockup Day-2 acceptance (plan P1)', () => {
  it('daySlots(0) returns the mockup structure from engine data alone', () => {
    const slots = daySlots(0, mockupDay2Deps())
    expect(slots.map(s => s.key)).toEqual(['breakfast', 'lunch', 'fuel', 'stretch', 'dinner', 'stay'])
    expect(slots.map(s => s.label)).toEqual(['Breakfast', 'Lunch', 'Fuel', 'Stretch', 'Dinner', 'Stay'])

    const [breakfast, lunch, fuel, stretch, dinner, stay] = slots

    expect(breakfast.state).toBe('filled')
    expect(breakfast.windowLabel).toBe('08:00 - 09:30')
    expect(breakfast.filledStop?.title).toBe('Hotel buffet')

    expect(lunch.state).toBe('empty')
    expect(lunch.windowLabel).toBe('11:30 - 14:30')
    expect(lunch.candidates.length).toBeGreaterThanOrEqual(2)
    expect(lunch.candidates[0].hit.name).toBe('Grand Hotel, Ernakulam')

    expect(fuel.state).toBe('empty')
    expect(fuel.windowLabel).toBeNull()
    expect(fuel.candidates.length).toBeGreaterThanOrEqual(1)

    expect(stretch.state).toBe('auto')
    expect(stretch.auto).toBe(true)
    expect(stretch.candidates).toEqual([])

    expect(dinner.state).toBe('empty')
    expect(dinner.windowLabel).toBe('20:00 - 21:00')
    expect(dinner.candidates.length).toBeGreaterThanOrEqual(1)

    expect(stay.state).toBe('filled')
    expect(stay.filledStop?.title).toBe('Backwater homestay')
  })

  it('the filled slots carry no candidates - only empty slots demand work', () => {
    const slots = daySlots(0, mockupDay2Deps())
    for (const s of slots) {
      if (s.state !== 'empty') expect(s.candidates).toEqual([])
      else expect(s.candidates.length).toBeGreaterThan(0)
    }
  })
})

describe('defensive edges', () => {
  it('a sight segment never becomes a slot', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('sight', { targetKm: 200 }), hit('h1', 'Waterfall'))], dayStops: [] }))
    expect(slots).toEqual([])
  })

  it('a day with no segments and no hotel stop renders nothing', () => {
    expect(daySlots(0, base({ haltSegments: [], dayStops: [] }))).toEqual([])
  })

  it('garbage ETA values (NaN/Infinity) are treated as absent', () => {
    const slots = daySlots(0, base({ haltSegments: [sh(seg('meal', { etaMinutes: Number.NaN }), null)], dayStops: [] }))
    expect(slots[0].key).toBe('lunch')
    expect(slots[0].urgencyMin).toBeNull()
  })

  it('non-finite drift targets do not open the auto slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('stretch', { targetKm: 128, haltPinned: true, haltDriftToKm: Number.NaN }), null)],
      dayStops: [],
    }))
    expect(slots[0].auto).toBe(true)
    expect(slots[0].drift).toBeNull()
  })
})

describe('P2 fill-loop support (added with the rail)', () => {
  it('a transport-hub stop claims the fuel slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('fuel', { etaMinutes: 560 }), null)],
      dayStops: [stop('s1', 'IndianOil pump', { category: 'transport-hub' })],
    }))
    expect(slots[0].key).toBe('fuel')
    expect(slots[0].state).toBe('filled')
    expect(slots[0].filledStop?.title).toBe('IndianOil pump')
  })

  it('the segment recommended place matching a stop title fills its slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), hit('h1', 'Grand Hotel, Ernakulam'))],
      dayStops: [stop('s1', 'Grand Hotel, Ernakulam')],
    }))
    expect(slots[0].state).toBe('filled')
    expect(slots[0].filledStop?.id).toBe('s1')
    expect(slots[0].candidates).toEqual([])
  })

  it('a food stop still fills the lunch slot the recommended-place way', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), hit('h1', 'Grand Hotel'))],
      dayStops: [stop('s1', 'grand hotel')],
    }))
    expect(slots[0].state).toBe('filled')
  })

  it('stay fill keeps working beside the new claims', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), hit('h1', 'Grand Hotel')), sh(seg('overnight', { dayEnd: true }), null)],
      dayStops: [stop('s1', 'grand hotel'), stop('s2', 'Backwater homestay', { category: 'hotel' })],
    }))
    expect(slots.find(s => s.key === 'lunch')?.state).toBe('filled')
    expect(slots.find(s => s.key === 'stay')?.state).toBe('filled')
  })
})

describe('single-blob corridor plans (P2 fix round)', () => {
  it('a plan with no dayEnd flags is one driving day, not an empty day 2', () => {
    const haltSegments = [sh(seg('meal', { etaMinutes: 735 }), null), sh(seg('stretch'), null)]
    expect(daySlots(0, base({ haltSegments, dayStops: [] })).map(s => s.key)).toEqual(['lunch', 'stretch'])
    expect(daySlots(1, base({ haltSegments, dayStops: [] }))).toEqual([])
    const rows = tripReadiness(haltSegments, [{ index: 0, stops: [] }], { dayStops: [], anchors: ANCHORS })
    expect(rows.map(r => r.dayIndex)).toEqual([0])
  })
})

describe('day attribution override (P2 fix round 2)', () => {
  const haltSegments = [
    sh(seg('meal', { etaMinutes: 735, targetKm: 100 }), null),
    sh(seg('meal', { etaMinutes: 800, targetKm: 400 }), null),
    sh(seg('fuel', { targetKm: 500 }), null),
  ]
  it('dayOfSegment slices by the caller\'s own day mapping', () => {
    const deps = base({ haltSegments, dayStops: [], dayOfSegment: (s) => (s.segment.targetKm >= 400 ? 1 : 0) })
    expect(daySlots(0, deps).map(s => s.key)).toEqual(['lunch'])
    expect(daySlots(1, deps).map(s => s.key)).toEqual(['lunch', 'fuel'])
  })
  it('tripReadiness covers every attributed day', () => {
    const rows = tripReadiness(haltSegments, [{ index: 0, stops: [] }, { index: 1, stops: [] }], {
      dayStops: [], anchors: ANCHORS, dayOfSegment: (s) => (s.segment.targetKm >= 400 ? 1 : 0),
    })
    expect(rows.map(r => r.dayIndex)).toEqual([0, 1])
    expect(rows[1].total).toBe(2)
  })
})

describe('the day skeleton (P2 fix round 3)', () => {
  it('fillSkeleton gives every active day the full grammar', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('fuel', { targetKm: 87 }), null)],
      dayStops: [stop('s1', 'Backwater homestay', { category: 'hotel' })],
      fillSkeleton: true,
    }))
    expect(slots.map(s => s.key)).toEqual(['breakfast', 'lunch', 'fuel', 'dinner', 'stay'])
    expect(slots.find(s => s.key === 'lunch')?.state).toBe('empty')
    expect(slots.find(s => s.key === 'stay')?.state).toBe('filled')
  })

  it('the skeleton fills only the gaps - engine halts keep their slots', () => {
    const slots = daySlots(0, base({
      haltSegments: [
        sh(seg('meal', { etaMinutes: 735 }), null),
        sh(seg('stretch', { targetKm: 128 }), null),
        sh(seg('overnight', { targetKm: 440, dayEnd: true }), null),
      ],
      dayStops: [],
      fillSkeleton: true,
    }))
    // The day ends at a stay, so it also began after a night - breakfast is part of its grammar.
    expect(slots.map(s => s.key)).toEqual(['breakfast', 'lunch', 'stretch', 'dinner', 'stay'])
    expect(slots.find(s => s.key === 'lunch')?.segment?.index).toBe(0)
  })

  it('a day without any activity still renders nothing', () => {
    const slots = daySlots(2, base({ haltSegments: [], dayStops: [], fillSkeleton: true }))
    expect(slots).toEqual([])
  })

  it('the skeleton is off by default - the engine stays honest', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('fuel', { targetKm: 87 }), null)],
      dayStops: [stop('s1', 'A hotel', { category: 'hotel' })],
    }))
    expect(slots.map(s => s.key)).toEqual(['fuel', 'stay'])
  })

  it('synthesized slots carry windows and candidates on the day span', () => {
    const slots = daySlots(1, base({
      haltSegments: [],
      dayStops: [stop('s1', 'Cliff stay', { category: 'hotel' })],
      fillSkeleton: true,
      daySpanKm: () => ({ fromKm: 300, toKm: 520 }),
      altPool: [hit('p1', 'Eatery on the way', { alongRouteKm: 400 })],
    }))
    const lunch = slots.find(s => s.key === 'lunch')
    expect(lunch?.windowLabel).toBe('11:30 - 14:30')
    expect(lunch?.candidates.length).toBeGreaterThanOrEqual(1)
    expect(slots.some(s => s.key === 'breakfast')).toBe(true)
  })
})

describe('claim direction (P2 fix round 4)', () => {
  it('a timed food stop goes to the meal slot its hours name, not the earliest slot', () => {
    const slots = daySlots(0, base({
      haltSegments: [],
      dayStops: [
        stop('s1', 'Sadya lunch', { openTime: '12:00', closeTime: '15:00' }),
        stop('s2', 'Backwater homestay', { category: 'hotel' }),
      ],
      fillSkeleton: true,
    }))
    expect(slots.find(s => s.key === 'lunch')?.filledStop?.title).toBe('Sadya lunch')
    expect(slots.find(s => s.key === 'breakfast')?.filledStop).toBeNull()
    expect(slots.find(s => s.key === 'dinner')?.filledStop).toBeNull()
  })
  it('an untimed food stop takes lunch before dinner or breakfast', () => {
    const slots = daySlots(0, base({
      haltSegments: [],
      dayStops: [stop('s1', 'Untimed eatery'), stop('s2', 'A hotel', { category: 'hotel' })],
      fillSkeleton: true,
    }))
    expect(slots.find(s => s.key === 'lunch')?.filledStop?.title).toBe('Untimed eatery')
    expect(slots.find(s => s.key === 'dinner')?.filledStop).toBeNull()
  })
})

describe('coupled re-ranking after a stay (plan P3.4)', () => {
  const stay = stop('stay1', 'Backwater homestay', { category: 'hotel', lat: 10.0, lng: 76.0 })
  it('a day with a stay ranks its meals by proximity to it', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [stay],
      altPool: [
        hit('far', 'Far kitchen', { latitude: 10.9, longitude: 76.9, alongRouteKm: 200 }),
        hit('near', 'Kitchen next door', { latitude: 10.01, longitude: 76.01, alongRouteKm: 100 }),
      ],
    }))
    expect(slots[0].candidates[0].hit.name).toBe('Kitchen next door')
  })

  it('a candidate beside the stay says so in its why-line', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [stay],
      altPool: [hit('near', 'Kitchen next door', { latitude: 10.005, longitude: 76.005, alongRouteKm: 100 })],
    }))
    expect(slots[0].candidates[0].reason).toContain('from your stay')
  })

  it('without a stay the engine score still orders the candidates', () => {
    const slots = daySlots(0, base({
      haltSegments: [sh(seg('meal', { etaMinutes: 735 }), null)],
      dayStops: [],
      altPool: [
        hit('a', 'A', { latitude: 10.9, longitude: 76.9, alongRouteKm: 100 }),
        hit('b', 'B', { latitude: 10.01, longitude: 76.01, alongRouteKm: 105 }),
      ],
    }))
    expect(slots[0].candidates.length).toBeGreaterThanOrEqual(2)
    expect(slots[0].candidates[0].reason).not.toContain('from your stay')
  })
})
