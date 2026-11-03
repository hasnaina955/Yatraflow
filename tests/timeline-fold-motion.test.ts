import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Source-reading gate for the day card's open/close gesture: the body, the
// cover strip, the header's hairline and the chevron are ONE motion on one
// clock (--motion-slower, --ease-resize), a day that mounts open never
// animates, and a reopen during a close reverses instead of snapping.
//
// Measured before the fix (first day, 1440px): expand jumped 195px to 1090px
// inside 130ms with no height animation while the chevron took 600ms;
// collapse unmounted the cover strip on the first frame (height -1 at 69ms).

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const TSX = read('src/pages/trip/timeline/DaySection.tsx')
const CSS = read('src/styles/legacy/02-select-and-print.css')

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
const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
const all = blocks(code)
const top = all.filter((b) => b.depth === 0)
const rule = (selector: string) => top.find((b) => norm(b.selector) === selector)
const reduceBlocks = all.filter((b) => norm(b.selector) === '@media (prefers-reduced-motion: reduce)')
const reducedSelectors = reduceBlocks.flatMap((b) =>
  blocks(b.body).filter((x) => x.depth === 0).flatMap((x) => x.selector.split(',').map(norm)),
)
const TOKEN_TIMING = /transition:[^;]*var\(--motion-slower\) var\(--ease-resize\)/

describe('day card fold: one hook, one clock', () => {
  const hook = TSX.slice(TSX.indexOf('function useFold('), TSX.indexOf('// React.memo on the timeline hot path'))

  it('commits the closed state and reads layout before the open class flips', () => {
    expect(hook).toContain('useLayoutEffect(')
    const read = hook.indexOf('document.documentElement.offsetHeight')
    const flip = hook.indexOf('setExpanded(true)')
    expect(read, 'no layout read in the hook').toBeGreaterThan(-1)
    expect(flip, 'no expanded flip in the hook').toBeGreaterThan(-1)
    expect(read).toBeLessThan(flip)
    // The two-rAF delay it replaced left a 40ms+ window in which the body was
    // mounted shut and no transition had a start; never return to it.
    expect(TSX).not.toMatch(/requestAnimationFrame\(\(\) => \{ raf2/)
  })

  it('mounts open without animating: both states start from the prop', () => {
    expect(hook).toMatch(/useState\(open\)[\s\S]*useState\(open\)/)
  })

  it('reverses a close on reopen instead of stranding the unmount timer', () => {
    // The cleanup of the closing effect clears the timer, and the reopen path
    // flips `expanded` again from the layout effect.
    expect(hook).toContain('return () => window.clearTimeout(t)')
    expect(hook).toMatch(/if \(!open \|\| !mounted \|\| expanded\) return/)
  })

  it('shares ONE fold between the cover strip and the body', () => {
    expect(TSX.match(/useFold\(open\)/g)?.length, 'the section and the idle own-fold wrapper').toBe(2)
    expect(TSX).toContain('const fold = useFold(open)')
    expect(TSX).toContain('fold={fold}')
    expect(TSX).toContain('{fold.mounted && (')
    expect(TSX).toContain('folded={!fold.expanded}')
    // The cover is no longer unmounted by the click itself.
    expect(TSX).not.toMatch(/\{!collapsed && <DayCover/)
  })
})

describe('day card fold: CSS on the one clock', () => {
  it('folds the cover strip and its top margin with the body', () => {
    const cover = rule('.day-cover')
    const folded = rule('.day-cover.is-folded')
    expect(cover?.body).toMatch(/transition:\s*height var\(--motion-slower\) var\(--ease-resize\), margin-top var\(--motion-slower\) var\(--ease-resize\)/)
    expect(folded?.body).toMatch(/height:\s*0/)
    // A 0-height strip that keeps its -16px margin pulls the header 16px up.
    expect(folded?.body).toMatch(/margin-top:\s*0/)
  })

  it('carries the header hairline and padding on the same fold', () => {
    const plain = rule('.day-section > .day-header')
    const covered = rule('.day-section > .day-cover + .day-header')
    expect(plain?.body).toMatch(/border-bottom:\s*0 dashed transparent/)
    for (const b of [plain, covered]) {
      expect(b?.body).toMatch(TOKEN_TIMING)
      expect(b?.body).toMatch(/padding-bottom var\(--motion-slower\) var\(--ease-resize\)/)
      expect(b?.body).toMatch(/border-bottom-width var\(--motion-slower\) var\(--ease-resize\)/)
    }
    expect(covered?.body).toMatch(/margin-top var\(--motion-slower\) var\(--ease-resize\)/)
  })

  it('keeps the chevron on the body token and easing', () => {
    expect(rule('.day-collapse-icon')?.body).toMatch(/transform var\(--motion-slower\) var\(--ease-resize\)/)
    expect(rule('.day-body-clip')?.body).toMatch(/grid-template-rows var\(--motion-slower\) var\(--ease-resize\)/)
  })

  it('fades the content after the shell moves, and before it on the way back', () => {
    const closing = rule('.day-body-clip-inner')?.body ?? ''
    const opening = rule('.day-body-clip.open .day-body-clip-inner')?.body ?? ''
    expect(closing).toMatch(/opacity:\s*0/)
    expect(closing).toMatch(/opacity var\(--motion-fast\) var\(--ease-paper\)/)
    expect(opening).toMatch(/opacity:\s*1/)
    expect(opening).toMatch(/opacity var\(--motion-med\) var\(--ease-paper\) var\(--motion-fast\)/)
  })

  it('spaces the body with a clipped spacer, not padding that floors the row', () => {
    expect(rule('.day-body-clip.open .day-body-clip-inner')?.body).not.toMatch(/padding-top/)
    expect(rule('.day-body-clip-inner::before')?.body).toMatch(/height:\s*var\(--space-7\)/)
  })

  it('restyles the badge only on an unfolded cover, so nothing pops at the unmount', () => {
    const badge = top.filter((b) => /day-badge/.test(b.selector) && /day-cover/.test(b.selector))
    expect(badge.length).toBeGreaterThan(0)
    for (const b of badge) expect(b.selector, b.selector).toContain('.day-cover:not(.is-folded) + .day-header')
  })

  it('opts every fold transition out under reduced motion', () => {
    for (const sel of ['.day-body-clip', '.day-body-clip-inner', '.day-cover', '.day-section > .day-header', '.day-section > .day-cover + .day-header']) {
      expect(reducedSelectors, `${sel} has no reduced-motion opt-out`).toContain(sel)
    }
  })

  it('uses motion tokens only: no raw time value in a fold rule', () => {
    const selectors = [
      '.day-cover', '.day-cover.is-folded', '.day-cover.is-folded .day-cover-tools', '.day-body-clip', '.day-body-clip-inner',
      '.day-body-clip.open .day-body-clip-inner', '.day-collapse-icon', '.day-section > .day-header', '.day-section > .day-cover + .day-header',
    ]
    for (const sel of selectors) {
      const b = rule(sel)
      expect(b, `${sel} is missing`).toBeDefined()
      // `0s` is the visibility hold's own duration and is allowed.
      const raw = (b?.body ?? '').match(/(?<![\w.-])(?:\d*\.)?\d+m?s\b/g)?.filter((t) => t !== '0s') ?? []
      expect(raw, `${sel} has a raw time value`).toEqual([])
    }
  })
})
