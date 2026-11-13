// ============ Map v2 package E: calibrated best-day ranking (#897) ============
// A rating counts only as far as its review count supports it. A hard limit
// still removes a place before any rating can save it.
import { describe, expect, it } from 'vitest'
import { calibratedQuality, poiTouristScore, rankAndCap, type PlaceHit } from '../src/lib/providers/hits'

const ANCHORS = [{ lat: 10, lng: 76 }]

function hit(id: string, extra: Partial<PlaceHit> = {}): PlaceHit {
  return {
    // A unique one-word name, so the duplicate filter keeps every test place.
    id, name: `Spot${id}zz`, latitude: 10, longitude: 76, kind: 'poi',
    source: 'google', category: 'sightseeing', ...extra,
  }
}

const score = (h: PlaceHit) => poiTouristScore(h, ANCHORS, 10_000)

describe('calibratedQuality', () => {
  it('returns null when the rating or the review count is missing', () => {
    expect(calibratedQuality(hit('a'))).toBeNull()
    expect(calibratedQuality(hit('a', { rating: 4.8 }))).toBeNull()
    expect(calibratedQuality(hit('a', { ratingCount: 50 }))).toBeNull()
    expect(calibratedQuality(hit('a', { rating: Number.NaN, ratingCount: 50 }))).toBeNull()
    expect(calibratedQuality(hit('a', { rating: 4.8, ratingCount: 0 }))).toBeNull()
  })

  it('pulls a thin sample towards the prior and leaves a large sample near its rating', () => {
    const few = calibratedQuality(hit('a', { rating: 5, ratingCount: 3 }))!
    const many = calibratedQuality(hit('b', { rating: 4.6, ratingCount: 800 }))!
    expect(few).toBeLessThan(4.3)
    expect(many).toBeGreaterThan(4.55)
    expect(many).toBeGreaterThan(few)
  })
})

describe('review-count calibration in the ranking', () => {
  it('ranks many good reviews above a perfect score from few reviews', () => {
    const few = hit('few', { rating: 5, ratingCount: 3 })
    const many = hit('many', { rating: 4.6, ratingCount: 800 })
    expect(score(many)).toBeGreaterThan(score(few))
    const ranked = rankAndCap([few, many], ANCHORS, 10_000, 5)
    expect(ranked.map(h => h.id)).toEqual(['many', 'few'])
  })

  it('ranks many good reviews above a perfect score from a few more than ten', () => {
    const some = hit('some', { rating: 5, ratingCount: 12 })
    const many = hit('many', { rating: 4.6, ratingCount: 800 })
    expect(score(some)).toBeGreaterThan(score(hit('none')))
    expect(score(many)).toBeGreaterThan(score(some))
  })

  it('does not reward a rating that has no review count behind it', () => {
    expect(score(hit('x', { rating: 5 }))).toBe(score(hit('y')))
    expect(score(hit('x', { rating: 5, ratingCount: 1 }))).toBeLessThan(score(hit('z', { rating: 4.6, ratingCount: 300 })))
  })

  it('keeps the quality bonus below one category tier', () => {
    const food = hit('food', { category: 'food', rating: 5, ratingCount: 9000 })
    const sight = hit('sight')
    expect(score(sight)).toBeGreaterThan(score(food))
  })

  it('keeps input order when two places tie', () => {
    const a = hit('a', { rating: 4.4, ratingCount: 120 })
    const b = hit('b', { rating: 4.4, ratingCount: 120 })
    expect(score(a)).toBe(score(b))
    expect(rankAndCap([a, b], ANCHORS, 10_000, 5).map(h => h.id)).toEqual(['a', 'b'])
    expect(rankAndCap([b, a], ANCHORS, 10_000, 5).map(h => h.id)).toEqual(['b', 'a'])
  })
})

describe('hard limits stay above the rating', () => {
  it('drops a top-rated place inside the home zone', () => {
    const home = hit('home', { rating: 5, ratingCount: 9000 })
    const other = hit('other', { latitude: 10.5, longitude: 76.5, rating: 4.1, ratingCount: 40 })
    const ranked = rankAndCap([home, other], ANCHORS, 100_000, 5, { homeCenter: { lat: 10, lng: 76 } })
    expect(ranked.map(h => h.id)).toEqual(['other'])
  })
})
