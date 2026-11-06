// ============ Timeline phone FAB / day-fold collision guard ============
// The fixed Add pill sits at the card's bottom-right. On a phone the day fold
// control must stay on the card's leading edge so the pill cannot cover its
// pointer target. This is a source/CSS regression guard; the browser hit-test
// proof is recorded in the repair report.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../src/', import.meta.url)
const entry = readFileSync(new URL('styles.css', root), 'utf8')
const legacy = readFileSync(new URL('styles/legacy/02-select-and-print.css', root), 'utf8')

describe('phone timeline fold control vs floating Add', () => {
  it('keeps the day fold on the leading edge under the phone media query', () => {
    expect(entry).toMatch(/@media \(max-width: 720px\)\s*\{[\s\S]*?\.day-header > \.day-collapse\s*\{[\s\S]*?order:\s*0;[\s\S]*?margin-inline-start:\s*0;/)
    expect(entry).toMatch(/margin-inline-end:\s*var\(--space-2\)/)
  })

  it('does not disable or hide either affordance', () => {
    expect(legacy).toMatch(/\.tl-add-fab\s*\{[\s\S]*?position:\s*fixed;/)
    expect(legacy).toContain('.tl-add-fab { display: flex; }')
    expect(legacy).toMatch(/\.day-header > \.day-collapse \{ order: 2; margin-inline-start: auto; \}/)
  })
})
