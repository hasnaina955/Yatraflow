// ============ PW-13 — the Budget family has one stylesheet owner ============
//
// The old census pinned 18 `bud-` rules inside the monolithic sheet and ten
// data-driven inline styles. The artboard redraw moves the whole family into
// `src/styles/pages/budget.css` and puts every chart measurement in SVG
// attributes, so the component now carries ZERO inline styles. That is a
// deliberate tightening, not a bypass: the page-consistency baseline drops
// from 10 to 0 in the same commit.
//
// This census is the replacement allowlist. It proves four things:
//   1. no legacy module still declares a budget rule;
//   2. the ownership map registers every class the family declares;
//   3. every class the component names is declared, or is a named probe hook;
//   4. the key recipes and the reduced-motion opt-outs are exact.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readCssSource } from '../scripts/css-source-graph.mjs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tab = read('../src/pages/trip/BudgetTab.tsx')
const css = read('../src/styles/pages/budget.css')
const sheet = readCssSource('src/styles.css')
const map = JSON.parse(read('../docs/css-ownership.json')) as {
  owners: { id: string; file: string; owned: string[] }[]
  legacy: string[]
  baselines: { configAppearanceKeys: string[] }
}
const baseline = JSON.parse(read('../tests/page-consistency-baseline.json')) as {
  pageFiles: Record<string, { inlineStyle: number }>
}

/** Code only — comments removed, so prose cannot satisfy an assertion. */
const code = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** One top-level rule's declaration text, normalised, plus its occurrence
 *  count. A selector that appears twice is a duplicate and must fail. */
function readRule(source: string, selector: string): { count: number; body: string | null } {
  const needle = `\n${selector} {`
  const at: number[] = []
  let from = 0
  for (;;) {
    const hit = source.indexOf(needle, from)
    if (hit === -1) break
    at.push(hit)
    from = hit + needle.length
  }
  if (at.length === 0) return { count: 0, body: null }
  const open = source.indexOf('{', at[0])
  const close = source.indexOf('}', open)
  if (open === -1 || close === -1) return { count: at.length, body: null }
  return {
    count: at.length,
    body: source.slice(open + 1, close).replace(/\s+/g, ' ').trim(),
  }
}

// Classes the markup uses as stable probe hooks. They carry no rule on
// purpose: a browser check can select a panel without depending on its skin.
const PROBE_HOOKS = new Set([
  'bud-cat-card',
  'bud-chart-card',
  'bud-crew-card',
  'bud-optional-card',
  'bud-read',
  'bud-target-group',
])
// Tokens the regex cannot read as classes: a template prefix and an SVG id.
const NOT_A_CLASS = new Set(['bud-cat', 'bud-day-table-caption', 'bud-optional-hatch'])

const KEY_RULES: { selector: string; declarations: string }[] = [
  { selector: '.bud-page', declarations: 'display: flex; flex-direction: column; gap: var(--space-7); min-width: 0;' },
  { selector: '.bud-grid-charts, .bud-grid-mid', declarations: 'grid-template-columns: 1.2fr 1fr;' },
  { selector: '.bud-glance', declarations: 'display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; gap: var(--space-6); min-width: 0;' },
  { selector: '.bud-panel', declarations: 'padding: var(--space-8); background: var(--card); border: 1px solid var(--pw-line-soft); border-radius: var(--radius-lg); box-shadow: var(--elev-1);' },
  { selector: '.bud-card-title', declarations: 'margin: 0; font-family: var(--font-body); font-size: 18px; font-weight: 800; line-height: 1.3; letter-spacing: 0; color: var(--text);' },
  { selector: '.bud-hit:focus-visible', declarations: 'outline: none; box-shadow: var(--ring);' },
  { selector: '.bud-watch-row', declarations: 'align-items: flex-start; gap: var(--space-4); margin-top: var(--space-5);' },
  { selector: '.bud-line-chip', declarations: 'margin-left: 0;' },
  { selector: '.bud-state', declarations: 'animation: errIn var(--motion-med) var(--ease-out);' },
]

describe('PW-13 — one owner for the Budget family', () => {
  it('registers the module, and no legacy file declares a budget rule', () => {
    const owner = map.owners.find(o => o.id === 'budget')
    expect(owner?.file).toBe('src/styles/pages/budget.css')
    for (const file of map.legacy) {
      const source = read(`../${file}`)
      // `.budget-tier` and `.budget-anchor` belong to the Map tab, not this
      // family. Every other retired `budget-*` name must be gone.
      expect(source, `${file} must not declare a .bud- or retired .budget- rule`).not.toMatch(/\.(bud|budget)-(?!tier\b|anchor\b)[a-z]/)
      expect(source, `${file} must not declare the capture form`).not.toMatch(/\.(quick-add|expense-edit)\b/)
    }
    // The dead hero label used to live in the shared kicker list.
    expect(sheet).not.toContain('.budget-hero-label')
  })

  it('the map owns every class the module declares', () => {
    const owner = map.owners.find(o => o.id === 'budget')
    const owned = new Set(owner?.owned ?? [])
    const modifiers = new Set(['is-over', 'is-on', 'is-done', 'is-unread', 'soft', 'pos', 'neg', 'sm', 'card'])
    const declared = new Set([...css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(hit => hit[1]))
    for (const cls of declared) {
      if (modifiers.has(cls)) continue
      expect(owned.has(cls), `${cls} is declared but not owned`).toBe(true)
    }
    expect(owned.has('settled-row')).toBe(true)
    expect(owned.has('quick-add')).toBe(true)
  })

  it('every class the component names is declared, or a named probe hook', () => {
    const declared = new Set([...css.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map(hit => hit[1]))
    const used = new Set(tab.match(/\bbud-[a-z0-9-]+\b/g) ?? [])
    for (const cls of used) {
      if (NOT_A_CLASS.has(cls)) continue
      expect(declared.has(cls) || PROBE_HOOKS.has(cls), `${cls} has no rule and is not a probe hook`).toBe(true)
    }
    // The category classes are composed by `catClass`, so the census needs
    // one named proof that every hue the app can paint exists.
    for (const hue of ['transport', 'accommodation', 'food', 'activities', 'entry-fees', 'tolls-parking', 'local-travel', 'emergency-buffer']) {
      expect(declared.has(`bud-cat--${hue}`), `bud-cat--${hue}`).toBe(true)
      expect(code).toContain('return `bud-cat--${c}`')
    }
  })

  it('the old rules are gone from the whole graph', () => {
    for (const dead of [
      'bud-card-lead', 'bud-hero-meter', 'bud-panel-gap', 'bud-hero-meter',
      'metric-strip', 'daybars', 'daybar-fill', 'catbars', 'cat-chip',
      'budget-bars', 'budget-bar-fill', 'budget-hero', 'budget-hero-label', 'balance-row', 'balance-who',
    ]) {
      expect(sheet, `.${dead} is a retired budget selector`).not.toMatch(new RegExp(`\\.${dead}[\\s,{:]`))
    }
  })
})

describe('PW-13 — the component carries no inline styles', () => {
  it('uses none, and the page baseline locks the zero in', () => {
    // The tenth survivor was a chart width. Every bar now uses SVG geometry
    // (`x`/`width`/`height` attributes), so no measured value needs `style`.
    expect(code.match(/style=\{\{/g) ?? []).toHaveLength(0)
    expect(baseline.pageFiles['src/pages/trip/BudgetTab.tsx'].inlineStyle).toBe(0)
    expect(tab).not.toContain('enterIndex')
  })

  it('keeps the watch-row classes on one element', () => {
    expect(tab).toContain('className="row-between bud-watch-row"')
  })
})

describe('PW-13 — the key recipes stay on the tokens', () => {
  for (const rule of KEY_RULES) {
    it(`declares ${rule.selector} once, with its own values`, () => {
      const found = readRule(css, rule.selector)
      expect(found.count).toBe(1)
      expect(found.body).toBe(rule.declarations)
    })
  }

  it('grows the stacked bars as one element from their baseline', () => {
    expect(readRule(css, '.bud-stack').body).toContain('animation: bud-bars-in var(--motion-slower) var(--ease-paper) backwards;')
    expect(readRule(css, '.bud-track-fill').body).toContain('animation: bud-grow-x var(--motion-slower) var(--ease-paper) backwards;')
    expect(readRule(css, '.bud-bal-bar').body).toContain('animation: bud-grow-x var(--motion-slower) var(--ease-paper) backwards;')
  })

  it('keeps the tooltip on a token transition and the card surface', () => {
    const tip = readRule(css, '.bud-tip').body ?? ''
    expect(tip).toContain('background: var(--card); color: var(--text);')
    expect(tip).toContain('transition: opacity var(--motion-fast) var(--ease-paper);')
  })

  it('resets the shared card step inside the Budget grids', () => {
    // The shared `.card + .card` step is real; this reset must own it back.
    const shared = readRule(sheet, '.card + .card')
    expect(shared.count).toBe(1)
    expect(shared.body).toContain('margin-top: 14px')
    expect(css).toMatch(/\.bud-glance > \.card \+ \.card,\s*\.bud-grid > \.card \+ \.card \{ margin-top: 0; \}/)
  })

  it('pairs every animated class with a reduced-motion opt-out', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const cls of ['.bud-track-fill', '.bud-share-bar', '.bud-essential-bar', '.bud-stack', '.bud-bal-bar', '.bud-state']) {
      expect(reduced, `${cls} must stop under reduced motion`).toContain(cls)
    }
    expect(reduced).toContain('.bud-tip { transition: none; }')
  })

  it('names no raw duration in the module', () => {
    const timeline = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(timeline).not.toMatch(/\d+ms/)
  })

  it('gives the coarse pointer the 40px control floor', () => {
    const coarse = css.slice(css.indexOf('@media (pointer: coarse)'))
    expect(coarse).toContain('.bud-filter { min-height: 40px; }')
    expect(coarse).toContain('.bud-table-view summary { min-height: 40px; padding: 10px 0; }')
    // A flex summary drops the native disclosure marker.
    expect(coarse).not.toContain('.bud-table-view summary { display: flex;')
  })
})
