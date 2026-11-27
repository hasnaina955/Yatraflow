import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { badgeText } from '../src/components/BottomNav'
import { nextStoredStop, tripPhase } from '../src/pages/NativeHome'
import { countdownText } from '../src/lib/tripsPage'

const now = new Date(2026, 10, 27, 12, 5)
const trip = {
  startDate: '2026-11-25',
  endDate: '2026-11-30',
  days: Array.from({ length: 6 }, (_, index) => ({ id: String(index), index, stops: [] })),
}

describe('native home live trip', () => {
  it('classifies live, upcoming and past dates', () => {
    expect(tripPhase(trip, now)).toBe('live')
    expect(tripPhase({ startDate: '2026-11-28', endDate: '2026-11-30' }, now)).toBe('upcoming')
    expect(tripPhase({ startDate: '2026-11-20', endDate: '2026-11-26' }, now)).toBe('other')
  })
  it('shows the current day and total days', () => {
    expect(countdownText(trip, now)).toBe('Day 3 of 6')
  })
  it('selects the next stored arrival, including the current minute', () => {
    const stops = [{ arrivalTime: '14:00' }, { arrivalTime: '11:59' }, { arrivalTime: '12:05' }, {}]
    expect(nextStoredStop(stops, now)).toEqual({ arrivalTime: '12:05' })
    expect(nextStoredStop([{}, { arrivalTime: '11:59' }], now)).toBeUndefined()
  })
  it('formats unread badges and places them on Profile', () => {
    expect(badgeText(0)).toBeNull()
    expect(badgeText(3)).toBe('3')
    expect(badgeText(12)).toBe('9+')
    const nav = readFileSync('src/components/BottomNav.tsx', 'utf8').replace(/\r\n/g, '\n')
    expect(nav).toContain("to === '/profile' && badge && <span className=\"bottom-nav-badge\"")
  })
})
