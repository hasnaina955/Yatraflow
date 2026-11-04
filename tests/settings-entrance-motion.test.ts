import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Source-reading gate for the Settings tab entrance (the block at the end of
// src/styles/legacy/16-motion-and-cover-v2.css) and for the state-change motion
// at the end of src/styles/legacy/12-pages.css. The cascade belongs to the tab's
// own rail, cards, aside and inner layers: top-level rules, stagger from
// --stagger-step, motion tokens only, no raw time values, transform and opacity
// only, and a reduced-motion opt-out that names every animated selector.
//
// The tab is scoped by `.tset-grid`, which only this tab renders.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const CSS = read('src/styles/legacy/16-motion-and-cover-v2.css')
const PAGES = read('src/styles/legacy/12-pages.css')
const TSX = read('src/pages/trip/TripSettingsForm.tsx')
const MARK = "/* ---------- Entrance: the Settings tab's own cascade ----------"

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
const PANEL = 'div[role="tabpanel"]:has(.tset-grid)'

describe('Settings tab entrance: tab-owned cascade', () => {
  const tailStart = CSS.indexOf(MARK)
  const tail = CSS.slice(tailStart)
  const code = stripComments(tail)
  const entrance = blocks(code).filter((b) => b.depth === 0)
  const animated = entrance.filter((b) => /animation:\s*(?!none\b)[a-zA-Z]/.test(b.body))
  const reduce = entrance.find((b) => b.selector === '@media (prefers-reduced-motion: reduce)')
  const findBlock = (sel: string) => entrance.find((b) => selectorsOf(b.selector).includes(sel))
  // The last rule that sets a delay for the selector wins, as it does in the cascade.
  const delayOf = (sel: string) => {
    const hits = entrance.filter((b) => selectorsOf(b.selector).includes(sel) && /animation-delay/.test(b.body))
    const body = hits[hits.length - 1]?.body ?? ''
    const m = body.match(/animation-delay:\s*calc\(var\(--stagger-step\) \* (\d+)\)/)
    return m ? Number(m[1]) : NaN
  }

  it('is appended at the end of the file, once, with the reduced-motion mirror last', () => {
    expect(tailStart).toBeGreaterThan(0)
    expect(CSS.indexOf(MARK, tailStart + 1)).toBe(-1)
    expect(reduce).toBeDefined()
    expect(entrance[entrance.length - 1]).toBe(reduce)
  })

  it('takes the late block fade off the Settings panel only', () => {
    expect(code).toMatch(/div\[role="tabpanel"\]:has\(\.tset-grid\)\s*\{\s*animation:\s*none;?\s*\}/)
    expect(findBlock(PANEL)).toBeDefined()
    expect(code).not.toMatch(/(^|[\s,{}])\.tab-panel\s*\{[^}]*animation:\s*none/)
  })

  it('staggers only with --stagger-step multiples, within six steps per cascade', () => {
    const delays = [...code.matchAll(/animation-delay:\s*([^;}]+)/g)].map((m) => m[1].trim())
    expect(delays.length).toBeGreaterThan(25)
    const steps: number[] = []
    for (const d of delays) {
      const m = d.match(/^calc\(var\(--stagger-step\) \* (\d+)\)$/)
      expect(m, d).not.toBeNull()
      steps.push(Number(m![1]))
    }
    // The last step is 11. It starts at 660ms and runs 360ms more. That ends near 1.0 s.
    expect(Math.max(...steps)).toBeLessThanOrEqual(11)
    expect(Math.max(...steps)).toBeGreaterThanOrEqual(10)
  })

  it('orders the cards left to right, top to bottom', () => {
    expect(delayOf('.tset-grid > .tset-nav')).toBe(0)
    expect(delayOf('.tset-main > #tset-identity')).toBe(0)
    expect(delayOf('.tset-main > #tset-dates')).toBe(1)
    expect(delayOf('.tset-aside > *')).toBe(1)
    expect(delayOf('.tset-aside > .tset-glance')).toBe(2)
    expect(delayOf('.tset-main > #tset-group')).toBe(2)
    expect(delayOf('.tset-main > #tset-travel')).toBe(3)
    expect(delayOf('.tset-main > #tset-people')).toBe(4)
    expect(delayOf('.tset-main > #tset-danger')).toBe(5)
    // The "Will you drive" card has no id and can mount between group and travel.
    expect(delayOf('.tset-main > section.yf-surface.tsx-card')).toBe(3)
  })

  it('keeps every nested cascade inside six steps and every step to four starts', () => {
    // The first-paint population of each group, read from the rules above.
    const rows = [0, 1, 2, 3, 4, 5].map((n) => (n === 0 ? delayOf('.tset-nav > .tset-nav-item') : delayOf(`.tset-nav > .tset-nav-item:nth-of-type(${n + 1})`)))
    const rowsLast = delayOf('.tset-nav > .tset-nav-item:nth-of-type(n+6)')
    rows[5] = rowsLast
    // First paint: the current cover and the upload tile. The route photos
    // mount late and are pinned to step 0 in their own test below.
    const tiles = [
      delayOf('.tset-coverstrip > .tset-cover-slot'),
      delayOf('.tset-coverstrip > .tset-cover-add'),
    ]
    const diffs = [
      delayOf('.tset-savecard > .tset-diff'),
      delayOf('.tset-savecard > .tset-diff + .tset-diff'),
      delayOf('.tset-savecard > .tset-diff + .tset-diff + .tset-diff'),
    ]
    const stats = [
      delayOf('.tset-glance-grid > .tset-stat'),
      delayOf('.tset-glance-grid > .tset-stat'),
      delayOf('.tset-glance-grid > .tset-stat:nth-child(n+3)'),
      delayOf('.tset-glance-grid > .tset-stat:nth-child(n+3)'),
    ]
    const days = [
      delayOf('.tset-daygrid > .tset-day'),
      delayOf('.tset-daygrid > .tset-day:nth-child(2)'),
      delayOf('.tset-daygrid > .tset-day:nth-child(3)'),
      delayOf('.tset-daygrid > .tset-day:nth-child(4)'),
      delayOf('.tset-daygrid > .tset-day:nth-child(n+5)'),
    ]
    const top = [
      delayOf('.tset-grid > .tset-nav'),
      delayOf('.tset-main > #tset-identity'),
      delayOf('.tset-main > #tset-dates'),
      delayOf('.tset-aside > *'),
      delayOf('.tset-aside > .tset-glance'),
      delayOf('.tset-main > #tset-group'),
      delayOf('.tset-main > #tset-travel'),
      delayOf('.tset-main > #tset-people'),
      delayOf('.tset-main > #tset-danger'),
    ]
    for (const group of [rows, tiles, diffs, stats, days, top]) {
      for (const n of group) expect(Number.isNaN(n)).toBe(false)
      const distinct = new Set(group)
      expect(distinct.size).toBeLessThanOrEqual(6)
    }
    const perStep = new Map<number, number>()
    for (const n of [...rows, ...tiles, ...diffs, ...stats, ...days, ...top]) perStep.set(n, (perStep.get(n) ?? 0) + 1)
    for (const [step, count] of perStep) expect(count, `step ${step}`).toBeLessThanOrEqual(4)
  })

  it('animates with motion tokens only: a named keyframe, a motion duration, the paper ease', () => {
    const values = [...code.matchAll(/animation:\s*([^;}]+)/g)]
      .map((m) => m[1].trim())
      .filter((v) => !/^none\b/.test(v))
    expect(values.length).toBeGreaterThanOrEqual(8)
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

  it('uses keyframes that exist in the shared files', () => {
    expect(read('src/styles/legacy/11-shared-page.css')).toMatch(/@keyframes pageRise\s*\{/)
    expect(read('src/styles/legacy/02-select-and-print.css')).toMatch(/@keyframes fadeIn\s*\{/)
  })

  it('opts every animated selector out under reduced motion, with the same selector text', () => {
    expect(reduce).toBeDefined()
    const optedOut = [...(reduce?.body ?? '').matchAll(/([^{}]+)\{\s*animation:\s*none;?\s*\}/g)].flatMap((m) => selectorsOf(m[1]))
    expect(animated.length).toBeGreaterThan(7)
    for (const block of animated) {
      for (const sel of selectorsOf(block.selector)) {
        expect(optedOut, sel).toContain(sel)
      }
    }
    expect(optedOut).toContain(PANEL)
    expect(reduce?.body).not.toMatch(/!important/)
    expect(entrance.indexOf(reduce as Block)).toBeGreaterThan(entrance.indexOf(animated[animated.length - 1]))
  })

  it('names the cards by section id, so a mounted question card never moves the order', () => {
    for (const id of ['identity', 'dates', 'group', 'travel', 'people', 'danger']) {
      expect(TSX).toContain(`id="tset-${id}"`)
    }
    expect(code).not.toMatch(/\.tsx-card:nth-/)
  })

  it('gives a day drawn after mount no delay, and keeps a pending tile at first paint in order', () => {
    expect(delayOf('.tset-daygrid > .tset-day.is-late')).toBe(0)
    // No rule may pull a first-paint pending tile ahead of tiles 1 to 4.
    expect(findBlock('.tset-daygrid > .tset-day.is-new')).toBeUndefined()
    expect(TSX).not.toMatch(/animationDelay|animation-delay/)
  })

  it('marks a late day tile once and keeps the mark, so a running rise never restarts', () => {
    // The first grid is the first paint: its tiles are never marked. The state is
    // adjusted during render (no ref read), so a late tile has its class at its first paint.
    expect(TSX).toMatch(/useState\(\(\) => \(\{ live: new Set\(grid\.map\(d => d\.key\)\), late: new Set<string>\(\) \}\)\)/)
    expect(TSX).toMatch(/const enteringDays = gridKeys\.filter\(k => !dayMarks\.live\.has\(k\)\)/)
    // A key that leaves the grid is forgotten, so a tile that returns is drawn anew.
    expect(TSX).toMatch(/const leavingDays = \[\.\.\.dayMarks\.live\]\.filter\(k => !gridKeys\.includes\(k\)\)/)
    // A mark is kept while its tile stays, so a running rise never restarts.
    expect(TSX).toMatch(/new Set\(\[\.\.\.dayMarks\.late\]\.filter\(k => !leavingDays\.includes\(k\)\)\.concat\(enteringDays\)\)/)
    expect(TSX).toContain("${lateDays.has(d.key) ? ' is-late' : ''}")
  })

  it('fades the route photos in at once: they mount when the lookups return, not at first paint', () => {
    const photo = findBlock('.tset-coverstrip > button.tset-cover-slot')
    expect(photo).toBeDefined()
    expect(norm(photo!.body)).toContain('animation: fadeIn var(--motion-slow) var(--ease-paper) backwards;')
    expect(delayOf('.tset-coverstrip > button.tset-cover-slot')).toBe(0)
    // No stagger by position: a late photo must never wait for a step.
    expect(code).not.toMatch(/\.tset-cover-slot:nth-/)
    // The first-paint tiles keep their steps.
    expect(delayOf('.tset-coverstrip > .tset-cover-slot')).toBe(1)
    expect(delayOf('.tset-coverstrip > .tset-cover-add')).toBe(5)
  })

  it('pins the upload tile to the last column, so late photos do not move it', () => {
    const add = blocks(stripComments(PAGES)).find((b) => b.depth === 0 && selectorsOf(b.selector).includes('.tset-cover-add'))
    expect(add?.body).toMatch(/grid-column:\s*-2 \/ -1;/)
  })

  it('leaves no cardIn on the Settings page rules', () => {
    for (const sel of ['.tset-nav', '.tset-aside', '.yf-surface.tsx-card']) {
      const rules = blocks(stripComments(PAGES)).filter((b) => b.depth === 0 && selectorsOf(b.selector).some((s) => s.startsWith(sel)))
      for (const r of rules) expect(r.body, r.selector).not.toMatch(/cardIn/)
    }
  })
})

describe('Settings state-change motion: tokens, no weight snap, reduced-motion mirror', () => {
  const pages = blocks(stripComments(PAGES))
  const topBlocks = pages.filter((b) => b.depth === 0)
  const SETTINGS = /\.(tset-|inp\b|seg-btn|tog\b|set-save-state)|bench-mode-btn/
  const mine = topBlocks.filter((b) => SETTINGS.test(b.selector) && !b.selector.startsWith('@'))
  const reduceBodies = topBlocks
    .filter((b) => b.selector === '@media (prefers-reduced-motion: reduce)')
    .map((b) => b.body)
    .join('\n')
  const offTransition = [...reduceBodies.matchAll(/([^{}]+)\{\s*transition:\s*none;?\s*\}/g)].flatMap((m) => selectorsOf(m[1]))
  const offAnimation = [...reduceBodies.matchAll(/([^{}]+)\{\s*animation:\s*none;?\s*\}/g)].flatMap((m) => selectorsOf(m[1]))
  const ruleOf = (sel: string) => topBlocks.find((b) => selectorsOf(b.selector).includes(sel))

  it('eases every settings control on motion tokens only', () => {
    let seen = 0
    for (const b of mine) {
      for (const m of b.body.matchAll(/transition:([^;]+);/g)) {
        const v = m[1].trim()
        if (v === 'none') continue
        for (const part of v.split(/,(?![^(]*\))/)) {
          seen++
          expect(part.trim(), `${b.selector}: ${part}`).toMatch(/^[a-z-]+ var\(--motion-(instant|fast|med)\) var\(--ease-(paper|out)\)$/)
        }
      }
    }
    expect(seen).toBeGreaterThan(30)
  })

  it('has no raw time value in the new rules and keeps layout out of every transition', () => {
    const start = PAGES.indexOf('/* ===== Trip settings: motion for state changes (not the entrance) ===== */')
    expect(start).toBeGreaterThan(0)
    const added = stripComments(PAGES.slice(start))
    expect(added).not.toMatch(/\b\d+(\.\d+)?(ms|s)\b/)
    expect(added).not.toMatch(/!important/)
    for (const b of mine) expect(b.body, b.selector).not.toMatch(/transition:[^;]*\b(width|height|margin|padding|top|left|right|bottom|inset|max-height)\b/)
  })

  it('keeps --ease-settle to the 18px count badge', () => {
    const users = topBlocks.filter((b) => /--ease-settle/.test(b.body)).map((b) => norm(b.selector))
    expect(users).toEqual(['.tset-nav-item i'])
    expect(ruleOf('.tset-nav-item i')?.body).toMatch(/animation: tsetBadgePop var\(--motion-fast\) var\(--ease-settle\) backwards;/)
    expect(ruleOf('.tset-nav-item i')?.body).toMatch(/height: 18px;/)
  })

  it('fields, buttons, the rail, the mode cards and the switch each ease', () => {
    expect(ruleOf('.tset-main .inp')?.body).toMatch(/border-color var\(--motion-fast\)[^;]*box-shadow var\(--motion-fast\)/)
    expect(ruleOf('.tset-aside .tset-save-btn')?.body).toMatch(/opacity var\(--motion-med\)/)
    expect(ruleOf('.tset-aside .tset-discard')?.body).toMatch(/opacity var\(--motion-med\)/)
    expect(ruleOf('.tset-nav-item')?.body).toMatch(/box-shadow var\(--motion-fast\)/)
    expect(ruleOf('.tset-main .bench-mode-btn')?.body).toMatch(/box-shadow var\(--motion-fast\)/)
    expect(ruleOf('.tset-main .bench-mode-btn')?.body).not.toMatch(/\.12s/)
    expect(ruleOf('.tset-main .bench-mode-btn:hover')?.body).toMatch(/transform:\s*none/)
    expect(ruleOf('.tog .sw::after')?.body).toMatch(/transition: transform var\(--motion-fast\)/)
    expect(ruleOf('.tog.on .sw::after')?.body).toMatch(/transform: translateX\(18px\)/)
    expect(ruleOf('.tset-main > .yf-surface.tsx-card')?.body).toMatch(/transition: border-color var\(--motion-med\)/)
    expect(ruleOf('.tset-diff')?.body).toMatch(/background-color var\(--motion-med\)/)
  })

  it('does not change the weight of a rail row or a segment with its state', () => {
    for (const sel of ['.tset-nav-item.is-edited', ".tset-nav-item[aria-current='true']", '.seg-btn.on']) {
      const rule = ruleOf(sel)
      expect(rule, sel).toBeDefined()
      expect(rule?.body, sel).not.toMatch(/font-weight/)
    }
  })

  it('opts every touched transition and animation out under reduced motion', () => {
    for (const sel of [
      '.tset-main .inp', '.tset-aside .tset-save-btn', '.tset-aside .tset-discard', '.tset-nav-item', '.tset-main .seg-btn',
      '.tset-main .bench-mode-btn', '.tset-stepper button', '.tset-manage', '.tset-danger-btn', '.tog .sw::after',
      '.tset-main > .yf-surface.tsx-card', '.tset-diff', '.tset-diff-lbl',
    ]) expect(offTransition, sel).toContain(sel)
    for (const sel of ['.tset-nav-item i', '.tset-changed', '.set-save-state']) expect(offAnimation, sel).toContain(sel)
    for (const sel of ['.tset-nav-item:active', '.tset-main .seg-btn:active:not(:disabled)', '.tset-main .bench-mode-btn:active:not(:disabled)']) {
      expect(reduceBodies, sel).toContain(sel)
    }
  })
})
