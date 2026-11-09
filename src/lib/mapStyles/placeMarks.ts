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

export interface MarkBounds { left: number; top: number; right: number; bottom: number }

function within(box: MarkBox, bounds: MarkBounds | undefined): boolean {
  if (!bounds) return true
  return box.x - box.w / 2 >= bounds.left && box.x + box.w / 2 <= bounds.right && box.y - box.h / 2 >= bounds.top && box.y + box.h / 2 <= bounds.bottom
}

/**
 * Place boxes in the order given. The order is the priority: an earlier box never moves for a later one.
 * Boxes are centred on x and y, in pixels. A box that collides tries the smallest slide that clears
 * one blocker, then steps of its own size along eight directions, up to `maxSteps`. The nearest free
 * spot inside `bounds` wins. With no free spot the box is hidden when `droppable` is set, and stays put otherwise.
 */
export function resolveMarkCollisions(items: (MarkBox & { droppable?: boolean; maxTravel?: number; alternates?: [number, number][] })[], opts: { gap?: number; maxSteps?: number; bounds?: MarkBounds } = {}): Map<string, MarkSpot> {
  const gap = opts.gap ?? 2
  const maxSteps = opts.maxSteps ?? 3
  const placed: MarkBox[] = []
  const out = new Map<string, MarkSpot>()
  for (const item of items) {
    const blockers = placed.filter(p => overlaps(item, p, gap))
    // A mark that starts outside the bounds must move in, even when nothing blocks it.
    let spot: MarkBox | null = blockers.length || !within(item, opts.bounds) ? null : item
    if (!spot) {
      // Own alternates come first, in the order given. They keep a pill beside its own stop.
      const own: MarkBox[] = (item.alternates ?? []).map(([dx, dy]) => ({ ...item, x: item.x + dx, y: item.y + dy }))
      const candidates: MarkBox[] = []
      // The smallest slide that clears one blocker keeps the mark near its real place.
      for (const b of blockers) {
        const reachX = (item.w + b.w) / 2 + gap
        const reachY = (item.h + b.h) / 2 + gap
        candidates.push({ ...item, x: b.x + reachX }, { ...item, x: b.x - reachX }, { ...item, y: b.y + reachY }, { ...item, y: b.y - reachY })
      }
      for (let ring = 1; ring <= maxSteps; ring++) {
        for (const [sx, sy] of STEPS) candidates.push({ ...item, x: item.x + sx * ring * (item.w + gap), y: item.y + sy * ring * (item.h + gap) })
      }
      const travel = (c: MarkBox) => Math.hypot(c.x - item.x, c.y - item.y)
      // A slide may travel as far as the ring steps allow, and no further.
      const reach = item.maxTravel ?? maxSteps * Math.hypot(item.w + gap, item.h + gap)
      candidates.sort((a, b) => travel(a) - travel(b))
      spot = [...own, ...candidates].find(c => travel(c) <= reach && within(c, opts.bounds) && !placed.some(p => overlaps(c, p, gap))) ?? null
    }
    if (spot) { placed.push(spot); out.set(item.id, { dx: spot.x - item.x, dy: spot.y - item.y, hidden: false }) }
    else if (item.droppable) out.set(item.id, { dx: 0, dy: 0, hidden: true })
    else { placed.push(item); out.set(item.id, { dx: 0, dy: 0, hidden: false }) }
  }
  return out
}

// ---- One layout for every mark on the map ----

export type MarkLayer = 'stop' | 'warn' | 'slot' | 'pick' | 'clock'
// `w` and `h` are the hit box. A pill never takes a tap, so it only has to clear the drawn size, `drawW` by `drawH`.
export interface LayoutMark extends MarkBox { layer: MarkLayer; follows?: string; drawW?: number; drawH?: number }

// A stop badge always wins. A warning, an empty-part pin and a pick follow. A clock pill gives way first.
const LAYER_RANK: Record<MarkLayer, number> = { stop: 0, warn: 1, slot: 2, pick: 3, clock: 4 }
// A pill may slide this far from its stop. Past that it is hidden, so it never reads as another stop's time.
const CLOCK_MAX_TRAVEL = 80

/**
 * Lay out stops, problems, empty parts, picks and clock pills in one pass. Higher layers never move
 * for lower ones. A pill is placed last, from where its stop ended up, and is hidden when it has no room.
 * A pill spot is relative to its stop's final place. Marks keep their real coordinates.
 */
export function layoutMarks(marks: LayoutMark[], opts: { gap?: number; maxSteps?: number; bounds?: MarkBounds } = {}): Map<string, MarkSpot> {
  const solid = marks.filter(m => m.layer !== 'clock').map((m, index) => ({ m, index })).sort((a, b) => LAYER_RANK[a.m.layer] - LAYER_RANK[b.m.layer] || a.index - b.index).map(entry => entry.m)
  const first = resolveMarkCollisions(solid, opts)
  const out = new Map<string, MarkSpot>(first)
  const fixed = solid.map(m => { const spot = first.get(m.id)!; return { id: m.id, x: m.x + spot.dx, y: m.y + spot.dy, w: m.drawW ?? m.w, h: m.drawH ?? m.h } })
  const clocks = marks.filter(m => m.layer === 'clock').map(m => {
    const anchor = m.follows ? first.get(m.follows) : undefined
    const x = m.x + (anchor?.dx ?? 0)
    const y = m.y + (anchor?.dy ?? 0)
    // Beside the stop first, then above it. The pill stays next to its own badge.
    const host = m.follows ? fixed.find(f => f.id === m.follows) : undefined
    const alternates: [number, number][] = host
      ? [[-((host.w + m.w) / 2 + 2) + (host.x - x), host.y - y], [((host.w + m.w) / 2 + 2) + (host.x - x), host.y - y], [host.x - x, host.y - y - ((host.h + m.h) / 2 + 2)]]
      : []
    return { id: m.id, x, y, w: m.w, h: m.h, droppable: true, maxTravel: CLOCK_MAX_TRAVEL, alternates }
  })
  const second = resolveMarkCollisions([...fixed, ...clocks], opts)
  for (const clock of clocks) out.set(clock.id, second.get(clock.id)!)
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
