// ============ The recorded-traffic chart's readout ============
// The chart is the hub's signature component, and its readout is the only way to
// read a single day off the drawing. Three defects lived in six lines of it, and
// all three were invisible from a mouse: a tap latched the readout with no way to
// release it, a window change silently re-labelled the latched day, and the
// keyboard path announced nothing at all.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const chart = readFileSync(new URL('../src/components/TrendChart.tsx', import.meta.url), 'utf8')

describe('the trend chart readout', () => {
  it('lets a tap release the readout it latched', () => {
    // A tap HAS to latch — a finger has no hover, and clearing on lift would make
    // the panel unusable on a phone. But `onPointerLeave` is mouse-only by design
    // and Escape is not a key a phone has, so the second tap on the same day is the
    // only dismissal a finger gets.
    expect(chart).toContain('latchPointer')
    expect(chart).toMatch(/e\.pointerType !== 'mouse' && current !== null && current\.label === label && current\.index === i/)
    expect(chart).toContain('onPointerDown={latchPointer}')
    // ...and the mouse keeps plain tracking: it clears by leaving, and a click that
    // blanked the readout under the cursor would fight the hover it already uses.
    expect(chart).toContain('onPointerMove={trackPointer}')
    expect(chart).toMatch(/if \(e\.pointerType === 'mouse'\) setLatch\(null\)/)
  })

  it('starts a new window clean instead of re-labelling the latched day', () => {
    // An index names a different day in a different window: 364 visits at index 40
    // of ninety days is not 42 visits at index 40 of seven. The latch therefore
    // CARRIES its window and goes unreadable once the two disagree — clearing it in
    // an effect would be a setState in an effect body, and would cost a render to
    // undo something a comparison already prevents.
    expect(chart).toMatch(/const \[latch, setLatch\] = useState<\{ label: string; index: number \} \| null>\(null\)/)
    expect(chart).toMatch(/latch !== null && latch\.label === label && !quiet \? latch\.index : null/)
    expect(chart).not.toMatch(/useEffect/)
  })

  it('announces the day the keyboard is on', () => {
    // The svg's `aria-label` describes the WINDOW totals, so before this the arrow
    // keys moved a silent index while the label went on describing other numbers —
    // focus on the chart, then a static description of a different week.
    expect(chart).toMatch(/role="status" aria-atomic="true"/)
    expect(chart).toContain('activeSpoken')
    expect(chart).toContain('sr-only')
    // Labelled like the tooltip, NOT pluralised into a sentence: the sentence form
    // reads "1 forks" for a single fork, which is the small wrongness the hub's own
    // `unit` helper exists to stop. Scoped to the spoken line — the svg's own
    // `aria-label` legitimately says "${totalViews} visits, ${totalForks} forks".
    const spokenLine = chart.split('\n').find(line => line.includes('const activeSpoken')) ?? ''
    expect(spokenLine).toContain('Visits:')
    expect(spokenLine).not.toContain(' visits, ')
  })
})
