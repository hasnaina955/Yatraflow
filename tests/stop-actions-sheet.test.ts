// ============ Phone stop actions sheet (#1052) ============
// One sheet replaces the ⋯ popover at phone widths. These pin the structure a
// screen reader gets, the read-only case, the reorder ends and the remove to
// undo path. The desktop disclosure stays unchanged in DaySection.
import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { StopActionsSheet, stopSheetHandlers, type StopActionsSheetProps } from '../src/components/StopActionsSheet'
import { removeStopWithUndo, type ApplyChange } from '../src/lib/mutationLifecycle'
import type { Trip, ItineraryStop } from '../src/data/types'

const undoToasts = vi.hoisted(() => [] as Array<{ msg: string; run: () => void }>)
vi.mock('../src/components/ui', async importOriginal => ({
  ...await importOriginal<typeof import('../src/components/ui')>(),
  toast: () => {},
  undoToast: (msg: string, run: () => void) => { undoToasts.push({ msg, run }) },
}))

function props(over: Partial<StopActionsSheetProps> = {}): StopActionsSheetProps {
  return {
    open: true,
    onClose: () => {},
    stopTitle: 'KDHP Tea Museum',
    dayNumber: 2,
    timeLabel: '9:00 AM – 10:30 AM',
    stopNumber: 2,
    stopCount: 5,
    status: 'confirmed',
    otherDayNumbers: [1, 3, 4],
    editable: true,
    isFirst: false,
    isLast: false,
    onEdit: () => {},
    onStatus: () => {},
    onStatusPreview: () => {},
    onMove: () => {},
    onReorderUp: () => {},
    onReorderDown: () => {},
    onShowOnMap: () => {},
    onRemove: () => {},
    ...over,
  }
}
const markup = (over: Partial<StopActionsSheetProps> = {}) =>
  renderToStaticMarkup(createElement(StopActionsSheet, props(over)))

const ACTIONS = [
  'Edit details', 'Move to another day', 'Reorder in Day 2',
  'Show on the map', 'Remove from Day 2',
]

function tripFixture(): Trip {
  const stop: ItineraryStop = {
    id: 's1', title: 'Top Station', category: 'sightseeing', locationName: 'Munnar',
    lat: 10.1, lng: 77.2, description: '', notes: '', visitMinutes: 60,
    openTime: '', closeTime: '', entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', sourceUrl: '', status: 'confirmed', orderInDay: 1,
  }
  return {
    id: 't1', name: 'T', startLocation: 'Home',
    startLocationCoords: { lat: 10, lng: 77 },
    destinations: ['Base'], destinationCoords: [{ lat: 10.2, lng: 77.1 }],
    startDate: '2026-11-15', endDate: '2026-11-17', travellers: 2,
    transportMode: 'car', roundTrip: false, budgetPerPersonInr: 30000,
    travelStyle: 'balanced', fixedCommitments: [],
    days: [{ id: 'd0', index: 0, title: 'Day 1', stops: [stop] }] as Trip['days'],
    expenses: [], coverEmoji: '🚗', visibility: 'private', createdAt: 0, updatedAt: 0,
  }
}

describe('the phone stop actions sheet', () => {
  it('renders the status group, the actions and a close button', () => {
    const html = markup()
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('role="radiogroup"')
    for (const status of ['Confirmed', 'Maybe', 'Needs booking']) expect(html, status).toContain(status)
    expect(html).toContain('aria-checked="true"')
    for (const action of ACTIONS) expect(html, action).toContain(action)
    expect(html).toContain('aria-label="Close stop actions"')
    expect(html).toContain('Day 1, 3, 4')
    expect(html).toContain('You see the impact first, and you can undo it.')
    expect(html).toContain('KDHP Tea Museum')
  })

  it('gives a read-only viewer no editable control', () => {
    const html = markup({ editable: false })
    expect(html).toContain('aria-label="Close stop actions"')
    expect(html).not.toContain('role="radio"')
    for (const action of ACTIONS) expect(html, action).not.toContain(action)
  })

  it('disables reorder up on the first stop and down on the last', () => {
    const first = markup({ isFirst: true })
    expect(first).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move KDHP Tea Museum earlier"/)
    expect(first).not.toMatch(/disabled=""[^>]*aria-label="Move KDHP Tea Museum later"/)
    const last = markup({ isLast: true })
    expect(last).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move KDHP Tea Museum later"/)
    expect(last).not.toMatch(/disabled=""[^>]*aria-label="Move KDHP Tea Museum earlier"/)
  })

  it('removes through the shared path that leaves an Undo', () => {
    const onRemove = vi.fn()
    const onClose = vi.fn()
    const handlers = stopSheetHandlers(props({ onRemove }), onClose)
    handlers.remove()
    expect(onRemove).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()

    // The sheet's onRemove is TimelineTab's handleDelete: it stages through
    // removeStopWithUndo, whose Keep callback is the Undo toast.
    undoToasts.length = 0
    const applyChange = vi.fn() as unknown as ApplyChange
    const outcome = removeStopWithUndo({ trip: tripFixture(), stopId: 's1', dayIndex: 0, applyChange })
    expect(outcome).toBe('staged-undo')
    expect(undoToasts).toHaveLength(0)
    const kept = (applyChange as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][3] as () => void
    kept()
    expect(undoToasts).toHaveLength(1)
    expect(undoToasts[0].msg).toContain('Top Station')
  })

  it('stages a phone status change through the preview, not the direct write', () => {
    const onStatus = vi.fn()
    const onStatusPreview = vi.fn()
    const onClose = vi.fn()
    const handlers = stopSheetHandlers(props({ onStatus, onStatusPreview }), onClose)
    handlers.status('confirmed')
    expect(onStatusPreview).toHaveBeenCalledOnce()
    expect(onStatusPreview).toHaveBeenCalledWith('confirmed')
    expect(onStatus).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('keeps the desktop disclosure and routes the phone trigger to the sheet', () => {
    const day = readFileSync(new URL('../src/pages/trip/timeline/DaySection.tsx', import.meta.url), 'utf8')
    const tab = readFileSync(new URL('../src/pages/trip/TimelineTab.tsx', import.meta.url), 'utf8')
    const workspace = readFileSync(new URL('../src/pages/TripWorkspace.tsx', import.meta.url), 'utf8')
    expect(day).toContain('className="icon-btn stop-more-phone"')
    expect(day).toContain('phoneSheet && editable && sheet && sheetStop && (')
    expect(day).toContain('open={sheet.open}')
    expect(day).toContain('onClose={closeSheet}')
    expect(day).toContain('onRemove={() => onDelete(sheetStop.id, day.index)}')
    expect(day).toContain("const PHONE_SHEET_QUERY = '(max-width: 720px)'")
    expect(day).toMatch(/useMedia\(PHONE_SHEET_QUERY,\s*typeof window !== 'undefined' && \(window\.matchMedia\?\.\(PHONE_SHEET_QUERY\)\.matches \?\? false\)\)/)
    expect(tab).toContain('onShowOnMap={handleShowOnMap}')
    expect(day).toContain('onStatusPreview={onStatusPreview ? status => onStatusPreview(sheetStop, status) : undefined}')
    expect(tab).toContain('onStatusPreview={handleStatusWithPreview}')
    // The phone path stages an 'edit' through applyChange; the desktop path
    // keeps its direct group-signal write untouched.
    const preview = tab.slice(tab.indexOf('const handleStatusWithPreview'), tab.indexOf('// --- Plan / Inspect'))
    expect(preview).toContain('applyChange(draft => {')
    expect(preview).toContain("}, 'edit', day.index, () => {")
    expect(preview).not.toContain('setStopStatus')
    const desktop = tab.slice(tab.indexOf('const handleStatus ='), tab.indexOf('const handleStatusWithPreview'))
    expect(desktop).toContain('setStopStatus(trip.id, status, stop.id)')
    expect(workspace).toContain('onOpenMap={openMap}')
  })
})
