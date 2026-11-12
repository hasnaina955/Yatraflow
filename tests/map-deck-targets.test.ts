// The Map V2 44px target floor: one shared contract, not per-incident repairs.
// The base .mv2-icon-btn rule carries the fold-button size, the deck-scoped
// shelf rules carry the shelf buttons', and check:ui rule U4 fails the gate on
// any px size below 44 on a Map floor selector (mv2-icon-btn anywhere,
// poi-fold and ledger-shelf inside .mv2-workspace).
import { describe, expect, it } from 'vitest'
import { readCssSource } from '../scripts/css-source-graph.mjs'
import { check, MAP_TARGET_FLOOR_CLASSES } from '../scripts/uiAntipatterns.mjs'

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const cssLines = (css: string) => stripCssComments(css).split(/\r?\n/)

describe('map deck shelf targets', () => {
  it('carries the fold-button size on the base mv2-icon-btn rule', () => {
    const rule = cssLines(readCssSource('src/styles.css'))
      .find(line => line.startsWith('.mv2-icon-btn {'))
    expect(rule, 'base mv2-icon-btn rule is missing').toBeTruthy()
    expect(rule!).toMatch(/width:\s*44px/)
    expect(rule!).toMatch(/height:\s*44px/)
  })

  it('gives every deck shelf button a 44px minimum on both axes', () => {
    const rule = cssLines(readCssSource('src/styles.css'))
      .find(line => line.startsWith('.mv2-workspace .lrow-deck .ledger-shelf > button {'))
    expect(rule, 'deck shelf button rule is missing').toBeTruthy()
    expect(rule!).toMatch(/min-width:\s*44px/)
    expect(rule!).toMatch(/min-height:\s*44px/)
  })

  it('keeps the shelf wrapping so a 320px deck does not overflow sideways', () => {
    const rule = cssLines(readCssSource('src/styles.css'))
      .find(line => line.startsWith('.mv2-workspace .lrow-deck .ledger-shelf {'))
    expect(rule, 'deck shelf wrap rule is missing').toBeTruthy()
    expect(rule!).toMatch(/flex-wrap:\s*wrap/)
  })

  it('declares the deck shelf top-level rule exactly once', () => {
    const rules = cssLines(readCssSource('src/styles.css'))
      .filter(line => line.startsWith('.mv2-workspace .lrow-deck .ledger-shelf {'))
    expect(rules).toHaveLength(1)
  })

  it('scopes the shelf target to the deck so legacy rows keep their size', () => {
    const scoped = cssLines(readCssSource('src/styles.css'))
      .filter(line => line.includes('.ledger-shelf > button'))
    expect(scoped.length).toBeGreaterThan(0)
    for (const line of scoped) {
      expect(line.startsWith('.mv2-workspace .lrow-deck .ledger-shelf > button')).toBe(true)
    }
  })

  it('holds the 44px floor across the real cascade: U4 finds nothing', () => {
    const findings = check({ 'src/styles.css': readCssSource('src/styles.css') })
      .filter(f => f.rule === 'U4')
    expect(findings).toEqual([])
  })

  it('keeps the floor class list named, so the contract stays explicit', () => {
    expect(MAP_TARGET_FLOOR_CLASSES).toContain('mv2-icon-btn')
    expect(MAP_TARGET_FLOOR_CLASSES).toContain('poi-fold')
    expect(MAP_TARGET_FLOOR_CLASSES).toContain('ledger-shelf')
  })
})
