import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import postcss from 'postcss'

// Read only the two #841 host rules. Never slice from the comment to the end of
// the sheet: later, unrelated append-only blocks would then fall into scope.
const SHEET = ".impact-sheet[role='status']"
const ZONE = ".toast-zone[role='status']"
function hostRules(css: string) {
  const found: Record<string, string[]> = { [SHEET]: [], [ZONE]: [] }
  postcss.parse(css).walkRules(rule => {
    if (rule.parent?.type === 'root' && rule.selector in found) {
      found[rule.selector].push(`${rule.selector} { ${rule.nodes.map(String).join('; ')} }`)
    }
  })
  // Fail closed: a missing or duplicated host rule must not pass vacuously.
  for (const selector of [SHEET, ZONE]) {
    if (found[selector].length !== 1) throw new Error(`expected one top-level ${selector} rule, found ${found[selector].length}`)
  }
  const [sheet, zone] = [found[SHEET][0], found[ZONE][0]]
  return { sheet, zone, both: `${sheet}\n${zone}` }
}
const hosts = hostRules(readFileSync('src/styles.css', 'utf8'))
const ui = readFileSync('src/components/ui.tsx', 'utf8')
const standards = readFileSync('docs/standards/ui-and-design-system.md', 'utf8')

describe('toast / impact-sheet lane contract (#841)', () => {
  it('fixes the two hosts with a measured lane, not a child z-index', () => {
    expect(hosts.sheet).toContain('bottom: var(--toast-lane-h, 0px)')
    expect(hosts.sheet).toContain('max-height: calc(100dvh - var(--toast-lane-h, 0px))')
    expect(hosts.both).not.toContain('z-index:')
    expect(hosts.both).not.toContain('toast-zone--actionable')
  })

  it('leaves the toast pills hit-testable so hover and focus hold survive', () => {
    expect(hosts.both).not.toContain('pointer-events: none')
    expect(hosts.both).not.toContain('pointer-events: auto')
    expect(ui).not.toContain('toast-zone--actionable')
    expect(ui).toContain('onMouseEnter')
    expect(ui).toContain('onMouseLeave')
    expect(ui).toContain('onFocus')
    expect(ui).toContain('onBlur')
  })

  it('publishes the lane from ToastZone and keeps the real timers', () => {
    expect(ui).toContain('--toast-lane-h')
    expect(ui).toContain('ResizeObserver')
    expect(ui).toContain('ref={zoneRef}')
    expect(ui).toContain('const TOAST_DWELL = 3400')
    expect(ui).toContain('const TOAST_DWELL_UNDO = 7000')
    expect(ui).toContain('dismissToastFn?.(t.id)')
  })

  it('keeps the standards guarantees the repair relies on', () => {
    expect(standards).toContain('a transient toast must never cover the Keep/Remove controls')
    expect(standards).toContain('Toast hover and focus hold still work')
    expect(standards).toContain('impact sheet 210 > toast 200')
  })

  it('bounds the lane on short viewports so the sheet keeps a usable height', () => {
    expect(hosts.zone).toContain('max-height: calc(100dvh - 178px)')
    expect(hosts.zone).toContain('overflow-y: auto')
    expect(ui).toContain('scrollTop = el.scrollHeight')
  })

  it('reads only the two host rules and still catches the forbidden declarations', () => {
    const ok = `${SHEET} { bottom: 0 }\n${ZONE} { overflow-y: auto }`
    // Unrelated rules after the hosts (any later append) are out of scope.
    expect(hostRules(`${ok}\n.later { z-index: 5; pointer-events: none }`).both).not.toContain('z-index:')
    // The original forbidden rules, written on a host, are still seen.
    const bad = `${SHEET} { bottom: 0; z-index: 9 }\n${ZONE} { pointer-events: none }`
    expect(hostRules(bad).both).toContain('z-index:')
    expect(hostRules(bad).both).toContain('pointer-events: none')
    // A missing or duplicated host rule fails closed.
    expect(() => hostRules(`${SHEET} { bottom: 0 }`)).toThrow(/found 0/)
    expect(() => hostRules(`${ok}\n${ZONE} { overflow-y: auto }`)).toThrow(/found 2/)
  })
})
