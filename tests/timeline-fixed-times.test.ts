// PW-08 source pins: the day surface must hand the fixed stop ids to BOTH
// optimiser calls. The preview path used to recompute without the guard, which
// would let a stale preview reorder a day the header had already refused.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const daySection = readFileSync(new URL('../src/pages/trip/timeline/DaySection.tsx', import.meta.url), 'utf8')

describe('Timeline fixed-time wiring', () => {
  it('passes fixedStopIds to every optimiser call', () => {
    const calls = [...daySection.matchAll(/optimizeDayOrder\([^)]*\)/g)].map(m => m[0])
    expect(calls).toHaveLength(2)
    for (const call of calls) expect(call).toContain('fixedStopIds')
  })

  it('renders the header badge, the stop pill and the Fixed times panel', () => {
    expect(daySection).toContain('day-fixed-badge')
    expect(daySection).toContain('stop-fixed-pill')
    expect(daySection).toContain('fixed-times-card')
  })
})
