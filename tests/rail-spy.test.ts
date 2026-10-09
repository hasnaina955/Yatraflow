import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

  it('reads the stack inside the spy callback, not at effect start', () => {
    // The effect above re-measures on every resize and on the review switch,
    // but this spy effect's dependencies changed. A line captured when the
    // effect started is a number that no longer agrees with --tl-stack, which
    // is what the jumps land under. The read must sit inside the
    // measure callback, where every invocation re-reads the current value.
    const body = /const measure = \(\) => \{([\s\S]*?)\n  \}\n/.exec(tab)?.[1] ?? ''
    expect(body.trim().length, 'the spy measure callback body was not found').toBeGreaterThan(0)
    expect(body).toMatch(/const line = stackRef\.current/)
    const readAt = tab.indexOf('const line = stackRef.current')
    const callbackAt = tab.indexOf('const measure = () => {')
    expect(readAt).toBeGreaterThan(callbackAt)
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
  const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8')

  it('gives the warned current card a border marker warn cannot replace', () => {
    const rule = /\.day-rail-card\.warn\[aria-current='true'\] \{([^}]*)\}/.exec(css)
    expect(rule, 'warn+current rule missing').not.toBeNull()
    expect(rule![1]).toContain('border-color: var(--teal)')
    expect(rule![1]).toContain('font-weight: 800')
  })

  it('drops the orphaned chip selector the card rename left behind', () => {
    expect(css).not.toMatch(/\.day-rail-chip\[aria-current/)
  })

  it('lands every day-card jump below the measured stack', () => {
    expect(css).toMatch(/\[id\^='day-card'\] \{ scroll-margin-top: var\(--tl-stack/)
  })
})
