// Package C, item 1: the detour rule lives in one small module, so the rail
// labels and the drive view no longer import each other.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ON_ROUTE_DETOUR_MIN, detourDisplay, detourDisplayText } from '../src/pages/trip/map/detourRule'

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

describe('detourRule', () => {
  it('owns the threshold and the display helpers', () => {
    expect(ON_ROUTE_DETOUR_MIN).toBe(0.5)
    expect(detourDisplay(0.5)).toEqual({ kind: 'on-route' })
    expect(detourDisplay(0.6)).toEqual({ kind: 'extra', minutes: 1 })
    expect(detourDisplay(null)).toEqual({ kind: 'unknown' })
    expect(detourDisplayText(12)).toBe('+12 min')
  })

  it('breaks the railLabels <-> driveSuggestionView import cycle', () => {
    const labels = read('src/pages/trip/map/railLabels.ts')
    const view = read('src/pages/trip/map/driveSuggestionView.ts')
    expect(labels).not.toMatch(/from '\.\/driveSuggestionView'/)
    expect(view).not.toMatch(/from '\.\/railLabels'/)
    expect(labels).toMatch(/from '\.\/detourRule'/)
    expect(view).toMatch(/from '\.\/detourRule'/)
  })
})
