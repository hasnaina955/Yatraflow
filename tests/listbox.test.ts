import { describe, expect, it } from 'vitest'
import { moveActive, typeaheadIndex } from '../src/lib/listbox'

describe('moveActive — listbox index math (#107 A-family)', () => {
  it('wraps forward past the last option', () => {
    expect(moveActive(3, 2, 'down')).toBe(0)
  })

  it('wraps backward past the first option', () => {
    expect(moveActive(3, 0, 'up')).toBe(2)
  })

  it('jumps to the ends on Home/End', () => {
    expect(moveActive(5, 2, 'home')).toBe(0)
    expect(moveActive(5, 2, 'end')).toBe(4)
  })

  it('is safe on empty and single-option lists', () => {
    expect(moveActive(0, 0, 'down')).toBe(0)
    expect(moveActive(1, 0, 'up')).toBe(0)
  })
})

describe('typeaheadIndex — first-letter selection', () => {
  const labels = ['Alleppey', 'Munnar', 'Kochi', 'Mysore']

  it('finds the next match after the current highlight', () => {
    expect(typeaheadIndex(labels, 'm', 0)).toBe(1)
    expect(typeaheadIndex(labels, 'm', 1)).toBe(3)
  })

  it('wraps around the end of the list', () => {
    expect(typeaheadIndex(labels, 'a', 2)).toBe(0)
  })

  it('is case-insensitive and ignores blank buffers', () => {
    expect(typeaheadIndex(labels, 'K', 0)).toBe(2)
    expect(typeaheadIndex(labels, '', 0)).toBe(-1)
    expect(typeaheadIndex(labels, '   ', 0)).toBe(-1)
  })

  it('returns -1 when nothing matches so the highlight stays put', () => {
    expect(typeaheadIndex(labels, 'z', 0)).toBe(-1)
  })
})
