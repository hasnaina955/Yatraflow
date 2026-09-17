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

describe('answerQuestion harvested routing regressions', () => {
  const realTrip = seedData.trips[0]

  it.each([
    'Day 2 is packed — which stop do we drop?',
    'Is day 3 too packed?',
  ])('routes an overloaded day to lightening advice: %s', question => {
    expect(answerQuestion(realTrip, question).text).toContain('is your heaviest:')
  })

  it.each([
    'Change saved but nothing changed',
    'Save this itinerary',
    'Are the times and costs real?',
    'Are these cost estimates accurate?',
    'Can I trust these prices?',
    'Ethical elephant bathing session, 45 min. Kids would love it.',
    'The children enjoyed the museum',
  ])('does not claim an unrelated capability: %s', question => {
    expect(answerQuestion(realTrip, question).text).toContain("Here's what I can see in")
  })

  it.each([
    'How can we save money on this trip?',
    'Any savings on this trip?',
    'Can we save on fuel?',
  ])('preserves savings requests: %s', question => {
    expect(answerQuestion(realTrip, question).text).toContain('Biggest levers:')
  })

  it.each([
    'What are the costs per person?',
    'Give me the cost breakdown',
  ])('preserves cost breakdown requests: %s', question => {
    expect(answerQuestion(realTrip, question).text).toContain('Where it goes:')
  })

  it.each([
    'What should we cut with kids along?',
    'Which stops are not good for kids?',
    'Anything unsuitable for a 4 year old?',
    'Stops to skip with a small child',
    'My toddler will get bored, what is too long?',
  ])('preserves child suitability requests: %s', question => {
    expect(answerQuestion(realTrip, question).text).toContain('With children along, first consider removing:')
  })

  it('preserves the packed-schedule tradeoff question', () => {
    expect(answerQuestion(realTrip, 'Do we see more with a packed schedule?').text).toContain('Packed version')
  })
})

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
