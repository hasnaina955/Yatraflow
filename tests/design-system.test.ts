// Design-system consistency invariants (v0.48 pass).
// Static source checks: they read the shipped files as text, so a regression
// in any of these rules fails CI without needing a browser.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

const srcRoot = new URL('../src/', import.meta.url)
const sourceFiles = readdirSync(srcRoot, { recursive: true })
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => {
    const rel = 'src/' + f.split('\\').join('/')
    return { rel, text: readFileSync(new URL('../' + rel, import.meta.url), 'utf8') }
  })

const source = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

const loadedWeights = (s: string): Set<number> => {
  const out = new Set<number>()
  for (const m of s.matchAll(/(?:Inter|Sora):wght@([\d;]+)/g)) {
    for (const w of m[1].split(';')) out.add(Number(w))
  }
  return out
}

/** Ranges of every @media block whose condition contains `query`. */
function mediaBlocks(cssText: string, query: string): string[] {
  const lines = cssText.split(/\r?\n/)
  const out: string[] = []
  let start = -1
  let depth = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (start === -1 && line.includes(query) && line.includes('{')) {
      start = i
      depth = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
      continue
    }
    if (start !== -1) {
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length
      if (depth <= 0) {
        out.push(lines.slice(start, i + 1).join('\n'))
        start = -1
      }
    }
  }
  return out
}

// 1 ---------------------------------------------------------------------------

describe('font weights match the loaded faces', () => {
  const loaded = loadedWeights(html)

  it('loads the canonical weight set (Inter 400-800, Sora 600-800)', () => {
    for (const w of [400, 500, 600, 700, 800]) expect(loaded.has(w), `Inter/Sora must ship ${w}`).toBe(true)
  })

  it('declares no font-weight that the font link does not load', () => {
    const declared = [...css.matchAll(/font-weight:\s*(\d+)/g)].map((m) => Number(m[1]))
    expect(declared.length).toBeGreaterThan(100)
    const off = [...new Set(declared.filter((w) => !loaded.has(w)))]
    expect(off, `declared but not loaded: ${off.join(', ')}`).toEqual([])
  })

  it('keeps inline fontWeight styles inside the loaded faces', () => {
    const off: string[] = []
    for (const { rel, text } of sourceFiles) {
      for (const m of text.matchAll(/fontWeight:\s*["']?(\d+)/g)) {
        const w = Number(m[1])
        if (!loaded.has(w)) off.push(`${rel} -> ${w}`)
      }
    }
    expect(off, off.join('; ')).toEqual([])
  })
})

// 2 ---------------------------------------------------------------------------

describe('glass blur tiers', () => {
  it('defines the four tier tokens', () => {
    expect(css).toContain('--yf-blur-nav: 18px')
    expect(css).toContain('--yf-blur-panel: 14px')
    expect(css).toContain('--yf-blur-chip: 8px')
    expect(css).toContain('--yf-blur-scrim: 3px')
  })

  it('has retired the superseded sm/md/lg ladder', () => {
    expect(css).not.toMatch(/--yf-blur-(sm|md|lg)\b/)
  })

  it('routes every backdrop-filter through a tier token', () => {
    const lines = css.split(/\r?\n/)
    let selector = ''
    const offenders: string[] = []
    const exceptions: string[] = []
    lines.forEach((line, i) => {
      const sel = line.match(/([^{}]+)\{/)
      if (sel) selector = sel[1].trim()
      const dm = line.match(/backdrop-filter:\s*blur\(([^)]*)\)/)
      if (!dm) return
      const arg = dm[1].trim()
      if (arg.startsWith('var(--yf-blur-')) return
      if (arg === '1.5px' && /locked-cta/.test(selector)) {
        exceptions.push(selector)
        return
      }
      offenders.push(`line ${i + 1} (${selector || 'unknown'}): blur(${arg})`)
    })
    expect(exceptions, 'the locked-CTA scrim is the single documented 1.5px exception').toHaveLength(1)
    expect(offenders, offenders.join('; ')).toEqual([])
  })

  it('still uses every tier somewhere', () => {
    for (const tier of ['nav', 'panel', 'chip', 'scrim']) {
      expect(css).toContain(`var(--yf-blur-${tier})`)
    }
  })
})

// 3 ---------------------------------------------------------------------------

describe('one green (#0D8D82)', () => {
  it('re-points the primary primitive to the CTI teal', () => {
    expect(css).toContain('--teal-500: #0D8D82;')
  })

  it('keeps light and dark themes in parity with the CTI scale', () => {
    const teal500 = [...css.matchAll(/--teal-500:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase())
    const yfTeal600 = [...css.matchAll(/--yf-teal-600:\s*(#[0-9A-Fa-f]{6})/g)].map((m) => m[1].toUpperCase())
    expect(teal500.length).toBe(2)
    expect(yfTeal600.length).toBe(2)
    expect(teal500[0]).toBe(yfTeal600[0])
    expect(teal500[1]).toBe(yfTeal600[1])
  })

  it('drives the focus ring and form accents through the CTI token', () => {
    expect(css).toContain('accent-color: var(--yf-teal-600);')
    expect(css).toContain('color-mix(in srgb, var(--yf-teal-600) 35%, transparent)')
    expect(css).toContain('color-mix(in srgb, var(--yf-teal-600) 40%, transparent)')
  })

  it('paints the primary button through the semantic chain', () => {
    expect(css).toContain('.btn-primary { background: var(--color-primary);')
    expect(css).toContain('--color-primary: var(--teal-500);')
  })

  it('retires the old teal everywhere', () => {
    expect(css).not.toContain('149A90')
    expect(html).not.toContain('149A90')
    for (const { rel, text } of sourceFiles) {
      expect(text, rel).not.toContain('149A90')
      expect(text, rel).not.toContain('20, 154, 144')
    }
  })

  it('keeps the map palette, logo mark and favicon on the unified green', () => {
    expect(source('src/components/TripMap.tsx')).toContain("const DAY_COLORS = ['#0D8D82'")
    expect(source('src/components/ui.tsx')).toContain('fill="#0D8D82"')
    expect(html).toContain("%230D8D82")
  })
})

// 4 ---------------------------------------------------------------------------

describe('kicker casing: sentence case in source, uppercase via CSS', () => {
  const retyped: Array<[string, string, string]> = [
    ['src/pages/PublicItinerary.tsx', 'The journey', 'THE JOURNEY'],
    ['src/pages/PublicItinerary.tsx', 'Trip highlights', 'TRIP HIGHLIGHTS'],
    ['src/pages/PublicItinerary.tsx', 'The practical bit', 'THE PRACTICAL BIT'],
    ['src/pages/PublicItinerary.tsx', 'The route at a glance', 'THE ROUTE AT A GLANCE'],
    ['src/pages/PublicItinerary.tsx', 'Why this route works', 'WHY THIS ROUTE WORKS'],
    ['src/pages/Explore.tsx', 'Featured itinerary', 'FEATURED ITINERARY'],
  ]

  it.each(retyped)('types "%s" in sentence case and drops the caps form', (file, good, bad) => {
    const src = source(file)
    expect(src).toContain(good)
    expect(src).not.toContain(bad)
  })

  it('types the day badges in sentence case', () => {
    for (const file of ['src/pages/trip/timeline/DaySection.tsx', 'src/pages/PublicItinerary.tsx']) {
      expect(source(file)).toContain('<small>Day</small>')
      expect(source(file)).not.toContain('<small>DAY</small>')
    }
  })

  it('keeps the decorative stamps CSS-uppercased too', () => {
    expect(source('src/components/PlanBench.tsx')).toContain('>Estimate</span>')
    expect(source('src/pages/trip/TripSettingsForm.tsx')).toContain('>Preview</span>')
    expect(css).toMatch(/\.bench-stamp \{[^}]*text-transform: uppercase/)
  })

  it('owns the uppercase look through the unified kicker block', () => {
    expect(css).toContain('font-size: var(--kicker-size)')
    expect(css).toContain('text-transform: uppercase;')
    expect(css).toContain('.editorial-kicker, .pub-stats-label,')
    expect(css).toContain('.route-glance .route-glance-label,')
  })

  it('keeps visible all-caps text to the documented allowlist', () => {
    const allow = new Set([
      'CNG',
      'SEAT 1A',
      'YF-10S',
      'DISCOVER \u00b7 TRUST \u00b7 FORK',
      'YATRAFLOW \u00b7 ROUGH BILL',
    ])
    const offenders: string[] = []
    for (const { rel, text } of sourceFiles.filter((f) => f.rel.endsWith('.tsx'))) {
      for (const m of text.matchAll(/>([^<>{}\n]{2,80})</g)) {
        const t = m[1].trim()
        if (!t || t.includes('&')) continue
        const core = t.replace(/\u00b7/g, ' ')
        if (/^[A-Z0-9]/.test(t) && /^[A-Z0-9 &'\.,\-\/:]+$/.test(core) && /[A-Z]{2,}/.test(t) && !allow.has(t)) {
          offenders.push(`${rel}: "${t}"`)
        }
      }
    }
    expect(offenders, offenders.join('; ')).toEqual([])
  })
})

// 5 ---------------------------------------------------------------------------

describe('mobile row-action touch targets', () => {
  const mobile = mediaBlocks(css, '(max-width: 720px)').join('\n')

  it('sizes the timeline row actions at exactly 40px inside the <=720px block', () => {
    expect(mobile).toContain('.move-btn { width: 40px; height: 40px;')
    expect(mobile).toContain('.stop-actions .icon-btn { width: 40px; height: 40px; }')
  })

  it('leaves no smaller definition for them behind', () => {
    expect(css).not.toMatch(/\.move-btn \{ width: (2\d|3\d)px/)
    expect(css).not.toMatch(/\.stop-actions \.icon-btn \{ width: (2\d|3\d)px/)
  })
})

// 6 ---------------------------------------------------------------------------
// The #107 classes, as regression gates.
// The v0.53.0 audit found its defects by measuring the shipped CSS by hand; these
// checks make the two highest-volume measurements permanent, so the same class of
// defect fails `npm run verify` instead of waiting for the next audit.

/** Blank out comments but keep every newline, so reported line numbers stay true. */
const stripCssComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

/** Body of the first top-level block whose selector line matches `re`. */
function topLevelBlock(text: string, re: RegExp): string {
  const m = re.exec(text)
  if (!m) return ''
  const open = text.indexOf('{', m.index)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i)
  }
  return ''
}

/** First declaration of each property in a block. */
function declMap(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of block.matchAll(/([\w-]+)\s*:\s*([^;{}]+)/g)) {
    const key = m[1].trim()
    if (!out.has(key)) out.set(key, m[2].trim())
  }
  return out
}

const rootTokens = declMap(stripCssComments(topLevelBlock(css, /^:root\s*\{/m)))
const darkOverrides = declMap(stripCssComments(topLevelBlock(css, /^\[data-theme='dark'\]\s*\{/m)))
const darkTokens = new Map<string, string>([...rootTokens, ...darkOverrides])

/** Follow a `var(--token)` chain inside one theme's table. */
function resolveVar(value: string, tokens: Map<string, string>, depth = 0): string {
  const v = value.trim()
  if (depth > 8) return v
  const m = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/)
  if (!m) return v
  const next = tokens.get(m[1]) ?? (m[2] === undefined ? undefined : m[2].trim())
  return next === undefined ? v : resolveVar(next, tokens, depth + 1)
}

interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

function parseColor(value: string): Rgb | null {
  const s = value.trim().toLowerCase()
  if (['transparent', 'none', 'currentcolor', 'inherit', 'unset', 'initial'].includes(s)) return null
  let m = s.match(/^#([0-9a-f]{3})$/)
  if (m) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16))
    return { r, g, b, a: 1 }
  }
  m = s.match(/^#([0-9a-f]{6})$/)
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 }
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/)
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a }
  }
  return null
}

const channel = (c: number) => {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const luminance = ({ r, g, b }: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

/** WCAG contrast, compositing a translucent foreground over the background. */
function contrast(fg: Rgb, bg: Rgb): number {
  const flat: Rgb =
    fg.a < 1
      ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 }
      : fg
  const values = [luminance(flat), luminance(bg)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

interface CssRule {
  selector: string
  body: string
  line: number
}

/** Top-level rules only (rules inside @media are out of scope — see the note). */
function topLevelRules(text: string): CssRule[] {
  const src = stripCssComments(text)
  const out: CssRule[] = []
  let selector = ''
  let body = ''
  let depth = 0
  let line = 1
  let selectorLine = 1
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === '\n') line++
    if (c === '{') {
      if (depth === 0) {
        selectorLine = line
        body = ''
      }
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0) {
        const s = selector.trim()
        if (s && !s.startsWith('@') && body.includes(':')) out.push({ selector: s, body, line: selectorLine })
        selector = ''
      }
    } else if (depth === 0) selector += c
    else if (depth === 1) body += c
  }
  return out
}

const cssRules = topLevelRules(css)

/** Base selectors that a `[data-theme='dark'] …` rule re-styles. */
const darkOverridden = new Set<string>()
for (const rule of cssRules) {
  for (const part of rule.selector.split(',')) {
    const m = part.trim().match(/^\[data-theme='dark'\]\s+([\s\S]+)$/)
    if (m) darkOverridden.add(m[1].trim().replace(/\s+/g, ' '))
  }
}

/** Base selectors a `:root:not([data-theme='dark']) …` rule re-styles (the light-only deepen). */
const lightOverridden = new Set<string>()
for (const rule of cssRules) {
  for (const part of rule.selector.split(',')) {
    const m = part.trim().match(/^:root:not\(\[data-theme='dark'\]\)\s+([\s\S]+)$/)
    if (m) lightOverridden.add(m[1].trim().replace(/\s+/g, ' '))
  }
}

const normalise = (s: string) => s.replace(/\s+/g, ' ').trim()

// --- ratchet ------------------------------------------------------------------
// The audit's classes are measured here, but a handful of the results are
// deliberate owner decisions or surfaces whose real backdrop lives outside this
// file. So the known set is frozen in a committed baseline that may only shrink:
// a NEW offender fails the build, and an entry that no longer reproduces must be
// deleted (re-baseline deliberately with UPDATE_DESIGN_SYSTEM_BASELINE=1).
//
// Every key is the offender's own text with the `styles.css:<line>` prefix
// DROPPED, for the same reason in every gate: a line number is where a rule
// happens to sit, not what it is, so a key carrying one is invalidated by any
// insertion above it — every CSS edit anywhere in the file re-failed the
// contrast and duration gates with phantom "new violations" and forced a
// re-baseline instead (hit twice, and it is what a rebase between two branches
// that both moved `styles.css` conflicted on). Keyed by what the rule declares,
// a shift moves nothing and only a real change to that declaration does. The
// trade-off is explicit and narrow: a *second* rule repeating an
// already-tolerated pair is not flagged, because the pair is what the key
// names — `duplicateSelectors` catches that selector twice at the top level,
// which is where it would surface first.

const baselineUrl = new URL('./design-system-baseline.json', import.meta.url)
const updatingBaseline = process.env.UPDATE_DESIGN_SYSTEM_BASELINE === '1'

function ratchet(key: string, offenders: string[]): void {
  const baseline = JSON.parse(readFileSync(baselineUrl, 'utf8')) as Record<string, string[]>
  const current = [...new Set(offenders)].sort()
  if (updatingBaseline) {
    baseline[key] = current
    writeFileSync(baselineUrl, JSON.stringify(baseline, null, 2) + '\n')
    return
  }
  const known = new Set(baseline[key] ?? [])
  const added = current.filter((o) => !known.has(o))
  const cleared = (baseline[key] ?? []).filter((o) => !current.includes(o))
  expect(added, `new ${key} violation(s) — fix them, or re-baseline deliberately:\n${added.join('\n')}`).toEqual([])
  expect(cleared, `${key}: these no longer reproduce — delete them from design-system-baseline.json:\n${cleared.join('\n')}`).toEqual([])
}

describe('contrast contract: colour pairs declared in one rule', () => {
  it('parses both theme token blocks and the rule set', () => {
    expect(rootTokens.size).toBeGreaterThan(100)
    expect(darkOverrides.size).toBeGreaterThan(30)
    expect(cssRules.length).toBeGreaterThan(400)
  })

  const offendersFor = (theme: 'light' | 'dark'): string[] => {
    const tokens = theme === 'light' ? rootTokens : darkTokens
    const out: string[] = []
    for (const rule of cssRules) {
      const sel = normalise(rule.selector)
      const isDarkRule = sel.startsWith("[data-theme='dark']")
      const isLightOnly = sel.includes(":not([data-theme='dark'])")
      if (theme === 'light' && isDarkRule) continue
      if (theme === 'dark' && isLightOnly) continue
      if (theme === 'dark' && !isDarkRule && darkOverridden.has(sel)) continue
      if (theme === 'light' && !isLightOnly && lightOverridden.has(sel)) continue
      const decls = declMap(rule.body)
      const fgRaw = decls.get('color')
      const bgRaw = decls.get('background-color') ?? decls.get('background')
      if (fgRaw === undefined || bgRaw === undefined) continue
      const fg = parseColor(resolveVar(fgRaw, tokens))
      const bg = parseColor(resolveVar(bgRaw, tokens))
      if (!fg || !bg) continue
      // A translucent backdrop sits on a surface this file cannot see (a hero band,
      // the page atmosphere), so its real contrast is unknowable from source alone.
      if (bg.a !== 1) continue
      const ratio = contrast(fg, bg)
      if (ratio < 4.5) out.push(`${sel} — ${ratio.toFixed(2)}:1`)
    }
    return out
  }

  // #154: the mechanical gate above only sees rules that declare fg+bg in ONE
  // rule — a color-only override like `.poi-fact--warn { color: … }` on a
  // separate background rule was invisible to it, which is exactly how the
  // 3.65:1 warn-on-white shipped. These pins make the Map-rail's warn-ink
  // pairs an explicit contract: measured against the surfaces the rail
  // actually paints (its own card bg, and the soft warn chip fill).
  it('map-rail warn ink meets AA on every surface it paints (#154)', () => {
    const surfaces: Array<[string, string]> = [
      ['--bg', 'card background'],
      ['--warn-soft', 'warn chip fill'],
    ]
    for (const [theme, tokens] of [['light', rootTokens], ['dark', darkTokens]] as const) {
      const warn = resolveVar('var(--warn)', tokens)
      const ink = resolveVar('var(--ink-amber)', tokens)
      const warnFg = parseColor(warn)
      const inkFg = parseColor(ink)
      expect(warnFg, `--warn must resolve in ${theme}`).not.toBeNull()
      expect(inkFg, `--ink-amber must resolve in ${theme}`).not.toBeNull()
      for (const [bgVar, surfaceName] of surfaces) {
        const bg = parseColor(resolveVar(`var(${bgVar})`, tokens))
        expect(bg, `${bgVar} must resolve in ${theme}`).not.toBeNull()
        // whichever ink a rail warn surface uses in that theme must clear 4.5
        expect(
          contrast(theme === 'light' ? inkFg! : warnFg!, bg!),
          `${theme}: warn ink on ${surfaceName} (${bgVar}) must meet AA`
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('introduces no new AA failure in the light theme', () => {
    ratchet('contrastLight', offendersFor('light'))
  })

  it('introduces no new AA failure in the dark theme', () => {
    ratchet('contrastDark', offendersFor('dark'))
  })
})

describe('no duplicate top-level selectors', () => {
  it('declares each top-level selector exactly once', () => {
    const seen = new Map<string, number[]>()
    for (const rule of cssRules) {
      const key = normalise(rule.selector)
      seen.set(key, [...(seen.get(key) ?? []), rule.line])
    }
    const dups = [...seen.entries()].filter(([, lines]) => lines.length > 1)
    ratchet('duplicateSelectors', dups.map(([sel]) => sel))
  })
})

describe('motion vocabulary: durations come from the tokens', () => {
  // AGENTS §2.10: a raw `ms` in a new CSS rule is a review flag. Ambient loops
  // (`infinite` keyframes — a spinner, a live ping) are a deliberate exception:
  // their cadence is a property of the ambient effect, not of a UI transition.
  it('introduces no new raw duration', () => {
    const offenders: string[] = []
    for (const rule of cssRules) {
      const decls = declMap(rule.body)
      for (const prop of ['transition', 'animation', 'transition-duration', 'animation-duration']) {
        const value = decls.get(prop)
        if (value === undefined) continue
        if (prop.startsWith('animation') && /\binfinite\b/.test(value)) continue
        for (const m of value.matchAll(/(?<![\d.])[0-9]*\.?[0-9]+m?s\b/g)) {
          if (parseFloat(m[0]) === 0) continue
          offenders.push(`${normalise(rule.selector)} — ${prop}: ${m[0]}`)
        }
      }
    }
    ratchet('rawDurations', offenders)
  })
})

describe('spacing rhythm: new values land on the documented ladder', () => {
  // DESIGN_TOKENS.md's `--s-1…--s-8` set was deleted in SYS-2 because nothing
  // routed through it, which left the app with no enforceable rhythm at all —
  // hundreds of declarations carry a value the ladder does not contain, and
  // 10px and 9px between them are the app's *de facto* beat rather than an
  // oversight. Rewriting every literal in one sweep is unverifiable (the
  // workspace tabs need a signed-in trip), so the drift is FROZEN instead: a
  // new off-ladder value fails the build, and re-baselining is the same env var
  // the contrast and duration gates use. The ladder is the documented one plus
  // the two beats the editorial family already shares — 14 (two cards in a
  // column) and 22 (two sections). `border-radius` and friends are not spacing
  // and are not read.
  //
  // Keyed by `property: value`, the ratchet's rule for every gate. The frozen
  // set (76 pairs at the time of writing) is immune to the line-number churn
  // that made every CSS insertion force a re-baseline, and the set may only
  // shrink — retiring one of these values means deleting its entry, after which
  // it can never come back.
  const LADDER = new Set([2, 4, 6, 8, 12, 14, 16, 20, 22, 24])
  const SPACING = /^(gap|row-gap|column-gap|margin|padding)(-top|-bottom|-left|-right)?$/

  it('introduces no new off-ladder spacing', () => {
    const offenders = new Set<string>()
    for (const rule of cssRules) {
      for (const [prop, value] of declMap(rule.body)) {
        if (!SPACING.test(prop)) continue
        for (const m of value.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px/g)) {
          const n = parseFloat(m[1])
          if (n === 0 || LADDER.has(n)) continue
          offenders.add(`${prop}: ${m[0]}`)
        }
      }
    }
    ratchet('offLadderSpacing', [...offenders])
  })
})

describe('categorical palettes: hues stay distinguishable', () => {
  // Colour-coded categories must not collide: two "days" or two expense categories
  // sharing a hue are indistinguishable in a legend, however different their
  // lightness. 15° is the floor.
  const MIN_HUE_SEPARATION = 15

  const hueOf = (hex: string): number => {
    const rgb = parseColor(hex)
    if (!rgb) return 0
    const max = Math.max(rgb.r, rgb.g, rgb.b)
    const min = Math.min(rgb.r, rgb.g, rgb.b)
    const d = max - min
    if (d === 0) return 0
    const h =
      max === rgb.r ? ((rgb.g - rgb.b) / d) % 6 : max === rgb.g ? (rgb.b - rgb.r) / d + 2 : (rgb.r - rgb.g) / d + 4
    return (h * 60 + 360) % 360
  }

  const separation = (a: number, b: number): number => {
    const d = Math.abs(a - b) % 360
    return Math.min(d, 360 - d)
  }

  const collisions = (label: string, colours: string[]): string[] => {
    const out: string[] = []
    for (let i = 0; i < colours.length; i++) {
      for (let j = i + 1; j < colours.length; j++) {
        const gap = separation(hueOf(colours[i]), hueOf(colours[j]))
        if (gap < MIN_HUE_SEPARATION) out.push(`${label} ${colours[i]} vs ${colours[j]} — ${gap.toFixed(1)}°`)
      }
    }
    return out
  }

  it('introduces no new hue collision', () => {
    const daySource = source('src/components/TripMap.tsx').match(/const DAY_COLORS = \[([^\]]+)\]/)?.[1] ?? ''
    const days = [...daySource.matchAll(/#[0-9A-Fa-f]{6}/g)].map((m) => m[0])
    expect(days.length, 'DAY_COLORS must parse').toBeGreaterThanOrEqual(7)

    const cats = ['--cat-transport', '--cat-accommodation', '--cat-food', '--cat-activities']
      .map((token) => rootTokens.get(token))
      .filter((v): v is string => v !== undefined)

    // The POI lane is drawn on the same map as the day routes, so it must also
    // stay clear of every day colour and every expense category.
    const poiSee = rootTokens.get('--yf-poi-see')
    const cross: string[] = []
    if (poiSee !== undefined) {
      for (const c of [...days, ...cats]) {
        const gap = separation(hueOf(poiSee), hueOf(c))
        if (gap < MIN_HUE_SEPARATION) cross.push(`--yf-poi-see vs ${c} — ${gap.toFixed(1)}°`)
      }
    }

    ratchet('hueCollisions', [...collisions('DAY_COLORS', days), ...collisions('--cat-*', cats), ...cross])
  })
})

describe("a popup's host claims the rung, never the popup", () => {
  // A popup's own z-index is bounded by its HOST's stacking context: a host
  // that paints one (backdrop-filter, opacity < 1, transform) traps the menu
  // inside it, and a positioned card painted later covers the open menu
  // however high the popup's rung is. Both rules below shipped broken from that
  // oversight and were found by hit-testing — a menu option resolving to the
  // card's own node — not by reading z-indexes.
  const rule = (selector: string) => cssRules.find((r) => normalise(r.selector) === selector)

  it('gives the Explore filter bar a rung above the cards its menu opens over', () => {
    const bar = rule('.explore-filterbar')
    expect(bar, '.explore-filterbar is missing from styles.css').toBeTruthy()
    expect(bar!.body).toMatch(/position:\s*relative/)
    expect(bar!.body).toMatch(/z-index:\s*var\(--z-frost\)/)
    // The rule changes nothing unless the page carries the class on the bar
    // that actually holds the selects.
    expect(source('src/pages/Explore.tsx')).toContain('card glass-soft explore-filterbar')
  })

  it('keeps the card footer row clear of the corner it sits in', () => {
    // The creator line + channel icons are a card's last row whenever the
    // creator has a bio or a link; unpadded they sat 1px inside the 12px
    // bottom-right radius and read as clipped by the card's own edge.
    const foot = rule('.itin-foot')
    expect(foot, '.itin-foot is missing from styles.css').toBeTruthy()
    expect(foot!.body).toMatch(/padding:\s*0 16px 14px/)
    expect(source('src/components/PubCard.tsx')).toContain('row-between itin-foot')
  })
})
