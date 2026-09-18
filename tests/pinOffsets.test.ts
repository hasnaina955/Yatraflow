// ============ Coincident map pins ============
// The 2026-09-18 report ("imported trip bugged out the map marker positions")
// was stops sharing one coordinate: four Gulmarg stops drew as a single pin.
// The importer now flags that shape, and the map makes what remains legible.
import { describe, it, expect } from 'vitest'
import { coincidentPinOffsets } from '../src/lib/pinOffsets'

const p = (id: string, lat: number, lng: number) => ({ id, lat, lng })

describe('coincidentPinOffsets', () => {
  it('offsets nothing when every stop has its own place', () => {
    expect(coincidentPinOffsets([p('a', 15.5, 73.9), p('b', 15.6, 73.8)]).size).toBe(0)
  })

  it('separates two stops sharing a pin, centred on the true point', () => {
    const out = coincidentPinOffsets([p('a', 15.5, 73.9), p('b', 15.5, 73.9)])
    expect(out.size).toBe(2)
    const dx = [out.get('a')!.dx, out.get('b')!.dx].sort((x, y) => x - y)
    expect(dx[0]).toBeLessThan(0)
    expect(dx[1]).toBeGreaterThan(0)
    // symmetric around the real coordinate
    expect(dx[0] + dx[1]).toBe(0)
  })

  it('fans three or more out around the point', () => {
    const out = coincidentPinOffsets([p('a', 12, 77), p('b', 12, 77), p('c', 12, 77)])
    const xs = ['a', 'b', 'c'].map(id => out.get(id)!.dx)
    expect(xs).toEqual([...xs].sort((x, y) => x - y))
    expect(new Set(xs).size).toBe(3) // every pin gets its own slot
  })

  it('matches at the same 4-decimal resolution the importer warns on', () => {
    // 15.50001 vs 15.50002 round to the same pin (map resolution ~11 m)
    expect(coincidentPinOffsets([p('a', 15.50001, 73.9), p('b', 15.50002, 73.9)]).size).toBe(2)
    // ~100 m apart is a different place, however close it looks
    expect(coincidentPinOffsets([p('a', 15.5, 73.9), p('b', 15.5009, 73.9)]).size).toBe(0)
  })

  it('ignores stops that cannot be plotted', () => {
    const out = coincidentPinOffsets([p('a', NaN, 73.9), p('b', 15.5, 73.9)])
    expect(out.size).toBe(0)
  })
})
