// The stop editor and the trip import write places the app only knows by NAME
// (#424): a fresh stop holds the form's default pin, a retyped location holds
// the old stop's, and an import row can arrive with no coordinates at all.
// These fixtures pin the two halves that keep the guard honest — the editor
// opens an existing stop VERIFIED (so edits never prompt), and saving an
// unpinned location routes through the shared resolve-or-prompt guard instead
// of writing unverified coordinates.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { stopInitialValues } from '../src/lib/stopForm'
import type { Trip } from '../src/data/types'

/** Minimal but type-faithful trip: one stop with a real pin. */
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

describe('the stop editor pin guard (#424)', () => {
  it('an existing stop opens VERIFIED — editing a real stop never prompts', () => {
    const v = stopInitialValues({ mode: 'edit', stopId: 'st-1' }, trip())
    expect(v?.geocoded).toBe(true)
    expect(v?.lat).toBeCloseTo(9.93)
    expect(v?.lng).toBeCloseTo(76.26)
  })

  it('a new stop has no verified pin — the guard will ask on save', () => {
    // No initial values at all: the editor's defaults (with its placeholder
    // lat/lng) stand, and geocoded is false by construction.
    expect(stopInitialValues({ mode: 'add', dayIndex: 0 }, trip())).toBeUndefined()
  })

  it('saving an unpinned location routes through the shared guard and refuses on skip', () => {
    const src = readFileSync(new URL('../src/components/StopEditor.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/if \(!v\.geocoded && !initial\?\.title\) \{/)              // the gate: NEW stops only
    expect(src).toMatch(/resolvePick\(unnamedPick\('stop-editor'/)                   // the shared guard
    expect(src).toMatch(/a stop cannot go on the map without a position/)            // the refusal
    expect(src).toMatch(/lat: picked\.latitude, lng: picked\.longitude/)             // manual answer saves
    expect(src).toMatch(/\{resolvePickDialog\}/)                                     // prompt is mounted
  })

  it('the import offers the same guard to every row its coordinate wall dropped', () => {
    const src = readFileSync(new URL('../src/components/ImportTripButton.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/resolvePick\(unnamedPick\(/)                                // the shared guard
    expect(src).toMatch(/parseTripImport\(text, patches\)/)                          // rescued rows re-parse in
    expect(src).toMatch(/dayIndex: d\.dayIndex, stopIndex: d\.stopIndex/)            // keyed to file position
    expect(src).toMatch(/\{resolvePickDialog\}/)
  })
})
