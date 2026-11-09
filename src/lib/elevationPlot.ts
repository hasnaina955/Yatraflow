// ============ Route-height plot geometry ============
// Layout for the simple height curve. The component paints what this returns,
// so the scale and the peak are testable without a DOM.
//
// The scale starts at sea level and never stretches a low trip into a mountain.
// There is no vertical axis and no sampling detail: the card shows the shape,
// the places and the highest one.
import type { RouteHeightCurveRun, RouteHeightPoint, RouteHeightStats } from './elevation'
import type { RoadPointKind } from './tripRoad'

export interface RouteHeightPlotMark {
  x: number
  y: number
  title: string
  kind: RoadPointKind
  dayIndex: number | null
  distanceKm: number
  elevationM: number
}

export interface RouteHeightPlotPeak {
  x: number
  y: number
  elevationM: number
  title: string
  dayIndex: number | null
}

export interface RouteHeightPlotRun {
  line: string
  area: string
}

export interface RouteHeightPlot {
  width: number
  height: number
  pad: { left: number; right: number; top: number; bottom: number }
  baseY: number
  topM: number
  maxDistanceKm: number
  runs: RouteHeightPlotRun[]
  marks: RouteHeightPlotMark[]
  peak: RouteHeightPlotPeak | null
  ticksX: Array<{ x: number; label: string }>
}

const HEIGHT_STEPS = [200, 300, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7000, 8000]

/** A round top for the scale, with a 1000 m floor so low routes stay calm. */
export function niceRouteHeightTop(maxM: number): number {
  const target = Math.max(1000, maxM * 1.08)
  return HEIGHT_STEPS.find(step => step >= target) ?? Math.ceil(target / 1000) * 1000
}

/** Nearby anchors share a displayed mark. */
const STROKE_SPACING_PX = 40

/**
 * One calm cubic through the stroke's own anchors.
 *
 * The tangents come from Fritsch and Carlson's monotone rule: a tangent never
 * points far enough to overshoot the two heights it joins. The curve
 * stays between them, so a gentle hill reads gentle and no peak appears where
 * the data has none.
 */
export function smoothRouteHeightPath(points: ReadonlyArray<{ x: number; y: number }>): string {
  const count = points.length
  if (count === 0) return ''
  const first = points[0]
  if (count === 1) return `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`
  const spans: number[] = []
  const slopes: number[] = []
  for (let index = 0; index < count - 1; index++) {
    const span = points[index + 1].x - points[index].x
    spans.push(span)
    slopes.push(span > 0 ? (points[index + 1].y - points[index].y) / span : 0)
  }
  const tangents: number[] = new Array(count)
  tangents[0] = slopes[0]
  tangents[count - 1] = slopes[count - 2]
  for (let index = 1; index < count - 1; index++) {
    // A place that turns the route up or down gets a flat tangent, so the curve
    // rounds over it instead of overshooting past its own height.
    tangents[index] = slopes[index - 1] * slopes[index] > 0
      ? (slopes[index - 1] + slopes[index]) / 2
      : 0
  }
  for (let index = 0; index < count - 1; index++) {
    const slope = slopes[index]
    if (slope === 0) {
      tangents[index] = 0
      tangents[index + 1] = 0
      continue
    }
    let before = tangents[index] / slope
    let after = tangents[index + 1] / slope
    if (before < 0) before = 0
    if (after < 0) after = 0
    const magnitude = before * before + after * after
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude)
      before *= scale
      after *= scale
    }
    tangents[index] = before * slope
    tangents[index + 1] = after * slope
  }
  let path = `M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`
  for (let index = 0; index < count - 1; index++) {
    const from = points[index]
    const to = points[index + 1]
    const span = spans[index]
    // Two places at one distance give no room for a curve. Draw the step.
    if (span <= 0) {
      if (to.y !== from.y) path += ` L ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
      continue
    }
    const controlStart = `${(from.x + span / 3).toFixed(2)} ${(from.y + (tangents[index] * span) / 3).toFixed(2)}`
    const controlEnd = `${(to.x - span / 3).toFixed(2)} ${(to.y - (tangents[index + 1] * span) / 3).toFixed(2)}`
    path += ` C ${controlStart}, ${controlEnd}, ${to.x.toFixed(2)} ${to.y.toFixed(2)}`
  }
  return path
}

export function buildRouteHeightPlot(
  points: readonly RouteHeightPoint[],
  runs: readonly RouteHeightCurveRun[],
  stats: RouteHeightStats,
  width: number,
  height: number,
): RouteHeightPlot {
  const pad = {
    left: width < 380 ? 18 : 22,
    right: width < 380 ? 14 : 18,
    top: 30,
    bottom: 30,
  }
  const plotW = Math.max(1, width - pad.left - pad.right)
  const plotH = Math.max(1, height - pad.top - pad.bottom)
  const baseY = height - pad.bottom
  const maxDistanceKm = Math.max(1, points[points.length - 1]?.distanceKm ?? 1)
  const topM = niceRouteHeightTop(stats.maxM)
  const xOf = (distanceKm: number) => pad.left + (distanceKm / maxDistanceKm) * plotW
  const yOf = (elevationM: number) => baseY - (Math.max(0, Math.min(topM, elevationM)) / topM) * plotH

  // Keep every run endpoint and turn in the path. Mark fewer nearby places.
  void runs
  const groups: RouteHeightPoint[][] = []
  let group: RouteHeightPoint[] = []
  const flush = () => { if (group.length) groups.push(group); group = [] }
  for (const point of points) {
    if (point.breakBefore || point.elevationM == null) flush()
    if (point.elevationM != null) group.push(point)
  }
  flush()
  const anchors = groups.map(groupPoints => groupPoints.filter((point, index) => {
    if (index === 0 || index === groupPoints.length - 1 || point === stats.peak) return true
    const before = groupPoints[index - 1].elevationM ?? 0
    const value = point.elevationM ?? 0
    const after = groupPoints[index + 1].elevationM ?? 0
    return (value < before && value <= after) || (value > before && value >= after)
  }))
  const selected = anchors.map(groupPoints => {
    const priority = [...groupPoints].sort((a, b) => Number(b === stats.peak) - Number(a === stats.peak))
    const chosen: RouteHeightPoint[] = []
    for (const point of priority) {
      if (chosen.every(other => Math.abs(xOf(point.distanceKm) - xOf(other.distanceKm)) >= STROKE_SPACING_PX)) chosen.push(point)
    }
    return groupPoints.filter(point => chosen.includes(point))
  })
  const marks: RouteHeightPlotMark[] = selected.flat().map(point => ({
      x: xOf(point.distanceKm),
      y: yOf(point.elevationM as number),
      title: point.title,
      kind: point.kind,
      dayIndex: point.dayIndex,
      distanceKm: point.distanceKm,
      elevationM: point.elevationM as number,
    }))
  const plotRuns: RouteHeightPlotRun[] = anchors.flatMap(groupPoints => {
    const plotted = groupPoints.map(point => ({ x: xOf(point.distanceKm), y: yOf(point.elevationM ?? 0) }))
    if (plotted.length === 0) return []
    const line = smoothRouteHeightPath(plotted)
    if (plotted.length === 1) return [{ line, area: '' }]
    return [{ line, area: `${line} L ${plotted[plotted.length - 1].x.toFixed(2)} ${baseY} L ${plotted[0].x.toFixed(2)} ${baseY} Z` }]
  })

  const peakPoint = stats.peak
  const peak: RouteHeightPlotPeak | null = peakPoint && peakPoint.elevationM != null
    ? {
      x: xOf(peakPoint.distanceKm),
      y: yOf(peakPoint.elevationM),
      elevationM: peakPoint.elevationM,
      title: peakPoint.title,
      dayIndex: peakPoint.dayIndex,
    }
    : null

  const ticksX = [0, maxDistanceKm / 2, maxDistanceKm].map(distanceKm => ({
    x: xOf(distanceKm),
    label: `${Math.round(distanceKm).toLocaleString('en-IN')} km`,
  }))

  return { width, height, pad, baseY, topM, maxDistanceKm, runs: plotRuns, marks, peak, ticksX }
}

export interface PaidHeightBand {
  x: number
  width: number
  /** "Days 5–8 · paid plan". Built from day numbers only, never from a place. */
  label: string
  /** Set for a paid run before the first or after the last free place. */
  edge?: 'start' | 'end'
}

/** "Day 5" for one day, "Days 5–8" for a run. */
export function paidDaysLabel(first: number, last: number): string {
  return first === last ? `Day ${first + 1} · paid plan` : `Days ${first + 1}–${last + 1} · paid plan`
}

/**
 * One band for each stretch of paid days that sits between two free places.
 * The band spans the chart's own gap, so it carries no height and no name.
 * A paid run before the first place or after the last one has no gap.
 * It gets a thin band in the chart's margin, with `edge` set, and the
 * page writes its label beside the chart.
 */
export function paidHeightBands(
  points: readonly RouteHeightPoint[],
  plot: Pick<RouteHeightPlot, 'width' | 'pad' | 'maxDistanceKm'>,
  paidIndexes: readonly number[],
): PaidHeightBand[] {
  const plotW = Math.max(1, plot.width - plot.pad.left - plot.pad.right)
  const xOf = (km: number) => plot.pad.left + (km / plot.maxDistanceKm) * plotW
  const bands: PaidHeightBand[] = []
  for (let i = 1; i < points.length; i++) {
    const before = points[i - 1].dayIndex
    const after = points[i].dayIndex
    if (before == null || after == null || after - before < 2) continue
    const between = paidIndexes.filter(day => day > before && day < after).sort((a, b) => a - b)
    if (between.length === 0) continue
    const x = xOf(points[i - 1].distanceKm)
    bands.push({ x, width: Math.max(0, xOf(points[i].distanceKm) - x), label: paidDaysLabel(between[0], between[between.length - 1]) })
  }
  const firstDay = points[0]?.dayIndex
  const lastDay = points[points.length - 1]?.dayIndex
  if (firstDay != null && lastDay != null) {
    const sorted = [...paidIndexes].sort((a, b) => a - b)
    const before = sorted.filter(day => day < firstDay)
    const after = sorted.filter(day => day > lastDay)
    if (before.length > 0) bands.unshift({ x: 0, width: plot.pad.left, label: paidDaysLabel(before[0], before[before.length - 1]), edge: 'start' })
    if (after.length > 0) bands.push({ x: plot.pad.left + plotW, width: plot.pad.right, label: paidDaysLabel(after[0], after[after.length - 1]), edge: 'end' })
  }
  return bands
}
