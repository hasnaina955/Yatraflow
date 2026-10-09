import { describe, expect, it } from 'vitest'
// @ts-expect-error The geometry checker is a standalone Node script.
import { compareCompactCardGeometry } from '../scripts/compactCardChecks.mjs'

const box = (key: string, height: number, width = 260, top = 0) => ({
  key, width, height, top, coverWidth: width, coverHeight: 120,
})
const before = {
  trips: [box('/trip/a', 400)],
  catalog: [box('/pub/a', 500)],
  trending: [box('/pub/b', 500)],
  creators: [box('/creator/a', 300)],
}
const after = {
  trips: [box('/trip/a', 395)],
  catalog: [box('/pub/a', 420)],
  trending: [box('/pub/b', 420)],
  creators: [box('/creator/a', 280)],
}

describe('compact card geometry', () => {
  it('accepts smaller cards at unchanged widths', () => {
    expect(compareCompactCardGeometry(before, after)).toEqual([])
  })
  it('rejects enlargement as a shortcut', () => {
    const changed = { ...after, catalog: [box('/pub/a', 420, 300)] }
    expect(compareCompactCardGeometry(before, changed).join(' ')).toMatch(/width/)
  })
  it('rejects a card that did not become compact', () => {
    const changed = { ...after, catalog: [box('/pub/a', 480)] }
    expect(compareCompactCardGeometry(before, changed).join(' ')).toMatch(/height/)
  })
  it('rejects a missing card instead of calling removal compactness', () => {
    expect(compareCompactCardGeometry(before, { ...after, trending: [] }).join(' ')).toMatch(/keys/)
  })
  it('rejects a changed column count', () => {
    const first = { ...before, trips: [box('/trip/a', 400), box('/trip/b', 400)] }
    const second = { ...after, trips: [box('/trip/a', 395), box('/trip/b', 395, 260, 420)] }
    expect(compareCompactCardGeometry(first, second).join(' ')).toMatch(/columns/)
  })
  it('rejects a non-finite rectangle', () => {
    const changed = { ...after, catalog: [box('/pub/a', Number.NaN)] }
    expect(compareCompactCardGeometry(before, changed).join(' ')).toMatch(/invalid rectangle/)
  })
  it('rejects a zero-size rectangle', () => {
    const changed = { ...after, catalog: [box('/pub/a', 420, 0)] }
    expect(compareCompactCardGeometry(before, changed).join(' ')).toMatch(/invalid rectangle/)
  })
  it('rejects duplicate card keys', () => {
    const duplicated = {
      trips: before.trips,
      catalog: [box('/pub/a', 500), box('/pub/a', 500)],
      trending: after.trending,
      creators: [box('/creator/a', 300), box('/creator/a', 300)],
    }
    const compact = {
      trips: after.trips,
      catalog: [box('/pub/a', 420), box('/pub/a', 420)],
      trending: after.trending,
      creators: [box('/creator/a', 280), box('/creator/a', 280)],
    }
    expect(compareCompactCardGeometry(duplicated, compact).join(' ')).toMatch(/duplicate/)
  })
  it('rejects a missing geometry group', () => {
    const { catalog: _catalog, ...missing } = after
    expect(compareCompactCardGeometry(before, missing).join(' ')).toMatch(/missing geometry/)
  })
  it('lets a My Trips card keep its height but never grow', () => {
    expect(compareCompactCardGeometry(before, { ...after, trips: [box('/trip/a', 400)] })).toEqual([])
    expect(compareCompactCardGeometry(before, { ...after, trips: [box('/trip/a', 403)] }).join(' ')).toMatch(/height grew/)
  })
})
