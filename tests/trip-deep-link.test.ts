import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Strip comment lines so prose about the contract cannot impersonate it
 *  (§6x: a negative source assertion judges code, never comments). */
function codeOf(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
}

describe('featured next-step deep link — the CTA builds the address', () => {
  const list = codeOf('../src/pages/TripsList.tsx')

  it('the timeline route carries the step day as a query param', () => {
    expect(list).toMatch(/new URLSearchParams\(\{ day: String\(step\.dayIndex\) \}\)/)
    expect(list).toMatch(/\/timeline\?\$\{q\.toString\(\)\}/)
  })

  it('the stop rides the query only when the step names one', () => {
    expect(list).toMatch(/if \(step\.stopId\) q\.set\('stop', step\.stopId\)/)
  })
})

describe('featured next-step deep link — the workspace consumes it once', () => {
  const ws = codeOf('../src/pages/TripWorkspace.tsx')

  it('reads both params through currentQuery, never off the route string', () => {
    expect(ws).toMatch(/currentQuery\(\)\.get\('day'\)/)
    expect(ws).toMatch(/currentQuery\(\)\.get\('stop'\)/)
  })

  it('validates the day against THIS trip before arming (canFocusDay)', () => {
    expect(ws).toMatch(/canFocusDay\(focusDayRequest\(req\.dayIndex\), trip\)/)
  })

  it('arms the stop only when that day really holds it', () => {
    expect(ws).toMatch(/d\.stops\.some\(s => s\.id === stopId\)/)
  })

  it('hands the tab one-shot signals cleared through one consume', () => {
    expect(ws).toMatch(/focusStopId=\{timelineFocusStop\}/)
    expect(ws).toMatch(/onFocusConsumed=\{clearTimelineFocus\}/)
  })
})

describe('featured next-step deep link — the timeline lands on the stop', () => {
  const tab = codeOf('../src/pages/trip/TimelineTab.tsx')

  it('seeks the stop row by its data attribute and scrolls it to centre', () => {
    expect(tab).toMatch(/\[data-stop-id="\$\{CSS\.escape\(stopId\)\}"\]/)
    expect(tab).toMatch(/row\.scrollIntoView\(\{ behavior: scrollBehavior\(\), block: 'center' \}\)/)
  })

  it('flashes the row once and always clears the class', () => {
    expect(tab).toMatch(/row\.classList\.add\('tl-stop-flash'\)/)
    expect(tab).toMatch(/row\.classList\.remove\('tl-stop-flash'\)/)
  })

  it('runs the stop focus only under a validated day focus', () => {
    expect(tab).toMatch(/canFocusDay\(\{ dayIndex: focusDay \}, trip\)/)
    expect(tab).toMatch(/if \(focusStopId\) focusStopRow\(focusStopId\)/)
  })
})

describe('featured next-step deep link — the flash ring stays on the tokens', () => {
  const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8')

  it('animates the row through the motion tokens', () => {
    expect(css).toMatch(/\.tl-row\.tl-stop-flash \{\s*animation: yf-stop-flash var\(--motion-slower\) var\(--ease-out\)/)
  })

  it('carries the reduced-motion opt-out', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.tl-row\.tl-stop-flash \{\s*animation: none;/)
  })
})
