// Pure-logic tests for the UI anti-pattern gate. Node env, no DOM — the
// checker is a pure function over { filename: source }, so the fixtures below
// are the whole surface. What matters is that each rule fires on its own
// violation AND stays silent on the shapes this repo deliberately uses, since
// a gate that cries wolf on correct code stops being run.
import { describe, it, expect } from 'vitest'
import { readCssSource } from '../scripts/css-source-graph.mjs'
import { check, RULES, MAP_TARGET_FLOOR_CLASSES, isFloorSelector } from '../scripts/uiAntipatterns.mjs'

const cleanCss = `
.btn { transition: color 180ms ease, background 180ms ease; }
.panel { z-index: var(--z-modal); }
.map-pin { z-index: 3; }
.sheet { z-index: 40; }
`
const cleanHtml = `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`
const ok = { 'src/styles.css': cleanCss, 'index.html': cleanHtml }

describe('ui anti-pattern gate', () => {
  it('is silent on the shapes this repo actually uses', () => {
    expect(check(ok)).toEqual([])
  })

  it('exposes four enforced rules, each with a reason', () => {
    expect(RULES.map(r => r.id)).toEqual(['U1', 'U2', 'U3', 'U4'])
    for (const r of RULES) expect(r.why.length).toBeGreaterThan(20)
  })

  describe('U1 transition: all', () => {
    it('catches the shorthand', () => {
      const f = check({ 'src/styles.css': '.x { transition: all 200ms ease; }' })
      expect(f).toHaveLength(1)
      expect(f[0]).toMatchObject({ rule: 'U1', line: 1 })
    })

    it('does not fire on an explicit property list, however long', () => {
      const many = '.x { transition: color 1s, background 1s, opacity 1s, border-color 1s, transform 1s; }'
      expect(check({ 'src/styles.css': many })).toEqual([])
    })
  })

  describe('U2 raw z-index', () => {
    it('catches a 999 literal', () => {
      const f = check({ 'src/styles.css': '.a { z-index: 999; }' })
      expect(f).toHaveLength(1)
      expect(f[0].rule).toBe('U2')
    })

    it('catches a four-digit literal', () => {
      expect(check({ 'src/styles.css': '.a { z-index: 9999; }' })).toHaveLength(1)
    })

    it('leaves the ladder and its rungs alone', () => {
      // the documented --z-* ladder tops out at --z-impact: 210
      const ladder = '.a { z-index: var(--z-impact); }\n.b { z-index: 210; }\n.c { z-index: 0; }'
      expect(check({ 'src/styles.css': ladder })).toEqual([])
    })
  })

  describe('U3 pinch-zoom', () => {
    it('catches user-scalable=no', () => {
      const f = check({ 'index.html': '<meta name="viewport" content="width=device-width, user-scalable=no" />' })
      expect(f).toHaveLength(1)
      expect(f[0].rule).toBe('U3')
    })

    it('catches maximum-scale=1', () => {
      expect(check({ 'index.html': '<meta name="viewport" content="width=device-width, maximum-scale=1" />' })).toHaveLength(1)
    })

    it('allows viewport-fit=cover, which is not a zoom block', () => {
      expect(check({ 'index.html': cleanHtml })).toEqual([])
    })

    it('reports a line carrying both zoom blocks once, not twice', () => {
      const both = '<meta name="viewport" content="width=device-width, user-scalable=no, maximum-scale=1" />'
      expect(check({ 'index.html': both })).toHaveLength(1)
    })
  })

  describe('U4 Map V2 44px floor', () => {
    // The two shipped misses that made this rule: the desktop fold button
    // measured 32x32 and the deck shelf buttons 25-26px (ticket 06 reports).
    // check() parses fixture CSS with the script's own PostCSS path, so these
    // exercise the real record contract.
    const checkCss = (css: string) => check({ 'src/styles.css': css })

    it('catches a 32px fold button, one line and multiline', () => {
      const one = checkCss('.mv2-deck-header > .mv2-icon-btn { width: 32px; }')
      expect(one).toHaveLength(1)
      expect(one[0].text).toContain('width: 32px')
      expect(one[0].why).toContain('44px')

      const multi = checkCss('.mv2-deck-header > .mv2-icon-btn {\n  height: 32px;\n  border-radius: 999px;\n}')
      expect(multi).toHaveLength(1)
      expect(multi[0].text).toContain('height: 32px')
    })

    it('catches a 26px shelf chip and a 24px scoped poi-fold, one finding per line', () => {
      const css = [
        '.mv2-workspace .lrow-deck .ledger-shelf > button { min-height: 26px; }',
        '.mv2-workspace .poi-fold { width: 24px; height: 24px; }',
      ].join('\n')
      const f = checkCss(css)
      // The shelf line reports once; the poi-fold line reports once — a line
      // with two sub-44 sizes is one defect to fix, matching the gate's
      // one-finding-per-line contract.
      expect(f).toHaveLength(2)
    })

    it('ignores comments and the same size inside a comment', () => {
      const css = [
        '/* .mv2-icon-btn { width: 32px; } — old rule, kept as prose */',
        '.mv2-icon-btn { /* width: 32px */ color: currentColor; }',
      ].join('\n')
      expect(checkCss(css)).toEqual([])
    })

    it('allows a 16px icon child; the floor governs the control, not its svg', () => {
      expect(checkCss('.mv2-icon-btn svg { width: 16px; height: 16px; }')).toEqual([])
    })

    it('does not match a similar class name', () => {
      expect(checkCss('.other-mv2-icon-btn { width: 24px; }')).toEqual([])
      expect(isFloorSelector('.other-mv2-icon-btn')).toBe(false)
      expect(isFloorSelector('.mv2-icon-btn')).toBe(true)
    })

    it('does not fire on the legacy unscoped surfaces the graph still ships', () => {
      const css = [
        '.ledger-shelf { display: flex; flex-wrap: wrap; }',
        '.poi-fold { width: 24px; height: 24px; }',
      ].join('\n')
      expect(checkCss(css)).toEqual([])
    })

    it('does not fire on non-Map controls at 40px (repo-wide floor)', () => {
      expect(checkCss('.map-day-chip { min-width: 40px; min-height: 44px; }')).toEqual([])
    })

    it('does not fire at 44px or on non-size uses like min-width: 0', () => {
      const css = [
        '.mv2-icon-btn { width: 44px; height: 44px; min-width: 44px; min-height: 44px; }',
        '.mv2-icon-btn { min-width: 0; }',
      ].join('\n')
      expect(checkCss(css)).toEqual([])
    })

    it('reports the exact source line the declaration lives on', () => {
      const css = '/* two lines of prose */\n\n.mv2-workspace .poi-fold {\n  height: 30px;\n}'
      const f = checkCss(css)
      expect(f).toHaveLength(1)
      expect(f[0].line).toBe(4)
      expect(f[0].source).toBe('src/styles.css:4')
    })
  })

  describe('U4 floor-presence contract (the shared rules must exist)', () => {
    const live = readCssSource('src/styles.css')

    it('carries the 44px floor on the shared control rule itself', () => {
      const f = check({ 'src/styles.css': live })
      expect(f.filter(x => x.rule === 'U4')).toEqual([])
      // Absence of bad px is not the contract: a shared floor rule must
      // actually declare 44px on one of the Map control selectors.
      const floored = live.split('\n').filter(line =>
        /min-(width|height):\s*44px/.test(line) && isFloorSelector(line.split('{')[0] ?? ''),
      )
      expect(floored.length, 'no shared Map control rule declares the 44px floor').toBeGreaterThan(0)
    })

    it('keeps the floor class list named', () => {
      expect(MAP_TARGET_FLOOR_CLASSES).toContain('mv2-icon-btn')
      expect(MAP_TARGET_FLOOR_CLASSES).toContain('poi-fold')
      expect(MAP_TARGET_FLOOR_CLASSES).toContain('ledger-shelf')
    })
  })

  describe('reporting', () => {
    it('reports a real line number for a violation below line 1', () => {
      const src = '.a { color: red; }\n.b { color: red; }\n.c { transition: all 1s; }'
      expect(check({ 'src/styles.css': src })[0].line).toBe(3)
    })

    it('quotes the offending line so the message is actionable', () => {
      const f = check({ 'src/styles.css': '.btn { transition: all 200ms; }' })
      expect(f[0].text).toContain('transition: all')
    })

    it('ignores a rule whose file is absent, rather than throwing', () => {
      expect(check({ 'index.html': cleanHtml })).toEqual([])
      expect(check({})).toEqual([])
    })

    it('sorts findings by file then line', () => {
      const files = {
        'src/styles.css': '.a { z-index: 5; }\n.b { z-index: 9999; }',
        'index.html': '<meta content="user-scalable=no" />',
      }
      const f = check(files)
      expect(f.map(x => `${x.file}:${x.line}`)).toEqual(['index.html:1', 'src/styles.css:2'])
    })

    it('collects every violation, not just the first per file', () => {
      const f = check({ 'src/styles.css': '.a { z-index: 999; }\n.b { z-index: 1000; }\n.c { transition: all 1s; }' })
      expect(f).toHaveLength(3)
    })
  })
})