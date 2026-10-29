import { describe, expect, it } from 'vitest'
import { coverPlanFor } from '../src/lib/regionArt'
import { regionFor } from '../src/lib/tripsPage'

// The shared signed-in trip that started this work. Its row is:
//   start = "Panaji, Goa"
//   destinations = ["Candolim", "Colva", "Palolem"]
//   coverEmoji = "🏖"
// It showed the neutral generic scene, with the emoji drawn over it as an
// "accent", because the resolver never read the start place and none of those
// three beach names is in either place table.
describe('the real Goa trip (712a0493)', () => {
  const TRIP = {
    id: '712a0493-678b-4193-a93e-cb479d01e45e',
    startLocation: 'Panaji, Goa',
    destinations: ['Candolim', 'Colva', 'Palolem'],
    coverEmoji: '🏖',
    coverImageUrl: '',
  }

  const plan = () => coverPlanFor({
    userCover: TRIP.coverImageUrl,
    fallbackEmoji: TRIP.coverEmoji,
    region: regionFor({ destinations: TRIP.destinations }),
    seed: TRIP.id,
    placeCount: TRIP.destinations.length,
    destinations: TRIP.destinations,
    startLocation: TRIP.startLocation,
  })

  it('does not resolve the region from those beach names, which is why the start matters', () => {
    expect(regionFor({ destinations: TRIP.destinations })).toBe('generic')
  })

  it('shows a Goa scene, not the neutral one', () => {
    const first = plan().candidates[0]
    expect(first.kind).toBe('generated')
    if (first.kind !== 'generated') throw new Error('expected a generated scene')
    expect(['goa-1', 'goa-2']).toContain(first.id)
  })

  it('never renders the saved beach emoji over that scene', () => {
    const ids = plan().candidates.map(candidate => (candidate.kind === 'generated' ? candidate.id : 'user'))
    // The neutral scene may still sit at the end of the list as a last image
    // resort. What must never happen is that it LEADS, or that the emoji does.
    expect(ids[0]).not.toBe('generic-1')
    expect(plan().fallbackEmoji).toBe('🏖')
    expect(ids.every(id => id !== 'user')).toBe(true)
  })

  it('is the same plan on every render', () => {
    expect(plan()).toEqual(plan())
  })
})
