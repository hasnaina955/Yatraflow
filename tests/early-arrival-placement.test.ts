import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { earlyArrivalPlacement } from '../src/pages/trip/timeline/earlyArrivalPlacement'

describe('early arrival placement', () => {
  it('assigns one location to each real stop around an auto anchor', () => {
    const stops = [{ auto: false }, { auto: true }, { auto: false }, { auto: false }]
    expect(stops.map((stop, index) => stop.auto ? null : earlyArrivalPlacement(index, false)))
      .toEqual(['stop', null, 'leg', 'leg'])
    expect(earlyArrivalPlacement(0, true)).toBe('leg')
  })

  it('uses the placement for both the incoming leg and the fallback', () => {
    const source = readFileSync('src/pages/trip/timeline/DaySection.tsx', 'utf8').replace(/\r\n/g, '\n')
    expect(source).toContain("earlyArrivalPlacement(i, firstLegVisible) === 'stop'")
    expect(source).toContain('{renderEarlyArrival(ordered[i + 1])}')
    expect(source).not.toContain('ordered[i - 1].auto === true')
  })
})
