// Fork honesty: one flight per publication, truthful copy toasts, and the copy
// opens after success. Node env, no DOM: the store and unlock modules are
// mocked so each branch is driven directly.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublishedItinerary, Trip } from '../src/data/types'

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('../src/components/ui', () => ({ toast }))

const storeMocks = vi.hoisted(() => ({
  tripById: vi.fn(),
  duplicateTripPersisted: vi.fn(),
  duplicateTripPublicPersisted: vi.fn(),
  registerPubCopy: vi.fn(),
  fetchPublicTrip: vi.fn(),
}))
vi.mock('../src/store/store', () => storeMocks)

const unlockMocks = vi.hoisted(() => ({ fetchMyEntitlements: vi.fn() }))
vi.mock('../src/lib/unlock', () => unlockMocks)

import { forkPublication, isForkPending } from '../src/lib/forkPub'

const stop = (title: string): Trip['days'][number]['stops'][number] => ({
  id: `st-${title}`, title, category: 'sightseeing', locationName: 'Goa',
  lat: 15, lng: 74, visitMinutes: 60, entryFeeInrPerPerson: 0,
  transportCostInrTotal: 0, priority: 'must-do', status: 'confirmed',
  orderInDay: 0, legDistanceKm: 0, legTravelMinutes: 0,
})
const trip: Trip = {
  id: 'trip-1', owner_id: 'creator-1', name: 'Goa Weekend',
  start_location: 'Goa', destinations: ['Goa'], start_date: '2026-10-12',
  end_date: '2026-10-14', travellers: 2, transport_mode: 'car',
  budget_per_person_inr: 12000, travel_style: 'relaxed', fixed_commitments: [],
  expenses: [{ id: 'e1', title: 'Stay', amountInrPerPerson: 5000 }],
  cover_emoji: '🌿', visibility: 'public', created_at: 0, updated_at: 0,
  days: [
    { id: 'd0', index: 0, title: 'Day 1', startTime: '08:30', stops: [stop('Beach')] },
    { id: 'd1', index: 1, title: 'Day 2', startTime: '08:30', stops: [stop('Fort')] },
  ],
} as Trip
const pub = (over: Partial<PublishedItinerary> = {}): PublishedItinerary => ({
  id: 'pub-1', tripId: 'trip-1', creatorId: 'creator-1', title: 'Goa Weekend',
  tagline: 'A weekend plan', routeSummary: ['Goa'], durationDays: 2,
  estimatedBudgetPerPersonInr: 12000, travelStyle: 'relaxed', bestSeason: null,
  travelTips: [], warningsAndAssumptions: [], freeDayIndexes: [0, 1],
  premiumPriceInr: null, subscriberCta: null, publishedAt: 1000,
  refreshedAt: 1000, unpublishedAt: null, views: 10, copies: 3,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  toast.mockClear()
  storeMocks.tripById.mockReturnValue(structuredClone(trip))
  storeMocks.fetchPublicTrip.mockResolvedValue(structuredClone(trip))
  storeMocks.duplicateTripPersisted.mockResolvedValue({ trip: { ...structuredClone(trip), id: 'copy-1' }, persisted: true })
  storeMocks.duplicateTripPublicPersisted.mockResolvedValue({ trip: { ...structuredClone(trip), id: 'copy-1' }, persisted: true })
  unlockMocks.fetchMyEntitlements.mockResolvedValue([])
})

describe('fork honesty', () => {
  it('a second flight for the same publication stops at the guard', async () => {
    const nav = vi.fn()
    const first = forkPublication(pub(), 'forker-1', nav, undefined, 'explore')
    expect(isForkPending('pub-1')).toBe(true)
    const second = await forkPublication(pub(), 'forker-1', nav, undefined, 'explore')
    expect(second).toBe(false)
    expect(toast).toHaveBeenCalledWith('Already forking that itinerary — one copy coming up.')
    expect(await first).toBe(true)
    expect(isForkPending('pub-1')).toBe(false)
    expect(storeMocks.duplicateTripPublicPersisted).toHaveBeenCalledTimes(1)
    expect(storeMocks.duplicateTripPersisted).not.toHaveBeenCalled()
    expect(storeMocks.registerPubCopy).toHaveBeenCalledTimes(1)
  })

  it('a priced copy without entitlement says locked days stayed locked', async () => {
    const nav = vi.fn()
    const priced = pub({ premiumPriceInr: 500, freeDayIndexes: [0] })
    expect(await forkPublication(priced, 'forker-2', nav, undefined, 'explore')).toBe(true)
    expect(storeMocks.duplicateTripPublicPersisted).toHaveBeenCalledTimes(1)
    expect(storeMocks.duplicateTripPersisted).not.toHaveBeenCalled()
    expect(String(toast.mock.calls.at(-1)?.[0] ?? '')).toMatch(/1 locked day stayed locked/)
  })

  it('a failed entitlement read forks conservatively and says so', async () => {
    unlockMocks.fetchMyEntitlements.mockRejectedValue(new Error('dropped connection'))
    const nav = vi.fn()
    const priced = pub({ premiumPriceInr: 500, freeDayIndexes: [0] })
    expect(await forkPublication(priced, 'forker-3', nav, undefined, 'explore')).toBe(true)
    expect(storeMocks.duplicateTripPublicPersisted).toHaveBeenCalledTimes(1)
    expect(String(toast.mock.calls.at(-1)?.[0] ?? '')).toMatch(/access check failed/)
  })

  it('an entitled priced copy forks whole and opens the copy', async () => {
    const nav = vi.fn()
    const priced = pub({ premiumPriceInr: 500, freeDayIndexes: [0] })
    expect(await forkPublication(priced, 'forker-4', nav, true, 'explore')).toBe(true)
    expect(storeMocks.duplicateTripPersisted).toHaveBeenCalledTimes(1)
    expect(nav).toHaveBeenCalledWith('/trip/copy-1/timeline')
  })

  it('a free copy opens the copy without lock talk', async () => {
    const nav = vi.fn()
    expect(await forkPublication(pub(), 'forker-5', nav, undefined, 'explore')).toBe(true)
    expect(nav).toHaveBeenCalledWith('/trip/copy-1/timeline')
    expect(String(toast.mock.calls.at(-1)?.[0] ?? '')).not.toMatch(/locked/)
  })
})
