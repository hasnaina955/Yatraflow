import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Trip } from '../src/data/types'
import {
  WORKSPACE_TABS,
  foldWorkspaceHeader,
  resolveMapFocus,
  resolveTimelineFocus,
  tripHeaderCover,
  workspacePanelId,
  workspaceTabId,
} from '../src/lib/workspaceHeader'

function tripFixture(): Trip {
  return {
    id: 'trip-1',
    coverEmoji: '🏔️',
    days: [
      { id: 'day-0', index: 0, stops: [{ id: 'stop-a', lat: 22.5, lng: 88.3 }] },
      { id: 'day-1', index: 1, stops: [{ id: 'stop-b', lat: 23, lng: 89 }] },
      { id: 'day-2', index: 2, stops: [{ id: 'stop-without-place', lat: 0, lng: 0 }] },
    ],
  } as Trip
}

function codeOf(path: string): string {
  return readFileSync(resolve(__dirname, path), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n')
}

describe('P2 workspace header rules', () => {
  it('folds only the Board and Map tabs', () => {
    expect(WORKSPACE_TABS.filter(([key]) => foldWorkspaceHeader(key)).map(([key]) => key))
      .toEqual(['board', 'map'])
  })

  it('keeps one stable tab and panel id for every tab', () => {
    expect(WORKSPACE_TABS.map(([key]) => workspaceTabId(key))).toEqual([
      'tab-overview', 'tab-board', 'tab-map', 'tab-timeline',
      'tab-group', 'tab-budget', 'tab-share', 'tab-settings',
    ])
    expect(WORKSPACE_TABS.map(([key]) => workspacePanelId(key))).toEqual([
      'panel-overview', 'panel-board', 'panel-map', 'panel-timeline',
      'panel-group', 'panel-budget', 'panel-share', 'panel-settings',
    ])
  })

  it('uses the approved cover order', () => {
    expect(tripHeaderCover({ coverImageUrl: 'https://img.test/cover.jpg', coverEmoji: '🏔️' }))
      .toEqual({ kind: 'image', url: 'https://img.test/cover.jpg' })
    expect(tripHeaderCover({ coverImageUrl: '  ', coverEmoji: '🏔️' }))
      .toEqual({ kind: 'emoji', emoji: '🏔️' })
    expect(tripHeaderCover({ coverImageUrl: '', coverEmoji: '' })).toEqual({ kind: 'art' })
  })
})

describe('workspace focus targets', () => {
  const trip = tripFixture()

  it('validates a day and keeps a stop only when it belongs to that day', () => {
    expect(resolveTimelineFocus(trip, { dayIndex: 1, stopId: 'stop-b' }))
      .toEqual({ dayIndex: 1, stopId: 'stop-b', block: null })
    expect(resolveTimelineFocus(trip, { dayIndex: 0, stopId: 'stop-b' }))
      .toEqual({ dayIndex: 0, stopId: null, block: null })
    expect(resolveTimelineFocus(trip, { dayIndex: 99 }))
      .toEqual({ dayIndex: null, stopId: null, block: null })
  })

  it('finds the day for a stop-only request', () => {
    expect(resolveTimelineFocus(trip, { stopId: 'stop-b' }))
      .toEqual({ dayIndex: 1, stopId: 'stop-b', block: null })
  })

  it('maps the trip-wide target without inventing a day', () => {
    expect(resolveTimelineFocus(trip, { block: 'trip-wide' }))
      .toEqual({ dayIndex: null, stopId: null, block: 'trip-wide' })
  })

  it('selects the day for a map stop and clears it for a point or bounds target', () => {
    expect(resolveMapFocus(trip, { kind: 'stop', stopId: 'stop-b' }))
      .toEqual({ dayIndex: 1, target: { kind: 'stop', stopId: 'stop-b' } })
    expect(resolveMapFocus(trip, { kind: 'coordinate', coordinate: { lat: 22.5, lng: 88.3 } }))
      .toEqual({ dayIndex: null, target: { kind: 'coordinate', coordinate: { lat: 22.5, lng: 88.3 } } })
    expect(resolveMapFocus(trip, { kind: 'bounds', points: [{ lat: 22.5, lng: 88.3 }, { lat: 23, lng: 89 }] }).dayIndex)
      .toBeNull()
  })

  it('rejects a map target that names no stop on this trip', () => {
    expect(resolveMapFocus(trip, { kind: 'stop', stopId: 'missing' }))
      .toEqual({ dayIndex: null, target: null })
  })

  it('opens the day but sends no camera target for a stop without a place', () => {
    expect(resolveMapFocus(trip, { kind: 'stop', stopId: 'stop-without-place' }))
      .toEqual({ dayIndex: 2, target: null })
  })
})

describe('the workspace markup consumes the rules', () => {
  const ws = codeOf('../src/pages/TripWorkspace.tsx')

  it('wraps the header and tabs in yf-page without putting it on the container', () => {
    expect(ws).toContain('className="yf-page"')
    expect(ws).toContain('className="container page-enter yf-workspace"')
  })

  it('shows one invite action behind the editable gate', () => {
    const invites = ws.match(/\{editable && \(\s*<button[\s\S]{0,180}>Invite & share<\/button>/g) ?? []
    expect(invites).toHaveLength(1)
  })

  it('gives every tab its stable controls id', () => {
    expect(ws).toContain('id: workspaceTabId(key)')
    expect(ws).toContain('controls: workspacePanelId(key)')
  })

  it('publishes the fold state on the workspace container and page wrapper', () => {
    expect(ws).toMatch(/<div className="container page-enter yf-workspace" data-wide=\{headerFolded \? 'true' : 'false'\}>/)
    expect(ws).toMatch(/<div className="yf-page" data-compact=\{headerFolded \? 'true' : 'false'\}>/)
  })

  it('makes folded content inert after focus moves to the active tab', () => {
    expect(ws).toContain('<div className="yf-extra" ref={headerExtraRef}>')
    expect(ws).toMatch(/const \[headerExtraInert, setHeaderExtraInert\] = useState\(false\)/)
    expect(ws).toMatch(/extra\.contains\(active\)[\s\S]{0,220}workspaceTabId\(tab\)\)\?\.focus\(\)[\s\S]{0,100}setHeaderExtraInert\(true\)/)
    expect(ws).toMatch(/if \(headerExtraRef\.current\) headerExtraRef\.current\.inert = headerExtraInert/)
  })

  it('passes the map target and consume callback to the map consumer', () => {
    expect(ws).toMatch(/<MapTab\b[\s\S]*?mapTarget=\{mapTarget\} onMapTargetConsumed=\{consumeMapTarget\}/)
    const mapTab = codeOf('../src/pages/trip/MapTab.tsx')
    expect(mapTab).toMatch(/<TripMap\b[\s\S]*?mapTarget=\{mapTarget\}[\s\S]{0,160}onMapTargetConsumed=\{onMapTargetConsumed\}/)
    const map = codeOf('../src/components/TripMap.tsx')
    expect(map).toMatch(/targetCameraActive\.current = true\s*targetCameraDay\.current = dayFilter\s*onMapTargetConsumed\?\.\(\)/)
    expect(map).toMatch(/!validMapCoordinate\(sourceStop\) \|\| sourceStop\.lat === 0/)
  })

  it('clears a pending map target when the workspace switches trips', () => {
    expect(ws).toMatch(/useEffect\(\(\) => \{ setMapInputs\(null\); setMapTarget\(null\) \}, \[tripId\]\)/)
  })

  it('passes the timeline focus block and consume callback to the timeline consumer', () => {
    expect(ws).toMatch(/<TimelineTab\b[\s\S]*?focusBlock=\{timelineFocusBlock\}[\s\S]{0,160}onFocusConsumed=\{clearTimelineFocus\}/)
    const timeline = codeOf('../src/pages/trip/TimelineTab.tsx')
    expect(timeline).toMatch(/if \(focusBlock !== 'trip-wide'\) return/)
    expect(timeline).toMatch(/const block = document\.getElementById\('timeline-trip-wide'\)[\s\S]{0,500}onFocusConsumed\?\.\(\)/)
  })
})
