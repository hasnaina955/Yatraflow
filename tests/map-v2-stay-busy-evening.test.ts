// F2 item 1: the Stay lens never calls a busy evening free. The window starts
// after the last scheduled stop that falls in it. A day with no free time left
// says so. Real Goa trip, Day 1: check-in 16:33, beach 17:58 for 135 min, then
// dinner at 20:25 for 135 min.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { STAY_DAY_END_MIN, stayWindows, scheduledBusyAfter } from '../src/pages/trip/map/stayLens'
import { stayRailSub } from '../src/components/map/railModel'
import { mapLensesFor, type MapLenses } from '../src/pages/trip/map/useMapLenses'
import { MapLensPanel, type MapLensPanelProps } from '../src/pages/trip/map/MapLensPanel'
import type { ItineraryStop, Trip } from '../src/data/types'

const hm = (h: number, m = 0) => h * 60 + m
const GOA_BUSY = [
  { startMin: hm(17, 58), endMin: hm(20, 13) },
  { startMin: hm(20, 25), endMin: hm(22, 40) },
]

describe('stayWindows with scheduled stops', () => {
  it('gives no free evening when dinner runs past the day end', () => {
    expect(stayWindows({ arriveAtBaseMin: hm(16, 33), leaveBaseMin: null, scheduled: GOA_BUSY })).toEqual([])
  })

  it('starts the evening after the last stop that falls in it', () => {
    expect(stayWindows({ arriveAtBaseMin: hm(16, 33), leaveBaseMin: null, scheduled: [GOA_BUSY[0]] })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: hm(20, 13), endMin: STAY_DAY_END_MIN },
    ])
    expect(stayWindows({ arriveAtBaseMin: hm(14, 0), leaveBaseMin: null, scheduled: [{ startMin: hm(15, 0), endMin: hm(16, 30) }] })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: hm(16, 30), endMin: STAY_DAY_END_MIN },
    ])
  })

  it('ignores a stop that ends before the arrival and an unreadable one', () => {
    expect(stayWindows({
      arriveAtBaseMin: hm(16, 0),
      leaveBaseMin: null,
      scheduled: [{ startMin: hm(9, 0), endMin: hm(10, 0) }, { startMin: Number.NaN, endMin: hm(23, 0) }],
    })).toEqual([{ id: 'evening', label: 'Free evening', startMin: hm(16, 0), endMin: STAY_DAY_END_MIN }])
  })

  it('keeps the old window when nothing is scheduled', () => {
    expect(stayWindows({ arriveAtBaseMin: hm(17, 0), leaveBaseMin: null, scheduled: [] })).toEqual([
      { id: 'evening', label: 'Free evening', startMin: hm(17, 0), endMin: STAY_DAY_END_MIN },
    ])
  })
})

describe('scheduledBusyAfter', () => {
  const stops = [
    { id: 'hotel', visitMinutes: 0 },
    { id: 'beach', visitMinutes: 135 },
    { id: 'dinner', visitMinutes: 135 },
  ]
  it('reads the stops after the base from the day schedule', () => {
    expect(scheduledBusyAfter({
      activeStops: stops,
      arrivalTimes: ['16:33', '17:58', '20:25'],
      departures: ['16:33', '20:13', '22:40'],
    }, 0)).toEqual(GOA_BUSY)
  })

  it('falls back to the visit length when a departure is missing', () => {
    expect(scheduledBusyAfter({ activeStops: stops, arrivalTimes: ['16:33', '17:58', '20:25'] }, 0)).toEqual([
      { startMin: hm(17, 58), endMin: hm(17, 58) + 135 },
      { startMin: hm(20, 25), endMin: hm(20, 25) + 135 },
    ])
  })

  it('has no busy time when the base is not on the schedule', () => {
    expect(scheduledBusyAfter({ activeStops: stops, arrivalTimes: ['16:33', '17:58', '20:25'] }, -1)).toEqual([])
  })
})

function goaTrip(): Trip {
  const hotel: ItineraryStop = {
    id: 'hotel', title: 'Check in · Agoa Palace hotel', category: 'hotel', locationName: 'Candolim',
    lat: 15.52, lng: 73.76, visitMinutes: 0, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', status: 'confirmed', orderInDay: 3,
  }
  return {
    id: 'goa', name: 'Goa', startLocation: 'South Mumbai', startLocationCoords: { lat: 18.94, lng: 72.83 },
    destinations: ['Goa'], destinationCoords: [{ lat: 15.5, lng: 73.8 }],
    startDate: '2026-09-15', endDate: '2026-09-19', travellers: 2, transportMode: 'car',
    roundTrip: false, budgetPerPersonInr: 20000, travelStyle: 'balanced', fixedCommitments: [],
    days: [{ id: 'd0', index: 0, title: 'Mumbai to Panjim', startTime: '05:00', stops: [hotel] }],
    expenses: [], coverEmoji: 'car', visibility: 'private', createdAt: 0, updatedAt: 0,
  }
}

function goaLenses(departures: string[] | undefined): MapLenses {
  const trip = goaTrip()
  const hotel = trip.days[0].stops[0]
  return mapLensesFor({
    trip, dayIndex: 0, status: { kind: 'ready', source: 'scan' }, rows: [], slots: [], budgetMin: 25,
    schedule: {
      activeStops: [hotel, { ...hotel, id: 'beach', category: 'beach', visitMinutes: 135 }, { ...hotel, id: 'dinner', category: 'food', visitMinutes: 135 }],
      arrivalTimes: ['16:33', '17:58', '20:25'],
      ...(departures ? { departures } : {}),
    },
    clock: (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`,
    dayLabel: 'Day 1',
  })
}

describe('the Stay lens on the real Goa Day 1', () => {
  it('offers no free evening and says that no free time is left', () => {
    for (const departures of [['16:33', '20:13', '22:40'], undefined]) {
      const out = goaLenses(departures)
      expect(out.stay.windows).toEqual([])
      expect(out.stay.noFreeTime).toBe(true)
      expect(out.counts.stay).toBeNull()
    }
  })

  it('shows the no-free-time line, never the free window', () => {
    const lenses = goaLenses(['16:33', '20:13', '22:40'])
    const props: MapLensPanelProps = {
      lens: 'stay', lenses, dayLabel: 'Day 1', dayNumber: 1, clock: (min: number) => String(min),
      activeDriveTab: null, onDriveTab: () => undefined, stripOf: () => ({ arrive: null, detour: null, budget: null }),
      bandOf: () => 'inside', introOf: () => null, onOpenDrive: () => undefined, onAddDrive: () => undefined,
      activeStayWindow: null, onStayWindow: () => undefined, stayRing: 'walk-15', onStayRing: () => undefined,
      onOpenStayPick: () => undefined, onAddStayPick: () => undefined, onSetStay: () => undefined,
      onOpenGapPick: () => undefined, onAddGapPick: () => undefined, onApplyFix: () => undefined, onPreviewFix: () => undefined,
    }
    const markup = renderToStaticMarkup(createElement(MapLensPanel, props))
    expect(markup).toContain('Stay · No free time')
    expect(markup).not.toMatch(/FREE|Free evening/)
  })
})

describe('the stay header on a day with no free evening', () => {
  it('says so after the arrival, and never claims a free window', () => {
    expect(stayRailSub({ arriveText: '4:33 PM', commitmentTitle: null, commitmentText: null, freeStartMin: null, freeEndMin: null, noFreeEvening: true }))
      .toBe('Arrive 4:33 PM · Free evening · None')
    expect(stayRailSub({ arriveText: '4:33 PM', commitmentTitle: null, commitmentText: null, freeStartMin: hm(17), freeEndMin: hm(21), noFreeEvening: false }))
      .toBe('Arrive 4:33 PM · Free time · 4 h')
    expect(stayRailSub({ arriveText: null, commitmentTitle: null, commitmentText: null, freeStartMin: null, freeEndMin: null }))
      .toBeNull()
  })

  it('keeps no evening window while a beach and a dinner fill it', () => {
    const lenses = goaLenses(['16:33', '20:13', '22:40'])
    expect(lenses.stay.noFreeTime).toBe(true)
    expect(lenses.stay.windows.some(window => window.id === 'evening')).toBe(false)
  })
})
