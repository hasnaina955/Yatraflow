// ============ AI answer-routing regression tests ============
import { describe, it, expect } from 'vitest'
import { answerQuestion } from '../src/lib/ai'
import { seedData } from '../src/data/seed'
import type { Trip } from '../src/data/types'

const trip = {
  id: 't', name: 'Test', startLocation: 'Munnar', startLocationCoords: { lat: 10.1, lng: 77.1 },
  destinations: ['Thekkady'], destinationCoords: [{ lat: 9.6, lng: 77.2 }],
  startDate: '2026-09-01', endDate: '2026-09-03', travellers: 2,
  transportMode: 'car', budgetPerPersonInr: 5000, travelStyle: 'balanced',
  fixedCommitments: [], days: [], expenses: [], coverEmoji: '🧭',
  visibility: 'private', createdAt: 0, updatedAt: 0, members: [],
} as unknown as Trip

describe('answerQuestion rain routing', () => {
  it('routes "if it rains" (the quick prompt) to the rain plan', () => {
    const reply = answerQuestion(trip, 'Give us three options if it rains')
    expect(reply.text).toContain('Three rain options')
  })

  it('routes "raining" to the rain plan', () => {
    const reply = answerQuestion(trip, 'It is raining in Munnar, what should we do?')
    expect(reply.text).toContain('Three rain options')
  })

  it('routes "rainy day backup" to the rain plan', () => {
    const reply = answerQuestion(trip, 'Give me a rainy day backup plan')
    expect(reply.text).toContain('Three rain options')
  })

  it('does not mis-route "train" questions to the rain plan', () => {
    const reply = answerQuestion(trip, 'Should we take the train from Munnar to Thekkady?')
    expect(reply.text).not.toContain('Three rain options')
  })
})

// Regression, found by scripts/jev-router-audit.test.ts: the tiring rule matches
// bare "relax", which is a substring of "relaxed", so it swallowed every compare
// prompt and compareRelaxedPacked was unreachable. The dead handler was the
// quickPrompts()[6] button, and planSummary/generalAnswer both tell the user to
// "compare relaxed vs packed" — so we advertised a capability that could not run.
// Uses a real seed trip because the compare handler needs days to compare.
describe('answerQuestion compare routing', () => {
  const realTrip = seedData.trips[0]

  it('routes the compare quick prompt to the comparison, not the tiring plan', () => {
    const reply = answerQuestion(realTrip, 'Compare a relaxed itinerary with a packed itinerary')
    expect(reply.text).toContain('Packed version')
    expect(reply.text).not.toContain('is your heaviest:')
  })

  it('still routes a single-intent relax question to the tiring plan', () => {
    const reply = answerQuestion(realTrip, 'How do we relax on this trip?')
    expect(reply.text).toContain('is your heaviest:')
  })
})
