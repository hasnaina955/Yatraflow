// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BOARD_FULL_MIN_HOURS,
  BOARD_FULL_MIN_KM,
  BOARD_FULL_MIN_STOPS,
  BOARD_LONG_MIN_HOURS,
  BOARD_LONG_MIN_KM,
  BOARD_LONG_MIN_STOPS,
  BOARD_STAY_MAX_KM,
  boardLoadWord,
} from '../src/lib/boardLoad'

const word = (distanceKm: number, stopCount: number, hours: number) =>
  boardLoadWord({ distanceKm, stopCount, hours })

describe('boardLoadWord', () => {
  it('keeps a day with no route movement as a stay day', () => {
    expect(word(0, 4, 8)).toBe('stay day')
    expect(word(BOARD_STAY_MAX_KM, 3, 6)).toBe('stay day')
  })

  it('prints rounded distance with a light load', () => {
    expect(word(1, 2, 1)).toBe('1 km · light')
    expect(word(42, 4, 4)).toBe('42 km · light')
    expect(word(79.6, 4, 4)).toBe('80 km · light')
  })

  it('moves to full at any named full boundary', () => {
    expect(word(BOARD_FULL_MIN_KM, 4, 4)).toBe('80 km · full')
    expect(word(50, 4, BOARD_FULL_MIN_HOURS)).toBe('50 km · full')
    expect(word(50, BOARD_FULL_MIN_STOPS, 4)).toBe('50 km · full')
    expect(word(127.6, 4, 4)).toBe('128 km · full')
  })

  it('moves to long at any named long boundary', () => {
    expect(word(BOARD_LONG_MIN_KM, 6, 6)).toBe('150 km · long')
    expect(word(90, 6, BOARD_LONG_MIN_HOURS)).toBe('90 km · long')
    expect(word(90, BOARD_LONG_MIN_STOPS, 6)).toBe('90 km · long')
    expect(word(138, 4, 4)).toBe('138 km · full')
  })

  it.each([
    [undefined, 2, 1],
    [42, undefined, 1],
    [42, 2, undefined],
    [null, 2, 1],
    [42, null, 1],
    [42, 2, null],
    [Number.NaN, 2, 1],
    [42, Number.NaN, 1],
    [42, 2, Number.NaN],
    [Number.POSITIVE_INFINITY, 2, 1],
    [42, Number.POSITIVE_INFINITY, 1],
    [42, 2, Number.POSITIVE_INFINITY],
    [-1, 2, 1],
    [42, -1, 1],
    [42, 2, -1],
    [42, 2.5, 1],
  ])('omits the word when a required value is invalid: %s, %s, %s', (distanceKm, stopCount, hours) => {
    expect(boardLoadWord({ distanceKm, stopCount, hours })).toBeNull()
  })
})

it('uses drive time for the board load', () => {
  const board = readFileSync('src/components/BoardView.tsx', 'utf8')
  expect(board).toContain('hours: journey ? journey.driveMinutes / 60 : undefined')
})
