// ============ Shared verified-placement effects (#08 R7) ============
import { describe, expect, it, vi } from 'vitest'
import type { WriterCompletion } from '../src/pages/trip/map/mapWriterActions'
import { applyVerifiedPlacement, undoRefusalMessage } from '../src/pages/trip/map/verifiedPlacementEffects'

function completion(overrides: Partial<WriterCompletion> = {}): WriterCompletion {
  return {
    operationId: 'op-1', context: { tripId: 't', dayId: 'd', dayIndex: 0 },
    phase: 'applied', acknowledged: true, receipt: null,
    placed: [
      { itemId: 'i1', dayId: 'd', stopId: 's1', hit: { id: 'h1', name: 'A', latitude: 10, longitude: 76, kind: 'poi' } },
      { itemId: 'i2', dayId: 'd', stopId: 's2', hit: { id: 'h2', name: 'B', latitude: 10.1, longitude: 76.1, kind: 'poi' } },
    ] as never,
    skipped: [], unresolved: [],
    ...overrides,
  }
}

describe('applyVerifiedPlacement', () => {
  it('applies each verified placed stop once and ticks once', () => {
    const dna = vi.fn()
    const drop = vi.fn()
    const placed = vi.fn()
    expect(applyVerifiedPlacement(completion(), { onDna: dna, onDrop: drop, onPlaced: placed })).toBe(2)
    expect(dna).toHaveBeenCalledTimes(2)
    expect(drop).toHaveBeenCalledTimes(2)
    expect(placed).toHaveBeenCalledTimes(1)
  })

  it('does nothing for unacknowledged, zero-verified, uncertain or abandoned', () => {
    const effects = { onDna: vi.fn(), onDrop: vi.fn(), onPlaced: vi.fn() }
    expect(applyVerifiedPlacement(completion({ acknowledged: false }), effects)).toBe(0)
    expect(applyVerifiedPlacement(completion({ placed: [] }), effects)).toBe(0)
    expect(applyVerifiedPlacement(completion({ phase: 'uncertain' }), effects)).toBe(0)
    expect(applyVerifiedPlacement(completion({ phase: 'abandoned', acknowledged: false }), effects)).toBe(0)
    expect(effects.onDna).not.toHaveBeenCalled()
    expect(effects.onPlaced).not.toHaveBeenCalled()
  })

  it('maps Undo outcomes to truthful refusal copy', () => {
    expect(undoRefusalMessage({ status: 'undone' })).toBeNull()
    expect(undoRefusalMessage({ status: 'refused' })).toMatch(/changed/)
    expect(undoRefusalMessage({ status: 'not-admitted' })).toMatch(/not admitted/)
    expect(undoRefusalMessage({ status: 'other' })).toMatch(/did not complete/)
  })
})
