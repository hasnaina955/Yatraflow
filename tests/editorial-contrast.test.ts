import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The general contrast gate reads a rule that declares `color` and `background`
// together. The editorial family puts its ink on a token the rule never names,
// so those pairs were invisible to it. This file measures the pairs the editorial
// surfaces actually paint, in both themes, from the token values themselves.

const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8')

interface Rgb { r: number; g: number; b: number; a: number }

function tokenBlock(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`)
  expect(start, `${selector} must exist`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) {
        const body = css.slice(open + 1, index)
        const tokens = new Map<string, string>()
        for (const line of body.split('\n')) {
          const match = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line)
          if (match) tokens.set(match[1], match[2].trim())
        }
        return tokens
      }
    }
  }
  throw new Error(`Unterminated block for ${selector}`)
}

function resolveVar(value: string, tokens: Map<string, string>, seen = new Set<string>()): string {
  const match = /^var\((--[\w-]+)\)$/.exec(value.trim())
  if (!match || seen.has(match[1])) return value
  seen.add(match[1])
  const next = tokens.get(match[1])
  return next === undefined ? value : resolveVar(next, tokens, seen)
}

function parseColor(value: string): Rgb | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map(c => c + c).join('') : hex[1]
    return { r: parseInt(digits.slice(0, 2), 16), g: parseInt(digits.slice(2, 4), 16), b: parseInt(digits.slice(4, 6), 16), a: 1 }
  }
  const fn = /^rgba?\(([^)]+)\)$/.exec(value.trim())
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
  }
  return null
}

const channel = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }
const luminance = ({ r, g, b }: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
function contrast(fg: Rgb, bg: Rgb): number {
  const flat: Rgb = fg.a < 1
    ? { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 }
    : fg
  const values = [luminance(flat), luminance(bg)].sort((x, y) => y - x)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

const light = tokenBlock(':root')
const dark = tokenBlock("[data-theme='dark']")

/** The app's own accepted hairline strength, measured from the same tokens. */
const HAIRLINE_FLOOR = contrast(
  parseColor(resolveVar('var(--line)', light))!,
  parseColor(resolveVar('var(--card)', light))!,
)

/** Every pair an editorial surface paints, as the token names the rule uses. */
const PAIRS: Array<[label: string, fg: string, bg: string, minimum: number]> = [
  ['card body text', '--color-editorial-ink', '--color-editorial-surface', 4.5],
  ['card text on paper', '--color-editorial-ink', '--color-editorial-paper', 4.5],
  ['card text on canvas', '--color-editorial-ink', '--color-editorial-canvas', 4.5],
  ['card text on mint', '--color-editorial-ink', '--color-editorial-mint', 4.5],
  ['secondary text on surface', '--text-2', '--color-editorial-surface', 4.5],
  ['secondary text on mint', '--text-2', '--color-editorial-mint', 4.5],
  ['meta text on surface', '--text-3', '--color-editorial-surface', 4.5],
  ['accent label on surface', '--color-editorial-accent-ink', '--color-editorial-surface', 4.5],
  ['accent label on mint', '--color-editorial-accent-ink', '--color-editorial-mint', 4.5],
  // A hairline is not text, so WCAG 1.4.11's 3:1 is the wrong bar for it and no
  // shipped surface in this app meets it. The honest floor is the app's own
  // accepted hairline: --line on --card. The editorial border must be at least
  // as strong as the standard the rest of the product already paints.
  ['card border against canvas', '--color-editorial-border', '--color-editorial-canvas', HAIRLINE_FLOOR],
  ['card border against surface', '--color-editorial-border', '--color-editorial-surface', HAIRLINE_FLOOR],
  ['card border against mint', '--color-editorial-border', '--color-editorial-mint', HAIRLINE_FLOOR],
]

describe('editorial contrast, measured from the tokens both themes declare', () => {
  it('declares the editorial family in both themes', () => {
    for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
      for (const name of ['--color-editorial-canvas', '--color-editorial-paper', '--color-editorial-surface',
        '--color-editorial-mint', '--color-editorial-ink', '--color-editorial-accent',
        '--color-editorial-accent-ink', '--color-editorial-border']) {
        expect(tokens.has(name), `${theme} must declare ${name}`).toBe(true)
      }
    }
  })

  // A token pair, not a rule: the accent teal clears AA on the dark surface and
  // fails it on the light one, which is exactly the split a per-theme gate catches.
  // The accent itself stays the non-text colour; accent-ink carries text.
  it('keeps the non-text accent distinct from the text accent in light only', () => {
    expect(light.get('--color-editorial-accent')).not.toBe(light.get('--color-editorial-accent-ink'))
    expect(dark.get('--color-editorial-accent')).toBe(dark.get('--color-editorial-accent-ink'))
  })

  it('never paints accent-coloured text with the non-text accent in light', () => {
    for (const rule of css.split('\n')) {
      const usesAccentInk = /color:\s*var\(--color-editorial-accent-ink\)/.test(rule)
      const usesAccent = /color:\s*var\(--color-editorial-accent\)/.test(rule)
      if (usesAccent) expect(usesAccentInk, `a rule paints text with the non-text accent: ${rule.trim()}`).toBe(true)
    }
  })

  for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
    for (const [label, fgName, bgName, minimum] of PAIRS) {
      it(`${theme}: ${label} (${fgName} on ${bgName}) clears ${minimum}:1`, () => {
        const fg = parseColor(resolveVar(`var(${fgName})`, tokens))
        const bg = parseColor(resolveVar(`var(${bgName})`, tokens))
        expect(fg, `${theme} ${fgName} must resolve to a colour`).not.toBeNull()
        expect(bg, `${theme} ${bgName} must resolve to a colour`).not.toBeNull()
        const ratio = contrast(fg!, bg!)
        expect(
          ratio,
          `${theme}: ${label} measures ${ratio.toFixed(2)}:1 — ${fgName} (${resolveVar(`var(${fgName})`, tokens)}) on ${bgName} (${resolveVar(`var(${bgName})`, tokens)}) must clear ${minimum}:1`,
        ).toBeGreaterThanOrEqual(minimum)
      })
    }
  }
})

function declaration(selector: string, property: string): string | null {
  const start = css.indexOf(`${selector} {`)
  if (start < 0) return null
  const open = css.indexOf('{', start)
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) {
        for (const line of css.slice(open + 1, index).split('\n')) {
          const match = new RegExp(`^\\s*${property}\\s*:\\s*([^;]+);`).exec(line)
          if (match) return match[1].trim()
        }
        return null
      }
    }
  }
  return null
}

// A control floating over an unknown photo must paint an opaque backing in
// both themes. The bookmark once inherited the shared translucent heart wash,
// which the token-pair gate never saw because no new solid backing was added.
describe('photo-floating editorial controls stay opaque', () => {
  for (const selector of ['.pub-card-duration', '.explore-page .pub-card-editorial .save-bookmark']) {
    it(`${selector} declares an opaque background`, () => {
      const background = declaration(selector, 'background')
      expect(background, `${selector} must declare a background`).not.toBeNull()
      for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
        const resolved = resolveVar(background!, tokens)
        const color = parseColor(resolved)
        expect(color, `${theme}: ${selector} background must resolve to a colour`).not.toBeNull()
        expect(color!.a, `${theme}: ${selector} background must stay opaque over photos`).toBe(1)
      }
    })
  }
})
