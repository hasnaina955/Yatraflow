// ============ Map v2 package G: the edit cards, rendered ============
// Server render only: the project's tests run in node with no DOM. These checks
// pin the honest states: unknown stays unknown, a failed save is an alert, and
// only a kept outcome offers Undo.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { seedData } from '../src/data/seed'
import type { Trip } from '../src/data/types'
import { AddPreviewCard, FixedTimeConfirm, StopEditorCard } from '../src/pages/trip/map/editing/EditCards'
import { previewAdd } from '../src/pages/trip/map/editing/addPreview'
import { outcomeFromKeep } from '../src/pages/trip/map/editing/outcomes'

const trip = structuredClone(seedData.trips[0]) as Trip
const a = trip.days[0].stops[0]
const b = trip.days[0].stops[1]
const ready = previewAdd({
  trip, dayIndex: 0, insertAt: 1,
  stop: {
    id: 'st_card', title: 'Card pick', category: 'sightseeing', locationName: 'x', lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2,
    visitMinutes: 45, entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'nice-to-have', status: 'suggested', orderInDay: 2,
  },
})
const noop = () => undefined
const render = (props: Partial<Parameters<typeof AddPreviewCard>[0]> = {}) =>
  renderToStaticMarkup(createElement(AddPreviewCard, { preview: ready, onKeep: noop, onReject: noop, ...props }))

describe('AddPreviewCard', () => {
  it('shows the order, the new road, the old and new clocks and the unknown facts', () => {
    const html = render()
    expect(html).toContain('Add as stop 2')
    expect(html).toContain('Card pick')
    expect(html).toContain('estimate')
    expect(html).toContain('<s>')
    expect(html).toContain('Opening hours are not known.')
    expect(html).toContain('Admission price is not known.')
  })
  it('says why a preview is unknown and offers no Add button', () => {
    const html = renderToStaticMarkup(createElement(AddPreviewCard, {
      preview: previewAdd({ trip, dayIndex: 0, stop: { ...a, id: 'z' }, insertAt: null }), onKeep: noop, onReject: noop,
    }))
    expect(html).toContain('road order for this place is not known')
    expect(html).not.toContain('map-edit-keep')
  })
  it('disables both buttons while saving', () => {
    const html = render({ busy: true })
    expect(html).toContain('aria-busy="true"')
    expect(html.match(/disabled=""/g)?.length).toBe(2)
  })
  it('shows a failed save as an alert and keeps the Add button', () => {
    const html = render({ outcome: outcomeFromKeep({ kind: 'unavailable' }) })
    expect(html).toContain('role="alert"')
    expect(html).toContain('map-edit-keep')
    expect(html).not.toContain('map-edit-undo')
  })
  it('offers Undo only after a kept outcome', () => {
    const kept = render({ outcome: outcomeFromKeep({ kind: 'acknowledged', revision: 'r', writeVersion: 1 }), canUndo: true, onUndo: noop })
    expect(kept).toContain('map-edit-undo')
    expect(kept).not.toContain('map-edit-keep')
    expect(render({ canUndo: true, onUndo: noop })).not.toContain('map-edit-undo')
  })
})

describe('StopEditorCard and FixedTimeConfirm', () => {
  const editor = (over: Partial<Parameters<typeof StopEditorCard>[0]> = {}) => renderToStaticMarkup(createElement(StopEditorCard, {
    title: 'Lunch', clockLabel: '12:05–12:50', visitMinutes: 45, days: [{ index: 1, label: 'Day 2' }], fixed: false,
    onStep: noop, onMoveToDay: noop, onSwap: noop, onRemove: noop, ...over,
  }))
  it('renders the 15-minute stepper, move, swap and remove', () => {
    const html = editor()
    expect(html).toContain('Shorten by 15 minutes')
    expect(html).toContain('45 min')
    expect(html).toContain('Move to day')
    expect(html).toContain('Swap')
    expect(html).toContain('Remove')
  })
  it('keeps an unknown stay length unknown and disables the stepper', () => {
    const html = editor({ visitMinutes: null, clockLabel: null })
    expect(html).toContain('Not known')
    expect(html).toContain('Clock not known')
    expect(html.match(/disabled=""/g)?.length).toBe(2)
  })
  it('explains a fixed-time stop and asks before it moves', () => {
    expect(editor({ fixed: true })).toContain('fixed time')
    const none = renderToStaticMarkup(createElement(FixedTimeConfirm, { guard: { fixedStopIds: [], touched: [], needsConfirm: false }, onConfirm: noop, onCancel: noop }))
    expect(none).toBe('')
    const html = renderToStaticMarkup(createElement(FixedTimeConfirm, {
      guard: { fixedStopIds: ['s'], needsConfirm: true, touched: [{ stopId: 's', title: 'Boat', commitTitle: 'Periyar boat', commitTime: '15:00', from: '14:10', to: '14:40', change: 'moves' }] },
      onConfirm: noop, onCancel: noop,
    }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('14:10')
    expect(html).toContain('Change it anyway')
  })
})
