// ============ The hero's text is legible over ANY cover a creator uploads (2026-09-17) ============
// `.pub-hero-photo` is an upload, so before this the kicker/title/story/byline
// were painted straight onto whatever the creator chose: the impeccable overlay
// measured them at 2.6-3.1:1 over the Chandratal cover (a tan photo) while the
// same text over the intended gradient is ~9:1 — i.e. the repo's token-based
// contrast gate was green and the rendered page was not.
//
// The guarantee is now a flat scrim layer over the text zone, and the pin is
// WORST CASE: the scrim composited over a pure white photo, which is brighter
// than any real one (the photo also renders at opacity .42). If the copy in
// styles.css drifts, this fails rather than shipping an unreadable hero.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

/** Relative luminance, WCAG 2.x. */
function luminance([r, g, b]: number[]): number {
  const lin = [r, g, b].map(v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}
function contrast(a: number[], b: number[]): number {
  const [l1, l2] = [luminance(a), luminance(b)]
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
function parseHex(hex: string): number[] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
}
/**
 * The first background layer only, by walking parenthesis depth — a regex
 * cannot tell `linear-gradient(...)` from the `radial-gradient(...)` layers
 * that follow it, and swallowing one of those was measuring the wrong scrim.
 */
function firstLayer(source: string, start: number): string {
  let depth = 0
  for (let i = start; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error('unbalanced parentheses in the hero background layer')
}

/** Parse every `<alpha> <offset>%` stop of the hero's first background layer. */
function heroScrimStops(): Array<{ alpha: number; offset: number; color: number[] }> {
  const rule = css.match(/\.pub-hero-bg\s*\{[\s\S]*?\}/)
  expect(rule, '.pub-hero-bg must exist in styles.css').not.toBeNull()
  const start = rule![0].indexOf('linear-gradient(180deg,')
  expect(start, '.pub-hero-bg must declare a 180deg linear scrim as its first layer').toBeGreaterThan(-1)
  const linear = firstLayer(rule![0], start)
  const stops = [...linear.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)\s*(\d+)%/g)]
    .map(m => ({ color: [+m[1], +m[2], +m[3]], alpha: m[4] === undefined ? 1 : +m[4], offset: +m[5] }))
  expect(stops.length, 'the scrim must declare at least three stops').toBeGreaterThanOrEqual(3)
  return stops
}
/**
 * The declaration block of a rule, scanned rather than built into a `RegExp(`
 * from the selector: a class name is not a pattern, and an escaping slip reads
 * as "no such rule" instead of as a bad pattern. The first occurrence whose
 * next non-space character is `{` wins, which is what skips a selector-list
 * member (`.a, .b {`) in favour of the rule that declares the style.
 */
function ruleFor(selector: string): string {
  for (let at = css.indexOf(selector); at !== -1; at = css.indexOf(selector, at + 1)) {
    let i = at + selector.length
    while (i < css.length && ' \t\r\n'.includes(css[i])) i++
    if (css[i] !== '{') continue
    const end = css.indexOf('}', i)
    if (end !== -1) return css.slice(at, end + 1)
  }
  return ''
}
/** A declared `color:` in a hero rule, e.g. `.pub-hero-kicker { … color: #a9eadc; }`. */
function heroTextColor(selector: string): number[] {
  const rule = ruleFor(selector)
  expect(rule, `${selector} must exist in styles.css`).not.toBe('')
  const color = rule.match(/color:\s*(#[0-9a-fA-F]{3,6})/)
  expect(color, `${selector} must declare a hex color`).not.toBeNull()
  return parseHex(color![1])
}

// The text zone: the byline is the lowest element of `.pub-hero-inner`, so the
// scrim must still be at full strength where it sits (~2/3 of the hero at the
// widest, measured on the live page at 1440x900).
const TEXT_ZONE_END_PERCENT = 62
const WHITE_PHOTO = [255, 255, 255]

describe('the public hero is legible over any uploaded cover', () => {
  it('paints a flat scrim across the whole text zone', () => {
    const stops = heroScrimStops()
    const covering = stops.filter(s => s.offset <= TEXT_ZONE_END_PERCENT)
    expect(covering.length, 'the scrim must cover the text zone').toBeGreaterThanOrEqual(2)
    // Every stop the text can sit on is at full strength — no gradient fade
    // through the text zone, which is how a head-line can silently fail.
    for (const stop of covering) {
      expect(stop.alpha, `scrim stop at ${stop.offset}% must not fade out inside the text zone`).toBeGreaterThanOrEqual(0.7)
    }
  })

  it('holds AA for every hero text colour over a worst-case white cover', () => {
    const stops = heroScrimStops().filter(s => s.offset <= TEXT_ZONE_END_PERCENT)
    const heroTexts: Array<[string, string]> = [
      ['kicker', '.pub-hero-kicker'],
      ['story', '.pub-hero-story'],
      ['byline', '.pub-hero-byline'],
    ]
    for (const [name, selector] of heroTexts) {
      const fg = heroTextColor(selector)
      for (const stop of stops) {
        // Composite the scrim onto the brightest possible photo.
        const base = stop.color.map((c, i) => stop.alpha * c + (1 - stop.alpha) * WHITE_PHOTO[i])
        const ratio = contrast(fg, base)
        expect(
          ratio,
          `${name} over a white cover at scrim stop ${stop.offset}% measured ${ratio.toFixed(2)}:1 — must clear AA`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
