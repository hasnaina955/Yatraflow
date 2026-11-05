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
  weatherAdjustedPurposeFit,
  FAMILY_CATEGORY,
  FAMILY_TYPE_ENTRIES,
} from '../src/lib/providers/families'
import { STOP_CATEGORIES } from '../src/data/types'
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

  it('B1 — a generic tourist_attraction type does NOT short-circuit the chain (review probe)', () => {
    // the most common sight type: family types and name evidence must still run
    expect(classifyGooglePlace({ primaryType: 'tourist_attraction', types: ['natural_feature'] }, 'water'))
      .toMatchObject({ category: 'nature', family: 'water' })
    expect(classifyGooglePlace({ primaryType: 'tourist_attraction', displayName: { text: 'Athirapally Waterfalls' } }, 'sightseeing'))
      .toMatchObject({ category: 'nature', family: 'water', subtype: 'waterfall' })
    // specific types still win immediately, and the generic mapping still beats a food query hint
    expect(classifyGooglePlace({ primaryType: 'tourist_attraction', displayName: { text: 'Unremarkable Sight' } }, 'food'))
      .toMatchObject({ category: 'sightseeing' })
  })

  it('B2 — hiking_area classifies from the source row even with no sibling type (review probe)', () => {
    // the query purpose ('stretch') must never leak in as a category
    expect(classifyGooglePlace({ primaryType: 'hiking_area', types: ['hiking_area'] }, 'stretch'))
      .toMatchObject({ category: 'nature', family: 'nature', subtype: 'trek' })
  })

  it('family types classify with subtype facts (source rows)', () => {
    expect(familyFromType('natural_feature')).toMatchObject({ category: 'nature', family: 'water' })
    expect(familyFromType('marina')).toMatchObject({ category: 'nature', family: 'water', subtype: 'backwater' })
    expect(familyFromType('observation_deck')).toMatchObject({ category: 'nature', family: 'views', subtype: 'viewpoint' })
    expect(familyFromType('monastery')).toMatchObject({ category: 'temple', subtype: 'monastery' })
    expect(familyFromType('monument')).toMatchObject({ category: 'museum', family: 'heritage', subtype: 'monument' })
    expect(familyFromType('water_park')).toMatchObject({ category: 'sightseeing', family: 'culture', subtype: 'park' })
  })

  it('evidenced name refines only the generic sight context — never a food hit', () => {
    expect(classifyGooglePlace({ displayName: { text: 'Fallsview Restaurant' } }, 'food'))
      .toMatchObject({ category: 'food' })
    expect(classifyGooglePlace({ displayName: { text: 'Athirapilly Waterfalls' } }, 'sightseeing'))
      .toMatchObject({ category: 'nature', family: 'water', subtype: 'waterfall' })
    expect(classifyGooglePlace({ displayName: { text: 'Bekal Fort' } }, 'sightseeing'))
      .toMatchObject({ category: 'museum', family: 'heritage', subtype: 'fort' })
    expect(familyFromName('Sunset Point')).toMatchObject({ subtype: 'sunrise-sunset' })
  })

  it('OSM tags classify — and the truncated heritage tag list is NOT reconstructed', () => {
    expect(familyFromOsmTags({ waterway: 'waterfall' })).toMatchObject({ category: 'nature', family: 'water', subtype: 'waterfall' })
    expect(familyFromOsmTags({ natural: 'water', water: 'lake' })).toMatchObject({ category: 'nature', family: 'water', subtype: 'lake' })
    expect(familyFromOsmTags({ tourism: 'viewpoint' })).toMatchObject({ category: 'nature', family: 'views' })
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
    expect(familyFactsFor('nature', 'waterfall', 'water')).toEqual({ visitMin: 45 })
    expect(familyFactsFor('nature', 'beach', 'water')).toEqual({ visitMin: 90 })
    expect(familyFactsFor('nature', 'waterfall', 'water')?.rain).toBeUndefined()
  })

  it('nature and faith carry their confirmed rain rules', () => {
    expect(familyFactsFor('nature', 'wildlife', 'nature')).toEqual({ visitMin: 180, rain: 'exposed' })
    expect(familyFactsFor('temple', 'temple', 'faith')).toEqual({ visitMin: 40, rain: 'sheltered' })
    expect(familyFactsFor('temple', 'church', 'faith')).toEqual({ visitMin: 30, rain: 'sheltered' })
  })

  it('heritage has NO facts at all — visit and rain both generic until confirmed', () => {
    expect(familyFactsFor('museum', 'fort', 'heritage')).toBeUndefined()
    expect(familyFactsFor('museum', 'museum', 'heritage')).toBeUndefined()
  })

  it('non-family categories have no family facts', () => {
    expect(familyFactsFor('food', 'meal')).toBeUndefined()
    expect(familyFactsFor('sightseeing', null)).toBeUndefined()
  })

  it('R1 — facts resolve from the hit family fact, not a domain-external category', () => {
    // family-bearing hits persist as StopCategory values; the family fact carries the refinement
    expect(familyFactsFor('nature', 'viewpoint', 'views')).toEqual({ visitMin: 20 })
    expect(familyFactsFor('sightseeing', 'market', 'culture')).toEqual({ visitMin: 60, rain: 'mixed' })
  })
})

describe('AC2 — a supported scenic stop fits a stretch; a wrong-kind place cannot fill fuel', () => {
  it('scenic families fit stretch at 3; temples keep the source-prescribed fits', () => {
    expect(fitScoreForPurpose(hit({ category: 'nature', family: 'water', subtype: 'waterfall' }), 'stretch')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'nature', family: 'views', subtype: 'viewpoint' }), 'stretch')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'nature', subtype: 'estate' }), 'stretch')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'temple' }), 'sight')).toBe(3)
    expect(fitScoreForPurpose(hit({ category: 'museum', family: 'heritage' }), 'sight')).toBe(3)
  })

  it('a scenic viewpoint cannot fill fuel — the gap stays a gap', () => {
    expect(fitScoreForPurpose(hit({ category: 'nature', family: 'views' }), 'fuel')).toBe(0)
    const seg = { index: 0, purpose: 'fuel' as const, label: 'Fuel', targetKm: 0, minKm: 0, maxKm: 10, kmFromPrev: 0, minutesFromPrev: 0, etaMinutes: 600 }
    expect(scoreHitForSegment(hit({ category: 'nature', family: 'views', offRouteKm: 0 }), seg, anchors)).toBeNull()
  })

  it('a waterfall 1 km off a ghat road outranks a petrol pump for a stretch break', () => {
    // same on-road position; only kind differs (source MD test list)
    const seg = { index: 0, purpose: 'stretch' as const, label: 'Short break', targetKm: 0, minKm: 0, maxKm: 10, kmFromPrev: 0, minutesFromPrev: 0, etaMinutes: 600 }
    const waterfall = scoreHitForSegment(hit({ name: 'Falls', category: 'nature', family: 'water', subtype: 'waterfall', offRouteKm: 1 }), seg, anchors)
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

// RECHECK P1 (no-wrong-kind): the pure eligibility contract. The reproduced
// case: a fort (= museum/heritage, NO confirmed rain row) fell through the
// category sheltered fallback (+1), turning fuel fit 0 into 1 — rejected on a
// dry day but a fuel candidate in rain. Weather never crosses the eligibility
// gate; unconfirmed family rain evidence stays unknown (no category fallback).
describe('recheck — weather never hardens purpose eligibility (pure contract)', () => {
  const fort = { category: 'museum', family: 'heritage' as const, subtype: 'fort' }

  it('a fort with zero fuel-fit stays zero in rain — no sheltered rescue', () => {
    expect(fitScoreForPurpose(hit(fort), 'fuel')).toBe(0) // dry-day gate
    expect(weatherAdjustedPurposeFit({ baseFit: 0, ...fort, rainy: true })).toBe(0)
  })

  it('a museum-sheltered boost applies ONLY to eligibility-fit hits and only via family rows', () => {
    // an eligible museum hit with a CONFIRMED sheltered row gets the +1
    expect(weatherAdjustedPurposeFit({ baseFit: 2, category: 'museum', family: undefined, rainy: true })).toBe(3)
    // but a family-bearing hit with NO confirmed rain row stays PUT (unknown ≠ sheltered)
    expect(weatherAdjustedPurposeFit({ baseFit: 2, ...fort, rainy: true })).toBe(2)
    // and even with a confirmed sheltered row it cannot exceed the 0..3 gate
    expect(weatherAdjustedPurposeFit({ baseFit: 3, ...fort, rainy: true })).toBe(3)
  })

  it('confirmed family rows still adjust eligible fits; non-family hits keep the legacy sets', () => {
    // heritage is unconfirmed → neutral for the family hit (both weathers)
    expect(weatherAdjustedPurposeFit({ baseFit: 3, ...fort, rainy: false })).toBe(3)
    // legacy path for a family-less hit: 'nature' sensitive −1
    expect(weatherAdjustedPurposeFit({ baseFit: 3, category: 'nature', family: undefined, rainy: true })).toBe(2)
    // 'temple' sheltered +1 via the legacy set for family-less hits
    expect(weatherAdjustedPurposeFit({ baseFit: 2, category: 'temple', family: undefined, rainy: true })).toBe(3)
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

  it('family entries carry a StopCategory-domain category, in stable order', () => {
    const entries = familyQueryEntries(['water', 'views'])
    expect(entries.map(e => e.textQuery)).toEqual(['waterfalls', 'lakes and dams', 'beaches', 'viewpoints and sunset points', 'peaks and hills'])
    expect(entries.every(e => e.cat === 'nature' || e.cat === 'views' || e.cat === 'heritage' || e.cat === 'sightseeing' || e.cat === 'beach')).toBe(true)
    // R1: no entry carries a domain-external category
    expect(entries.every(e => (STOP_CATEGORIES as readonly string[]).includes(e.cat))).toBe(true)
  })

  it('a classified water hit is visible through the presentation adapter rows', async () => {
    const { driveRowFromCandidate } = await import('../src/pages/trip/map/driveSuggestionView')
    const waterfallHit = hit({ name: 'Athirapilly Waterfalls', category: 'nature', family: 'water', subtype: 'waterfall' })
    const row = driveRowFromCandidate(
      { hit: waterfallHit, detourMin: 24, detourKm: 8, budgetSharePct: 53, posKm: 100, arriveMin: 753, arriveLabel: '12:33', inWindow: true, score: 12, reason: '12 km off-route' },
      { key: 'lunch', kind: 'meal', label: 'Lunch', state: 'empty', windowMin: [690, 870], windowLabel: '11:30-14:30', segment: { index: 0, purpose: 'meal', label: 'Lunch', targetKm: 100, minKm: 80, maxKm: 130, kmFromPrev: 100, minutesFromPrev: 120, hint: '' }, filledStop: null, auto: false, drift: null, urgencyMin: 10, candidates: [] },
      0,
      { detourMinFor: () => 24, days: [], dayForKm: () => null, travelStyle: 'balanced', added: () => false, dismissed: () => false, heldBack: new Set<string>() },
    )
    expect(row.hit.category).toBe('nature')
    expect(row.hit.family).toBe('water')
    expect(row.hit.subtype).toBe('waterfall')
    expect(row.detourMin).toBe(24)
  })
})

describe('R1 — the saved-category boundary holds end to end', () => {
  it('the probe case: a Jog Falls Google hit persists as a valid StopCategory with family facts kept separate', () => {
    // probe.json categoryBoundary: { category: 'water', validStopCategory: false } — repaired
    const classified = classifyGooglePlace(
      { displayName: { text: 'Jog Falls' }, primaryType: 'tourist_attraction', types: ['tourist_attraction'] },
      'sightseeing',
    )
    expect((STOP_CATEGORIES as readonly string[]).includes(classified.category)).toBe(true)
    expect(classified).toMatchObject({ category: 'nature', family: 'water', subtype: 'waterfall' })
  })

  it('every classification output across all evidence tables stays inside the StopCategory domain', () => {
    const categories: string[] = []
    for (const entry of FAMILY_TYPE_ENTRIES) categories.push(entry.category)
    const classified = classifyGooglePlace(
      { displayName: { text: 'Bekal Fort Kota Qila Palace Mahal' }, primaryType: 'park', types: ['park'] },
      'sightseeing',
    )
    categories.push(classified.category)
    categories.push(FAMILY_CATEGORY.water, FAMILY_CATEGORY.views, FAMILY_CATEGORY.faith, FAMILY_CATEGORY.heritage, FAMILY_CATEGORY.culture, FAMILY_CATEGORY.nature)
    for (const c of categories) {
      expect((STOP_CATEGORIES as readonly string[]).includes(c)).toBe(true)
    }
  })

  it('a saved stop built the way the stop writers do passes the itinerary import validator unchanged', () => {
    // the write boundary cast (useMapWriters.ts:116) is only safe if the emitted value is already valid
    const classified = classifyGooglePlace(
      { displayName: { text: 'Sunset Point' }, primaryType: 'tourist_attraction' },
      'sightseeing',
    )
    const savedCategory = classified.category // writers persist this verbatim; family/subtype ride as facts
    expect((STOP_CATEGORIES as readonly string[]).includes(savedCategory)).toBe(true)
    expect(classified).toMatchObject({ family: 'views', subtype: 'sunrise-sunset' })
  })
})
