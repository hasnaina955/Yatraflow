// W13 look: the Drive deck draws a lone category as a heading row, never as a
// one-item tab track. The deck has no DOM test, so the branch is checked in the
// source and the rule itself is checked as a pure function.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { driveTabMode } from '../src/components/map/lenses/DriveTabs'

const source = readFileSync('src/components/map/lenses/DriveTabs.tsx', 'utf8')

describe('driveTabMode', () => {
  it('draws a heading row for no category or one category', () => {
    expect(driveTabMode(0)).toBe('heading')
    expect(driveTabMode(1)).toBe('heading')
  })

  it('draws the tab track for two or more categories', () => {
    expect(driveTabMode(2)).toBe('tabs')
    expect(driveTabMode(5)).toBe('tabs')
  })
})

describe('DriveTabs render', () => {
  it('guards the tab track with the mode', () => {
    expect(source).toContain("driveTabMode(groups.length) === 'heading'")
    expect(source).toContain('mv2-lens-single-tab')
  })

  it('keeps the tablist inside the non-heading branch', () => {
    const heading = source.indexOf("driveTabMode(groups.length) === 'heading'")
    const track = source.indexOf('role="tablist"')
    expect(heading).toBeGreaterThan(-1)
    expect(track).toBeGreaterThan(heading)
    // The track branch closes before the panel starts.
    const panel = source.indexOf('className="mv2-lens-panel"')
    expect(track).toBeLessThan(panel)
  })
})
