// ============ Map V2 shell: phone sheet layout rules (package B) ============
//
// Package B keeps the sheet, the ribbon and the map tools apart at 320 and 390.
// A node test cannot measure a box, so this pins the rules the browser proof
// measured: the snap heights, the docked ribbon, the 44px floor and the tokens.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(root, 'src', 'styles.css'), 'utf8').replace(/\r\n/g, '\n')
const block = css.slice(css.indexOf('/* Map V2 shell, package B.'))

describe('package B block', () => {
  it('is appended at the end of the stylesheet', () => {
    expect(block.length).toBeGreaterThan(200)
    expect(css.indexOf('/* Map V2 shell, package B.')).toBe(css.lastIndexOf('/* Map V2 shell, package B.'))
  })

  it('keeps half below the ribbon and full below the map tools toggle', () => {
    expect(block).toContain("[data-snap='half'] { --mv2-sheet-height: min(60%, 480px, calc(100% - 248px)); }")
    expect(block).toContain("[data-snap='full'] { --mv2-sheet-height: calc(100% - 184px); }")
  })

  it('keeps the full sheet ribbon in flow and drops the handle offset', () => {
    expect(css).not.toContain('var(--mv2-lens-ribbon-h)')
    expect(css).not.toContain('margin-bottom: 192px')
    expect(css).toContain('.mv2-workspace .poi-col > .mv2-ribbon-sheet,')
    expect(css).toMatch(/\.mv2-workspace \.mv2-detail > \.mv2-ribbon-sheet \{[^}]*position: static/)
  })

  it('holds every control it touches to 44px', () => {
    expect(block).toContain('.mv2-itinerary .mv2-fold-day::before { content: ""; position: absolute; inset: -8px;')
    expect(block).toContain('.mv2-workspace .mv2-directions { min-height: 44px; }')
    expect(block).toContain('.mv2-workspace .mv2-phone-day > button { min-width: 44px; min-height: 44px; }')
  })

  it('uses no raw duration', () => {
    expect(block).not.toMatch(/\d(ms|s)\b/)
  })
})

describe('the sheet motion', () => {
  it('moves the sheet and the ribbon on motion tokens', () => {
    expect(css).toMatch(/\.poi-col, \.mv2-workspace \.mv2-detail \{[^}]*transition: height var\(--motion-med\) var\(--ease-resize\)/)
    expect(css).toMatch(/\.mv2-workspace \.mv2-ribbon \{[^}]*transition: bottom var\(--motion-med\) var\(--ease-resize\)/)
  })

  it('turns every workspace transition off for reduced motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n  \.mv2-workspace \*, \.mv2-workspace \*::before, \.mv2-workspace \*::after \{ transition: none; animation: none;/)
  })
})
