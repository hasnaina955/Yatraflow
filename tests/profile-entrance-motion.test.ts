// Source-reading gate for the Profile page entrance (the block at the end of
// src/styles/legacy/16-motion-and-cover-v2.css). The cascade belongs to the
// page's own containers: top-level rules, stagger from --stagger-step inside the
// six-step budget, motion tokens only, no raw time values, and a reduced-motion
// opt-out that names every animated selector with the same selector text.
//
// The last describe proves the gate has teeth: one meaningful mutation to the
// real file (a raw duration in a transition) must fail it. The mutation is
// restored byte-for-byte in the same test, and the restored bytes are checked.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const MOTION_PATH = 'src/styles/legacy/16-motion-and-cover-v2.css'
const CSS = read(MOTION_PATH)
const TSX = read('src/pages/Profile.tsx')
const MARK = '/* ---------- Entrance: the Profile page\'s own cascade ----------'

type Block = { selector: string; body: string; depth: number }

function blocks(css: string): Block[] {
  const out: Block[] = []
  const stack: { start: number; selector: string; depth: number }[] = []
  let depth = 0
  let last = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      const selector = css.slice(last, i).replace(/\/\*[\s\S]*?\*\//g, '').trim()
      stack.push({ start: i + 1, selector, depth })
      depth++
      last = i + 1
    } else if (ch === '}') {
      depth--
      const open = stack.pop()
      if (open) out.push({ selector: open.selector, body: css.slice(open.start, i), depth: open.depth })
      last = i + 1
    } else if (ch === ';') {
      last = i + 1
    }
  }
  return out
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const selectorsOf = (selector: string) => selector.split(',').map(norm)

describe('Profile entrance: page-owned cascade', () => {
  const tailStart = CSS.indexOf(MARK)
  const tail = CSS.slice(tailStart)
  const code = stripComments(tail)
  const entrance = blocks(tail).filter((b) => b.depth === 0)
  const animated = entrance.filter((b) => /animation:\s*(?!none\b)[a-zA-Z]/.test(b.body))
  const reduce = entrance.find((b) => b.selector === '@media (prefers-reduced-motion: reduce)')
  const findBlock = (sel: string) => entrance.find((b) => selectorsOf(b.selector).includes(sel))

  it('is appended at the end of the file, once', () => {
    expect(tailStart).toBeGreaterThan(0)
    expect(CSS.indexOf(MARK, tailStart + 1)).toBe(-1)
    expect(reduce).toBeDefined()
  })

  it('takes the whole-column rise off, so no block animates twice', () => {
    expect(code).toMatch(/\.prof-page > \.prof-grid\s*\{\s*animation:\s*none;?\s*\}/)
  })

  it('staggers with --stagger-step multiples inside the six-step budget', () => {
    const delays = [...code.matchAll(/animation-delay:\s*([^;}]+)/g)].map((m) => m[1].trim())
    expect(delays.length).toBeGreaterThan(10)
    const steps: number[] = []
    for (const d of delays) {
      const m = d.match(/^calc\(var\(--stagger-step\) \* (\d+)\)$/)
      expect(m, d).not.toBeNull()
      steps.push(Number(m![1]))
    }
    // Six steps is the shared entrance cap (MOTION-TOKENS.md). The last section
    // starts at 300ms and settles at 660ms.
    expect(Math.max(...steps)).toBeLessThanOrEqual(5)
  })

  it('animates with motion tokens only: a named keyframe, a motion duration, the paper ease', () => {
    const values = [...code.matchAll(/animation:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^none\b/.test(v))
    expect(values.length).toBeGreaterThanOrEqual(3)
    for (const v of values) {
      expect(v).toMatch(/^(pageRise|fadeIn) var\(--motion-slow\) var\(--ease-paper\) backwards$/)
    }
  })

  it('has no raw time values and no !important', () => {
    expect(code).not.toMatch(/\b\d+(\.\d+)?(ms|s)\b/)
    expect(code).not.toMatch(/!important/)
  })

  it('animates only transform and opacity, never layout', () => {
    const motion = code.slice(0, code.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(motion).not.toMatch(/\b(top|left|right|bottom|width|height|margin|padding|inset|max-height)\s*:/)
  })

  it('uses keyframes that exist elsewhere in the stylesheet', () => {
    expect(read('src/styles/legacy/11-shared-page.css')).toMatch(/@keyframes pageRise\s*\{/)
    expect(read('src/styles/legacy/02-select-and-print.css')).toMatch(/@keyframes fadeIn\s*\{/)
  })

  it('opts every animated selector out under reduced motion, with the same selector text', () => {
    expect(reduce).toBeDefined()
    const optedOut = [...(reduce?.body ?? '').matchAll(/([^{}]+)\{\s*animation:\s*none;?\s*\}/g)].flatMap((m) => selectorsOf(m[1]))
    expect(optedOut.length).toBeGreaterThan(0)
    for (const b of animated) {
      for (const sel of selectorsOf(b.selector)) {
        expect(optedOut, `${sel} animates but has no reduced-motion opt-out`).toContain(sel)
      }
    }
  })

  it('follows the rendered sections, not a fixed list', () => {
    // The cascade is keyed by position, so a gated section that does not render
    // simply shortens the run; no rule may name a section id.
    expect(TSX).toContain('className="prof-grid"')
    expect(TSX).toContain('className="prof-nav yf-surface"')
    expect(TSX).toContain('className="prof-nav-item"')
    expect(TSX).toContain('className="prof-section"')
    expect(TSX).toContain('className="prof-aside"')
    expect(code).not.toMatch(/\.prof-section#|#prof-/)
  })
})

describe('Profile entrance: the gate has teeth', () => {
  /** Run the two rules a mutation is most likely to break, against a candidate CSS. */
  function violations(css: string): string[] {
    const start = css.indexOf(MARK)
    if (start < 0) return ['marker missing']
    const body = stripComments(css.slice(start))
    const out: string[] = []
    if (/\b\d+(\.\d+)?(ms|s)\b/.test(body)) out.push('raw time value')
    const delays = [...body.matchAll(/animation-delay:\s*([^;}]+)/g)].map((m) => m[1].trim())
    for (const d of delays) {
      const m = d.match(/^calc\(var\(--stagger-step\) \* (\d+)\)$/)
      if (!m) { out.push(`bad delay: ${d}`); continue }
      if (Number(m[1]) > 5) out.push(`step over budget: ${d}`)
    }
    return out
  }

  it('passes on the real file', () => {
    expect(violations(CSS)).toEqual([])
  })

  it('fails on a raw duration and on a stagger step past the cap, then restores exact bytes', () => {
    const rawDuration = CSS.replace(
      '.prof-aside > * {\n  animation: pageRise var(--motion-slow) var(--ease-paper) backwards;',
      '.prof-aside > * {\n  transition: color 240ms var(--ease-paper);\n  animation: pageRise var(--motion-slow) var(--ease-paper) backwards;',
    )
    expect(rawDuration, 'the mutation must actually change the file').not.toBe(CSS)
    expect(violations(rawDuration)).toContain('raw time value')

    const overBudget = CSS.replace(
      '.prof-main > .prof-section:nth-child(n+6) { animation-delay: calc(var(--stagger-step) * 5); }',
      '.prof-main > .prof-section:nth-child(n+6) { animation-delay: calc(var(--stagger-step) * 9); }',
    )
    expect(overBudget).not.toBe(CSS)
    expect(violations(overBudget).some((v) => v.startsWith('step over budget'))).toBe(true)

    // Nothing was written: the file on disk is byte-identical to what was read.
    expect(read(MOTION_PATH)).toBe(CSS)
  })
})
