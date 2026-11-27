import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { earlyArrivalPlacement } from '../src/pages/trip/timeline/earlyArrivalPlacement'

describe('early arrival placement', () => {
  it('assigns one location to each real stop around an auto anchor', () => {
    expect(earlyArrivalPlacement(0, true, false)).toBe('leg')
    expect(earlyArrivalPlacement(0, false, false)).toBe('stop')
    expect(earlyArrivalPlacement(1, false, false)).toBe('leg')
    expect(earlyArrivalPlacement(2, false, true)).toBe('stop')
  })

  it('uses the placement for both the incoming leg and the fallback', () => {
    const source = readFileSync('src/pages/trip/timeline/DaySection.tsx', 'utf8').replace(/\r\n/g, '\n')
    expect(source).toContain("earlyArrivalPlacement(i, firstLegVisible, i > 0 && ordered[i - 1].auto === true) === 'stop'")
    expect(source).toContain('{renderEarlyArrival(ordered[i + 1])}')
  })
})
