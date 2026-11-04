// Profile page structure (P9, Stage B). These are static checks on the shipped
// source. The page root and header follow the catalog pattern. The panels and
// the choice rows use the shared components. The feature gate and the save
// handlers keep their shape.
//
// Updated for the Profile layout foundation: the page is now the artboard's
// three columns (rail / form / supporting rail) with ten anchored sections.
// Every check below still asserts the same intent it always did — the shared
// Surface skin, one h2 per panel, FilterChip for both choice rows, no static
// inline style, and the gate and handlers unchanged — against the new markup.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/pages/Profile.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('Profile: the page root and header follow the catalog pattern', () => {
  it('carries page-enter and yf-page on the root', () => {
    expect(src).toContain('<div className="container form-page yf-page page-enter prof-page">')
  })

  it('uses the shared PageHeader for the one serif h1 and has no raw h1', () => {
    expect(src).toContain('<PageHeader')
    expect(src).toContain("headline={{ lead: 'Profile & settings' }}")
    expect(src).not.toMatch(/<h1[\s>]/)
  })

  it('sets the trip count and the email as the header lede', () => {
    expect(src).toContain("lede={<>{tripCount} trip{tripCount !== 1 ? 's' : ''} · {me.email}</>}")
  })
})

describe('Profile: panels use the Surface skin with h2 titles', () => {
  it('renders each panel as a Surface and leaves no card class', () => {
    expect(src).toContain('<Surface className="prof-panel">')
    expect(src).not.toMatch(/className="card[" ]/)
  })

  it('titles each panel with an h2 through the shared panel head', () => {
    // The title moved into PanelHead, so the icon tile, heading and subtitle
    // share one recipe. It is still the page's one panel-title element.
    expect(src).toContain('title="Your details"')
    expect(src).toContain('<h2 className="prof-panel-title">{title}</h2>')
    // The one h3 is the native in-app inbox, a sub-block inside the
    // Notifications panel rather than a peer section.
    expect(src.match(/<h3[\s>]/g) ?? []).toHaveLength(1)
  })
})

describe('Profile: choice rows use FilterChip', () => {
  it('renders the travel styles on FilterChip', () => {
    expect(src).toContain('pressed={me.profile.travelStyles.includes(s)} onClick={() => toggleStyle(s)}')
  })

  it('renders the clock format on FilterChip', () => {
    expect(src).toContain('pressed={timeFormat === opt} onClick={() => setTimeFormat(opt)}')
  })

  it('keeps Chip for the status badges and no choice row', () => {
    expect(src).not.toMatch(/<Chip key=/)
  })
})

describe('Profile: inline styles stay only where the value is dynamic', () => {
  it('keeps the one read-state opacity inline and no static inline style', () => {
    expect(src.match(/style=\{\{/g) ?? []).toHaveLength(1)
    expect(src).toContain('style={{ opacity: n.read ? 0.6 : 1 }}')
  })
})

describe('Profile: the feature gate and the save handlers keep their shape', () => {
  it('keeps the AI-companion flag gate around the two settings cards', () => {
    expect(src).toContain('{AI_COMPANION_ENABLED && (')
  })

  it('keeps the creator-mode handler awaited and the travel-style toggle async', () => {
    expect(src).toContain('const r = await updateProfile({ isCreator: true })')
    expect(src).toContain('async function toggleStyle(s: TravelStyle) {')
  })
})
