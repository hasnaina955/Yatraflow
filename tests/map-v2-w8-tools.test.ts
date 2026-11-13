import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const tsx = readFileSync(new URL('../src/components/TripMap.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const css = readFileSync(new URL('../src/styles/components/map-v2-rail.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// The workspace branch runs from the ternary to the legacy branch.
function workspaceBranch(): string {
  const start = tsx.indexOf('{workspaceChrome ? (')
  const end = tsx.indexOf(') : (', start)
  return start >= 0 && end > start ? tsx.slice(start, end) : ''
}

describe('W8 tools map controls', () => {
  it('keeps primary tools in a column and secondary tools in menus', () => {
    const b = workspaceBranch()
    expect(b.length).toBeGreaterThan(0)
    expect(b).toContain('aria-label="Zoom and recentre"')
    expect(b).toContain('mv2-map-tools-card--mode')
    expect(b).toContain('aria-label="More map tools"')
    expect(b).toContain('aria-label="Layers"')
  })

  it('keeps the zoom buttons and their labels', () => {
    const b = workspaceBranch()
    expect(b).toContain('aria-label="Zoom in"')
    expect(b).toContain('aria-label="Zoom out"')
  })

  it('shows short mode text', () => {
    expect(workspaceBranch()).toContain("'TER'")
  })

  it('drops the Filters text label', () => {
    expect(workspaceBranch()).not.toContain('>Filters')
  })

  it('keeps the filters menu behind the layers button', () => {
    const b = workspaceBranch()
    expect(b).toContain('aria-expanded={filtersOpen}')
    expect(b).toContain('map-filters-pop')
    expect(b).toContain('aria-label="Filter nearby ideas by type"')
  })

  it('keeps every old aria-label', () => {
    const b = workspaceBranch()
    for (const label of [
      'Recentre the map on the trip route',
      'Show or hide the road milestones',
      'Directions for this day in Google Maps',
      'Expand the map to fill the screen',
    ]) expect(b).toContain(label)
  })

  it('divides the buttons with a hairline', () => {
    expect(workspaceBranch()).toContain('mv2-map-tools-divider')
    expect(css).toContain('.mv2-workspace .mv2-map-tools-divider')
  })

  it('uses a teal wash, not a filled circle', () => {
    expect(css).toMatch(/\.mv2-workspace \.mv2-map-tools-card button\.mv2-map-tools-btn\.on,[\s\S]{0,240}var\(--pw-lagoon-100\)/)
    expect(css).toContain('var(--pw-sea-700)')
  })

  it('keeps a 44 px touch target on phone', () => {
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]{0,400}width: 44px; height: 44px/)
  })
})
