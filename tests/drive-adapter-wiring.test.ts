// Ticket 03 repair (direct review): the adapter must feed the real renderer,
// not just tests. These pins hold the page to the wiring while the adapter's
// own behavior stays covered in drive-suggestion-view.test.ts.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const mapTab = read('../src/pages/trip/MapTab.tsx')
const railRows = read('../src/pages/trip/map/RailRowViews.tsx')
const adapter = read('../src/pages/trip/map/driveSuggestionView.ts')
const producer = read('../src/pages/trip/journey/journeyDays.ts')
const mapRows = read('../src/pages/trip/map/mapJourneyRows.ts')

describe('the map renderer consumes the presentation adapter', () => {
  function assertLivePin(label: string, pattern: RegExp, marker: string) {
    expect(mapTab, `${label}: live source`).toMatch(pattern)
    expect(mapTab, `${label}: marker present`).toContain(marker)
    expect(mapTab.replace(marker, ''), `${label}: negative control`).not.toMatch(pattern)
  }

  it('reads the producer rows and the whole-trip adapter, not a raw-id map', () => {
    expect(mapTab).toContain('const driveRows = journeyDays.allDriveRows')
    expect(mapTab).toMatch(/mapAllJourneyRowsForDays\(journeyDays\.byDay\.values\(\), journeyDays\.allDriveRows\)/)
    assertLivePin('rail row lookup', /mapRailRowForHit\(mapRows, hit, dayForKm\(hit\.cumKm\)\)/, 'mapRailRowForHit(mapRows, hit, dayForKm(hit.cumKm))')
    expect(producer).toMatch(/driveRowsFromSegments\(\[\.\.\.snapshot\.pois\], driveFacts\)/)
    expect(producer).toMatch(/projectJourney\(\{/)
    expect(mapRows).toMatch(/export function mapAllJourneyRowsForDays\(/)
    expect(adapter).toMatch(/id: String\(hit\.id\)/)
    // Known-bad controls: the active-day-only path and the raw-id view must not return.
    expect(mapTab).not.toMatch(/driveRowById/)
    expect(mapTab).not.toMatch(/driveRows\.map\(r => \[r\.id, r\]\)/)
    expect(mapTab).not.toMatch(/mapAllJourneyRows\(journeyDay\.projection, journeyDays\.allDriveRows\)/)
  })

  it('the ledger row renders the adapter chips, not a second chip computation', () => {
    expect(mapTab).toMatch(/chips=\{row\?\.chips \?\? drive\?\.chips \?\? \[\]\}/)
    expect(railRows).toMatch(/chips: RailChip\[\]/)
    expect(railRows).not.toContain('chipsFor(')
  })

  it('the rail keeps the engine order: seeForRail is a filter over the same list', () => {
    expect(mapTab).toMatch(/const seeForRail = chipFilter[\s\S]{0,200}\? seeAndDoLive\.filter/)
    expect(mapTab).toMatch(/seeForRail\.slice\(0, SEE_VISIBLE\)\.map\(ledgerRow\)/)
  })

  it('retained and failure state stay with the page, not the adapter', () => {
    expect(mapTab).toMatch(/poisFailed/)
    expect(adapter).not.toMatch(/poisFailed|corridorQuotaOut|scanFailed/)
  })

  it('the preview and acknowledged write path is unchanged', () => {
    expect(mapTab).toMatch(/onAdd=\{\(\) => \{ if \(hit\) openAddModal\(hit\) \}\}/)
    expect(mapTab).toMatch(/onDismiss=\{dismissHit\}/)
    expect(mapTab).toMatch(/setDismissedIds\(prev => new Set\(prev\)\.add\(hit\.id as string\)\)/)
    expect(adapter).not.toMatch(/applyChange|addPoiToDay|openAddModal/)
  })
})
