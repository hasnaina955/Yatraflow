// W17: the four last polish items. Pure rules plus a source check, node env.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stayHoursText } from '../src/components/map/lenses/StayDeck'
import { stayRailTitle } from '../src/components/map/railModel'
import { layoutMarks } from '../src/lib/mapStyles/placeMarks'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('W17 opening hours', () => {
  it('keeps AM/PM in 12 h and the padded clock in 24 h', () => {
    expect(stayHoursText({ closeTime: '19:30' }, '12h')).toBe('Open till 7:30 PM')
    expect(stayHoursText({ closeTime: '19:30' }, '24h')).toBe('Open till 19:30')
    expect(stayHoursText({ closeTime: '21:00' }, '12h')).toBe('Open till 9:00 PM')
    expect(stayHoursText({ closeTime: '21:00' }, '24h')).toBe('Open till 21:00')
  })
})

describe('W17 stay rail row', () => {
  it('names the town and tonight', () => {
    expect(stayRailTitle('Thekkady', false)).toBe('Thekkady · Tonight')
    expect(stayRailTitle('Thekkady', true)).toBe('Thekkady · Evening')
  })

  it('feeds the same text to the base row', () => {
    const mapTab = read('../src/pages/trip/MapTab.tsx')
    expect(mapTab).toContain('baseSub: stayTownSub')
    const chrome = read('../src/components/map/MapWorkspaceChrome.tsx')
    expect(chrome).toContain("hotelSub")
  })
})

describe('W17 map name tag', () => {
  it('stays beside its own pin instead of sliding onto a neighbour', () => {
    const map = read('../src/components/TripMap.tsx')
    expect(map).toMatch(/id: `tag:\$\{p\.id\}`, layer: 'clock'[\s\S]{0,400}maxTravel: belowY/)
    expect(map).toContain('alternates: [[sideX, 0], [-sideX, 0], [0, belowY], [0, -belowY]]')
  })

  it('prefers a free side of the host mark', () => {
    const spots = layoutMarks([
      { id: 'stop', layer: 'stop', x: 100, y: 100, w: 36, h: 36 },
      { id: 'blocker', layer: 'pick', x: 45, y: 100, w: 40, h: 40 },
      { id: 'tag', layer: 'clock', follows: 'stop', x: 35, y: 100, w: 100, h: 26,
        maxTravel: 38, alternates: [[70, 0], [-70, 0], [0, 38], [0, -38]] },
    ])
    const tag = spots.get('tag')!
    expect(tag.hidden).toBe(false)
    expect(Math.abs(tag.dx)).toBeLessThanOrEqual(38)
    expect(Math.abs(tag.dy)).toBeLessThanOrEqual(38)
  })
})

describe('W17 phone Swap', () => {
  it('draws no pill without a bound planned stop', () => {
    const card = read('../src/components/map/MapPickCard.tsx')
    expect(card).toContain('{onSwap != null && <button type="button" className="mv2-place-pill"')
    const mapTab = read('../src/pages/trip/MapTab.tsx')
    expect(mapTab).toContain("selectedRow?.stopId != null && selectedHit != null")
    expect(mapTab).toContain('edit.swapPickIntoStop(selectedRow.stopId!, selectedHit)')
  })
})
