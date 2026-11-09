export type RouteSnapshotPoint = { lat: number; lng: number; day: number | null }
export type RouteBadge = { days: number[]; x: number; y: number; width: number; label: string }

export const ROUTE_BOX = { width: 360, height: 260, padding: 44 }

/** Keep north up and use one scale for both axes. */
export function fitRoutePoints(points: readonly RouteSnapshotPoint[], box = ROUTE_BOX) {
  const valid = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
  if (!valid.length) return []
  const minLat = Math.min(...valid.map(p => p.lat)), maxLat = Math.max(...valid.map(p => p.lat))
  const minLng = Math.min(...valid.map(p => p.lng)), maxLng = Math.max(...valid.map(p => p.lng))
  const longitudeScale = Math.max(0.01, Math.cos((minLat + maxLat) * Math.PI / 360))
  const spanX = (maxLng - minLng) * longitudeScale, spanY = maxLat - minLat
  const scale = Math.min(
    spanX ? (box.width - 2 * box.padding) / spanX : Infinity,
    spanY ? (box.height - 2 * box.padding) / spanY : Infinity,
  )
  const unit = Number.isFinite(scale) ? scale : 0
  return valid.map(p => ({ ...p,
    x: box.width / 2 + (p.lng - (minLng + maxLng) / 2) * longitudeScale * unit,
    y: box.height / 2 - (p.lat - (minLat + maxLat) / 2) * unit,
  }))
}

function dayRanges(days: number[]) {
  const ranges: string[] = []
  for (let i = 0; i < days.length; i++) {
    const first = days[i]
    while (i + 1 < days.length && days[i + 1] === days[i] + 1) i++
    ranges.push(first === days[i] ? `${first + 1}` : `${first + 1}–${days[i] + 1}`)
  }
  return ranges.join(', ')
}

/** Merge again after each move so a merged badge cannot cover a neighbour. */
export function routeBadges(points: ReturnType<typeof fitRoutePoints>): RouteBadge[] {
  const seen = new Set<number>()
  const badges: RouteBadge[] = []
  const makeBadge = (days: number[], x: number, y: number): RouteBadge => {
    const label = dayRanges(days)
    const width = Math.min(ROUTE_BOX.width - 16, Math.max(28, label.length * 8 + 20))
    return { days, label, width,
      x: Math.max(width / 2 + 8, Math.min(ROUTE_BOX.width - width / 2 - 8, x)),
      y: Math.max(22, Math.min(ROUTE_BOX.height - 22, y)),
    }
  }
  for (const p of points) {
    if (p.day === null || seen.has(p.day)) continue
    seen.add(p.day)
    badges.push(makeBadge([p.day], p.x, p.y))
  }
  for (let i = 0; i < badges.length; i++) {
    for (let j = i + 1; j < badges.length; j++) {
      const a = badges[i], b = badges[j]
      if (Math.abs(a.x - b.x) >= (a.width + b.width) / 2 + 6 || Math.abs(a.y - b.y) >= 34) continue
      const days = [...a.days, ...b.days].sort((left, right) => left - right)
      badges[i] = makeBadge(days,
        (a.x * a.days.length + b.x * b.days.length) / days.length,
        (a.y * a.days.length + b.y * b.days.length) / days.length)
      badges.splice(j, 1)
      i = -1
      break
    }
  }
  return badges
}

/** Labels share their point's position and stay within the map frame. */
export function routeEndpointLabel(point: { x: number; y: number }, label: string, end: boolean) {
  const text = label.length > 20 ? `${label.slice(0, 19)}…` : label
  const width = Math.min(ROUTE_BOX.width - 16, text.length * 7 + 12)
  return { text, width,
    x: Math.max(8, Math.min(ROUTE_BOX.width - width - 8, point.x - width / 2)),
    y: Math.max(8, Math.min(ROUTE_BOX.height - 30, point.y + (end ? 24 : -44))),
  }
}
