import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Source-reading gate for the Overview tab entrance (the block at the end of
// src/styles/legacy/17-overview-tiles-and-cover.css). The cascade belongs to the
// tab's own cards and rows: top-level rules, stagger from --stagger-step, motion
// tokens only, no raw time values, transform, opacity and stroke dash only, and a
// reduced-motion opt-out at top level that names every animated selector.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const CSS = read('src/styles/legacy/17-overview-tiles-and-cover.css')
const TSX = read('src/components/trips/OverviewElevationProfile.tsx')
const MARK = "/* ---------- Entrance: the Overview tab's own cascade ----------"

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

describe('Overview tab entrance: tab-owned cascade', () => {
  const tailStart = CSS.indexOf(MARK)
  const tail = CSS.slice(tailStart)
  const code = stripComments(tail)
  const entrance = blocks(tail).filter((b) => b.depth === 0)
  const animated = entrance.filter((b) => /animation:\s*(?!none\b)[a-zA-Z]/.test(b.body))
  const reduce = entrance.find((b) => b.selector === '@media (prefers-reduced-motion: reduce)')
  const findBlock = (sel: string) => entrance.find((b) => selectorsOf(b.selector).includes(sel))
  const delayOf = (sel: string) => {
    const body = findBlock(sel)?.body ?? ''
    const m = body.match(/animation-delay:\s*calc\(var\(--stagger-step\) \* (\d+)\)/)
    return m ? Number(m[1]) : NaN
  }

  it('is appended at the end of the file, once', () => {
    expect(tailStart).toBeGreaterThan(0)
    expect(CSS.indexOf(MARK, tailStart + 1)).toBe(-1)
    expect(reduce).toBeDefined()
  })

  it('takes the block fade off the Overview panel only', () => {
    expect(code).toMatch(/div\[role="tabpanel"\]:has\(> \.ovw2\)\s*\{\s*animation:\s*none;?\s*\}/)
    // Other tabs keep their own panel fade: no bare tab-panel opt-out here.
    expect(code).not.toMatch(/(^|[\s,{}])\.tab-panel\s*\{[^}]*animation:\s*none/)
  })

  it('staggers only with --stagger-step multiples, within the settle budget', () => {
    const delays = [...code.matchAll(/animation-delay:\s*([^;}]+)/g)].map((m) => m[1].trim())
    expect(delays.length).toBeGreaterThan(20)
    const steps: number[] = []
    for (const d of delays) {
      const m = d.match(/^calc\(var\(--stagger-step\) \* (\d+)\)$/)
      expect(m, d).not.toBeNull()
      steps.push(Number(m![1]))
    }
    // The last step is 20: 1200 plus one 360 run lands near 1.56 s, inside the 1.0 to 1.6 s target.
    expect(Math.max(...steps)).toBeLessThanOrEqual(20)
  })

  it('animates with motion tokens only: a named keyframe, a motion duration, the paper ease', () => {
    const values = [...code.matchAll(/animation:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^none\b/.test(v))
    // Fifteen animated rules today. The bound catches an empty parse, not a count change.
    expect(values.length).toBeGreaterThanOrEqual(15)
    for (const v of values) {
      expect(v).toMatch(
        /^(pageRise|fadeIn|ovwGrowY|ovwRoadDraw) (var\(--motion-(fast|med|slow|slower)\)|calc\(var\(--motion-slower\) \* 1\.5\)) var\(--ease-paper\) backwards$/,
      )
    }
  })

  it('has no raw time values and no !important', () => {
    expect(code).not.toMatch(/\b\d+(\.\d+)?(ms|s)\b/)
    expect(code).not.toMatch(/!important/)
  })

  it('animates only transform, opacity and the stroke dash, never layout', () => {
    const motion = code.slice(0, code.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(motion).not.toMatch(/\b(top|left|right|bottom|width|height|margin|padding|inset|max-height)\s*:/)
  })

  it('uses keyframes that exist in the shared and Overview files', () => {
    expect(CSS).toMatch(/@keyframes ovwGrowY\s*\{\s*from\s*\{\s*transform:\s*scaleY\(0\)/)
    expect(read('src/styles/legacy/15-overview.css')).toMatch(/@keyframes ovwRoadDraw\s*\{\s*from\s*\{\s*stroke-dashoffset:\s*1/)
    expect(read('src/styles/legacy/11-shared-page.css')).toMatch(/@keyframes pageRise\s*\{/)
    expect(read('src/styles/legacy/02-select-and-print.css')).toMatch(/@keyframes fadeIn\s*\{/)
  })

  it('opts every animated selector out under reduced motion, with the same selector text', () => {
    expect(reduce).toBeDefined()
    const optedOut = [...(reduce?.body ?? '').matchAll(/([^{}]+)\{\s*animation:\s*none;?\s*\}/g)].flatMap((m) => selectorsOf(m[1]))
    expect(animated.length).toBeGreaterThan(10)
    for (const block of animated) {
      for (const sel of selectorsOf(block.selector)) {
        expect(optedOut, sel).toContain(sel)
      }
    }
    expect(reduce?.body).not.toMatch(/!important/)
    // The opt-out sits after every animated rule, so it wins on equal specificity.
    expect(entrance.indexOf(reduce as Block)).toBeGreaterThan(entrance.indexOf(animated[animated.length - 1]))
  })

  it('keeps the issue cascade to the first three rows, so "Show all" never replays them', () => {
    expect(CSS).not.toMatch(/\.ovw-need-list > \.ovw-need\s*\{/)
    expect(findBlock('.ovw2-issues .ovw-need-list > .ovw-need:nth-child(-n+3)')).toBeDefined()
  })

  it('draws the stroke and grows the fill from the base line', () => {
    const area = findBlock('.ovw2-route .ovw-elev-area')
    expect(area?.body).toMatch(/transform-box:\s*fill-box/)
    expect(area?.body).toMatch(/transform-origin:\s*bottom/)
    expect(area?.body).toMatch(/animation:\s*ovwGrowY/)
    expect(findBlock('.ovw2-route .ovw-elev-line')?.body).toMatch(/animation:\s*ovwRoadDraw/)
    // The stroke runs on a unit path length; the centre line keeps its dashes.
    expect(CSS).toMatch(/\.ovw-elev-line \{[^}]*stroke-dasharray:\s*1;/)
    expect(CSS).toMatch(/\.ovw-elev-line-centre \{[^}]*stroke-dasharray:\s*3 4;/)
    expect(TSX).toMatch(/className="ovw-elev-line" d=\{run\.line\} pathLength=\{1\}/)
  })

  it('fades each place label only after its mark', () => {
    expect(delayOf('.ovw2-route .ovw-elev-labels')).toBeGreaterThan(delayOf('.ovw2-route .ovw-elev-marks'))
    expect(delayOf('.ovw2-route .ovw-elev-marks')).toBeGreaterThan(delayOf('.ovw2-route .ovw-elev-line'))
    expect(findBlock('.ovw2-route .ovw-elev-labels')?.body).toMatch(/animation:\s*fadeIn var\(--motion-med\)/)
    expect(findBlock('.ovw2-route .ovw-elev-labels')?.body).not.toMatch(/pageRise/)
  })

  it('wraps the marks, labels and axis ticks in one group each, with the geometry unchanged', () => {
    expect(TSX).toMatch(/<g className="ovw-elev-marks">/)
    expect(TSX).toMatch(/<g className="ovw-elev-labels">/)
    expect(TSX).toMatch(/<g className="ovw-elev-axes">/)
    expect(TSX).toMatch(/d=\{run\.area\}/)
    expect(TSX).toMatch(/d=\{run\.line\}/)
    expect(TSX).not.toMatch(/style=\{/)
  })

  it('restyles no shared component: no avatar, button or card selector in the entrance', () => {
    for (const block of entrance) {
      expect(block.selector, block.selector).not.toMatch(/\.(avatar|btn|yf-surface)\b/)
    }
  })
})
