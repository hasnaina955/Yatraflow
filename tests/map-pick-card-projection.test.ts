// ============ MapPickCard projected-fact proof (#08 L2) ============
// Server-renders the REAL card export with the real providers. No DOM is
// needed. MapPickCard's clock hook has a deterministic server snapshot.
// Known-bad expectations prove a projected null never falls back to a computed
// visit, and projected actions can only remove an existing control.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapPickCard } from '../src/components/map/MapWorkspaceChrome'
import { intendedVisitMinutes, hoursDisplayFor, visitDateForDay } from '../src/lib/hoursContext'
import type { Trip } from '../src/data/types'
import type { JourneyActions } from '../src/lib/journeyProjection'
import { makeHit } from './helpers/journeyProjectionFixture'

const trip = { startDate: '2026-11-06', days: [] } as unknown as Trip
const hit = makeHit({
  id: 'g-card',
  name: 'Card Cafe',
  placeId: 'g-card',
  source: 'google',
  category: 'cafe',
  rating: 4.6,
  ratingCount: 120,
})

const allowAll: JourneyActions = { preview: true, add: true, shortlist: true, vote: true, navigate: true }

const baseProps = {
  hit,
  trip,
  dayIndex: 0,
  detourMin: 12,
  reason: 'Breaks a 2 h drive',
  added: false,
  editable: true,
  busy: false,
  shortlisted: false,
  onAdd: () => {},
  onShortlist: () => {},
  onClose: () => {},
  onDirections: () => {},
}

function render(overrides: Partial<Parameters<typeof MapPickCard>[0]> = {}): string {
  const props = { ...baseProps, ...overrides } as Parameters<typeof MapPickCard>[0]
  return renderToStaticMarkup(createElement(MapPickCard, props))
}

describe('projected facts on the card', () => {
  it('shows the row visit, budget share, source and freshness', () => {
    const html = render({
      visitMin: 25,
      budgetSharePct: 27,
      source: 'google',
      freshness: 'retained',
      actions: allowAll,
      arriveMin: 770,
    })
    expect(html).toContain('25 min')
    expect(html).toContain('27% of budget')
    expect(html).toContain('Google Places')
    expect(html).toContain('Retained result')
    expect(html).toContain('+12 min')
    expect(html).not.toContain('Unknown')
  })

  it('hides a projected unknown visit instead of printing a guess', () => {
    const fallback = intendedVisitMinutes(hit)
    const html = render({ visitMin: null, actions: allowAll })
    expect(html).not.toContain('<dt>Visit</dt>')
    expect(html).not.toContain('Unknown')
    // Known-bad control: the old unconditional fallback would print this number.
    expect(html).not.toContain(`${fallback} min`)
  })

  it('keeps a projected unknown source and freshness truthful', () => {
    const html = render({ source: null, freshness: 'unknown', actions: allowAll })
    expect(html).toContain('Source not supplied')
    expect(html).toContain('Freshness unknown')
  })

  it('uses the projected arrival in the existing hours note', () => {
    const dated = makeHit({
      id: 'g-hours',
      name: 'Hours Cafe',
      placeId: 'g-hours',
      source: 'google',
      category: 'cafe',
      hours: { basis: 'pattern', pattern: [{ startDay: 5, startMin: 540, endMin: 1020 }] },
    })
    const date = visitDateForDay(trip.startDate, 0)
    const late = hoursDisplayFor(dated, { date, arrivalMin: 1080, visitMin: 25 }).note
    expect(late).toBeTruthy()
    const html = render({ hit: dated, arriveMin: 1080, visitMin: 25, actions: allowAll })
    expect(html).toContain(late!)
  })
})

describe('projected actions only restrict the existing controls', () => {
  it('disables add, shortlist and directions when the row withholds them', () => {
    const html = render({
      actions: { preview: false, add: false, shortlist: false, vote: false, navigate: false },
    })
    expect((html.match(/disabled=""/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(html).toMatch(/disabled=""[^>]*>[\s\S]{0,900}Add to Day 1/)
    expect(html).toMatch(/disabled=""[^>]*>[\s\S]{0,900}View place in Google Maps/)
  })

  it('leaves the controls enabled for an allowing row', () => {
    const html = render({ actions: allowAll })
    expect(html).toMatch(/<button[^>]*class="btn btn-primary"(?![^>]*disabled)[^>]*>[\s\S]{0,900}Add to Day 1/)
    expect(html).toMatch(/<button[^>]*class="mv2-directions"(?![^>]*disabled)[^>]*>/)
  })
})

describe('the unprojected search pin keeps its prior path', () => {
  it('uses the existing computed visit and shows no projected labels', () => {
    const html = render()
    expect(html).toContain(`${intendedVisitMinutes(hit)} min`)
    expect(html).not.toContain('% of budget')
    expect(html).not.toContain('Freshness')
    expect(html).toMatch(/<button[^>]*class="btn btn-primary"(?![^>]*disabled)[^>]*>/)
  })

  it('keeps the viewer note for a non-editable pin', () => {
    const html = render({ editable: false })
    expect(html).toContain('Editing is available to its planners.')
    expect(html).not.toContain('Add to a day')
  })
})
