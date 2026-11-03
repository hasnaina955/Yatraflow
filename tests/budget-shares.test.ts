import { describe, expect, it } from 'vitest'
import { largestRemainderShares } from '../src/lib/budgetShares'

describe('largestRemainderShares', () => {
  it('makes three equal parts sum to 100 instead of 99', () => {
    expect(largestRemainderShares([1, 1, 1])).toEqual([34, 33, 33])
    expect(largestRemainderShares([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('keeps exact shares exact', () => {
    expect(largestRemainderShares([3, 1])).toEqual([75, 25])
    expect(largestRemainderShares([50, 50])).toEqual([50, 50])
  })

  it('never lets a rounded row total pass the footer', () => {
    const values = [47, 21, 23, 9]
    const shares = largestRemainderShares(values)
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
    for (const share of shares) expect(Number.isInteger(share)).toBe(true)
  })

  it('returns zeros for an empty or unreadable set', () => {
    expect(largestRemainderShares([])).toEqual([])
    expect(largestRemainderShares([0, 0, 0])).toEqual([0, 0, 0])
    expect(largestRemainderShares([Number.NaN, -1])).toEqual([0, 0])
  })
})
