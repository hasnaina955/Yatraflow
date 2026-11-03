import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Source-reading gate for the Timeline tab entrance (the block at the end of
// src/styles/legacy/16-motion-and-cover-v2.css). The cascade belongs to the
// tab's own toolbar, ribbon and day cards: top-level rules, stagger from
// --stagger-step, motion tokens only, no raw time values, transform and
// opacity only, and a reduced-motion opt-out that names every animated
// selector.
//
// The tab is scoped by `.tl-ribbon`, which it renders unconditionally and
// which no other surface names, because its wrapper carries no stable root
// class and the fixture's panel id is stale.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const CSS = read('src/styles/legacy/16-motion-and-cover-v2.css')
const TSX = read('src/pages/trip/TimelineTab.tsx')
const MARK = "/* ---------- Entrance: the Timeline tab's own cascade ----------"

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
const SCOPE = '.page-enter:has(> .tl-ribbon)'
const PANEL = 'div[role="tabpanel"]:has(.tl-ribbon)'

describe('Timeline tab entrance: tab-owned cascade', () => {
  const tailStart = CSS.indexOf(MARK)
  const tail = CSS.slice(tailStart)
  const code = stripComments(tail)
  // Parse the comment-free text: the block reader carries a comment that
  // precedes a selector into that selector's text.
  const entrance = blocks(code).filter((b) => b.depth === 0)
  const animated = entrance.filter((b) => /animation:\s*(?!none\b)[a-zA-Z]/.test(b.body))
  const reduce = entrance.find((b) => b.selector === '@media (prefers-reduced-motion: reduce)')
  const findBlock = (sel: string) => entrance.find((b) => selectorsOf(b.selector).includes(sel))
  const delaySteps = (sel: string) => {
    const body = findBlock(sel)?.body ?? ''
    return [...body.matchAll(/animation-delay:\s*calc\(var\(--stagger-step\) \* (\d+)\)/g)].map((m) => Number(m[1]))
  }

  it('is appended at the end of the file, once', () => {
    expect(tailStart).toBeGreaterThan(0)
    expect(CSS.indexOf(MARK, tailStart + 1)).toBe(-1)
    expect(reduce).toBeDefined()
  })

  it('takes the block fade off the Timeline panel only', () => {
    expect(findBlock(PANEL), `${PANEL} is missing`).toBeDefined()
    expect(norm(findBlock(PANEL)!.body)).toBe('animation: none;')
    // The other two tab opt-outs stay untouched, and no bare panel opt-out exists.
    expect(read('src/styles/legacy/17-overview-tiles-and-cover.css')).toMatch(/div\[role="tabpanel"\]:has\(> \.ovw2\) \{ animation: none; \}/)
    expect(read('src/styles/pages/budget.css')).toMatch(/div\[role="tabpanel"\]:has\(> \.bud-page\) \{ animation: none; \}/)
    expect(code).not.toMatch(/(^|[\s,{}])\.tab-panel\s*\{[^}]*animation:\s*none/)
  })

  it('scopes the cascade to the tab wrapper, through the ribbon', () => {
    expect(TSX).toMatch(/className="page-enter"/)
    expect(TSX).toMatch(/<section className="tl-ribbon"/)
    // The stage is the adapter, not the ribbon block: every animated rule that
    // owns a Timeline element carries the scope prefix.
    for (const sel of ['.tl-head', '.tl-ribbon', '.day-section']) {
      expect(findBlock(`${SCOPE} > ${sel}`), `${SCOPE} > ${sel}`).toBeDefined()
    }
  })

  it('orders toolbar, then ribbon, then the day cards one at a time', () => {
    const head = delaySteps(`${SCOPE} > .tl-head`)
    const ribbon = delaySteps(`${SCOPE} > .tl-ribbon`)
    const dayBase = delaySteps(`${SCOPE} > .day-section`)
    expect(head).toEqual([0])
    expect(ribbon).toEqual([1])
    expect(dayBase).toEqual([2])
    // Cards after the fourth share the last step, so a long trip still settles.
    const last = delaySteps(`${SCOPE} > .day-section:nth-child(n+7)`)
    expect(last).toEqual([6])
  })

  it('keeps the whole cascade inside the six-step budget', () => {
    const steps = [...code.matchAll(/animation-delay:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .flatMap((d) => [...d.matchAll(/calc\(var\(--stagger-step\) \* (\d+)\)/g)].map((m) => Number(m[1])))
    expect(steps.length).toBeGreaterThan(10)
    expect(Math.max(...steps)).toBeLessThanOrEqual(6)
  })

  it('animates day cards with the page rise, not the card lift', () => {
    // 12-pages gives the shared `.page-enter > .day-section` the `cardIn` lift.
    // The Timeline tab overrides the name with its own, more specific rule, so
    // the shared rule stays as it is for every other surface.
    expect(read('src/styles/legacy/12-pages.css')).toContain('.page-enter > .day-section { animation-name: cardIn; }')
    const rule = findBlock(`${SCOPE} > .day-section`)
    expect(rule).toBeDefined()
    expect(rule!.body).toMatch(/animation:\s*pageRise var\(--motion-slow\) var\(--ease-paper\) backwards/)
    expect(rule!.body).not.toMatch(/cardIn/)
  })

  it('grows each ribbon bar from its left edge, after its card', () => {
    const bar = findBlock(`${SCOPE} .tl-ribbon-card .tl-ribbon-card-bar > span`)
    expect(bar, 'the ribbon progress fill has no entrance').toBeDefined()
    expect(norm(bar!.body)).toContain('transform-origin: left center;')
    expect(bar!.body).toMatch(/animation:\s*tlBarGrow calc\(var\(--motion-slower\) \* 1\.5\) var\(--ease-paper\) backwards/)
    expect(CSS).toMatch(/@keyframes tlBarGrow \{\s*from \{ transform: scaleX\(0\); \}\s*\}/)
    // A card's bar starts after the card itself does.
    const card = delaySteps(`${SCOPE} .tl-ribbon-days > .tl-ribbon-card`)
    const fill = delaySteps(`${SCOPE} .tl-ribbon-card .tl-ribbon-card-bar > span`)
    expect(fill[0]).toBeGreaterThan(card[0])
  })

  it('fades the connector line with the ribbon', () => {
    const line = findBlock(`${SCOPE} .tl-ribbon-days > .tl-ribbon-line`)
    const end = findBlock(`${SCOPE} .tl-ribbon-days > .tl-ribbon-line-end`)
    expect(line?.body).toMatch(/animation:\s*fadeIn var\(--motion-slow\) var\(--ease-paper\) backwards/)
    expect(end?.body).toMatch(/animation:\s*fadeIn var\(--motion-slow\) var\(--ease-paper\) backwards/)
    expect(delaySteps(`${SCOPE} .tl-ribbon-days > .tl-ribbon-line`)).toEqual([1])
  })

  it('gives no entrance to anything mounted after first paint', () => {
    // A day body is mounted on expand. Any rule reaching it would replay the
    // entrance on every toggle, so the block must not name a body, a stop, a
    // row, the editor or the FAB.
    const forbidden = /\.(day-body|day-body-clip|day-body-clip-inner|day-stops|stop-card|travel-leg|tl-time|tl-add-fab|stop-editor|quick-add)\b/
    for (const block of entrance) {
      expect(block.selector, block.selector).not.toMatch(forbidden)
    }
    // The animated day selector reaches direct children of the wrapper only.
    for (const block of animated) {
      if (!block.selector.includes('.day-section')) continue
      expect(block.selector).toMatch(new RegExp(`^${SCOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} > \\.day-section`))
    }
  })

  it('animates with motion tokens only: a named keyframe, a motion duration, the paper ease', () => {
    const values = [...code.matchAll(/animation:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^none\b/.test(v))
    expect(values.length).toBeGreaterThanOrEqual(4)
    for (const v of values) {
      expect(v).toMatch(
        /^(pageRise|fadeIn|tlBarGrow) (var\(--motion-(fast|med|slow|slower)\)|calc\(var\(--motion-slower\) \* 1\.5\)) var\(--ease-paper\) backwards$/,
      )
    }
  })

  it('has no raw time values and no !important', () => {
    expect(code).not.toMatch(/\b\d+(\.\d+)?(ms|s)\b/)
    expect(code).not.toMatch(/!important/)
  })

  it('animates only transform and opacity, never layout', () => {
    const motion = code.slice(0, code.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(motion).not.toMatch(/\b(top|left|right|bottom|width|height|margin|padding|inset|max-height)\s*:/)
    // The one allowed exception is the fill's transform origin.
    expect(motion).toMatch(/transform-origin:\s*left center;/)
  })

  it('uses keyframes that exist in the shared files', () => {
    expect(read('src/styles/legacy/11-shared-page.css')).toMatch(/@keyframes pageRise \{/)
    expect(read('src/styles/legacy/02-select-and-print.css')).toMatch(/@keyframes fadeIn \{/)
  })

  it('opts every animated selector out under reduced motion, with the same selector text', () => {
    expect(reduce).toBeDefined()
    const optedOut = [...(reduce?.body ?? '').matchAll(/([^{}]+)\{\s*animation:\s*none;?\s*\}/g)].flatMap((m) => selectorsOf(m[1]))
    expect(animated.length).toBeGreaterThan(3)
    for (const block of animated) {
      for (const sel of selectorsOf(block.selector)) {
        expect(optedOut, sel).toContain(sel)
      }
    }
    // The panel opt-out is in the list too, so a reduced-motion reader gets no
    // fade from either layer.
    expect(optedOut).toContain(PANEL)
    expect(reduce?.body).not.toMatch(/!important/)
    // The opt-out sits after every animated rule, so it wins on equal specificity.
    expect(entrance.indexOf(reduce as Block)).toBeGreaterThan(entrance.indexOf(animated[animated.length - 1]))
  })

  it('restyles no shared component: no avatar, button or card selector', () => {
    for (const block of entrance) {
      expect(block.selector, block.selector).not.toMatch(/\.(avatar|btn|yf-surface|tab-btn|view-pillbar)\b/)
    }
  })
})
