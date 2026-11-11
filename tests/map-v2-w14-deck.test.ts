// W14 deck: the real add preview lines, the road clock at a pick, and the deck
// provenance line. These are pure facts; no DOM is needed.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Trip } from '../src/data/types'
import { MapPickCard } from '../src/components/map/MapPickCard'
import { compactCount, deckSourceLine, kindWordOf } from '../src/components/map/placeCardFacts'
import { detailPreviewView } from '../src/pages/trip/map/detailPreview'
import { passClockMin, pickArrivalMin } from '../src/pages/trip/map/passClock'
import type { AddPreview, ReadyAddPreview } from '../src/pages/trip/map/editing/addPreview'
import { makeHit } from './helpers/journeyProjectionFixture'

const clock = (hm: string) => hm

function ready(over: Partial<ReadyAddPreview> = {}): ReadyAddPreview {
  return {
    kind: 'ready',
    dayIndex: 0,
    stopId: 'farm',
    insertion: { index: 2, order: 3, total: 5, afterTitle: 'Lunch · Nalla Ruchi Kitchen', beforeTitle: 'Check in · Spice Village' },
    road: { legIn: null, legOut: null, replaced: null },
    newStop: { arrive: '13:20', depart: '14:05' },
    keptClocks: [],
    clocks: [
      { stopId: 'hotel', title: 'Check in · Spice Village', from: '13:40', to: '14:41', deltaMin: 61 },
      { stopId: 'dinner', title: 'Dinner', from: '20:00', to: '20:00', deltaMin: 0 },
    ],
    dayEnd: { from: '20:00', to: '20:00', deltaMin: 0 },
    warnings: { added: [], cleared: [] },
    netAddedMin: 45,
    unknownFacts: [],
    impact: {} as ReadyAddPreview['impact'],
    proposedTrip: {} as Trip,
    ...over,
  }
}

describe('the place detail preview', () => {
  it('writes the stop order, the moved clock and the calm last line', () => {
    const view = detailPreviewView(ready(), clock)
    expect(view.lines[0]?.parts.map(part => part.text).join('')).toBe('Lands as stop 3, in road order after lunch')
    expect(view.lines[1]?.parts.map(part => part.text).join('')).toBe('Spice Village 13:40 → 14:41')
    expect(view.lines.at(-1)?.parts.map(part => part.text).join('')).toBe('Dinner and the day’s end do not move')
  })

  it('keeps the engine risk and its real times', () => {
    const view = detailPreviewView(ready({
      warnings: {
        added: [{ code: 'commitment', title: 'Conflicts with Periyar boat', detail: 'You reach Periyar boat ~15:05, after the 15:30 commitment.', severe: true, dayIndex: 0 }],
        cleared: [],
      },
    }), clock)
    const text = view.lines.find(line => line.tone === 'risk')?.parts.map(part => part.text).join('')
    expect(text).toContain('Periyar boat:')
    expect(text).toContain('15:05')
    expect(view.summary?.tone).toBe('risk')
  })

  it('draws the phone fit note from a stay and a held meal', () => {
    const trip = {
      days: [{
        index: 0,
        stops: [
          { id: 'hotel', title: 'Check in · Spice Village', category: 'hotel', slotKey: 'stay' },
          { id: 'lunch', title: 'Lunch · Nalla Ruchi Kitchen', category: 'food', slotKey: 'lunch' },
          { id: 'farm', title: 'Spice farm walk', category: 'nature' },
        ],
      }],
    } as unknown as Trip
    const view = detailPreviewView(ready({
      proposedTrip: trip,
      clocks: [{ stopId: 'hotel', title: 'Check in · Spice Village', from: '13:40', to: '13:40', deltaMin: 0 }],
    }), clock)
    expect(view.summary?.parts.map(part => part.text).join('')).toBe('Spice Village stays at 13:40; lunch time was already held for you')
    expect(view.lines.some(line => line.key === 'fit')).toBe(false)
  })

  it('keeps the calm phone note when later stops move and no risk is added', () => {
    const trip = {
      days: [{
        index: 0,
        stops: [
          { id: 'hotel', title: 'Check in · Spice Village', category: 'hotel', slotKey: 'stay' },
          { id: 'lunch', title: 'Lunch · Nalla Ruchi Kitchen', category: 'food', slotKey: 'lunch' },
          { id: 'farm', title: 'Spice farm walk', category: 'nature' },
        ],
      }],
    } as unknown as Trip
    const view = detailPreviewView(ready({
      proposedTrip: trip,
      clocks: [
        { stopId: 'hotel', title: 'Check in · Spice Village', from: '13:40', to: '13:40', deltaMin: 0 },
        { stopId: 'dinner', title: 'Dinner', from: '20:00', to: '20:20', deltaMin: 20 },
      ],
      dayEnd: { from: '20:00', to: '20:20', deltaMin: 20 },
    }), clock)
    expect(view.summary?.key).toBe('fit')
    expect(view.summary?.parts.map(part => part.text).join('')).toBe('Spice Village stays at 13:40; lunch time was already held for you')
    expect(view.lines.some(line => line.key === 'moved-dinner')).toBe(true)
  })

  it('reads a stay before the insertion as still on its clock', () => {
    const trip = {
      days: [{
        index: 0,
        stops: [
          { id: 'hotel', title: 'Check in · Spice Village', category: 'hotel', slotKey: 'stay' },
          { id: 'lunch', title: 'Lunch · Nalla Ruchi Kitchen', category: 'food', slotKey: 'lunch' },
          { id: 'farm', title: 'Spice farm walk', category: 'nature' },
        ],
      }],
    } as unknown as Trip
    const view = detailPreviewView(ready({
      proposedTrip: trip,
      keptClocks: [{ stopId: 'hotel', title: 'Check in · Spice Village', from: '13:40', to: '13:40', deltaMin: 0 }],
      clocks: [{ stopId: 'dinner', title: 'Dinner', from: '20:00', to: '20:20', deltaMin: 20 }],
      dayEnd: { from: '20:00', to: '20:20', deltaMin: 20 },
    }), clock)
    expect(view.summary?.key).toBe('fit')
    expect(view.summary?.parts.map(part => part.text).join('')).toBe('Spice Village stays at 13:40; lunch time was already held for you')
  })

  it('names an unknown preview reason instead of inventing a line', () => {
    const view = detailPreviewView({ kind: 'unknown', reason: 'position-unknown' } as AddPreview, clock)
    expect(view.kind).toBe('unknown')
    expect(view.lines[0]?.parts[0]?.text).toContain('road order')
  })

  it('does not claim Clears when the same stop gets a worse warning', () => {
    const view = detailPreviewView(ready({
      warnings: {
        added: [{ code: 'commitment', title: 'Conflicts with Periyar boat', detail: 'You reach Periyar boat ~15:52, after the 15:30 commitment.', severe: true, dayIndex: 0 }],
        cleared: [{ code: 'buffer', title: 'Thin buffer before Periyar boat', detail: 'You reach Periyar boat ~15:05, under ~45 min before the 15:30 commitment.', severe: false, dayIndex: 0 }],
      },
    }), clock)
    expect(view.lines.some(line => line.parts.map(part => part.text).join('').startsWith('Clears:'))).toBe(false)
    expect(view.lines.some(line => line.tone === 'risk')).toBe(true)
  })

  it('claims Clears when the stop has no warning after the add', () => {
    const view = detailPreviewView(ready({
      warnings: {
        added: [],
        cleared: [{ code: 'buffer', title: 'Thin buffer before Periyar boat', detail: 'You reach Periyar boat ~15:05, under ~45 min before the 15:30 commitment.', severe: false, dayIndex: 0 }],
      },
    }), clock)
    expect(view.lines.some(line => line.parts.map(part => part.text).join('') === 'Clears: Thin buffer before Periyar boat')).toBe(true)
  })

  it('leaves out the retime line for a fixed booking', () => {
    const trip = {
      fixedCommitments: [{ id: 'lock', dayIndex: 0, stopId: 'boat', title: 'Periyar boat', time: '15:30', type: 'event' }],
      days: [{ index: 0, stops: [{ id: 'boat', title: 'Periyar boat', category: 'nature' }, { id: 'hotel', title: 'Check in · Spice Village', category: 'hotel' }] }],
    } as unknown as Trip
    const view = detailPreviewView(ready({
      proposedTrip: trip,
      clocks: [
        { stopId: 'boat', title: 'Periyar boat', from: '15:30', to: '15:52', deltaMin: 22 },
        { stopId: 'hotel', title: 'Check in · Spice Village', from: '14:00', to: '14:22', deltaMin: 22 },
      ],
      warnings: {
        added: [{ code: 'commitment', title: 'Conflicts with Periyar boat', detail: 'You reach Periyar boat ~15:52, after the 15:30 commitment.', severe: true, dayIndex: 0 }],
        cleared: [],
      },
    }), clock)
    const retimed = view.lines.filter(line => line.key.startsWith('moved-')).map(line => line.key)
    expect(retimed).toEqual(['moved-hotel'])
    expect(view.lines.some(line => line.tone === 'risk')).toBe(true)
  })
})

describe('the road clock at a pick', () => {
  const anchors = [
    { km: 0, arriveMin: 600, departMin: 600 },
    { km: 60, arriveMin: 720, departMin: 720 },
  ]

  it('spreads the clock between two anchors', () => {
    expect(passClockMin(anchors, 30)).toBe(660)
    expect(passClockMin(anchors, 0)).toBe(600)
    expect(passClockMin(anchors, 60)).toBe(720)
  })

  it('returns null outside the anchors or with a missing fact', () => {
    expect(passClockMin(anchors, 61)).toBeNull()
    expect(passClockMin([{ km: 0, arriveMin: null, departMin: null }, anchors[1]!], 30)).toBeNull()
    expect(passClockMin(anchors, null)).toBeNull()
  })

  it('adds the outward half of the detour to the pass clock', () => {
    expect(pickArrivalMin(660, 16)).toBe(668)
    expect(pickArrivalMin(660, null)).toBeNull()
    expect(pickArrivalMin(null, 16)).toBeNull()
  })
})

describe('the deck provenance line', () => {
  const now = 1_000_000_000_000
  it('names each real source once and states the age', () => {
    expect(deckSourceLine({ sources: ['google', 'google', 'osm'], fetchedAt: now - 12 * 60_000, coverage: null, now }))
      .toBe('Google Places and OpenStreetMap · Checked 12 min ago')
  })
  it('stays out when no source is known', () => {
    expect(deckSourceLine({ sources: [null, undefined], fetchedAt: null, coverage: null, now })).toBeNull()
  })
  it('abbreviates a count as the board does and names the kind', () => {
    expect(compactCount(1200)).toBe('1.2k')
    expect(compactCount(12_000)).toBe('12k')
    expect(compactCount(null)).toBeNull()
    expect(kindWordOf('sightseeing')).toBe('Sight')
    expect(kindWordOf(null)).toBe('Place')
  })
})

describe('the card action copy', () => {
  const hit = makeHit({ id: 'g-farm', name: 'Spice farm walk', placeId: 'g-farm', source: 'google', category: 'nature' })
  const trip = { startDate: '2026-11-06', days: [] } as unknown as Trip
  const render = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(MapPickCard, {
    hit, trip, dayIndex: 0, detourMin: 16, reason: null, added: false, editable: true, busy: false,
    shortlisted: false, onAdd: () => {}, onShortlist: () => {}, onClose: () => {}, onDirections: () => {},
    ...over,
  } as never))

  it('takes the stop position from the preview', () => {
    const html = render({ preview: detailPreviewView(ready(), clock) })
    expect(html).toContain('Add as stop 3')
  })

  it('offers the fix only when the caller has a verified offer', () => {
    expect(render()).not.toContain('Add and fix')
    expect(render({ fixOffer: { label: 'Add and fix Periyar boat' }, onAddAndFix: () => {} })).toContain('Add and fix Periyar boat')
  })

  it('shows the used-of budget on the phone when the share is unknown', () => {
    const html = render({ budgetText: '28 of 45' })
    expect(html).toContain('28 of 45')
    expect(html).toContain('data-cell="budget"')
  })
})
