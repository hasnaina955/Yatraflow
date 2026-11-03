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
  // Only the entrance section: the rest of the file has base rules with the same
  // class names, and they carry no entrance.
  const entrance = blocks(tail).filter((b) => b.depth === 0)

  it('has the entrance block appended at the end of the file', () => {
    expect(tailStart).toBeGreaterThan(0)
    expect(tailStart).toBeGreaterThan(CSS.indexOf('@media (pointer: coarse)'))
  })

  it('owns the body cascade at the top level, with the page-entrance kind', () => {
    // The body's blocks are the wrappers and the expense list. A wrapper carries
    // no fade of its own (its cards do), and the list lands on the last beat.
    const rule = top.find((b) => b.selector === '.bud-page > *')
    expect(rule).toBeDefined()
    expect(rule?.body).toMatch(/animation:\s*none/)
    const list = top.find((b) => b.selector === '.bud-page > .bud-lines')
    expect(list?.body).toMatch(/animation:\s*pageRise var\(--motion-slow\) var\(--ease-paper\) backwards/)
    expect(list?.body).toMatch(/animation-delay:\s*calc\(var\(--stagger-step\) \* 8\)/)
    // The containers still own their cards with the page-entrance kind.
    const glance = top.find((b) => b.selector === '.bud-glance > *')
    expect(glance?.body).toMatch(/animation:\s*pageRise var\(--motion-slow\) var\(--ease-paper\) backwards/)
  })

  it('takes the block fade off the tab panel only for the Budget tab', () => {
    expect(code).toMatch(/div\[role="tabpanel"\]:has\(> \.bud-page\)\s*\{\s*animation:\s*none;?\s*\}/)
  })

  it('staggers only with --stagger-step, inside the card step plus six, or after a bar', () => {
    const delays = [...code.matchAll(/animation-delay:\s*([^;}]+)/g)].map((m) => m[1].trim())
    expect(delays.length).toBeGreaterThan(40)
    for (const d of delays) {
      // `* N`, `* (base + N)`, and either of those plus one bar growth (the bar
      // is one and a half token lengths, so its multiplier is allowed).
      expect(d).toMatch(
        /^calc\(var\(--stagger-step\) \* (?:\d+|\(\d+ \+ \d+\))(?: \+ var\(--motion-slower\)(?: \* 1\.5)?)?\)$/,
      )
    }
  })

  it('spreads the card beats and caps every inner cascade at six steps', () => {
    const pairs = [...code.matchAll(/\((\d+) \+ (\d+)\)/g)]
    expect(pairs.length).toBeGreaterThan(10)
    for (const [, base, step] of pairs) {
      // `base` is the card's beat (0-8); `step` is the inner offset (at most six).
      expect(Number(base)).toBeLessThanOrEqual(8)
      expect(Number(step)).toBeLessThanOrEqual(6)
    }
    const plain = [...code.matchAll(/var\(--stagger-step\) \* (\d+)(?!\)?\s*\+)/g)].map((m) => Number(m[1]))
    // The card beats run 0-8: hero, three tiles, day chart, category card,
    // balances, optional card, expense list. Every inner cascade stays inside
    // six steps beyond its card's beat (the `(base + N)` pairs above).
    for (const n of plain) expect(n).toBeLessThanOrEqual(8)
    // The four card beats are distinct, so the cards arrive in separate beats.
    const cardSteps = [
      '.bud-grid-charts > \\*:nth-child\\(1\\)',
      '.bud-grid-charts > \\*:nth-child\\(2\\)',
      '.bud-grid-mid > \\*:nth-child\\(1\\)',
      '.bud-grid-mid > \\*:nth-child\\(2\\)',
    ].map((sel) => {
      const rule = code.match(new RegExp(`${sel}\\s*\\{\\s*animation-delay:\\s*calc\\(var\\(--stagger-step\\) \\* (\\d+)\\)`))
      expect(rule, sel).not.toBeNull()
      return Number(rule![1])
    })
    expect(new Set(cardSteps).size, cardSteps.join(',')).toBe(cardSteps.length)
    // The catch-alls sit on the last inner step of their cascade.
    expect(code).toMatch(
      /\.bud-cat-card \.bud-cat-table > tbody > tr:nth-child\(n\+5\)\s*\{\s*animation-delay:\s*calc\(var\(--stagger-step\) \* \(5 \+ 6\)\)/,
    )
    expect(code).toMatch(
      /\.bud-balances > \*:nth-child\(n\+4\)\s*\{\s*animation-delay:\s*calc\(var\(--stagger-step\) \* \(6 \+ 5\)\)/,
    )
    expect(code).toMatch(
      /\.bud-chart-card \.bud-legend > li:nth-child\(n\+5\)\s*\{\s*animation-delay:\s*calc\(var\(--stagger-step\) \* \(4 \+ 4\)\)/,
    )
  })

  it('runs an inner cascade in each card, owned by its container', () => {
    const owned = [
      '.bud-glance-main > *',
      '.bud-cat-card .bud-cat-table > tbody > tr',
      '.bud-cat-card .bud-cat-table > tfoot > tr',
      '.bud-balances > *',
      '.bud-transfers > *',
      '.bud-chart-card .bud-legend > li',
    ]
    for (const selector of owned) {
      const rule = entrance.find((b) => b.selector === selector)
      expect(rule, selector).toBeDefined()
      expect(rule?.body, selector).toMatch(
        /animation:\s*pageRise var\(--motion-slow\) var\(--ease-paper\) backwards/,
      )
    }
  })

  it('fades a label instead of moving it, and only after its mark has grown', () => {
    // The axis ticks and the rupee label on the target line are static, as they
    // are in the mockup: six labels (five ticks plus the rupee) fading together
    // would start six elements in one frame. The day totals and the caption fade.
    const labelRules = entrance.filter((b) =>
      /bud-bar-total|bud-axis-label|bud-target-text|bud-target-caption/.test(b.selector),
    )
    expect(labelRules.length).toBeGreaterThanOrEqual(6)
    for (const rule of labelRules) {
      expect(rule.body, rule.selector).toMatch(/animation:\s*fadeIn var\(--motion-med\)/)
      expect(rule.body, rule.selector).not.toMatch(/pageRise/)
      expect(rule.body, rule.selector).toMatch(
        /animation-delay:\s*calc\(var\(--stagger-step\) \* [\d() +]+ \+ var\(--motion-slower\)(?: \* 1\.5)?\)/,
      )
    }
  })

  it('leaves the rows that re-mount out of the inner cascade', () => {
    // The ledger and the optional lines re-mount on a filter or a toggle, so a
    // per-row rule there would replay the entrance.
    expect(code).not.toMatch(/bud-lines-table/)
    expect(code).not.toMatch(/bud-optional-row/)
    expect(code).not.toMatch(/bud-state\s*[,{]/)
    expect(code).not.toMatch(/bud-editor-actions[^{]*\{[^}]*pageRise/)
  })

  it('keeps an inner element out of more than one cascade', () => {
    // No selector in the tail may be both a card and a part of a card.
    const cardSelectors = ['.bud-glance-main', '.bud-cat-card', '.bud-chart-card', '.bud-balances']
    for (const rule of entrance) {
      const target = rule.selector.split(',')[0].trim()
      for (const card of cardSelectors) {
        const isCardItself = new RegExp(`(^|[ >])${card.replace('.', '\\.')}$`).test(target)
        expect(isCardItself, target).toBe(false)
      }
    }
  })

  it('has no raw time values or new keyframes in the entrance code', () => {
    expect(code).not.toMatch(/\b\d+(\.\d+)?(ms|s)\b/)
    expect(code).not.toMatch(/@keyframes/)
  })

  it('animates only transform and opacity, never layout properties', () => {
    // The reduced-motion block below the cascade switches transitions off, which
    // is a `transition:` declaration and not an animated property; it is checked
    // by its own test, so it is cut out here.
    const motionCode = code.slice(0, code.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(motionCode).not.toMatch(/\b(top|left|right|bottom|width|height|margin|padding|inset|transition)\s*:/)
  })

  it('does not restart on a filter: expense rows carry no cascade of their own', () => {
    expect(code).not.toMatch(/\.bud-lines-table tbody > tr\s*\{/)
    expect(code).not.toMatch(/\.bud-optional-row\s*\{/)
  })

  it('keeps the state banners and the edit bar out of the cascade', () => {
    // `.bud-page > *` is opted out wholesale, so the banners and the edit bar
    // cannot enter the cascade even if they move up the child order.
    const body = top.find((b) => b.selector === '.bud-page > *')
    expect(body?.body).toMatch(/animation:\s*none/)
    expect(code).not.toMatch(/bud-read[^{]*\{[^}]*pageRise/)
    expect(code).not.toMatch(/bud-editor-actions[^{]*\{[^}]*pageRise/)
  })

  it('keeps the existing chart and balance grow rules', () => {
    expect(CSS).toMatch(/\.bud-stack\s*\{[^}]*bud-bars-in calc\(var\(--motion-slower\) \* 1\.5\)/)
    expect(CSS).toMatch(/\.bud-bal-bar[^{]*\{[^}]*bud-grow-x/)
  })

  it('opts out under reduced motion at the top level, after the cascade', () => {
    const reduce = top.find((b) => b.selector === '@media (prefers-reduced-motion: reduce)' && b.body.includes('.bud-page > *'))
    expect(reduce).toBeDefined()
    expect(reduce?.body).toMatch(/\.bud-page > \*[\s\S]*?animation:\s*none/)
    expect(reduce?.body).toMatch(/\.bud-glance > \*[\s\S]*?animation:\s*none/)
    expect(reduce?.body).toMatch(/\.bud-grid-charts > \*[\s\S]*?animation:\s*none/)
    expect(reduce?.body).toMatch(/\.bud-grid-mid > \*[\s\S]*?animation:\s*none/)
    // Every inner rule carries the same opt-out.
    for (const selector of [
      '\\.bud-glance-main > \\*',
      '\\.bud-glance-main \\.bud-target-caption',
      '\\.bud-cat-card \\.bud-cat-table > tbody > tr',
      '\\.bud-cat-card \\.bud-cat-table > tfoot > tr',
      '\\.bud-balances > \\*',
      '\\.bud-transfers > \\*',
      '\\.bud-chart-card \\.bud-bars \\.bud-day-group \\.bud-bar-total',
      '\\.bud-chart-card \\.bud-bars \\.bud-day-group \\.bud-day-name',
      '\\.bud-chart-card \\.bud-bars \\.bud-day-group \\.bud-day-date',
      '\\.bud-chart-card \\.bud-legend > li',
    ]) {
      expect(reduce?.body, selector).toMatch(new RegExp(`${selector}[\\s\\S]*?animation:\\s*none`))
    }
    // The container opt-out is what actually stops the per-day rules: their
    // `:nth-of-type` selectors outrank the plain list, so the plain list alone
    // left a 0.01ms fadeIn running on those labels.
    expect(reduce?.body).toMatch(/\.bud-page \*[\s\S]*?animation:\s*none/)
    expect(reduce?.body).toMatch(/transition:\s*none/)
    expect(reduce?.body).toMatch(/\.bud-day-group:nth-of-type\(n\)/)
    expect(reduce?.body).not.toMatch(/!important/)
    const index = top.indexOf(reduce as Block)
    expect(index).toBeGreaterThan(top.findIndex((b) => b.selector === '.bud-page > *'))
  })

  it('never animates the cascade under no-preference', () => {
    expect(tail).not.toMatch(/prefers-reduced-motion: no-preference/)
  })
})
