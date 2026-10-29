import { isRoadMeasuredMode } from './engine'
import type { OverviewRouteRow } from './overviewTruth'
import type { RoadStatus, TripRoadView } from './tripRoad'

export const OVERVIEW_PLATE_WIDTH = 720
export const OVERVIEW_PLATE_HEIGHT = 340
export const OVERVIEW_PLATE_PAD = 32
export const OVERVIEW_PIN_HIT_DIAMETER = 44

export interface ProjectedOverviewRoutePoint {
  row: OverviewRouteRow
  x: number
  y: number
}

export interface OverviewPinGroup {
  key: string
  x: number
  y: number
  rows: OverviewRouteRow[]
  rowKeys: string[]
  isStart: boolean
  isEnd: boolean
  tag: 'Start' | 'End' | 'Start and end' | null
  stopId: string | null
}

export interface OverviewPinTarget extends OverviewPinGroup {
  interactive: boolean
}

/** The role of one route row in the card and the grouped-pin tooltip. */
export function overviewRouteRowMeta(
  row: Pick<OverviewRouteRow, 'kind' | 'dayIndex'>,
): string {
  if (row.kind === 'start') return 'Start'
  if (row.kind === 'return') return 'Return'
  if (row.kind === 'destination') return 'End'
  return row.dayIndex == null ? 'Stop' : `Day ${row.dayIndex + 1}`
}

/** A grouped pin has one stop target only when all stop rows share one id. */
export function overviewPinStopId(
  group: Pick<OverviewPinGroup, 'rows'>,
): string | null {
  const stopIds = new Set(
    group.rows.flatMap(row => row.kind === 'stop' && row.stopId ? [row.stopId] : []),
  )
  return stopIds.size === 1 ? [...stopIds][0] : null
}

/** A short label that uses the named start/end place, never one stop's title. */
export function overviewPinTitle(
  group: Pick<OverviewPinGroup, 'rows' | 'tag'>,
  activeRowKey: string | null = null,
): string {
  const active = activeRowKey
    ? group.rows.find(row => row.key === activeRowKey)
    : null
  if (active) return active.title
  if (!group.tag) {
    const titles = [...new Set(group.rows.map(row => row.title))]
    return titles.length === 1 ? titles[0] : `${titles.length} nearby places`
  }
  const anchor = group.rows.find(row => row.kind === 'start')
    ?? group.rows.find(row => row.kind === 'destination')
    ?? group.rows[group.rows.length - 1]
  return anchor.title
}

/** The tag follows the active row, so a stop never inherits the group's role. */
export function overviewPinTag(
  group: Pick<OverviewPinGroup, 'rows' | 'tag'>,
  activeRowKey: string | null = null,
): string | null {
  if (activeRowKey && group.rows.length > 1) {
    const active = group.rows.find(row => row.key === activeRowKey)
    if (active) return overviewRouteRowMeta(active)
  }
  return group.tag
}

/** Name every row in a grouped-pin tooltip, instead of showing one title. */
export function overviewPinDetailLines(
  group: Pick<OverviewPinGroup, 'rows'>,
  maxRows = 4,
): string[] {
  const lines = group.rows.length === 1
    ? [overviewRouteRowMeta(group.rows[0])]
    : group.rows.map(row => `${overviewRouteRowMeta(row)}: ${row.title}`)
  if (lines.length <= maxRows) return lines
  return [
    ...lines.slice(0, Math.max(1, maxRows - 1)),
    `+${lines.length - maxRows + 1} more route rows in the stop list.`,
  ]
}

/** The spoken label for one pin. A pin that cannot open the Map must not say
 *  that it does: it names the stop list instead, so role and label agree. */
export function overviewPinAriaLabel(
  group: Pick<OverviewPinGroup, 'rows'>,
  options: { canOpen: boolean; hasMapAction: boolean; hasStopTarget: boolean },
): string {
  const names = group.rows.map(row => `${overviewRouteRowMeta(row)}: ${row.title}`).join('. ')
  const onlyRow = group.rows.length === 1 ? group.rows[0] : null
  const leg = onlyRow?.arrivingLeg
  const facts = leg ? ` ${leg.distanceKm.toLocaleString('en-IN')} km${leg.estimated ? ' estimated' : ''}.` : ''
  const estimate = leg?.estimated ? ' Straight-line estimate, not a measured road.' : ''
  const verb = !options.canOpen
    ? options.hasMapAction
      ? ' This pin is too close to another pin. Choose a route row to open the Map.'
      : ''
    : options.hasStopTarget
      ? ' Opens the Map at this stop.'
      : group.rows.some(row => row.kind === 'stop')
        ? ' Opens the Map. Choose a route row to target a stop.'
        : ' Opens the Map.'
  return `${names}.${facts}${estimate}${verb}`
}

/** Keep SVG text inside its fixed card width. The full name stays in the list. */
export function overviewPinText(value: string, maxLength = 40): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(1, maxLength - 3)).trimEnd()}...`
}

export type OverviewRoadState =
  | 'schematic'
  | 'pending'
  | 'failed'
  | 'incomplete'
  | 'measured'
  | 'estimated'

export interface OverviewRoadSummary {
  state: OverviewRoadState
  caption: 'Schematic route' | 'Measured road'
  distanceKm: number | null
  durationMinutes: number | null
  estimatedLegs: number
  totalLegs: number
  note: string | null
}

export interface OverviewTerrainModel {
  kind: 'flat'
}

/** This release has no trustworthy point-elevation or water data. */
export function overviewTerrainModel(): OverviewTerrainModel {
  return { kind: 'flat' }
}

/** Project the route with the same north-up, latitude-corrected fit as RouteSnapshot. */
export function projectOverviewRoute(
  rows: readonly OverviewRouteRow[],
  width = OVERVIEW_PLATE_WIDTH,
  height = OVERVIEW_PLATE_HEIGHT,
  pad = OVERVIEW_PLATE_PAD,
): ProjectedOverviewRoutePoint[] {
  if (rows.length === 0) return []
  const lats = rows.map(row => row.lat)
  const lngs = rows.map(row => row.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const kcos = Math.max(0.2, Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180))
  const widthKm = Math.max((maxLng - minLng) * kcos * 111, 1e-4)
  const heightKm = Math.max((maxLat - minLat) * 111, 1e-4)
  const scale = Math.min(
    Math.max(1, width - 2 * pad) / widthKm,
    Math.max(1, height - 2 * pad) / heightKm,
  )
  const raw = rows.map(row => ({
    x: (row.lng - minLng) * kcos * 111 * scale,
    y: -row.lat * 111 * scale,
  }))
  const xs = raw.map(point => point.x)
  const ys = raw.map(point => point.y)
  const dx = (width - (Math.max(...xs) - Math.min(...xs))) / 2 - Math.min(...xs)
  const dy = (height - (Math.max(...ys) - Math.min(...ys))) / 2 - Math.min(...ys)
  return rows.map((row, index) => ({
    row,
    x: raw[index].x + dx,
    y: raw[index].y + dy,
  }))
}

/**
 * Merge points inside one hit diameter. Every row stays in the model; grouping
 * affects the map pin only. Start and end keep their target even when a busy
 * route would otherwise leave no room.
 */
export function groupOverviewPins(
  points: readonly ProjectedOverviewRoutePoint[],
  hitDiameter = OVERVIEW_PIN_HIT_DIAMETER,
): OverviewPinTarget[] {
  if (points.length === 0) return []
  const parent = points.map((_, index) => index)
  const find = (index: number): number => {
    let current = index
    while (parent[current] !== current) {
      parent[current] = parent[parent[current]]
      current = parent[current]
    }
    return current
  }
  const join = (a: number, b: number) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) <= hitDiameter) {
        join(i, j)
      }
    }
  }
  const buckets = new Map<number, number[]>()
  points.forEach((_, index) => {
    const root = find(index)
    const bucket = buckets.get(root) ?? []
    bucket.push(index)
    buckets.set(root, bucket)
  })
  const lastChainIndex = Math.max(...points.map(point => point.row.chainIndex))
  const grouped = [...buckets.values()]
    .sort((a, b) => a[0] - b[0])
    .map(indices => {
      const rows = indices.map(index => points[index].row)
      const first = points[indices[0]]
      const isStart = rows.some(row => row.kind === 'start')
      const hasReturn = rows.some(row => row.kind === 'return')
      const isEnd = rows.some(row => row.chainIndex === lastChainIndex)
      const tag: OverviewPinGroup['tag'] = isStart && (isEnd || hasReturn)
        ? 'Start and end'
        : isStart
          ? 'Start'
          : isEnd
            ? 'End'
            : null
      const action = rows.find(row => row.kind === 'stop') ?? rows[0]
      return {
        key: `pin:${first.row.key}`,
        x: indices.reduce((sum, index) => sum + points[index].x, 0) / indices.length,
        y: indices.reduce((sum, index) => sum + points[index].y, 0) / indices.length,
        rows,
        rowKeys: rows.map(row => row.key),
        isStart,
        isEnd,
        tag,
        stopId: action.kind === 'stop' ? action.stopId : null,
      }
    })
  return grouped.map((group, index) => {
    let nearest = Infinity
    grouped.forEach((other, otherIndex) => {
      if (index === otherIndex) return
      nearest = Math.min(nearest, Math.hypot(group.x - other.x, group.y - other.y))
    })
    return {
      ...group,
      interactive: group.isStart || group.isEnd || nearest >= hitDiameter,
    }
  })
}

/**
 * Keep a handle on its own ray while holding it inside the leg's box. Scaling
 * the offset keeps the direction the tangent named, which is what makes the
 * join smooth; clamping each axis on its own would bend the handle off it.
 */
function fitHandleInLeg(
  from: { x: number; y: number },
  target: { x: number; y: number },
  legStart: { x: number; y: number },
  legEnd: { x: number; y: number },
): { x: number; y: number } {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const minX = Math.min(legStart.x, legEnd.x)
  const maxX = Math.max(legStart.x, legEnd.x)
  const minY = Math.min(legStart.y, legEnd.y)
  const maxY = Math.max(legStart.y, legEnd.y)
  let scale = 1
  if (dx > 1e-9) scale = Math.min(scale, (maxX - from.x) / dx)
  if (dx < -1e-9) scale = Math.min(scale, (minX - from.x) / dx)
  if (dy > 1e-9) scale = Math.min(scale, (maxY - from.y) / dy)
  if (dy < -1e-9) scale = Math.min(scale, (minY - from.y) / dy)
  const clamped = Math.max(0, Math.min(1, scale))
  return { x: from.x + dx * clamped, y: from.y + dy * clamped }
}

/**
 * The unit direction the route travels through one point, shared by both of its
 * legs so the curve does not change direction at the join.
 *
 * Where both legs exist, the tangent has to enter both legs' boxes, or one
 * handle would leave its box and the join would bend. An axis whose two legs
 * disagree keeps no component there, which rounds the corner instead of kinking
 * it. A point with one leg takes that leg's own direction.
 */
function routeTangentAt(
  points: readonly ProjectedOverviewRoutePoint[],
  index: number,
): { x: number; y: number } {
  const point = points[index]
  const before = points[index - 1]
  const after = points[index + 1]
  const joinsBefore = !!before && point.row.chainIndex === before.row.chainIndex + 1
  const joinsAfter = !!after && after.row.chainIndex === point.row.chainIndex + 1
  const unit = (dx: number, dy: number) => {
    const length = Math.hypot(dx, dy)
    return length ? { x: dx / length, y: dy / length } : { x: 0, y: 0 }
  }
  if (!joinsBefore && !joinsAfter) return { x: 0, y: 0 }
  if (!joinsBefore) return unit(after.x - point.x, after.y - point.y)
  if (!joinsAfter) return unit(point.x - before.x, point.y - before.y)
  const agrees = (a: number, b: number) => Math.sign(a) * Math.sign(b) > 0
  const dx = agrees(point.x - before.x, after.x - point.x) ? after.x - before.x : 0
  const dy = agrees(point.y - before.y, after.y - point.y) ? after.y - before.y : 0
  return unit(dx, dy)
}

/**
 * One smooth cubic per adjacent leg. The two handles at a shared point run along
 * one tangent, so the route has no corner there. A filtered point leaves a null
 * gap, so the route never connects two points from different sections of the
 * chain, and every handle stays inside its own leg's box.
 */
export function overviewRouteSegments(
  points: readonly ProjectedOverviewRoutePoint[],
): Array<string | null> {
  if (points.length < 2) return []
  const tangents = points.map((_, index) => routeTangentAt(points, index))
  const out: Array<string | null> = []
  for (let index = 1; index < points.length; index++) {
    const p1 = points[index - 1]
    const p2 = points[index]
    if (p2.row.chainIndex !== p1.row.chainIndex + 1) {
      out.push(null)
      continue
    }
    const legLength = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const handle = legLength / 3
    const start = tangents[index - 1]
    const end = tangents[index]
    const c1 = fitHandleInLeg(
      p1,
      { x: p1.x + start.x * handle, y: p1.y + start.y * handle },
      p1,
      p2,
    )
    const c2 = fitHandleInLeg(
      p2,
      { x: p2.x - end.x * handle, y: p2.y - end.y * handle },
      p1,
      p2,
    )
    out.push(
      `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ` +
      `C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ` +
      `${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    )
  }
  return out
}

/**
 * One calm stroke for the whole chain. Each leg keeps its own path so the map
 * can animate and highlight a leg alone; this joins them into a single subpath
 * for the callers that draw the route as one line, such as the corner inset. A
 * gap in the chain breaks the stroke, so the drawing never joins two places
 * that are not neighbours.
 */
export function overviewRoutePath(points: readonly ProjectedOverviewRoutePoint[]): string {
  let path = ''
  let continuing = false
  for (const segment of overviewRouteSegments(points)) {
    if (!segment) {
      continuing = false
      continue
    }
    // A leg that follows its neighbour continues the stroke; a leg after a gap
    // opens a new one, so the pen lifts where the chain broke.
    const piece = continuing ? segment.slice(segment.indexOf(' C ')) : segment
    path = path ? `${path} ${piece}` : piece
    continuing = true
  }
  return path
}

/** Four honest road states: schematic, pending, failed, measured or estimated. */
export function overviewRoadSummary(
  rows: readonly OverviewRouteRow[],
  road: Pick<TripRoadView, 'status' | 'legs'> | null | undefined,
  transportMode: string,
): OverviewRoadSummary {
  if (!isRoadMeasuredMode(transportMode)) {
    return {
      state: 'schematic',
      caption: 'Schematic route',
      distanceKm: null,
      durationMinutes: null,
      estimatedLegs: 0,
      totalLegs: 0,
      note: 'Road distance and drive time do not apply to this transport mode.',
    }
  }
  const status: RoadStatus = road?.status ?? 'pending'
  if (status === 'pending') {
    return {
      state: 'pending',
      caption: 'Schematic route',
      distanceKm: null,
      durationMinutes: null,
      estimatedLegs: 0,
      totalLegs: Math.max(0, rows.length - 1),
      note: null,
    }
  }
  if (status === 'failed') {
    return {
      state: 'failed',
      caption: 'Schematic route',
      distanceKm: null,
      durationMinutes: null,
      estimatedLegs: 0,
      totalLegs: Math.max(0, rows.length - 1),
      note: 'Road not measured.',
    }
  }
  const arriving = rows.slice(1).map(row => row.arrivingLeg)
  const lastRow = rows[rows.length - 1]
  const droppedTail = !!lastRow
    && lastRow.chainPointCount != null
    && lastRow.chainIndex !== lastRow.chainPointCount - 1
  const hasChainGap = rows.length > 0 && (
    rows[0].chainIndex > 0
    || droppedTail
    || rows.slice(1).some((row, index) => row.chainIndex !== rows[index].chainIndex + 1)
  )
  const totalLegs = rows.length < 2
    ? 0
    : rows[rows.length - 1].chainIndex - rows[0].chainIndex
  if (hasChainGap || arriving.some(leg => leg == null)) {
    return {
      state: 'incomplete',
      caption: 'Schematic route',
      distanceKm: null,
      durationMinutes: null,
      estimatedLegs: 0,
      totalLegs,
      note: 'Road not measured.',
    }
  }
  const legs = arriving.filter((leg): leg is NonNullable<typeof leg> => leg != null)
  const estimatedLegs = legs.filter(leg => leg.estimated).length
  const distanceKm = legs.reduce((sum, leg) => sum + leg.distanceKm, 0)
  const durationMinutes = legs.reduce((sum, leg) => sum + leg.durationMinutes, 0)
  return {
    state: estimatedLegs > 0 ? 'estimated' : 'measured',
    caption: 'Schematic route',
    distanceKm,
    durationMinutes,
    estimatedLegs,
    totalLegs,
    note: estimatedLegs > 0 ? `${estimatedLegs} of ${totalLegs} legs estimated.` : null,
  }
}
