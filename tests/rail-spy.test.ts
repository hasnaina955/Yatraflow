import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readCssSource } from '../scripts/css-source-graph.mjs'

/** Strip comment lines so prose about the contract cannot impersonate it
 *  (§6x: a negative source assertion judges code, never comments). */
function codeOf(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

describe('MR9/P4 — the sticky stack is measured, not assumed', () => {
  const tab = codeOf('../src/pages/trip/TimelineTab.tsx')

  it('measures the stack from the stuck bars and their sticky tops', () => {
    expect(tab).toMatch(/function measureStickyStack\(\): number \{/)
    expect(tab).toMatch(/getComputedStyle\(el\)/)
  })

  it('publishes the measurement as the one answer both consumers read', () => {
    // The jump lands through CSS scroll-margin (var --tl-stack); the spy line
    // reads the same number through stackRef. One measurement, one answer.
    expect(tab).toMatch(/setProperty\('--tl-stack'/)
    expect(tab).toMatch(/const line = stackRef\.current/)
  })

  it('re-measures on resize and on the review switch', () => {
    expect(tab).toMatch(/window\.addEventListener\('resize', sync\)/)
    expect(tab).toMatch(/\}, \[reviewAll\]\)/)
  })
})

describe('MR9 — the one nav tracks the section in view', () => {
  const tab = codeOf('../src/pages/trip/TimelineTab.tsx')

  it('marks the day in view in review, and the open day otherwise', () => {
    expect(tab).toMatch(
      /const current = reviewAll \? currentDay === it\.dayIndex : openDayIndex === it\.dayIndex/,
    )
  })

  it('day jumps honour prefers-reduced-motion through scrollBehavior', () => {
    expect(tab).toMatch(/el\.scrollIntoView\(\{ behavior: scrollBehavior\(\), block: 'start' \}\)/)
  })
})

describe('P4 — the current-day marker survives the warn skin', () => {
  const css = readCssSource('src/styles.css')

  it('gives the warned current card a border marker warn cannot replace', () => {
    // PW-08 moved the warn state off the card's own skin and onto the dot, so
    // the current-day border can no longer be overwritten by a warn rule. The
    // dot still cannot carry meaning by colour alone: its label says it.
    const rule = /\.tl-ribbon-card\[aria-current='true'\] \{([^}]*)\}/.exec(css)
    expect(rule, 'current-day ribbon card rule missing').not.toBeNull()
    expect(rule![1]).toContain('border-color: var(--pw-lagoon-600)')
    expect(css).not.toMatch(/\.tl-ribbon-card\.warn/)
    expect(css).toMatch(/\.tl-ribbon-dot\.warn \{ background: var\(--yf-amber\); \}/)
  })

  it('drops the orphaned chip selector the card rename left behind', () => {
    expect(css).not.toMatch(/\.day-rail-chip/)
  })

  it('lands every day-card jump below the measured stack', () => {
    expect(css).toMatch(/\[id\^='day-card'\] \{ scroll-margin-top: var\(--tl-stack/)
  })
})
