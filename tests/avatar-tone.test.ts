// The member avatar stack: distinct fills, stable identity, readable initials.
//
// Three initials avatars painted one pale mint read as a single block, because
// the circles overlap and identical fills merge where they cross. The fix is a
// deterministic tone per member from the approved token trio, resolved by the
// stack so neighbours never share one.
//
// These are pure tests: the assignment is a function of the id list, so the
// properties that matter (distinct, stable, deterministic) are checkable
// without a browser. The rendered geometry is asserted in the fixture probe.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { AVATAR_TONES, assignAvatarTones, avatarToneFor } from '../src/lib/avatarTone'
import { readCssSource } from '../scripts/css-source-graph.mjs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

/** Comments must go before any rule is located by its own text: a comment that
 *  merely NAMES a selector would otherwise be found instead of the rule. */
const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

describe('a stack of members gets distinct tones', () => {
  it('gives three members three different tones', () => {
    const tones = assignAvatarTones(['fixture-owner', 'fixture-editor', 'fixture-viewer'])
    expect(new Set(tones).size, `three members must read as three colours, got ${tones.join('/')}`).toBe(3)
  })

  it('never repeats the tone immediately to the left, at any length', () => {
    // The property overlap actually needs. Beyond three members the palette
    // runs out, so "all distinct" is impossible - "no two neighbours alike"
    // is not.
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    for (let n = 1; n <= ids.length; n += 1) {
      const tones = assignAvatarTones(ids.slice(0, n))
      for (let i = 1; i < tones.length; i += 1) {
        expect(tones[i], `stack of ${n}: positions ${i - 1} and ${i} share ${tones[i]}`).not.toBe(tones[i - 1])
      }
    }
  })

  it('is deterministic — the same list always paints the same way', () => {
    const ids = ['fixture-owner', 'fixture-editor', 'fixture-viewer']
    const once = assignAvatarTones(ids)
    const twice = assignAvatarTones(ids)
    expect(twice).toEqual(once)
  })

  it('keeps a member stable when somebody else joins or leaves', () => {
    // The real reorder: a member leaves, and the two remaining circles must
    // not swap colours under the reader.
    const before = assignAvatarTones(['owner', 'editor', 'viewer'])
    const after = assignAvatarTones(['owner', 'viewer'])
    expect(after[0], 'the first member keeps the tone they had').toBe(before[0])
    // The second member's tone may move only if it would otherwise collide,
    // which is the documented rule; it must never equal their neighbour's.
    expect(after[1]).not.toBe(after[0])
  })

  // The stability claim that used to be untrue. Resolving collisions in RENDER
  // order made the first arrival win the contested tone, so reversing the same
  // three people swapped two of their colours — and "stable across reorder"
  // was a comment, not a property. The canonical pass fixes it for a trio
  // because three identities fill the three-tone palette exactly, leaving the
  // render-order repair nothing to do.
  it('paints a fixed trio the same way in EVERY render order', () => {
    const trio = ['fixture-owner', 'fixture-editor', 'fixture-viewer']
    const permutations = <T,>(items: T[]): T[][] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(rest => [item, ...rest]))

    const toneOf = new Map<string, string>()
    for (const order of permutations(trio)) {
      const tones = assignAvatarTones(order)
      expect(new Set(tones).size, `three members must stay three colours in ${order.join('/')}`).toBe(3)
      order.forEach((id, i) => {
        const seen = toneOf.get(id)
        if (seen === undefined) toneOf.set(id, tones[i])
        else expect(tones[i], `${id} changed tone when the render order changed`).toBe(seen)
      })
    }
    expect(toneOf.size).toBe(3)
  })

  it('keeps a trio stable across repeated calls, not just the first two', () => {
    const trio = ['fixture-owner', 'fixture-editor', 'fixture-viewer']
    const first = assignAvatarTones(trio)
    for (let i = 0; i < 5; i += 1) expect(assignAvatarTones(trio)).toEqual(first)
  })

  it('handles an id-less member without collapsing the stack', () => {
    const tones = assignAvatarTones([null, undefined, ''])
    expect(new Set(tones).size, 'unnamed rows must still differ from each other').toBe(3)
    for (let i = 1; i < tones.length; i += 1) expect(tones[i]).not.toBe(tones[i - 1])
  })

  it('tells apart members who repeat an id, and never mutates the list', () => {
    // A duplicate id means two circles claiming one identity. They must still
    // differ where they overlap, and the caller's array must come back intact —
    // the assignment sorts and de-duplicates internally, so an accidental
    // in-place sort would silently reorder the members on screen.
    const ids: (string | null)[] = ['dup', 'dup', null, '', 'dup']
    const snapshot = JSON.stringify(ids)
    const tones = assignAvatarTones(ids)
    expect(JSON.stringify(ids), 'assignAvatarTones must not touch its argument').toBe(snapshot)
    expect(tones).toHaveLength(ids.length)
    for (let i = 1; i < tones.length; i += 1) {
      expect(tones[i], `positions ${i - 1} and ${i} share ${tones[i]}`).not.toBe(tones[i - 1])
    }
  })

  it('still differs from the neighbour in a stack longer than the palette', () => {
    // Four or more identities exhaust the trio. The canonical pass cannot make
    // them all distinct, so the guarantee drops to what overlap needs — the
    // circle on your left — and that is asserted at every length.
    const ids = Array.from({ length: 12 }, (_, i) => `user-${i}`)
    for (let n = 4; n <= ids.length; n += 1) {
      const tones = assignAvatarTones(ids.slice(0, n))
      for (let i = 1; i < tones.length; i += 1) {
        expect(tones[i], `stack of ${n}: positions ${i - 1} and ${i} share ${tones[i]}`).not.toBe(tones[i - 1])
      }
    }
  })

  it('returns one tone per member, and only approved tones', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `user-${i}`)
    const tones = assignAvatarTones(ids)
    expect(tones).toHaveLength(ids.length)
    for (const tone of tones) expect(AVATAR_TONES).toContain(tone)
  })

  it('handles an empty stack', () => {
    expect(assignAvatarTones([])).toEqual([])
  })
})

describe('a single avatar keeps the tone its id names', () => {
  it('is stable for the same id', () => {
    expect(avatarToneFor('fixture-owner')).toBe(avatarToneFor('fixture-owner'))
  })

  it('uses the index only when there is no id', () => {
    expect(avatarToneFor(null, 0)).toBe(AVATAR_TONES[0])
    expect(avatarToneFor(null, 1)).toBe(AVATAR_TONES[1])
    expect(avatarToneFor('  ', 2)).toBe(AVATAR_TONES[2])
  })

  it('spreads real-looking ids across the palette', () => {
    // A hash that dumped everything into one bucket would pass the stability
    // test above and still paint a uniform stack.
    const ids = ['a1b2c3d4-0000-4000-8000-000000000001', 'e5f6a7b8-1111-4111-8111-000000000002', 'c9d0e1f2-2222-4222-8222-000000000003']
    const used = new Set(ids.map(id => avatarToneFor(id)))
    expect(used.size, 'three distinct ids must not all land on one tone').toBeGreaterThan(1)
  })
})

describe('the rendered stack carries the rule', () => {
  it('every stack consumer resolves tones through the shared helper', () => {
    // A stack that painted its own colours would drift from the palette and
    // from the collision rule. Each of these renders overlapping circles.
    for (const path of [
      '../src/pages/TripWorkspace.tsx',
      '../src/pages/trip/OverviewTab.tsx',
      '../src/pages/trip/GroupInputTab.tsx',
      '../src/components/trips/Planners.tsx',
    ]) {
      const src = read(path)
      expect(src, `${path} must resolve stack tones through assignAvatarTones`).toContain('assignAvatarTones')
      expect(src, `${path} must not hand-roll an index-based tone`).not.toMatch(/tone=\{AVATAR_TONES\[/)
    }
  })

  it('a real photo still wins over a tone', () => {
    // The tone paints initials only; a member with an uploaded photo must
    // render that photo, or the colour would cover their face.
    const ui = read('../src/components/ui.tsx')
    const avatar = ui.slice(ui.indexOf('export function Avatar'), ui.indexOf('export function Chip'))
    expect(avatar, 'an uploaded photo must render before any tone is applied').toMatch(
      /avatarUrl\) return <img className=\{cls\}[\s\S]*?\n\s*const initials/,
    )
  })

  it('each tone pairs a fill with an ink in the stylesheet', () => {
    const css = readCssSource('src/styles.css')
    for (const tone of AVATAR_TONES) {
      const rule = css.split(/\r?\n/).find(line => line.startsWith(`.avatar.tone-${tone} {`))
      expect(rule, `.avatar.tone-${tone} is missing from styles.css`).toBeTruthy()
      expect(rule!, `${tone} must set its own ink, not inherit one`).toMatch(/color:/)
      expect(rule!, `${tone} must paint an approved token, not a raw hex`).toMatch(/background:\s*var\(--pw-/)
    }
  })

  // The ink is read off the rule and RESOLVED through the real token blocks, in
  // both themes, then measured. A source pin cannot catch this: the earlier
  // rules inked sea and marigold with borrowed tokens (`--pw-sea-900` in dark,
  // the page ink in light), which looked deliberate and measured 2.13:1 and
  // 1.62:1 in dark mode — initials that are technically painted and practically
  // invisible. Only the numbers show it.
  it('keeps initials readable in both themes, measured from the real tokens', () => {
    const css = stripCssComments(readCssSource('src/styles.css'))

    // The tokens are read the way the cascade resolves them: every block that
    // declares `--pw-*` and is not theme-scoped feeds the light map, then the
    // theme-scoped blocks are laid over it for dark. Reading beats restating —
    // a token that moves takes this expectation with it.
    const tokenBlocks = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map(m => ({ selector: m[1].trim(), body: m[2] }))
      .filter(b => b.body.includes('--pw-'))

    const merge = (blocks: typeof tokenBlocks) => {
      const tokens = new Map<string, string>()
      for (const block of blocks) {
        for (const [, name, value] of block.body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens.set(name, value.trim())
      }
      return tokens
    }
    const isDark = (b: { selector: string }) => b.selector.includes("data-theme='dark'")
    const light = merge(tokenBlocks.filter(b => !isDark(b)))
    const dark = merge(tokenBlocks)
    expect(light.size, 'the light token map must be populated').toBeGreaterThan(10)

    const resolve = (name: string, tokens: Map<string, string>, depth = 0): string => {
      const raw = tokens.get(name)
      expect(raw, `${name} must be declared`).toBeTruthy()
      const alias = raw!.match(/^var\((--[\w-]+)\)$/)
      if (alias && depth < 8) return resolve(alias[1], tokens, depth + 1)
      return raw!
    }

    const rgb = (value: string): [number, number, number] => {
      const hex = value.match(/^#([0-9a-f]{6})$/i)
      expect(hex, `expected a 6-digit hex, got ${value}`).toBeTruthy()
      const h = hex![1]
      return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
    }
    const luminance = (value: string) => {
      const [r, g, b] = rgb(value).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (hi + 0.05) / (lo + 0.05)
    }

    const ruleOf = (tone: string) =>
      css.split(/\r?\n/).find(line => line.startsWith(`.avatar.tone-${tone} {`))!

    for (const [theme, tokens] of [['light', light], ['dark', dark]] as const) {
      for (const tone of AVATAR_TONES) {
        const rule = ruleOf(tone)
        const fill = rule.match(/background:\s*var\((--[\w-]+)/)?.[1]
        const ink = rule.match(/color:\s*var\((--[\w-]+)/)?.[1]
        expect(fill, `${tone} must fill from a token`).toBeTruthy()
        expect(ink, `${tone} must ink from a token`).toBeTruthy()
        const ratio = contrast(resolve(fill!, tokens), resolve(ink!, tokens))
        expect(
          ratio,
          `${theme} ${tone}: ${ink} on ${fill} measures ${ratio.toFixed(2)}:1 — initials need 4.5:1`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('inks every tone from the semantic on-* partner, not a borrowed role', () => {
    // `--pw-on-*` exists precisely to be the ink for its own fill. Borrowing
    // another role's token is how the dark-mode regression happened: the value
    // is correct for the role it was named for and wrong here.
    const css = stripCssComments(readCssSource('src/styles.css'))
    for (const tone of AVATAR_TONES) {
      const rule = css.split(/\r?\n/).find(line => line.startsWith(`.avatar.tone-${tone} {`))!
      expect(rule, `${tone} must ink from --pw-on-${tone}`).toMatch(new RegExp(`color:\\s*var\\(--pw-on-${tone}\\b`))
    }
    // No per-theme ink patch may reappear: the token set already carries both
    // themes, so a `[data-theme='dark'] .avatar.tone-*` override means somebody
    // is working around a fill/ink pair that does not match.
    expect(css, 'tones must not need a per-theme ink override').not.toMatch(/\[data-theme='dark'\]\s+\.avatar\.tone-/)
  })
})
