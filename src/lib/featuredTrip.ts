import type { Trip } from '../data/types'
import { localMidnightMs } from './dayCount'
import { startOfLocalDay } from './dayClock'
import { departureLabel } from './tripNextStep'

type TripTiming = 'upcoming' | 'underway' | 'completed' | 'undated'

function timing(trip: Trip, today: Date): TripTiming {
  const start = localMidnightMs(trip.startDate)
  const end = localMidnightMs(trip.endDate)
  if (start === null || end === null || end < start) return 'undated'
  const now = startOfLocalDay(today).getTime()
  if (end < now) return 'completed'
  return start >= now ? 'upcoming' : 'underway'
}

export function selectFeaturedTrip(trips: readonly Trip[], today: Date): Trip | null {
  const active = trips.filter(trip => {
    const state = timing(trip, today)
    return state === 'upcoming' || state === 'underway'
  }).sort((a, b) => {
    const aFuture = timing(a, today) === 'upcoming'
    const bFuture = timing(b, today) === 'upcoming'
    if (aFuture !== bFuture) return aFuture ? -1 : 1
    return localMidnightMs(a.startDate)! - localMidnightMs(b.startDate)!
  })
  return active[0] ?? [...trips].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null
}

export function featuredTripPresentation(trip: Trip, today: Date) {
  const state = timing(trip, today)
  if (state === 'upcoming') {
    return {
      heading: 'Your next journey',
      subheading: 'Closest upcoming departure',
      status: 'Upcoming',
      badge: departureLabel(trip, today) ?? 'Upcoming',
    }
  }
  if (state === 'underway') {
    return {
      heading: 'Your current journey',
      subheading: 'Trip in progress',
      status: 'Underway',
      badge: 'Underway',
    }
  }
  const status = state === 'completed' ? 'Completed' : 'Dates not set'
  return { heading: 'Featured trip', subheading: 'Most recently updated trip', status, badge: status }
}
