import { describe, expect, it } from 'vitest'
import { parseSavedIds, savedDayId, savedStopId } from '../src/lib/uiPrefs'

/* MR8. The parsing is the only part worth pinning here: the load/save wrappers
   need localStorage, which node does not have. A corrupted value must save
   nothing rather than crash the timeline, because the timeline is where it is
   read. */

describe('parseSavedIds', () => {
  it('reads a stored array of ids', () => {
    expect(parseSavedIds('["day:0","stop:abc"]')).toEqual(['day:0', 'stop:abc'])
  })

  it('reads nothing from missing or empty storage', () => {
    expect(parseSavedIds(null)).toEqual([])
    expect(parseSavedIds(undefined)).toEqual([])
    expect(parseSavedIds('')).toEqual([])
  })

  it('survives malformed JSON instead of throwing at the timeline', () => {
    expect(parseSavedIds('{not json')).toEqual([])
  })

  it('drops a non-array whole, rather than reading an object as a set', () => {
    expect(parseSavedIds('{"day:0":true}')).toEqual([])
    expect(parseSavedIds('"day:0"')).toEqual([])
    expect(parseSavedIds('7')).toEqual([])
    expect(parseSavedIds('null')).toEqual([])
  })

  it('keeps only non-empty strings from a mixed array', () => {
    expect(parseSavedIds('["day:0", 7, null, "", {"a":1}, "stop:x"]')).toEqual(['day:0', 'stop:x'])
  })
})

describe('saved ids', () => {
  it('namespaces a day and a stop so the same key cannot mean both', () => {
    // A stop whose id happens to be "0" must not collide with day 0.
    expect(savedDayId(0)).toBe('day:0')
    expect(savedStopId('0')).toBe('stop:0')
    expect(savedDayId(0)).not.toBe(savedStopId('0'))
  })

  it('gives the same id for the same day every time, so a reload matches', () => {
    expect(savedDayId(3)).toBe(savedDayId(3))
  })
})
