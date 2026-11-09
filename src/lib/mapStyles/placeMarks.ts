// Pure rules for the Map tab marks. Nothing here invents a fact. A subtype
// comes from the place category and the words in its own name. A hit with no
// signal stays a generic sight.

export type PlaceFamily = 'water' | 'nature' | 'views' | 'faith' | 'heritage' | 'culture' | 'needs'
export interface PlaceSubtype { key: string; label: string; family: PlaceFamily }

// Order matters: the first match wins. Name words come before the broad category.
const NAME_RULES: [RegExp, PlaceSubtype][] = [
  [/\bwaterfalls?\b|\bfalls\b/i, { key: 'waterfall', label: 'Waterfall', family: 'water' }],
  [/\bbackwaters?\b|\bhouseboat\b|\bboat(ing)?\b/i, { key: 'backwater', label: 'Backwater or boat', family: 'water' }],
  [/\bdam\b|\breservoir\b/i, { key: 'dam', label: 'Dam or reservoir', family: 'water' }],
  [/\blake\b|\btal\b/i, { key: 'lake', label: 'Lake', family: 'water' }],
  [/\briver\b|\bghat\b/i, { key: 'river', label: 'River or ghat', family: 'water' }],
  [/\bbeach\b/i, { key: 'beach', label: 'Beach', family: 'water' }],
  [/\bwildlife\b|national park|\bsanctuary\b|\bsafari\b/i, { key: 'wildlife', label: 'Wildlife or national park', family: 'nature' }],
  [/\bgarden\b|\bpark\b/i, { key: 'garden', label: 'Garden or park', family: 'nature' }],
  [/\bcaves?\b/i, { key: 'cave', label: 'Cave', family: 'nature' }],
  [/\btrek\b|\btrail\b/i, { key: 'trek', label: 'Trek', family: 'nature' }],
  [/\btea\b|\bspice\b|\bplantation\b|\bestate\b/i, { key: 'estate', label: 'Tea or spice estate', family: 'nature' }],
  [/\bforest\b/i, { key: 'forest', label: 'Forest', family: 'nature' }],
  [/\bsunrise\b|\bsunset\b/i, { key: 'sun', label: 'Sunrise or sunset point', family: 'views' }],
  [/\bview ?point\b|\bviewpoint\b|\blookout\b/i, { key: 'viewpoint', label: 'Viewpoint', family: 'views' }],
  [/\bpeak\b|\bmountain\b/i, { key: 'peak', label: 'Peak or mountain', family: 'views' }],
  [/\bhills?\b/i, { key: 'hill', label: 'Hill', family: 'views' }],
  [/\bmosque\b|\bdargah\b|\bmasjid\b/i, { key: 'mosque', label: 'Mosque or dargah', family: 'faith' }],
  [/\bchurch\b|\bcathedral\b|\bbasilica\b/i, { key: 'church', label: 'Church', family: 'faith' }],
  [/\bgurdwara\b/i, { key: 'gurdwara', label: 'Gurdwara', family: 'faith' }],
  [/\bmonastery\b|\bgompa\b/i, { key: 'monastery', label: 'Monastery', family: 'faith' }],
  [/\btemple\b|\bmandir\b/i, { key: 'temple', label: 'Temple', family: 'faith' }],
  [/\bfort\b|\bfortress\b/i, { key: 'fort', label: 'Fort', family: 'heritage' }],
  [/\bpalace\b/i, { key: 'palace', label: 'Palace', family: 'heritage' }],
  [/\bruins?\b/i, { key: 'ruins', label: 'Ruins', family: 'heritage' }],
  [/\bmonument\b|\bmemorial\b/i, { key: 'monument', label: 'Monument', family: 'heritage' }],
  [/\bmuseum\b|\bgallery\b/i, { key: 'museum', label: 'Museum', family: 'heritage' }],
  [/\bmarket\b|\bbazaar\b/i, { key: 'market', label: 'Market or bazaar', family: 'culture' }],
  [/\bamusement\b|water ?park/i, { key: 'amusement', label: 'Amusement or water park', family: 'culture' }],
  [/\btheatre\b|\btheater\b|\bshow\b|\bperformance\b/i, { key: 'show', label: 'Show or performance', family: 'culture' }],
  [/\bchai\b|\bcafe\b|\bcafé\b|\bcoffee\b/i, { key: 'cafe', label: 'Chai or cafe', family: 'needs' }],
  [/\bfuel\b|\bpetrol\b/i, { key: 'fuel', label: 'Fuel', family: 'needs' }],
  [/\bev charg/i, { key: 'ev', label: 'EV charge', family: 'needs' }],
]

const CATEGORY_FALLBACK: Record<string, PlaceSubtype> = {
  food: { key: 'meal', label: 'Meal', family: 'needs' },
  hotel: { key: 'stay', label: 'Stay', family: 'needs' },
  rest: { key: 'rest', label: 'Rest stop', family: 'needs' },
  temple: { key: 'temple', label: 'Temple', family: 'faith' },
  beach: { key: 'beach', label: 'Beach', family: 'water' },
  nature: { key: 'garden', label: 'Nature', family: 'nature' },
  adventure: { key: 'adventure', label: 'Adventure', family: 'culture' },
  shopping: { key: 'market', label: 'Market or bazaar', family: 'culture' },
  museum: { key: 'museum', label: 'Museum', family: 'heritage' },
}
export const GENERIC_SIGHT: PlaceSubtype = { key: 'sight', label: 'Sight', family: 'views' }

/** One subtype for a place. The name wins over the broad category, as the engine does. */
export function placeSubtype(hit: { category?: string | null; name?: string | null }): PlaceSubtype {
  const name = hit.name ?? ''
  // A food or hotel category is a fact about the place. A name word must not override it.
  const category = hit.category ?? ''
  if (category === 'food') return /\bchai\b|\bcafe\b|\bcafé\b|\bcoffee\b/i.test(name) ? NAME_RULES.find(([, s]) => s.key === 'cafe')![1] : CATEGORY_FALLBACK.food
  if (category === 'hotel') return CATEGORY_FALLBACK.hotel
  for (const [pattern, subtype] of NAME_RULES) if (pattern.test(name)) return subtype
  return CATEGORY_FALLBACK[category] ?? GENERIC_SIGHT
}

/** A to C, in rank order. A fourth pick gets no letter, so no letter is ever reused. */
export function pickLetter(rankIndex: number): 'A' | 'B' | 'C' | null {
  return rankIndex === 0 ? 'A' : rankIndex === 1 ? 'B' : rankIndex === 2 ? 'C' : null
}

// ---- Close marks must not overlap ----

export interface MarkBox { id: string; x: number; y: number; w: number; h: number }
export interface MarkSpot { dx: number; dy: number; hidden: boolean }

function overlaps(a: MarkBox, b: MarkBox, gap: number): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + gap && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap
}

const STEPS: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]

/**
 * Place boxes in priority order. Boxes are centred on x and y, in pixels. A box that
 * collides moves in steps of its own size along eight directions, up to `maxSteps`.
 * With no free spot the box is hidden when `droppable` is set, and stays put otherwise.
 */
export function resolveMarkCollisions(items: (MarkBox & { droppable?: boolean })[], opts: { gap?: number; maxSteps?: number } = {}): Map<string, MarkSpot> {
  const gap = opts.gap ?? 2
  const maxSteps = opts.maxSteps ?? 3
  const placed: MarkBox[] = []
  const out = new Map<string, MarkSpot>()
  for (const item of items) {
    let spot: MarkBox | null = placed.some(p => overlaps(item, p, gap)) ? null : item
    for (let ring = 1; !spot && ring <= maxSteps; ring++) {
      for (const [sx, sy] of STEPS) {
        const candidate = { ...item, x: item.x + sx * ring * (item.w + gap), y: item.y + sy * ring * (item.h + gap) }
        if (!placed.some(p => overlaps(candidate, p, gap))) { spot = candidate; break }
      }
    }
    if (spot) { placed.push(spot); out.set(item.id, { dx: spot.x - item.x, dy: spot.y - item.y, hidden: false }) }
    else if (item.droppable) out.set(item.id, { dx: 0, dy: 0, hidden: true })
    else { placed.push(item); out.set(item.id, { dx: 0, dy: 0, hidden: false }) }
  }
  return out
}

// ---- Ghost road for an edit preview ----

export interface GhostLeg { coordinates: [number, number][]; measured: boolean }
export interface GhostRoad { legIn: GhostLeg | null; legOut: GhostLeg | null; replaced: GhostLeg | null }

/** An estimate must not look measured: it is thinner, fainter and dotted. */
export function ghostLegPaint(leg: Pick<GhostLeg, 'measured'>, role: 'new' | 'replaced'): { width: number; opacity: number; dash: [number, number] } {
  if (role === 'replaced') return { width: 5, opacity: 0.18, dash: [1, 0] as [number, number] }
  return leg.measured ? { width: 4, opacity: 0.9, dash: [2, 1.5] } : { width: 2.5, opacity: 0.55, dash: [0.6, 1.8] }
}
