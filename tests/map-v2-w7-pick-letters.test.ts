// W7 package C: the pick letters on the Drive cards and the map pins.
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { driveLensRows, type DriveLensRow } from '../src/lib/mapLensContracts'
import type { JourneyRow } from '../src/lib/journeyProjection'
import type { JourneyStatus } from '../src/pages/trip/journey/journeyDays'
import { driveLettersByRoad } from '../src/pages/trip/map/useMapLenses'
import { driveTabs, type DriveTabGroup } from '../src/pages/trip/map/driveLens'
import { DriveTabs } from '../src/components/map/lenses/DriveTabs'

const READY: JourneyStatus = { kind: 'ready', source: 'scan' }

function row(key: string, km?: number): JourneyRow {
  return {
    key, tripId: 't', dayId: 'd', dayIndex: 0, lens: 'drive', purpose: 'meal', slotRef: null, slotKey: null,
    stopId: null,
    hit: { id: key, name: key, latitude: 1, longitude: 2, kind: 'poi', ...(km == null ? {} : { alongRouteKm: km }) },
    placeKeys: [],
    origin: 'drive', detourMin: 0, detourKm: null, budgetSharePct: 0, visitMin: null, bufferMin: null,
    netAddedMin: null, arriveMin: null, arriveLabel: null, arriveSource: 'none', windowMin: null,
    inWindow: null, reason: null, source: 'osm', freshness: 'retained', vote: null,
    actions: { preview: true, add: true, shortlist: true, vote: false, navigate: true },
  }
}

function lensRows(rows: JourneyRow[]): DriveLensRow[] {
  return [...driveLensRows({ status: READY, dayIndex: 0, rows, budgetMin: 60 }).rows]
}

describe('driveLettersByRoad', () => {
  it('gives A, B and C in road order, not in card order', () => {
    const letters = driveLettersByRoad(lensRows([row('far', 30), row('near', 5), row('mid', 12)]))
    expect(letters.near).toBe('A')
    expect(letters.mid).toBe('B')
    expect(letters.far).toBe('C')
  })

  it('gives the next letter to a pick with no road position', () => {
    const letters = driveLettersByRoad(lensRows([row('unknown'), row('near', 5), row('mid', 12)]))
    expect(letters.unknown).toBe('C')
    expect(letters.near).toBe('A')
    expect(letters.mid).toBe('B')
    expect(Object.keys(letters)).toHaveLength(3)
  })

  it('stops at C when more than three picks have a road position', () => {
    const letters = driveLettersByRoad(lensRows([
      row('p1', 1), row('p2', 2), row('p3', 3), row('p4', 4),
    ]))
    expect(letters.p1).toBe('A')
    expect(letters.p2).toBe('B')
    expect(letters.p3).toBe('C')
    expect(letters.p4).toBeUndefined()
  })

  it('keeps a non-finite road position in card order', () => {
    const letters = driveLettersByRoad(lensRows([row('bad', Number.POSITIVE_INFINITY)]))
    expect(letters).toEqual({ bad: 'A' })
  })

  it('uses the cumulative km when the exact leg is absent', () => {
    const near = row('near', 5)
    const far = row('far', 40)
    const letters = driveLettersByRoad(lensRows([
      { ...far, hit: { ...far.hit, alongRouteKm: undefined, cumKm: 40 } },
      { ...near, hit: { ...near.hit, alongRouteKm: undefined, cumKm: 5 } },
    ]))
    expect(letters.near).toBe('A')
    expect(letters.far).toBe('B')
  })
})

describe('DriveTabs card badge', () => {
  function groupsOf(rows: DriveLensRow[]): DriveTabGroup {
    const tabs = driveTabs({ phase: 'ready', rows, degraded: null }, [])
    return tabs.tabs[0]!
  }

  function markupFor(rows: DriveLensRow[]): string {
    const group = groupsOf(rows)
    return renderToStaticMarkup(createElement(DriveTabs, {
      result: { phase: 'ready', tabs: [group] },
      activeTab: group.tab,
      onTab: () => {},
      intro: null,
      stripOf: () => ({ arrive: null, detour: null, budget: null }),
      bandOf: () => 'inside' as const,
      nameOf: (row: DriveLensRow) => row.row.hit.name,
      onOpen: () => {},
      onAdd: () => {},
      dayNumber: 1,
    }))
  }

  function badges(markup: string): Array<[string, string]> {
    const pairs: Array<[string, string]> = []
    const scan = /mv2-lens-place-letter" aria-hidden="true">([A-C])<\/span>[\s\S]*?mv2-lens-place-name">([^<]+)</g
    for (const match of markup.matchAll(scan)) pairs.push([match[2]!, match[1]!])
    return pairs
  }

  it('shows the same road-order letter on each card', () => {
    const markup = markupFor(lensRows([row('far', 30), row('near', 5), row('mid', 12)]))
    expect(badges(markup)).toEqual([['far', 'C'], ['near', 'A'], ['mid', 'B']])
  })

  it('shows the card-order badge on a card with no road position', () => {
    const markup = markupFor(lensRows([row('unknown'), row('near', 5)]))
    expect(badges(markup)).toEqual([['unknown', 'B'], ['near', 'A']])
  })
})
