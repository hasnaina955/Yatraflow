// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { radarLines, commitmentTimeLabel } from '../src/lib/createRadar'

const base = {
  commitments: [{ title: 'Houseboat boarding', type: 'hotel-checkin' as const, dayIndex: 2, time: '14:00' }],
  days: 6,
  roadKm: 412,
  roundTrip: true,
  startName: 'Kochi',
}

describe('create radar - the calm pre-create check', () => {
  it('no pinned plans, no lines - silence is the honest default', () => {
    expect(radarLines({ ...base, commitments: [] })).toEqual([])
  })

  it('a pinned plan on the last day of a round trip gets the honest note', () => {
    const lines = radarLines({ ...base, commitments: [{ title: 'Wedding', type: 'event', dayIndex: 5, time: '17:00' }] })
    expect(lines).toHaveLength(1)
    expect(lines[0].headline).toContain('Wedding')
    expect(lines[0].headline).toContain('the last day')
    expect(lines[0].headline).toContain('206 km')
    expect(lines[0].detail).toContain('5:00pm')
    expect(lines[0].detail).toContain('protected')
  })

  it('a pinned plan on a middle day earns no drive-home line - and no invented one either', () => {
    // a mid-trip train on an otherwise quiet day is normal; saying nothing is correct
    const lines = radarLines({ ...base, commitments: [{ title: 'Train 12626', type: 'train-departure', dayIndex: 1, time: '09:30' }] })
    expect(lines).toEqual([])
  })

  it('two fixed times on one day are named, not judged', () => {
    const lines = radarLines({
      ...base,
      commitments: [
        { title: 'Check-in', type: 'hotel-checkin', dayIndex: 1, time: '14:00' },
        { title: 'Wedding', type: 'event', dayIndex: 1, time: '19:00' },
      ],
    })
    expect(lines.some(l => l.headline === 'Day 2 carries 2 fixed times')).toBe(true)
    expect(lines.find(l => l.headline.includes('fixed times'))!.detail).toContain('Check-in at 2:00pm')
    expect(lines.find(l => l.headline.includes('fixed times'))!.detail).toContain('Wedding at 7:00pm')
  })

  it('capped at two lines', () => {
    const lines = radarLines({
      ...base,
      commitments: [
        { title: 'A', type: 'other', dayIndex: 5, time: '10:00' },
        { title: 'B', type: 'other', dayIndex: 5, time: '11:00' },
        { title: 'C', type: 'other', dayIndex: 1, time: '12:00' },
      ],
    })
    expect(lines.length).toBeLessThanOrEqual(2)
  })

  it('one-way trips get no drive-home line', () => {
    expect(radarLines({ ...base, roundTrip: false, commitments: [{ title: 'A', type: 'event', dayIndex: 5, time: '17:00' }] })).toEqual([])
  })

  it('an unresolved road distance says nothing about the drive home either', () => {
    expect(radarLines({ ...base, roadKm: null, commitments: [{ title: 'A', type: 'event', dayIndex: 5, time: '17:00' }] })).toEqual([])
  })

  it('blank-titled commitments are ignored entirely', () => {
    expect(radarLines({ ...base, commitments: [{ title: '   ', type: 'other', dayIndex: 5, time: '17:00' }] })).toEqual([])
  })

  it('the time label is a real 12-hour clock and passes junk through', () => {
    expect(commitmentTimeLabel('00:15')).toBe('12:15am')
    expect(commitmentTimeLabel('12:00')).toBe('12:00pm')
    expect(commitmentTimeLabel('19:05')).toBe('7:05pm')
    expect(commitmentTimeLabel('nonsense')).toBe('nonsense')
  })
})
