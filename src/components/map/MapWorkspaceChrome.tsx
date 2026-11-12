import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, CarFront, Check, ChevronLeft, ChevronRight, House, LocateFixed, Lock, MoreHorizontal, PanelLeftClose } from 'lucide-react'
import type { Trip } from '../../data/types'
import type { Journey, JourneyPoint, LegEstimate } from '../../lib/engine'
import { fmtDur, legKey } from '../../lib/engine'
import { useTimeFormat, formatHM } from '../../lib/timefmt'
import { clockHM } from '../../lib/clockOverlay'
import { visitDateForDay } from '../../lib/hoursContext'
import { titleCase } from '../../lib/labels'
import { budgetBlockView, budgetValueParts, fixProblemReason, fixReasonLine, windowDurationText } from '../../pages/trip/map/LensRailExtras'
import { dayColor } from '../../lib/mapStyles/dayColors'
import { fixProblemSubLine, railMarkerKind, railStopNumber, railStopPaid } from './railModel'
import { ribbonAxis, ribbonLabelLayout, ribbonPercent, ribbonTickText, ribbonStops, ribbonRange, ribbonSignature, ribbonResetMinute, ribbonKeyMinute, ribbonScrub, ribbonClockMinutes, retimedStops, type RibbonPosition, type RibbonPreview } from '../../lib/mapJourneyRibbon'

export type { SheetSnap, SheetSnapSource } from '../../lib/mapSheetGesture'
export type { RibbonPreview }

export function MapPhoneDay({ trip, journey, activeDay, allDays, onShowAll, onDayChange, onBack }: { trip: Trip; journey: Journey | null; activeDay: number; allDays: boolean; onShowAll: () => void; onDayChange: (index: number) => void; onBack?: (() => void) | undefined }) {
  const days = [...trip.days].sort((a, b) => a.index - b.index)
  const at = days.findIndex(day => day.index === activeDay)
  const day = days[at]
  const title = journey ? `${journey.startTitle ?? ''} → ${journey.endTitle ?? ''}` : day?.title || 'Your day on the map'
  // "All days" is a mode, not a day step. The board's slim row carries only the
  // two chevrons, so the mode moves into a small overflow beside them.
  const [menuOpen, setMenuOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menuOpen) return
    const close = (event: Event) => {
      if (event.type === 'keydown') {
        if (!(event instanceof KeyboardEvent) || event.key !== 'Escape') return
      } else if (moreRef.current?.contains(event.target as Node)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])
  return <div className="mv2-phone-day" aria-label="Map day">
    {/* W10: the board's left chevron is the way back to the trip. It is the
        leftmost control and keeps its own 44 px hit area. */}
    {onBack && <button type="button" className="mv2-phone-day-back" aria-label="Back to trip" onClick={onBack}><ArrowLeft size={18} /></button>}
    <button type="button" className="mv2-icon-btn mv2-phone-day-step" disabled={at <= 0} aria-label="Previous map day" onClick={() => { const previous = days[at - 1]; if (previous) onDayChange(previous.index) }}><ChevronLeft size={16} /></button>
    <div className="mv2-phone-day-copy">
      <span className="mv2-phone-day-label"><i className="mv2-day-dot" style={{ '--mv2-day-tone': dayColor(activeDay) } as CSSProperties} aria-hidden="true" />{allDays ? 'All days' : `Day ${activeDay + 1} · Map`}</span>
      <strong>{title}</strong>
    </div>
    <button type="button" className="mv2-icon-btn mv2-phone-day-step" disabled={at < 0 || at >= days.length - 1} aria-label="Next map day" onClick={() => { const next = days[at + 1]; if (next) onDayChange(next.index) }}><ChevronRight size={16} /></button>
    <div className="mv2-phone-day-more" ref={moreRef}>
      <button type="button" className="mv2-phone-day-overflow" aria-label="Map day options" aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen(open => !open)}><MoreHorizontal size={18} aria-hidden /></button>
      {menuOpen && <div className="mv2-phone-day-menu" role="menu" aria-label="Map days to show">
        <button type="button" role="menuitemradio" aria-checked={!allDays} onClick={() => { onDayChange(activeDay); setMenuOpen(false) }}>{!allDays ? <Check size={14} aria-hidden /> : <span className="mv2-phone-day-menu-gap" aria-hidden />}This day</button>
        <button type="button" role="menuitemradio" aria-checked={allDays} onClick={() => { onShowAll(); setMenuOpen(false) }}>{allDays ? <Check size={14} aria-hidden /> : <span className="mv2-phone-day-menu-gap" aria-hidden />}All days</button>
      </div>}
    </div>
  </div>
}

/** The phone locate action. It reuses the map's existing recentre handler. */
export function MapPhoneLocate({ onLocate }: { onLocate: () => void }) {
  return <button type="button" className="mv2-map-phone-locate mv2-icon-btn"
    aria-label="Recentre the map on the trip route" title="Recentre the map on the trip route"
    onClick={onLocate}><LocateFixed size={18} aria-hidden /></button>
}

export { MapPhoneSheetHandle as MapSheetHandle } from './MapPhoneSheetHandle'

export interface ItineraryWindowRow {
  label: string
  startMin: number
  endMin: number
  /** Only the active window carries the marigold outline. */
  active?: boolean
  /** Where the row sits on the clock. Absent means the window start. */
  atMin?: number
  /** The known facts after the clocks, such as "around km 57 · 3 picks". */
  detail?: string | null
  /** A window that opens on the next day shows this in the time column and goes last. */
  nextDayLabel?: string | null
  /** A free-time window the strip shows as a box only. Absent draws the dashed mark too. */
  boxOnly?: boolean
}

export interface ItineraryPreviewChip {
  /** Index in the day's stop array. */
  index: number
  /** Ids of the day's stops, in array order. */
  stopIds: string[]
  label: string | null
}

/** The Stay lens header and the first row of its list. Known facts only. */
export interface ItineraryStayView {
  /** The base stop. The list starts here. */
  baseStopId: string
  title: string | null
  sub: string | null
  /** The base row's own sub line. The board names the town for tonight. */
  baseSub: string | null
}

export function MapItinerary({ trip, journey, corrections, activeDay, budgetMin, selectedStop, allDays, onShowAll, onDayChange, onSelect, onOpenDay, onFold, railExtras, windowRows, windowRow, daysCaption, fixStopId, fixSubLine, fixProblem: fixProblemProp, budgetBar, clock, previewChip, stayView, hotelSub, hideBudget }: {
  trip: Trip; journey: Journey | null; activeDay: number; budgetMin: number; selectedStop: string | null
  corrections?: Record<string, LegEstimate>
  allDays: boolean; onShowAll: () => void
  onDayChange: (index: number) => void; onSelect: (point: JourneyPoint) => void; onOpenDay?: (index: number) => void; onFold: () => void
  /** Lens extras sit in the rail's normal flow, between the stops and the footer. */
  railExtras?: ReactNode
  /** The day's open windows. One row per window, in road order. */
  windowRows?: ItineraryWindowRow[] | null
  /** One active window for a caller that holds just one. */
  windowRow?: { label: string; startMin: number; endMin: number } | null
  /** Copy under the day list. */
  daysCaption?: string | null
  /** The stop the Fix lens names. An unknown id keeps its tint out. */
  fixStopId?: string | null
  /** The Fix row's short fact line. Absent falls back to the engine detail. */
  fixSubLine?: string | null
  /** The Fix lens's own problem, with its engine evidence. */
  fixProblem?: { title: string; evidence: readonly string[] } | null
  /** The detour budget bar. Null keeps the original two lines. */
  budgetBar?: { text: string; step: number } | null
  /** Formats one minute of the day for a window row. */
  clock?: (min: number) => string
  /** The open add preview. Its index finds one row by stop id. */
  previewChip?: ItineraryPreviewChip | null
  /** The Stay lens. The list starts at the base and the header names the evening. */
  stayView?: ItineraryStayView | null
  /** A hotel row's town and night. An absent value keeps the generic base copy. */
  hotelSub?: string | null
  /** The Stay board has no budget block. Its rail shows the reach card instead. */
  hideBudget?: boolean
}) {
  const timeFormat = useTimeFormat()
  const days = [...trip.days].sort((a, b) => a.index - b.index)
  const position = days.findIndex(day => day.index === activeDay)
  const day = days[position]
  const date = day && visitDateForDay(trip.startDate, day.index)
  const dateLabel = date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') : ''
  const locks = new Set(trip.fixedCommitments?.filter(lock => lock.dayIndex === activeDay).flatMap(lock => lock.stopId ? [lock.stopId] : []))
  // The booking clock of each locked stop. A fixed stop shows its commitment
  // time, never the arrival: the two facts disagree, and the booking is the one
  // the traveller holds.
  const lockClocks = new Map<string, string>()
  for (const lock of trip.fixedCommitments ?? []) {
    if (lock.dayIndex !== activeDay || lock.stopId == null || lock.time == null) continue
    lockClocks.set(String(lock.stopId), lock.time)
  }
  const allPoints = journey?.points ?? []
  // The Stay list starts at the base. The leg into the base stays out of it.
  const stayFrom = stayView == null ? -1 : allPoints.findIndex(point => point.stop.id === stayView.baseStopId)
  const firstShown = stayFrom > 0 ? stayFrom : 0
  const points = allPoints
  // One budget block for the lenses that show it. The bar needs the used part,
  // so a caller with no used part shows the day budget alone.
  const budget = budgetBlockView(budgetBar ?? null, budgetMin)
  // The Fix problem row's sub line. One fix stop, one set of engine facts.
  const fixPoint = fixStopId == null ? null : points.find(point => point.stop.id === fixStopId) ?? null
  const engineFixSubLine = fixPoint == null
    ? null
    : fixReasonLine(fixPoint.title, formatHM(fixPoint.arrive, timeFormat), fixProblemReason(trip, activeDay, corrections))
  const fixProblem = fixProblemProp ?? null
  // The Fix line renders in the reader's 12 h/24 h clock, like every other row.
  const fixRowLine = fixProblemSubLine(fixProblem, hm => formatHM(hm, timeFormat)) ?? fixSubLine ?? engineFixSubLine
  const fixRowRef = useRef<HTMLButtonElement | null>(null)
  const stopsRef = useRef<HTMLOListElement | null>(null)
  useEffect(() => {
    // The header stays whole. Only the list scrolls, and only as far as the
    // flagged row needs to become whole in view.
    const row = fixRowRef.current?.closest('li')
    if (fixStopId == null || row == null) return
    row.scrollIntoView({ block: 'nearest' })
  }, [fixStopId])
  const estimated = points.some((point, index) => {
    if (!point.legIn) return false
    const previous = points[index - 1]
    const leg = previous ? corrections?.[legKey(previous, point)] : undefined
    return !leg || leg.estimated === true
  })
  // A window is not a stop row. Each window enters the list once, at its own
  // place in time order. The picks are known only to the caller, so it passes
  // them in the detail text.
  const minutesOf = (text: string) => {
    const [hours, minutes] = text.split(':').map(Number)
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null
  }
  const resolvedWindows: ItineraryWindowRow[] = windowRows != null
    ? windowRows
    : windowRow != null ? [{ ...windowRow, active: true }] : []
  const atOf = (row: ItineraryWindowRow) => row.atMin ?? row.startMin
  const windowsInOrder = clock == null ? [] : [...resolvedWindows].sort((a, b) => (a.nextDayLabel != null ? 1 : 0) - (b.nextDayLabel != null ? 1 : 0) || atOf(a) - atOf(b))
  const insertAtFor = (row: ItineraryWindowRow) => {
    if (row.nextDayLabel != null) return points.length
    const at = atOf(row)
    const index = points.findIndex((point, pointIndex) => {
      if (pointIndex < firstShown) return false
      const arrive = minutesOf(point.arrive)
      return arrive != null && arrive > at
    })
    return index < 0 ? points.length : index
  }
  const windowsAt = (index: number) => windowsInOrder
    .filter(row => insertAtFor(row) === index)
    .map(row => {
      const duration = windowDurationText(row.startMin, row.endMin)
      // The board keeps one line. A row with a proven detail drops the duration
      // (the window's own clocks already state it) so the detail is not cut off.
      // A stay window keeps the duration: its detail is a count, not a place.
      const parts = row.detail != null && !row.boxOnly
        ? [`${clock?.(row.startMin)}–${clock?.(row.endMin)}`, row.detail]
        : [`${clock?.(row.startMin)}–${clock?.(row.endMin)}`, duration, row.detail]
      const sub = parts.filter(part => part != null && part !== '').join(' · ')
      return <li key={`window-${row.startMin}-${row.label}`} className={`mv2-window-row${row.active ? ' is-active-window' : ''}`}>
        <time className="mv2-lens-window-time">{row.nextDayLabel ?? clock?.(row.startMin)}</time>
        <span className="mv2-window-ring" aria-hidden="true" />
        <span className="mv2-stop-copy"><strong>{row.label}</strong><small>{sub}</small></span>
      </li>
    })
  const previewChipAt = (stopId: string | null) => {
    if (previewChip == null || previewChip.label == null) return null
    const beforeFirst = previewChip.index === 0
    const target = beforeFirst ? null : previewChip.stopIds[previewChip.index - 1] ?? null
    if (beforeFirst ? stopId !== null : target == null || stopId !== target) return null
    return <span className="mv2-lens-tag">{previewChip.label} · Preview</span>
  }
  // The number of a used-of line takes the board's bold step.
  const budgetParts = budgetValueParts(budget.value)
  const dayTone = { '--mv2-day-tone': dayColor(activeDay) } as CSSProperties
  const headTitle = stayView?.title != null ? stayView.title : null
  const headSub = stayView?.sub != null ? stayView.sub : null
  const shownPoints = points.map((point, index) => ({ point, index })).filter(entry => entry.index >= firstShown)
  return <aside className="mv2-itinerary" aria-label="Day itinerary" data-clock={timeFormat} data-lens={stayView != null ? 'stay' : undefined} style={dayTone}>
    <header className="mv2-day-header">
      <div className="mv2-day-arrows">
        <button type="button" className="mv2-icon-btn" disabled={position <= 0} aria-label="Previous day" onClick={() => { const previous = days[position - 1]; if (previous) onDayChange(previous.index) }}><ChevronLeft size={18} /></button>
        <div className="mv2-day-head">
          <span className="mv2-day-mark"><i className="mv2-day-dot" style={{ '--mv2-day-tone': dayColor(activeDay) } as CSSProperties} aria-hidden="true" />Day {activeDay + 1}{dateLabel && ` · ${dateLabel}`}</span>
          <h2>{headTitle ?? (journey ? <>{journey.startTitle}<ArrowRight size={17} aria-hidden />{journey.endTitle}</> : day?.title || 'Your day on the map')}</h2>
        </div>
        <button type="button" className="mv2-icon-btn" disabled={position < 0 || position >= days.length - 1} aria-label="Next day" onClick={() => { const next = days[position + 1]; if (next) onDayChange(next.index) }}><ChevronRight size={18} /></button>
      </div>
      <p>{headSub ?? (journey ? `${Math.round(journey.distanceKm)} km · ${fmtDur(journey.driveMinutes)} drive · ${estimated ? 'estimate' : 'planned'}` : 'Add a stop to start this day.')}</p>
      <button type="button" className="mv2-fold-day" aria-label="Fold day itinerary" onClick={onFold}><PanelLeftClose size={16} /></button>
    </header>
    {hideBudget !== true && <div className="mv2-budget mv2-lens-budget"><span className="mv2-lens-budget-label">{budget.label}</span><strong className="mv2-lens-budget-value">{budgetParts.lead != null && <b className="mv2-lens-budget-number">{budgetParts.lead}</b>}{budgetParts.rest}</strong>{budget.showBar && budgetBar != null
      ? <div className="mv2-budget-progress" role="progressbar" aria-label="Detour budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={budgetBar.step * 25}><span className="mv2-budget-progress-fill" data-step={budgetBar.step} /></div>
      : null}</div>}
    <ol className="mv2-stops" ref={stopsRef}>
      {shownPoints.map(({ point, index }, shownIndex) => {
        const locked = locks.has(point.stop.id)
        const isFix = fixStopId === point.stop.id
        const marker = railMarkerKind({ kind: point.kind, category: point.stop.category, locked, isFix })
        const paid = railStopPaid(trip.expenses, {
          id: point.stop.id,
          status: point.stop.status,
          notes: trip.fixedCommitments.find(lock => lock.stopId === point.stop.id)?.notes,
        })
        const isBase = stayView != null && point.stop.id === stayView.baseStopId
        const subLine = isBase
          ? stayView?.baseSub ?? 'Base for tonight'
          : point.stop.category === 'hotel' && point.kind !== 'start' && hotelSub != null
            ? hotelSub
          : locked
            ? 'Fixed time · tickets booked'
            : point.kind === 'start'
              ? 'Departure'
              : `${titleCase(point.stop.category)}${point.dwellMinutes > 0 ? ` · ${point.dwellMinutes} min` : ''}`
        return <Fragment key={point.stop.id}>
          {windowsAt(index)}
          <li>
            {shownIndex === 0 && previewChipAt(null)}
            {shownIndex > 0 && point.legIn && <div className="mv2-travel-leg"><span aria-hidden="true" /><span>{Math.round(point.legIn.distanceKm)} km · {fmtDur(point.legIn.durationMinutes)}</span></div>}
            <button type="button" ref={isFix ? fixRowRef : undefined} className={`mv2-stop${selectedStop === point.stop.id ? ' is-selected' : ''}${isFix ? ' is-fix-problem' : ''}`} onClick={() => onSelect(point)} aria-pressed={selectedStop === point.stop.id}>
              <time>{formatHM((locked ? lockClocks.get(String(point.stop.id)) : null) ?? point.arrive, timeFormat)}</time>
              <span className={`mv2-stop-mark is-${marker}`}>
                {marker === 'car' ? <CarFront size={13} aria-hidden /> : marker === 'stay' ? <House size={13} strokeWidth={2.3} aria-hidden /> : marker === 'lock' ? <Lock size={12} strokeWidth={2.4} aria-label="Fixed time" /> : marker === 'risk' ? <i className="mv2-stop-diamond" aria-label="Problem" /> : railStopNumber(points, index)}
              </span>
              <span className="mv2-stop-copy"><strong title={point.title}>{point.kind === 'start' ? `Leave ${point.title}` : point.title}</strong>{isFix && fixRowLine != null ? <small className="mv2-lens-fix-reason">{fixRowLine}</small> : <small>{subLine}</small>}{previewChipAt(point.stop.id)}</span>
              {paid && <span className="mv2-stop-chip">Paid</span>}
            </button>
          </li>
        </Fragment>
      })}
      {windowsAt(points.length)}
    </ol>
    {railExtras}
    <footer className="mv2-day-footer">
      {onOpenDay && <button type="button" className="mv2-timeline-link" onClick={() => onOpenDay(activeDay)}>Open day in Timeline<ArrowRight size={15} aria-hidden /></button>}
      <span className="mv2-section-label">Days on the map</span>
      <div className="mv2-day-strip" role="group" aria-label="Choose map day"><button type="button" aria-label="Show all map days" aria-pressed={allDays} onClick={onShowAll}>All</button>{days.map(item => <button key={item.index} type="button" aria-pressed={!allDays && item.index === activeDay} onClick={() => onDayChange(item.index)}><span aria-hidden="true" style={{ '--mv2-day-tone': dayColor(item.index) } as CSSProperties} />{item.index + 1}</button>)}</div>
      {daysCaption && <p className="hint-text" role="status">{daysCaption}</p>}
    </footer>
  </aside>
}

/** The preview label, plus the new stop's clocks when both are known. */
function previewTitle(preview: RibbonPreview, format: ReturnType<typeof useTimeFormat>): string {
  const arrive = ribbonClockMinutes(preview.newStop.arrive)
  const depart = ribbonClockMinutes(preview.newStop.depart)
  if (arrive == null || depart == null) return 'Re-timed preview'
  return `Re-timed preview · new stop ${formatHM(preview.newStop.arrive, format)}–${formatHM(preview.newStop.depart, format)}`
}

/** One open window on the strip. It is drawn from the same rows as the rail. */
export interface RibbonWindow {
  label: string
  startMin: number
  endMin: number
  /** Where the window glyph sits. Absent means the window start. */
  atMin?: number
  active?: boolean
  /** A free-time window is a box only, with no dashed mark. */
  boxOnly?: boolean
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** The first word of a stop name. "Lunch · Nalla Ruchi" reads "Lunch". */
function ribbonShortTitle(title: string): string {
  return title.split(' · ')[0]
}

export function MapJourneyRibbon({ journey, corrections, preview = null, onScrub, inSheet = false, windows = [], lockedStopIds = [], lockedClockOf = null, fixStopId = null, note = null }: {
  journey: Journey | null; corrections?: Record<string, LegEstimate>
  onScrub: (position: RibbonPosition, minute: number) => void
  /** The open add preview. Its own schedule re-times the stops shown here. */
  preview?: RibbonPreview | null
  /** W10b: the phone sheet ribbon has its own class, so the map camera does
   *  not read it as a second overlay above the sheet. */
  inSheet?: boolean
  /** The day's open windows, drawn as dashed marks. The active one gets a box. */
  windows?: readonly RibbonWindow[]
  /** Stops with a fixed time. Each draws as a dark bar with a lock. */
  lockedStopIds?: readonly string[]
  /** The fixed commitment's own clock for a locked stop. Absent falls back to
   *  the engine's arrival, so an unlinked lock never invents a time. */
  lockedClockOf?: ((stopId: string) => string | null) | null
  /** The stop the Fix lens names. It draws a diamond. */
  fixStopId?: string | null
  /** A short fact for the third line of the left block, such as "Free 17:00–20:00". */
  note?: string | null
}) {
  const format = useTimeFormat()
  const planned = journey ? ribbonStops(journey) : []
  const stops = preview ? retimedStops(planned, preview) : planned
  const stopsRange = ribbonRange(stops)
  // The scrub may reach the end of the last open window. The stops keep the
  // honest position: after the last stop the clock holds at that stop.
  const windowEnd = windows.reduce((latest, window) => Math.max(latest, window.endMin), stopsRange.end)
  const range = { start: stopsRange.start, end: windowEnd }
  const axis = ribbonAxis(range, windows)
  const { start } = range
  // Day index and the engine start clock join the stop times, so a new trip or
  // a new day cannot keep a stored cursor from the previous journey.
  const signature = ribbonSignature(stops, journey?.dayIndex ?? 0, journey?.startTime ?? '') + (preview ? `|preview:${preview.newStop.arrive}:${preview.newStop.depart}` : '')
  const [cursor, setCursor] = useState({ signature, minute: start })
  const minute = ribbonResetMinute(range, signature, cursor)
  const current = ribbonScrub(stops, minute, corrections, range)
  const position = current.position
  const id = useId()
  const percent = (value: number) => ribbonPercent(axis, value)
  const tone = { '--mv2-day-tone': dayColor(journey?.dayIndex ?? 0) } as CSSProperties
  const locked = new Set(lockedStopIds)
  // A locked stop draws and labels at its booking clock, the same clock the
  // rail row and the pin chip show.
  const lockedMinute = (stopId: string): number | null => {
    if (!locked.has(stopId) || lockedClockOf == null) return null
    const hm = lockedClockOf(stopId)
    return hm == null ? null : ribbonClockMinutes(hm)
  }
  const drawingRef = useRef<HTMLDivElement | null>(null)
  const [labelLayout, setLabelLayout] = useState<{ hidden: string[]; shift: Record<string, number> }>({ hidden: [], shift: {} })
  // A label that has no room hides, and a label at an edge moves back in. The
  // boxes are measured, so a long name or a 12 h clock cannot overlap.
  const labelSignature = signature + `|${windows.map(window => `${window.label}:${window.startMin}`).join(',')}|${format}`
  useIsoLayoutEffect(() => {
    const drawing = drawingRef.current
    if (drawing == null) return
    const measure = () => {
      const width = drawing.clientWidth
      const boxes = [...drawing.querySelectorAll<HTMLElement>('[data-label-key]')].map(node => ({
        key: node.dataset.labelKey ?? '',
        center: Number(node.dataset.at ?? 0) / 100 * width,
        width: node.offsetWidth,
      }))
      const next = ribbonLabelLayout(boxes, width)
      setLabelLayout(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(drawing)
    return () => observer.disconnect()
  }, [labelSignature])
  function scrub(next: number) {
    const outcome = ribbonScrub(stops, next, corrections, range)
    setCursor({ signature, minute: outcome.minute })
    // Report the honest position for every grade. The MapTab consumer clears
    // its camera cursor for 'estimated' and reveals it only for measured road
    // or stop grades, so an unmeasured leg never produces a fake camera move.
    if (outcome.position) onScrub(outcome.position, outcome.minute)
  }
  const rootClass = inSheet ? 'mv2-ribbon-sheet' : 'mv2-ribbon'
  if (!stops.length) return <section className={rootClass} aria-label="Journey clock"><span className="mv2-ribbon-title">Journey clock</span><span>No scheduled stops yet.</span></section>
  const labels: Array<{ key: string; at: number; text: string; title: string }> = []
  stops.forEach(stop => {
    const point = stop.point
    labels.push({ key: `stop-${point.stop.id}`, at: percent(lockedMinute(String(point.stop.id)) ?? stop.arrive), text: ribbonShortTitle(point.title), title: point.title })
  })
  windows.forEach((window, index) => {
    if (window.boxOnly) return
    labels.push({ key: `window-${index}`, at: percent(window.atMin ?? window.startMin), text: ribbonShortTitle(window.label), title: window.label })
  })
  const bars = stops.slice(0, -1).flatMap((stop, index) => {
    const next = stops[index + 1]
    return next.arrive > stop.depart ? [{ key: stop.point.stop.id, from: stop.depart, to: next.arrive }] : []
  })
  return <section className={rootClass} aria-label="Journey clock" style={tone}>
    <div className="mv2-ribbon-title"><span>Journey</span><strong>Day {(journey?.dayIndex ?? 0) + 1}</strong><small title={preview ? previewTitle(preview, format) : undefined}>{preview ? previewTitle(preview, format) : current.cameraReveal ? (note ?? 'Drag to scrub') : 'Road position unavailable'}</small></div>
    <div className="mv2-clock-track">
      <div className="mv2-clock-drawing" ref={drawingRef} aria-hidden="true">
        {axis.ticks.map(tick => <Fragment key={tick}>
          <span className="mv2-clock-tick-line" style={{ left: `${percent(tick)}%` }} />
          <span className="mv2-clock-tick" style={{ left: `${percent(tick)}%` }}>{ribbonTickText(tick, format)}</span>
        </Fragment>)}
        {windows.filter(window => window.active).map(window => <span key={`box-${window.startMin}`} className="mv2-clock-window-box" style={{ left: `${percent(window.startMin)}%`, width: `${Math.max(0, percent(window.endMin) - percent(window.startMin))}%` }} />)}
        <span className="mv2-clock-line" />
        {bars.map(bar => <span key={`bar-${bar.key}`} className="mv2-clock-bar" style={{ left: `${percent(bar.from)}%`, width: `${Math.max(0, percent(bar.to) - percent(bar.from))}%` }} />)}
        {stops.map(stop => {
          const point = stop.point
          const key = point.stop.id
          const booked = lockedMinute(String(key))
          const left = `${percent(booked ?? stop.arrive)}%`
          const width = `${Math.max(0, percent(stop.depart) - percent(booked ?? stop.arrive))}%`
          if (key === fixStopId) return <Fragment key={key}>
            {locked.has(key) && <><span className="mv2-clock-fixed" style={{ left, width }} /><Lock className="mv2-clock-fixed-lock" size={12} strokeWidth={2.4} style={{ left }} /></>}
            <span className="mv2-clock-risk" style={{ left }} />
          </Fragment>
          if (locked.has(key)) return <Fragment key={key}><span className="mv2-clock-fixed" style={{ left, width }} /><Lock className="mv2-clock-fixed-lock" size={12} strokeWidth={2.4} style={{ left }} /></Fragment>
          if (point.stop.category === 'hotel') return <span key={key} className="mv2-clock-stay" style={{ left }}><House size={11} strokeWidth={2.4} /></span>
          if (point.kind === 'start' || point.kind === 'destination') return <span key={key} className="mv2-clock-end" style={{ left }} />
          return <span key={key} className="mv2-clock-visit" style={{ left, width }} />
        })}
        {windows.filter(window => !window.boxOnly).map((window, index) => <span key={`gap-${index}`} className="mv2-clock-gap" style={{ left: `${percent(window.atMin ?? window.startMin)}%` }} />)}
        {labels.map(label => <b key={label.key} className="mv2-clock-label" data-label-key={label.key} data-at={label.at} title={label.title}
          data-hidden={labelLayout.hidden.includes(label.key) ? 'true' : undefined}
          style={{ left: `${label.at}%`, ...(labelLayout.shift[label.key] ? { '--mv2-label-shift': `${labelLayout.shift[label.key]}px` } as CSSProperties : {}) }}>{label.text}</b>)}
        <span className="mv2-clock-cursor" style={{ left: `${percent(minute)}%` }} />
      </div>
      <label className="sr-only" htmlFor={id}>Journey time. Arrow keys move by five minutes. Home and End jump to the start and end.</label>
      <input id={id} type="range" min={axis.start} max={axis.end} step={1} value={minute} disabled={!stops.length} aria-valuetext={`${formatHM(clockHM(minute), format)}${minute >= 1440 ? ', next day' : ''}. ${position?.label ?? 'No scheduled stops'}. ${current.cameraReveal ? 'Planned time.' : 'Road position unavailable.'}`}
        onChange={event => scrub(Number(event.target.value))}
        onKeyDown={event => {
          const next = ribbonKeyMinute(range, minute, event.key)
          if (next === null) return
          event.preventDefault()
          scrub(next)
        }} />
    </div>
    <output className="sr-only">{formatHM(clockHM(minute), format)} {preview ? 'Preview clock' : minute >= 1440 ? 'Next day' : position?.grade === 'estimated' ? 'Estimated travel' : 'Plan clock'}</output>
  </section>
}

export function MapDeckHeader({ title, count, children, onFold }: { title: string; count: number; children?: ReactNode; onFold: () => void }) {
  return <header className="mv2-deck-header"><div><span className="mv2-section-label">Picks for your journey</span><h2>{title}<span>{count}</span></h2></div>{children}<button type="button" className="mv2-icon-btn" aria-label="Fold suggestions" onClick={onFold}><ArrowRight size={17} /></button></header>
}
