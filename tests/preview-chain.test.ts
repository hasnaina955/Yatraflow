// #334: the impact-preview sheet is NOT modal, so a second mutation while a
// preview is open used to clone the COMMITTED trip and replace the pending
// proposal — the first staged change vanished with no toast, no merge and no
// warning. The policy is to CHAIN (the issue's Option A): the second mutation
// builds on the staged proposal and the sheet reports the combined delta, while
// the impact stays measured against the committed trip. These fixtures pin the
// pure composition and tripwire the two surfaces that must not race it.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { keepIsStale, previewBase, stagedChange } from '../src/lib/previewChain'
import type { Trip } from '../src/data/types'

function trip(): Trip {
  return {
    id: 'trip-1', name: 'Kerala, 4 days', startLocation: 'Kochi', destinations: ['Munnar'],
    startDate: '2026-10-01', endDate: '2026-10-04', travellers: 2, transportMode: 'car',
    budgetPerPersonInr: 12000, travelStyle: 'balanced', fixedCommitments: [],
    days: [{
      id: 'day-1', index: 0, title: 'Day 1',
      stops: [{
        id: 'st-1', title: 'Fort Kochi', category: 'sightseeing', locationName: 'Fort Kochi',
        lat: 9.93, lng: 76.26, visitMinutes: 90, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
        priority: 'must-do', status: 'confirmed', orderInDay: 1,
      }],
    }],
    expenses: [], coverEmoji: '🌴', visibility: 'private', createdAt: 1, updatedAt: 2,
    members: [{ userId: 'amelia', role: 'owner', joinedAt: 0 }],
  }
}

const stop = (id: string, title: string) => ({
  id, title, category: 'food', locationName: title, lat: 9.5, lng: 76.3,
  visitMinutes: 45, entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
  priority: 'nice-to-have', status: 'suggested', orderInDay: 2,
})

describe('previewChain — a second edit builds on the first (#334)', () => {
  it('without a preview, a mutation clones the committed trip', () => {
    const committed = trip()
    const proposed = stagedChange(committed, null, d => { d.name = 'Renamed trip' })
    expect(proposed.name).toBe('Renamed trip')
    expect(committed.name).toBe('Kerala, 4 days')
    expect(previewBase(committed, null)).toBe(committed)
  })

  it('the first staged change SURVIVES the second mutation', () => {
    const committed = trip()
    const first = stagedChange(committed, null, d => { d.days[0].title = 'Coastal day' })
    const second = stagedChange(committed, first, d => { d.days[0].stops.push(stop('st-2', 'Lunch')) })
    // Both edits are in the chained shape — the old code kept only the second.
    expect(second.days[0].title).toBe('Coastal day')
    expect(second.days[0].stops.map(s => s.title)).toEqual(['Fort Kochi', 'Lunch'])
    // …and neither the staged shape nor the committed row was mutated.
    expect(first.days[0].stops).toHaveLength(1)
    expect(committed.days[0].title).toBe('Day 1')
    expect(committed.days[0].stops).toHaveLength(1)
    expect(previewBase(committed, first)).toBe(first)
  })

  it('Keep refuses a preview whose committed row moved underneath it', () => {
    const committed = trip()
    // No preview yet: nothing to go stale.
    expect(keepIsStale(null, committed)).toBe(false)
    // The preview was built on THIS row object…
    expect(keepIsStale(committed, committed)).toBe(false)
    // …a direct write (resolved decision, accepted suggestion, realtime edit)
    // replaces the cached row with a new object, which is the stale signal.
    expect(keepIsStale(committed, structuredClone(committed))).toBe(true)
  })
})

describe('the surfaces that must not race a preview (#334)', () => {
  it('the workspace chains, refuses a stale Keep, re-stages Move, and clears on trip switch', () => {
    const src = readFileSync(new URL('../src/pages/TripWorkspace.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/stagedChange\(trip, staged\?\.proposed \?\? null, mutator\)/)  // chain, don't fork
    expect(src).toMatch(/keepIsStale\(baseRef\.current, trip\)/)                        // stale Keep refuses
    expect(src).toMatch(/applyChange\(draft => \{/)                                     // Move goes through the chain
    expect(src).toMatch(/'move-day', dayIndex\)/)
    expect(src).toMatch(/previewOpen=\{!!pending\}/)                                    // timeline is told
    expect(src).toMatch(/Staged change discarded — you switched trips/)
  })

  it('day rename and ride-start are refused while a preview is open', () => {
    const src = readFileSync(new URL('../src/pages/trip/TimelineTab.tsx', import.meta.url), 'utf8')
    const guards = src.match(/if \(previewOpen\) \{ toast\('Keep or remove your staged change first\.', 'err'\); return \}/g) ?? []
    expect(guards).toHaveLength(2) // rename AND ride start — both write the committed row
  })
})
