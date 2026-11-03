import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Source-reading gate for the Day by day / Whole trip switch. Measured before
// the fix (1440px, Goa fixture): the trip ribbon changed in ONE frame on every
// switch - the totals column went from 233px to display:none, the ribbon lost
// 31px of height and 8px of padding, the route line jumped 263px, the current
// card's weight flipped 400 to 800 and its label and bar colours snapped. The
// toolbar swapped label weights (600 to 700) under the sliding glider, and four
// day bodies mounted in one commit (frames of 109 to 126ms).

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const TSX = read('src/pages/trip/TimelineTab.tsx')
const CSS = read('src/styles/legacy/02-select-and-print.css')
const PILL = read('src/styles/components/pill-nav.css')

type Block = { selector: string; body: string; depth: number }
function blocks(css: string): Block[] {
  const out: Block[] = []
  const stack: { start: number; selector: string; depth: number }[] = []
  let depth = 0
  let last = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      stack.push({ start: i + 1, selector: css.slice(last, i).trim(), depth })
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
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const all = blocks(strip(CSS))
const top = all.filter((b) => b.depth === 0)
// Every top-level block with this selector, merged: a selector can be styled in two places.
const merge = (found: Block[]): Block | undefined =>
  found.length ? { selector: found[0].selector, body: found.map((b) => b.body).join('\n'), depth: 0 } : undefined
const rule = (selector: string) => merge(top.filter((b) => norm(b.selector) === selector))
const media = (query: string) => all.filter((b) => b.depth === 0 && norm(b.selector) === query)
const inMedia = (query: string, selector: string) =>
  merge(media(query).flatMap((m) => blocks(m.body)).filter((b) => b.depth === 0 && norm(b.selector) === selector))

const RAW_MS = /(?<![\w.-])[1-9]\d*(\.\d+)?m?s\b/

describe('ribbon: the totals column folds instead of vanishing', () => {
  const total = rule('.tl-ribbon-total')
  const review = rule('.tl-root-review .tl-ribbon-total')

  it('never uses display:none for review mode, so every property can travel', () => {
    expect(review).toBeDefined()
    expect(review?.body).not.toMatch(/display\s*:\s*none/)
    expect(review?.body).toMatch(/width:\s*0/)
    expect(review?.body).toMatch(/opacity:\s*0/)
    expect(review?.body).toMatch(/visibility:\s*hidden/)
  })

  it('cancels the ribbon gap and the dashed edge so no hole is left', () => {
    expect(review?.body).toMatch(/margin-inline-end:\s*-22px/)
    expect(review?.body).toMatch(/padding-inline-end:\s*0/)
    expect(review?.body).toMatch(/border-inline-end-width:\s*0/)
  })

  it('transitions every folded property on a motion token, both ways', () => {
    for (const b of [total, review]) {
      const t = norm(b?.body ?? '')
      for (const prop of ['width', 'padding-inline-end', 'margin-inline-end', 'border-inline-end-width', 'opacity', 'visibility']) {
        expect(t, prop).toMatch(new RegExp(`transition:[^;]*${prop} `))
      }
      expect(t).not.toMatch(RAW_MS)
    }
  })

  it('delays the visibility flip until the fold has finished, so the keyboard cannot reach a hidden column', () => {
    expect(norm(review?.body ?? '')).toMatch(/visibility 0s linear var\(--motion-slow\)/)
    expect(norm(total?.body ?? '')).toMatch(/visibility 0s[,;]/)
  })

  it('keeps the column measure while it folds, so its text never rewraps', () => {
    expect(inMedia('@media (min-width: 901px)', '.tl-ribbon-total > *')?.body).toMatch(/min-width:\s*210px/)
    expect(total?.body).toMatch(/overflow:\s*clip/)
  })

  it('folds the stacked ribbon by height on a phone', () => {
    const phone = inMedia('@media (max-width: 900px)', '.tl-root-review .tl-ribbon-total')
    expect(phone?.body).toMatch(/height:\s*0/)
    expect(phone?.body).toMatch(/margin-block-end:\s*-10px/)
    expect(inMedia('@media (max-width: 900px)', '.tl-ribbon-total')?.body).toMatch(/interpolate-size:\s*allow-keywords/)
  })

  it('tightens the ribbon padding on the same clock', () => {
    expect(norm(rule('.tl-ribbon')?.body ?? '')).toMatch(/transition: padding var\(--motion-slow\) var\(--ease-resize\)/)
  })
})

describe('ribbon: the current-day marker tweens and never reflows', () => {
  it('replaces the 800 weight with a ring that can transition', () => {
    const marker = rule(".tl-root-review .tl-ribbon-card[aria-current='true']")
    expect(marker?.body).toMatch(/box-shadow:\s*inset 0 0 0 1px/)
    expect(marker?.body).not.toMatch(/font-weight/)
    expect(strip(CSS)).not.toMatch(/\.tl-root-review \.tl-ribbon-card\[aria-current='true'\]\s*\{\s*font-weight/)
  })

  it('tweens the card fill, border and ring, the day label and the bar track', () => {
    const card = norm(rule('.tl-ribbon-card')?.body ?? '')
    for (const prop of ['border-color', 'background-color', 'box-shadow']) {
      expect(card, prop).toMatch(new RegExp(`transition:[^;]*${prop} var\\(--motion-med\\) var\\(--ease-paper\\)`))
    }
    expect(norm(rule('.tl-ribbon-card-day')?.body ?? '')).toMatch(/transition: color var\(--motion-med\) var\(--ease-paper\)/)
    expect(norm(rule('.tl-ribbon-card-bar')?.body ?? '')).toMatch(/transition: background-color var\(--motion-med\) var\(--ease-paper\)/)
  })

  it('starts a page that loads in Whole trip with the first day current, so a load never animates', () => {
    expect(TSX).toMatch(/useState<number \| null>\(\(\) => \(reviewAll && days\.length \? days\[0\]\.index : null\)\)/)
  })
})

describe('day cards: Whole trip opens its days over six capped beats', () => {
  it('counts beats in state and starts a persisted Whole trip past the last one', () => {
    expect(TSX).toMatch(/const REVEAL_STEPS = 6/)
    expect(TSX).toMatch(/useState\(\(\) => \(reviewAll \? REVEAL_STEPS : 0\)\)/)
  })

  it('opens the first day in the click commit and steps one --stagger-step at a time', () => {
    expect(TSX).toMatch(/setRevealStep\(on && motionTiming\('--stagger-step'\)\.duration > 0 \? 1 : on \? REVEAL_STEPS : 0\)/)
    expect(TSX).toMatch(/window\.setTimeout\(\(\) => setRevealStep\(s => s \+ 1\), motionTiming\('--stagger-step'\)\.duration\)/)
  })

  it('keeps the accordion value: the open day stays open, and a day past the sixth shares the last beat', () => {
    expect(TSX).toMatch(/open=\{openDayIndex === day\.index \|\| \(reviewAll && revealStep > Math\.min\(ordinal, REVEAL_STEPS - 1\)\)\}/)
  })
})

describe('toolbar switch: one weight, a tinted icon, a light press, a paper glider', () => {
  const tab = '.tl-toolbar .view-pillbar .tab-btn'

  it('gives both labels one weight, so the glyphs never snap under the glider', () => {
    expect(rule(tab)?.body).toMatch(/font-weight:\s*700/)
    expect(rule(`${tab}.active`)?.body).not.toMatch(/font-weight/)
  })

  it('tints and settles the active icon on the glider beat', () => {
    const icon = norm(rule(`${tab} > svg`)?.body ?? '')
    for (const prop of ['color', 'opacity', 'transform']) expect(icon, prop).toMatch(new RegExp(`${prop} var\\(--motion-med\\) var\\(--ease-paper\\)`))
    expect(rule(`${tab}.active > svg`)?.body).toMatch(/transform:\s*scale\(1\.08\)/)
  })

  it('presses lightly on the instant step', () => {
    expect(norm(rule(tab + ' ')?.body ?? rule(tab)?.body ?? '')).toMatch(/transform var\(--motion-instant\) var\(--ease-paper\)/)
    expect(rule(`${tab}:active`)?.body).toMatch(/transform:\s*scale\(\.98\)/)
  })

  it('slides the glider on the paper ease with no overshoot', () => {
    const glider = PILL.replace(/\/\*[\s\S]*?\*\//g, '')
    const m = /\.tl-toolbar \.view-pillbar \.pill-glider \{([^}]*)\}/.exec(glider)
    const body = norm(m?.[1] ?? '')
    for (const prop of ['left', 'top', 'width', 'height']) expect(body, prop).toContain(`${prop} var(--motion-med) var(--ease-paper)`)
    expect(body).not.toMatch(/--ease-settle|cubic-bezier/)
  })

  it('leaves aria-pressed and the 44px coarse target alone', () => {
    expect(TSX).toMatch(/aria-pressed=\{!reviewAll\}/)
    expect(TSX).toMatch(/aria-pressed=\{reviewAll\}/)
    expect(norm(strip(CSS))).toMatch(/@media \(pointer: coarse\) \{ \.tl-toolbar \.view-pillbar \.tab-btn \{ height: 44px; \} \}/)
  })
})

describe('reduced motion and rules', () => {
  it('switches every new transition off', () => {
    const reduced = media('@media (prefers-reduced-motion: reduce)').flatMap((m) => blocks(m.body)).filter((b) => b.depth === 0)
    const sels = reduced.flatMap((b) => b.selector.split(',').map(norm))
    for (const s of ['.tl-ribbon', '.tl-ribbon-total', '.tl-ribbon-card', '.tl-ribbon-card-day', '.tl-ribbon-card-bar', '.tl-root-review .tl-ribbon-total', '.tl-toolbar .view-pillbar .tab-btn', '.tl-toolbar .view-pillbar .tab-btn > svg']) {
      expect(sels, s).toContain(s)
    }
  })

  it('adds no !important and no raw time to the new rules', () => {
    const mine = [rule('.tl-ribbon-total'), rule('.tl-root-review .tl-ribbon-total'), rule('.tl-ribbon-card'), rule('.tl-toolbar .view-pillbar .tab-btn > svg')]
    for (const b of mine) {
      expect(b?.body).not.toMatch(/!important/)
      expect(b?.body).not.toMatch(RAW_MS)
    }
  })
})
