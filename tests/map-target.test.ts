import { describe, expect, it } from 'vitest'
import { normalizeMapTarget } from '../src/lib/mapTarget'

describe('normalizeMapTarget', () => {
  it('validates stop and coordinate targets', () => {
    expect(normalizeMapTarget({ kind: 'stop', stopId: '  s1 ' })).toEqual({ kind: 'stop', stopId: 's1' })
    expect(normalizeMapTarget({ kind: 'stop', stopId: ' ' })).toBeNull()
    expect(normalizeMapTarget({ kind: 'coordinate', coordinate: { lat: 91, lng: 0 } })).toBeNull()
    expect(normalizeMapTarget({ kind: 'coordinate', coordinate: { lat: 90, lng: -180 } })).not.toBeNull()
  })
  it('requires two valid points for bounds', () => {
    expect(normalizeMapTarget({ kind: 'bounds', points: [{ lat: 0, lng: 0 }] })).toBeNull()
    expect(normalizeMapTarget({ kind: 'bounds', points: [{ lat: 0, lng: 0 }, { lat: NaN, lng: 1 }] })).toBeNull()
    expect(normalizeMapTarget({ kind: 'bounds', points: [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }] })).not.toBeNull()
  })
})
