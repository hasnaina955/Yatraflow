// The day's time bar must split halts out of the dwell total, and must never
// draw a segment the simulation has no number for.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const day = readFileSync(new URL('../src/pages/trip/timeline/DaySection.tsx', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8')

describe('the day time bar draws only measured segments', () => {
  it('splits halts out of the dwell total using the journey point kind', () => {
    expect(day).toMatch(/p\.kind === 'halt'/)
    expect(day).toMatch(/const budgetHalts = Math\.min\(budgetDwell,/)
    expect(day).toMatch(/const budgetStops = Math\.max\(0, budgetDwell - budgetHalts\)/)
  })

  // The bar originally had no waiting segment, because the simulation keeps no
  // separate "waiting" total. That was half right: no total existed, but the
  // fixed-time read model already computes `spareMin` per commitment — the same
  // number the rail prints as "At the jetty with 55 min to spare". So the
  // segment is real data, and it must come from `waitingMinutesFor`, which
  // walks the commitments in time order so two spares cannot double-count.
  it('draws the waiting segment from the fixed-time read model, never from a sum of spares', () => {
    expect(day).toMatch(/waitingMinutesFor\(fixedRows\)/)
    expect(day).not.toMatch(/reduce\(\(sum, r\) => sum \+ Math\.max\(0, r\.spareMin/)
    expect(day).toMatch(/\{ cls: 'db-wait', minutes: budgetWait \}/)
    expect(day).toMatch(/\{budgetWait > 0 && <span><i className="db-dot db-wait"/)
  })

  it('gives the waiting segment its own theme token in both themes', () => {
    // The file carries several dark blocks, so assert on the declarations
    // themselves: the light amber, then the lifted dark one.
    expect(tokens).toMatch(/--pw-time-wait:\s*#F2A33A/)
    expect(tokens).toMatch(/--pw-time-wait:\s*#F5B04E/)
    const css = readFileSync(new URL('../src/styles/legacy/02-select-and-print.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.db-wait\s*\{\s*background:\s*var\(--pw-time-wait\)/)
  })

  it('draws the halt segment and its key only when a halt exists', () => {
    expect(day).toMatch(/\{ cls: 'db-halt', minutes: budgetHalts \}/)
    expect(day).toMatch(/\{budgetHalts > 0 && <span><i className="db-dot db-halt"/)
  })

  it('keeps the segments summing to the day window', () => {
    expect(day).toMatch(/const budgetFree = Math\.max\(0, budgetWindow - budgetDrive - budgetDwell - budgetWait\)/)
  })
})

describe('the ribbon route line stays visible in both themes', () => {
  // The line is a 3px rule on the shell. The dark surface colour (#2D5E58) is a
  // card-border value and measures 2.1:1 on the dark shell, so the dark theme
  // carries its own lighter mint; light falls back to --pw-route (#9FD9CF).
  it('falls back to the artboard mint when the theme has no line colour', () => {
    const css = readFileSync(new URL('../src/styles/legacy/02-select-and-print.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.tl-ribbon-line\s*\{[^}]*background:\s*var\(--pw-route-line,\s*var\(--pw-route\)\)/)
  })

  it('overrides the line colour in the dark theme', () => {
    const dark = tokens.slice(tokens.indexOf('[data-theme=\'dark\']'))
    expect(dark).toMatch(/--pw-route-line:\s*#7FC3B6/)
  })
})
