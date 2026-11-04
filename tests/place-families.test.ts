// Ticket 09 (#894): place families, classification chain and confirmed facts.
// Pure fixtures — no network, no DOM. The chain is provider type first, then
// evidenced name, then OSM tags, then generic Sight; subtype facts come ONLY
// from complete confirmed source rows (heritage visit/rain and water/views
// rain stay absent, never invented).
import { describe, it, expect } from 'vitest'
import {
  familyFromType,
  familyFromName,
  familyFromOsmTags,
  familyFactsFor,
} from '../src/lib/providers/families'
import { classifyGooglePlace } from '../src/lib/providers/google'
import { queriesForFamily, familyQueryEntries, queriesForPurpose } from '../src/lib/purposeQueries'
import { fitScoreForPurpose, scoreHitForSegment } from '../src/lib/ridePlan'
import type { PlaceHit } from '../src/lib/providers/hits'

function hit(over: Partial<PlaceHit>): PlaceHit {
  return { id: 'h', name: 'Place', latitude: 10, longitude: 76, kind: 'poi', ...over }
}

const anchors = [{ lat: 10, lng: 76 }]

describe('AC1 — classification chain: type, then evidenced name, then OSM tags', () => {
  it('provider type wins over name words', () => {
    expect(classifyGooglePlace({ primaryType: 'hindu_temple', displayName: { text: 'Palace Gardens Temple' } }, 'sightseeing'))
      .toMatchObject({ category: 'temple' })
  })

  it('family types classify with subtype facts (source rows)', () => {
    expect(familyFromType('natural_feature')).toMatchObject({ category: 'water', family: 'water' })
    expect(familyFromType('marina')).toMatchObject({ category: 'water', subtype: 'backwater' })
    expect(familyFromType('observation_deck')).toMatchObject({ category: 'views', subtype: 'viewpoint' })
    expect(familyFromType('monastery')).toMatchObject({ category: 'temple', subtype: 'monastery' })
    expect(familyFromType('monument')).toMatchObject({ category: 'heritage', subtype: 'monument' })
    expect(familyFromType('water_park')).toMatchObject({ category: 'culture', subtype: 'park' })
  })

  it('evidenced name refines only the generic sight context — never a food hit', () => {
    expect(classifyGooglePlace({ displayName: { text: 'Fallsview Restaurant' } }, 'food'))
      .toMatchObject({ category: 'food' })
    expect(classifyGooglePlace({ displayName: { text: 'Athirapilly Waterfalls' } }, 'sightseeing'))
      .toMatchObject({ category: 'water', family: 'water', subtype: 'waterfall' })
    expect(classifyGooglePlace({ displayName: { text: 'Bekal Fort' } }, 'sightseeing'))
      .toMatchObject({ category: 'heritage', subtype: 'fort' })
    expect(familyFromName('Sunset Point')).toMatchObject({ subtype: 'sunrise-sunset' })
  })

  it('OSM tags classify — and the truncated heritage tag list is NOT reconstructed', () => {
    expect(familyFromOsmTags({ waterway: 'waterfall' })).toMatchObject({ category: 'water', subtype: 'waterfall' })
    expect(familyFromOsmTags({ natural: 'water', water: 'lake' })).toMatchObject({ category: 'water', subtype: 'lake' })
    expect(familyFromOsmTags({ tourism: 'viewpoint' })).toMatchObject({ category: 'views' })
    expect(familyFromOsmTags({ historic: 'fort' })).toBeNull() // source cell truncated — stays unclassified
  })

  it('no evidence anywhere → generic sight (never a guessed family)', () => {
    expect(classifyGooglePlace({ displayName: { text: 'Blue Building' } }, 'sightseeing'))
      .toMatchObject({ category: 'sightseeing' })
    expect(familyFromName('Blue Building')).toBeNull()
    expect(familyFromOsmTags({ shop: 'convenience' })).toBeNull()
  })
})

describe('AC3/AC4 — subtype facts only from complete confirmed source rows', () => {
  it('water visit minutes are confirmed; water rain is NOT (source cell empty)', () => {
    expect(familyFactsFor('water', 'waterfall')).toEqual({ visitMin: 45 })
    expect(familyFactsFor('water', 'beach')).toEqual({ visitMin: 90 })
    expect(familyFactsFor('water', 'waterfall')?.rain).toBeUndefined()
  })

  it('nature and faith carry their confirmed rain rules', () => {
    expect(familyFactsFor('nature', 'wildlife')).toEqual({ visitMin: 180, rain: 'exposed' })
    expect(familyFactsFor('temple', 'temple')).toEqual({ visitMin: 40, rain: 'sheltered' })
    expect(familyFactsFor('temple', 'church')).toEqual({ visitMin: 30, rain: 'sheltered' })
  })

  it('heritage has NO facts at all — visit and rain both generic until confirmed', () => {
    expect(familyFactsFor('heritage', 'fort')).toBeUndefined()
    expect(familyFactsFor('heritage', 'museum')).toBeUndefined()
    expect(familyFactsFor('museum', 'museum')).toBeUndefined()
  })

  it('non-family categories have no family facts', () => {
    expect(familyFactsFor('food', 'meal')).toBeUndefined()
    expect(familyFactsFor('sightseeing', null)).toBeUndefined()
  })
})

describe('AC2 — a supported scenic stop fits a stretch; a wrong-kind place cannot fill fuel', () => {
  it('scenic families fit stretch at 3; temples keep the source-prescribed fits', () => {
    expect(fitScoreForPurpose(hit({ category: 'water', subtype: 'waterfall' }), 'stretch')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'views', subtype: 'viewpoint' }), 'stretch')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'nature', subtype: 'estate' }), 'stretch')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'temple' }), 'sight')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'heritage' }), 'sight')).toBe(3)
  })

  it('a scenic viewpoint cannot fill fuel — the gap stays a gap', () => {
    expect(fitScoreForPurpose(hit({ category: 'views' }), 'fuel')).toBe(0)
    const seg = { index: 0, purpose: 'fuel' as const, label: 'Fuel', targetKm: 0, minKm: 0, maxKm: 10, kmFromPrev: 0, minutesFromPrev: 0, etaMinutes: 600 }
    expect(scoreHitForSegment(hit({ category: 'views', offRouteKm: 0 }), seg, anchors)).toBeNull()
  })

  it('a waterfall 1 km off a ghat road outranks a petrol pump for a stretch break', () => {
    // same on-road position; only kind differs (source MD test list)
    const seg = { index: 0, purpose: 'stretch' as const, label: 'Short break', targetKm: 0, minKm: 0, maxKm: 10, kmFromPrev: 0, minutesFromPrev: 0, etaMinutes: 600 }
    const waterfall = scoreHitForSegment(hit({ name: 'Falls', category: 'water', subtype: 'waterfall', offRouteKm: 1 }), seg, anchors)
    const pump = scoreHitForSegment(hit({ name: 'Pump', category: 'transport-hub', offRouteKm: 0.2 }), seg, anchors)
    expect(waterfall).not.toBeNull()
    expect(pump).not.toBeNull()
    expect(waterfall!).toBeLessThan(pump!)
  })
})

describe('rain sets align with the confirmed source rows', () => {
  const seg = (rainy: boolean) => ({ index: 0, purpose: 'stretch' as const, label: 'Short break', targetKm: 0, minKm: 0, maxKm: 10, kmFromPrev: 0, minutesFromPrev: 0, etaMinutes: 600, rainy })

  it('a temple is sheltered (was wrongly sensitive)', () => {
    const dry = scoreHitForSegment(hit({ category: 'temple', offRouteKm: 0 }), seg(false), anchors)
    const wet = scoreHitForSegment(hit({ category: 'temple', offRouteKm: 0 }), seg(true), anchors)
    expect(dry).not.toBeNull()
    expect(wet).not.toBeNull()
    expect(wet!).toBeLessThan(dry!) // sheltered picks gain a point in the rain
  })

  it('adventure is mixed — no rain adjustment', () => {
    const dry = scoreHitForSegment(hit({ category: 'adventure', offRouteKm: 0 }), seg(false), anchors)
    const wet = scoreHitForSegment(hit({ category: 'adventure', offRouteKm: 0 }), seg(true), anchors)
    expect(wet).toBe(dry)
  })
})

describe('AC5 — family queries feed the provider scan and the presentation adapter', () => {
  it('family query sets carry family text queries without a type gate', () => {
    const water = queriesForFamily('water')
    expect(water.googleQueries).toContain('waterfalls')
    expect(water.includedType).toBeUndefined() // the audit's flaw-5 gate is not repeated
    expect(water.overpassSelectors).not.toContain('historic=monument') // truncated source cell
    expect(queriesForPurpose('sight').includedType).toBe('tourist_attraction') // generic path unchanged
  })

  it('family entries carry the family category, in stable order', () => {
    const entries = familyQueryEntries(['water', 'views'])
    expect(entries.map(e => e.textQuery)).toEqual(['waterfalls', 'lakes and dams', 'beaches', 'viewpoints and sunset points', 'peaks and hills'])
    expect(entries.every(e => e.cat === 'water' || e.cat === 'views')).toBe(true)
  })

  it('a classified water hit is visible through the presentation adapter rows', async () => {
    const { driveRowFromCandidate } = await import('../src/pages/trip/map/driveSuggestionView')
    const waterfallHit = hit({ name: 'Athirapilly Waterfalls', category: 'water', family: 'water', subtype: 'waterfall' })
    const row = driveRowFromCandidate(
      { hit: waterfallHit, detourMin: 24, detourKm: 8, budgetSharePct: 53, posKm: 100, arriveMin: 753, arriveLabel: '12:33', inWindow: true, score: 12, reason: '12 km off-route' },
      { key: 'lunch', kind: 'meal', label: 'Lunch', state: 'empty', windowMin: [690, 870], windowLabel: '11:30-14:30', segment: { index: 0, purpose: 'meal', label: 'Lunch', targetKm: 100, minKm: 80, maxKm: 130, kmFromPrev: 100, minutesFromPrev: 120, hint: '' }, filledStop: null, auto: false, drift: null, urgencyMin: 10, candidates: [] },
      0,
      { detourMinFor: () => 24, days: [], dayForKm: () => null, travelStyle: 'balanced', added: () => false, dismissed: () => false, heldBack: new Set<string>() },
    )
    expect(row.hit.category).toBe('water')
    expect(row.hit.subtype).toBe('waterfall')
    expect(row.detourMin).toBe(24)
  })
})
