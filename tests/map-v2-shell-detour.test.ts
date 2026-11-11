// ============ Map V2 shell: one detour rule on the card and the rail (package B) ============
//
// The place card and the rail labels both read `detourDisplay`, so a model zero
// and a 0.2 minute detour read the same. An on-route detour hides its budget share.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detourBits } from '../src/pages/trip/map/railLabels'
import { detourDisplayText } from '../src/pages/trip/map/driveSuggestionView'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n')

describe('rail detour bits', () => {
  it('reads 0 and 0.2 the same and hides the share', () => {
    expect(detourBits({ detourMin: 0, budgetSharePct: 12 })).toEqual(['on route'])
    expect(detourBits({ detourMin: 0.2, budgetSharePct: 12 })).toEqual(['on route'])
    expect(detourBits({ detourMin: 0.5, budgetSharePct: 12 })).toEqual(['on route'])
  })

  it('keeps the share for a detour above the cutoff', () => {
    expect(detourBits({ detourMin: 0.6, budgetSharePct: 12 })).toEqual(['+1 min', "12% of the day's detour budget"])
    expect(detourBits({ detourMin: 4, budgetSharePct: 9, arriveLabel: '12:05' })).toEqual(['arrive 12:05', '+4 min', "9% of the day's detour budget"])
  })

  it('keeps unknown separate from on route', () => {
    expect(detourBits({ detourMin: null, budgetSharePct: 12 })).toEqual(['position unknown'])
    expect(detourBits({ detourMin: Number.NaN })).toEqual(['position unknown'])
  })

  it('never prints a zero share', () => {
    expect(detourBits({ detourMin: 4, budgetSharePct: 0 })).toEqual(['+4 min'])
  })
})

describe('the place card text', () => {
  it('uses the same words as the rail', () => {
    expect(detourDisplayText(0)).toBe('On route')
    expect(detourDisplayText(0.2)).toBe('On route')
    expect(detourDisplayText(0.5)).toBe('On route')
    expect(detourDisplayText(7.4)).toBe('+7 min')
    expect(detourDisplayText(null)).toBe('Unknown')
  })

  it('calls the shared rule at the card, and shows a share only for an extra detour', () => {
    const card = read('src', 'components', 'map', 'MapPickCard.tsx')
    expect(card).toContain('detourDisplayText(detourMin)')
    expect(card).toContain("detour.kind === 'extra' && budgetSharePct != null")
    expect(card).not.toMatch(/detourMin > 0/)
  })

  it('calls the shared rule in the rail labels', () => {
    const labels = read('src', 'pages', 'trip', 'map', 'railLabels.ts')
    expect(labels).toContain("detourDisplay } from './detourRule'")
    expect(labels).toContain('detourDisplay(detourMin)')
  })
})
