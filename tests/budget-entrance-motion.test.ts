import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Source-reading gate for the Budget tab entrance (src/styles/pages/budget.css).
// The cascade is owned by the body: top-level rules, stagger from --stagger-step,
// no raw time values, transform and opacity only, reduced-motion opt-out at top level.

const CSS = readFileSync(join(process.cwd(), 'src/styles/pages/budget.css'), 'utf8').replace(/\r\n/g, '\n')
const MARK = '/* ---------- Entrance: one cascade, owned by the page body ----------'

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

describe('Budget tab entrance: container-owned cascade', () => {
  const tailStart = CSS.indexOf(MARK)
  const tail = CSS.slice(tailStart)
  const code = stripComments(tail)
  const top = blocks(CSS).filter((b) => b.depth === 0)

  it('has the entrance block appended at the end of the file', () => {
    expect(tailStart).toBeGreaterThan(0)
    expect(tailStart).toBeGreaterThan(CSS.indexOf('@media (pointer: coarse)'))
  })

  it('owns the body cascade at the top level, with the page-entrance kind', () => {
    const rule = top.find((b) => b.selector === '.bud-page > *')
    expect(rule).toBeDefined()
    expect(rule?.body).toMatch(/animation:\s*pageRise var\(--motion-slow\) var\(--ease-paper\) backwards/)
    // The catch-all sits at step 6, the same shape as the page-enter pattern.
    expect(code).toMatch(/\.bud-page > \*:nth-child\(n\+7\)\s*\{\s*animation-delay:\s*calc\(var\(--stagger-step\) \* 6\);?\s*\}/)
  })

  it('takes the block fade off the tab panel only for the Budget tab', () => {
    expect(code).toMatch(/div\[role="tabpanel"\]:has\(> \.bud-page\)\s*\{\s*animation:\s*none;?\s*\}/)
  })

  it('staggers only with --stagger-step, steps 1 to 6', () => {
    const delays = [...code.matchAll(/animation-delay:\s*([^;}]+)/g)].map((m) => m[1].trim())
    expect(delays.length).toBeGreaterThan(20)
    for (const d of delays) {
      expect(d).toMatch(/^calc\(var\(--stagger-step\) \* [1-6]\)$/)
    }
  })

  it('has no raw time values or new keyframes in the entrance code', () => {
    expect(code).not.toMatch(/\b\d+(\.\d+)?(ms|s)\b/)
    expect(code).not.toMatch(/@keyframes/)
  })

  it('animates only transform and opacity, never layout properties', () => {
    expect(code).not.toMatch(/\b(top|left|right|bottom|width|height|margin|padding|inset|transition)\s*:/)
  })

  it('does not restart on a filter: expense rows carry no cascade of their own', () => {
    expect(code).not.toMatch(/\.bud-lines-table tbody > tr\s*\{/)
    expect(code).not.toMatch(/\.bud-optional-row\s*\{/)
  })

  it('keeps the state banners and the edit bar out of the cascade', () => {
    expect(code).toMatch(/\.bud-page > \.bud-read[\s\S]*?animation:\s*none/)
    expect(code).toMatch(/\.bud-page > \.bud-editor-actions[\s\S]*?animation:\s*none/)
  })

  it('keeps the existing chart and balance grow rules', () => {
    expect(CSS).toMatch(/\.bud-stack\s*\{[^}]*bud-bars-in var\(--motion-slower\)/)
    expect(CSS).toMatch(/\.bud-bal-bar[^{]*\{[^}]*bud-grow-x/)
  })

  it('opts out under reduced motion at the top level, after the cascade', () => {
    const reduce = top.find((b) => b.selector === '@media (prefers-reduced-motion: reduce)' && b.body.includes('.bud-page > *'))
    expect(reduce).toBeDefined()
    expect(reduce?.body).toMatch(/\.bud-page > \*[\s\S]*?animation:\s*none/)
    expect(reduce?.body).toMatch(/\.bud-glance > \*[\s\S]*?animation:\s*none/)
    expect(reduce?.body).toMatch(/\.bud-grid-charts > \*[\s\S]*?animation:\s*none/)
    expect(reduce?.body).toMatch(/\.bud-grid-mid > \*[\s\S]*?animation:\s*none/)
    const index = top.indexOf(reduce as Block)
    expect(index).toBeGreaterThan(top.findIndex((b) => b.selector === '.bud-page > *'))
  })

  it('never animates the cascade under no-preference', () => {
    expect(tail).not.toMatch(/prefers-reduced-motion: no-preference/)
  })
})
