// W6: the more-count counts hidden picks. The Add label is clear.
// The node env has no DOM, so source checks read the file text.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { addSlotLabel, driveAddLabel, hiddenDrivePicks } from '../src/components/map/lenses/DriveTabs'
import { gapAddLabel } from '../src/components/map/lenses/GapDeck'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

type Pick = { hit: { id: string } | null }
const pick = (id: string): Pick => ({ hit: { id } })

describe('hiddenDrivePicks', () => {
  it('two shown picks of two leave no hidden picks', () => {
    const all = [pick('a'), pick('b')]
    expect(hiddenDrivePicks(all, new Set(['a', 'b']))).toEqual([])
  })

  it('three shown picks of five leave the other two', () => {
    const all = [pick('a'), pick('b'), pick('c'), pick('d'), pick('e')]
    expect(hiddenDrivePicks(all, new Set(['a', 'b', 'c']))).toEqual([pick('d'), pick('e')])
  })

  it('keeps a pick with no hit', () => {
    expect(hiddenDrivePicks([{ hit: null }], new Set<string>())).toEqual([{ hit: null }])
  })
})

describe('the Add label rule', () => {
  it('a lunch label names the meal slot', () => {
    expect(addSlotLabel(3, 'lunch')).toBe('Add as Day 3 lunch')
    expect(driveAddLabel(3, 'Lunch gap')).toBe('Add as Day 3 lunch')
  })

  it('a sights label names only the day', () => {
    expect(addSlotLabel(1, 'sights')).toBe('Add to Day 1')
    expect(driveAddLabel(1, 'Sights')).toBe('Add to Day 1')
  })

  it('an unknown day gives Add', () => {
    expect(addSlotLabel(Number.NaN, 'lunch')).toBe('Add')
    expect(driveAddLabel(Number.NaN, 'Lunch gap')).toBe('Add')
  })

  it('the gap label follows the same rule', () => {
    expect(gapAddLabel(1, 'Lunch')).toBe('Add as Day 1 lunch')
    expect(gapAddLabel(1, '11:30-14:30')).toBe('Add to Day 1')
    expect(gapAddLabel(Number.NaN, 'Lunch')).toBe('Add')
  })

  it('breakfast and dinner name the meal slot', () => {
    expect(driveAddLabel(2, 'Breakfast gap')).toBe('Add as Day 2 breakfast')
    expect(driveAddLabel(2, 'Dinner gap')).toBe('Add as Day 2 dinner')
  })
})

describe('the source shows the count once', () => {
  it('the drive deck draws no duplicate count', () => {
    const source = read('../src/components/map/lenses/DriveTabs.tsx')
    expect(source).not.toContain('more like this')
  })

  it('the Map tab lists only hidden picks', () => {
    const source = read('../src/pages/trip/MapTab.tsx')
    expect(source).toContain('hiddenRows.length > 0')
    expect(source).toContain('More like this · {hiddenRows.length}')
    expect(source).toContain('{hiddenRows.map(ledgerRow)}')
  })
})
