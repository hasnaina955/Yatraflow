import { Fragment, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Car, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, Heart, Home, LocateFixed, LockKeyhole, MapPin, Plus, Star, X } from 'lucide-react'
import type { Trip } from '../../data/types'
import type { Journey, JourneyPoint, LegEstimate } from '../../lib/engine'
import { fmtDur, legKey } from '../../lib/engine'
import { CatIcon } from '../icons'
import { useTimeFormat, formatHM, formatHMRange } from '../../lib/timefmt'
import { clockHM } from '../../lib/clockOverlay'
import { hoursCardText, hoursDisplayFor, intendedVisitMinutes, visitDateForDay } from '../../lib/hoursContext'
import type { PlaceHit } from '../../lib/geocode'
import type { JourneyActions, JourneyFreshness } from '../../lib/journeyProjection'
import { titleCase } from '../../lib/labels'
import { detourDisplay, detourDisplayText } from '../../pages/trip/map/driveSuggestionView'
import { budgetBlockView, budgetValueParts, fixProblemReason, fixReasonLine, windowDurationText } from '../../pages/trip/map/LensRailExtras'
import type { DiscoveryCoverage } from '../../lib/providers/hits'
import { PlacePhotos } from './PlacePhotos'
import { knownCostCells } from './lenses/LensPlaceCard'
import { dayColor } from '../../lib/mapStyles/dayColors'
import { ageText, coverageText } from './placeCardFacts'
import { ribbonStops, ribbonRange, ribbonSignature, ribbonResetMinute, ribbonKeyMinute, ribbonScrub, ribbonClockMinutes, retimedStops, type RibbonPosition, type RibbonPreview } from '../../lib/mapJourneyRibbon'

export type { SheetSnap, SheetSnapSource } from '../../lib/mapSheetGesture'
export type { RibbonPreview }

export function MapPhoneDay({ trip, journey, activeDay, allDays, onShowAll, onDayChange, onBack }: { trip: Trip; journey: Journey | null; activeDay: number; allDays: boolean; onShowAll: () => void; onDayChange: (index: number) => void; onBack?: (() => void) | undefined }) {
  const days = [...trip.days].sort((a, b) => a.index - b.index)
  const at = days.findIndex(day => day.index === activeDay)
  const day = days[at]
  const title = journey ? `${journey.startTitle ?? ''} → ${journey.endTitle ?? ''}` : day?.title || 'Your day on the map'
  return <div className="mv2-phone-day" aria-label="Map day">
    {/* W10: the board's left chevron is the way back to the trip. It is the
        leftmost control and keeps its own 44 px hit area. */}
    {onBack && <button type="button" className="mv2-phone-day-back" aria-label="Back to trip" onClick={onBack}><ArrowLeft size={18} /></button>}
    <button type="button" className="mv2-icon-btn mv2-phone-day-step" disabled={at <= 0} aria-label="Previous map day" onClick={() => { const previous = days[at - 1]; if (previous) onDayChange(previous.index) }}><ChevronLeft size={16} /></button>
    <div className="mv2-phone-day-copy">
      <span className="mv2-phone-day-label"><i className="mv2-day-dot" style={{ '--mv2-day-tone': dayColor(activeDay) } as CSSProperties} aria-hidden="true" />Day {activeDay + 1} · Map</span>
      <strong>{title}</strong>
    </div>
    <button type="button" className="mv2-phone-day-all" aria-label="Show all map days" aria-pressed={allDays} onClick={onShowAll}>All</button>
    <button type="button" className="mv2-icon-btn mv2-phone-day-step" disabled={at < 0 || at >= days.length - 1} aria-label="Next map day" onClick={() => { const next = days[at + 1]; if (next) onDayChange(next.index) }}><ChevronRight size={16} /></button>
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
}

export interface ItineraryPreviewChip {
  /** Index in the day's stop array. */
  index: number
  /** Ids of the day's stops, in array order. */
  stopIds: string[]
  label: string | null
}

export function MapItinerary({ trip, journey, corrections, activeDay, budgetMin, selectedStop, allDays, onShowAll, onDayChange, onSelect, onOpenDay, onFold, railExtras, windowRows, windowRow, daysCaption, fixStopId, fixSubLine, budgetBar, clock, previewChip }: {
  trip: Trip; journey: Journey | null; activeDay: number; budgetMin: number; selectedStop: string | null
  corrections?: Record<string, LegEstimate>
  allDays: boolean; onShowAll: () => void
  onDayChange: (index: number) => void; onSelect: (point: JourneyPoint) => void; onOpenDay?: (index: number) => void; onFold: () => void
  /** Lens extras sit in the rail's normal flow, between the stops and the footer. */
  railExtras?: ReactNode
  /** The day's stay windows. One row per window, in time order. */
  windowRows?: ItineraryWindowRow[] | null
  /** One active window for a caller that holds just one. */
  windowRow?: { label: string; startMin: number; endMin: number } | null
  /** Copy under the day list. Show it only while all days draw. */
  daysCaption?: string | null
  /** The stop the Fix lens names. An unknown id keeps its tint out. */
  fixStopId?: string | null
  /** The Fix row's short fact line. Absent falls back to the engine detail. */
  fixSubLine?: string | null
  /** The detour budget bar. Null keeps the original two lines. */
  budgetBar?: { text: string; step: number } | null
  /** Formats one minute of the day for a window row. */
  clock?: (min: number) => string
  /** The open add preview. Its index finds one row by stop id. */
  previewChip?: ItineraryPreviewChip | null
}) {
  const timeFormat = useTimeFormat()
  const days = [...trip.days].sort((a, b) => a.index - b.index)
  const position = days.findIndex(day => day.index === activeDay)
  const day = days[position]
  const date = day && visitDateForDay(trip.startDate, day.index)
  const dateLabel = date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '') : ''
  const locks = new Set(trip.fixedCommitments?.filter(lock => lock.dayIndex === activeDay).flatMap(lock => lock.stopId ? [lock.stopId] : []))
  const points = journey?.points ?? []
  // One budget block for every lens. The bar needs the used part, so Stay and
  // Fix keep it out and show the day budget alone.
  const budget = budgetBlockView(budgetBar ?? null, budgetMin)
  // The Fix problem row's sub line. One fix stop, one set of engine facts.
  const fixPoint = fixStopId == null ? null : points.find(point => point.stop.id === fixStopId) ?? null
  const engineFixSubLine = fixPoint == null
    ? null
    : fixReasonLine(fixPoint.title, formatHM(fixPoint.arrive, timeFormat), fixProblemReason(trip, activeDay))
  const fixRowLine = fixSubLine ?? engineFixSubLine
  const fixRowRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (fixStopId != null) fixRowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [fixStopId])
  const estimated = points.some((point, index) => {
    if (!point.legIn) return false
    const previous = points[index - 1]
    const leg = previous ? corrections?.[legKey(previous, point)] : undefined
    return !leg || leg.estimated === true
  })
  // A window is not a stop row. Each window enters the list once, at its own
  // place in time order. No count is printed here: the picks are not known.
  const minutesOf = (text: string) => {
    const [hours, minutes] = text.split(':').map(Number)
    return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : null
  }
  const resolvedWindows: ItineraryWindowRow[] = windowRows != null
    ? windowRows
    : windowRow != null ? [{ ...windowRow, active: true }] : []
  const windowsInOrder = clock == null ? [] : [...resolvedWindows].sort((a, b) => a.startMin - b.startMin)
  const insertAtFor = (startMin: number) => {
    const index = points.findIndex(point => {
      const arrive = minutesOf(point.arrive)
      return arrive != null && arrive > startMin
    })
    return index < 0 ? points.length : index
  }
  const windowsAt = (index: number) => windowsInOrder
    .filter(row => insertAtFor(row.startMin) === index)
    .map(row => {
      const duration = windowDurationText(row.startMin, row.endMin)
      return <li key={`window-${row.startMin}-${row.label}`} className={`mv2-window-row${row.active ? ' is-active-window' : ''}`}>
        <time className="mv2-lens-window-time">{clock?.(row.startMin)}</time>
        <span className="mv2-window-ring" aria-hidden="true" />
        <span className="mv2-stop-copy"><strong>{row.label}</strong><small>{clock?.(row.startMin)}–{clock?.(row.endMin)}{duration != null && ` · ${duration}`}</small></span>
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
  return <aside className="mv2-itinerary" aria-label="Day itinerary">
    <header className="mv2-day-header">
      <div className="mv2-day-arrows">
        <button type="button" className="mv2-icon-btn" disabled={position <= 0} aria-label="Previous day" onClick={() => { const previous = days[position - 1]; if (previous) onDayChange(previous.index) }}><ChevronLeft size={18} /></button>
        <div className="mv2-day-head">
          <span className="mv2-day-mark"><i className="mv2-day-dot" style={{ '--mv2-day-tone': dayColor(activeDay) } as CSSProperties} aria-hidden="true" />Day {activeDay + 1}{dateLabel && ` · ${dateLabel}`}</span>
          <h2>{journey ? <>{journey.startTitle}<ArrowRight size={17} aria-hidden />{journey.endTitle}</> : day?.title || 'Your day on the map'}</h2>
        </div>
        <button type="button" className="mv2-icon-btn" disabled={position < 0 || position >= days.length - 1} aria-label="Next day" onClick={() => { const next = days[position + 1]; if (next) onDayChange(next.index) }}><ChevronRight size={18} /></button>
      </div>
      <p>{journey ? `${Math.round(journey.distanceKm)} km · ${fmtDur(journey.driveMinutes)} drive · ${estimated ? 'estimate' : 'planned'}` : 'Add a stop to start this day.'}</p>
      <button type="button" className="mv2-fold-day" aria-label="Fold day itinerary" onClick={onFold}><ChevronLeft size={16} /></button>
    </header>
    <div className="mv2-budget mv2-lens-budget"><span className="mv2-lens-budget-label">{budget.label}</span><strong className="mv2-lens-budget-value">{budgetParts.lead != null && <b className="mv2-lens-budget-number">{budgetParts.lead}</b>}{budgetParts.rest}</strong>{budget.showBar && budgetBar != null
      ? <div className="mv2-budget-progress" role="progressbar" aria-label="Detour budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={budgetBar.step * 25}><span className="mv2-budget-progress-fill" data-step={budgetBar.step} /></div>
      : null}</div>
    <ol className="mv2-stops">
      {points.map((point, index) => <Fragment key={point.stop.id}>
        {windowsAt(index)}
        <li>
        {index === 0 && previewChipAt(null)}
        {index > 0 && point.legIn && <div className="mv2-travel-leg"><span />{Math.round(point.legIn.distanceKm)} km · {fmtDur(point.legIn.durationMinutes)}</div>}
        <button type="button" ref={fixStopId === point.stop.id ? fixRowRef : undefined} className={`mv2-stop${selectedStop === point.stop.id ? ' is-selected' : ''}${fixStopId === point.stop.id ? ' is-fix-problem' : ''}`} onClick={() => onSelect(point)} aria-pressed={selectedStop === point.stop.id}>
          <time>{formatHM(point.arrive, timeFormat)}</time>
          <span className={`mv2-stop-mark${point.kind === 'halt' || point.stop.category === 'hotel' ? ' is-stay' : ''}`}>
            {point.kind === 'start' || point.kind === 'destination' ? <Car size={13} /> : point.stop.category === 'hotel' ? <Home size={15} /> : index}
          </span>
          <span className="mv2-stop-copy"><strong>{point.title}</strong><small>{point.stop.category === 'travel' ? 'Journey anchor' : `${titleCase(point.stop.category)}${point.dwellMinutes > 0 ? ` · ${point.dwellMinutes} min` : ''}`}</small>{fixStopId === point.stop.id && fixRowLine != null && <small className="mv2-lens-fix-reason">{fixRowLine}</small>}{previewChipAt(point.stop.id)}</span>
          {locks.has(point.stop.id) && <LockKeyhole size={13} aria-label="Fixed time" />}
        </button>
      </li>
      </Fragment>)}
      {windowsAt(points.length)}
    </ol>
    {railExtras}
    <footer className="mv2-day-footer">
      {onOpenDay && <button type="button" className="mv2-timeline-link" onClick={() => onOpenDay(activeDay)}>Open day in Timeline<ArrowRight size={15} aria-hidden /></button>}
      <span className="mv2-section-label">Days on the map</span>
      <div className="mv2-day-strip" role="group" aria-label="Choose map day"><button type="button" aria-label="Show all map days" aria-pressed={allDays} onClick={onShowAll}>All</button>{days.map(item => <button key={item.index} type="button" aria-pressed={!allDays && item.index === activeDay} onClick={() => onDayChange(item.index)}><span aria-hidden="true" />{item.index + 1}</button>)}</div>
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

export function MapJourneyRibbon({ journey, corrections, preview = null, onScrub, inSheet = false }: {
  journey: Journey | null; corrections?: Record<string, LegEstimate>
  onScrub: (position: RibbonPosition, minute: number) => void
  /** The open add preview. Its own schedule re-times the stops shown here. */
  preview?: RibbonPreview | null
  /** W10b: the phone sheet ribbon has its own class, so the map camera does
   *  not read it as a second overlay above the sheet. */
  inSheet?: boolean
}) {
  const format = useTimeFormat()
  const planned = journey ? ribbonStops(journey) : []
  const stops = preview ? retimedStops(planned, preview) : planned
  const range = ribbonRange(stops)
  const { start, end } = range
  // Day index and the engine start clock join the stop times, so a new trip or
  // a new day cannot keep a stored cursor from the previous journey.
  const signature = ribbonSignature(stops, journey?.dayIndex ?? 0, journey?.startTime ?? '') + (preview ? `|preview:${preview.newStop.arrive}:${preview.newStop.depart}` : '')
  const [cursor, setCursor] = useState({ signature, minute: start })
  const minute = ribbonResetMinute(range, signature, cursor)
  const current = ribbonScrub(stops, minute, corrections, range)
  const position = current.position
  const id = useId()
  const percent = (value: number) => Math.max(0, Math.min(100, (value - start) / (end - start) * 100))
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
  return <section className={rootClass} aria-label="Journey clock">
    <div className="mv2-ribbon-title"><span>Journey</span><strong>Day {(journey?.dayIndex ?? 0) + 1}</strong><small>{preview ? previewTitle(preview, format) : current.cameraReveal ? 'Planned times' : 'Road position unavailable'}</small></div>
    <div className="mv2-clock-track">
      <div className="mv2-clock-drawing" aria-hidden="true">
        <span className="mv2-clock-line" />
        {stops.map((stop, index) => <span key={stop.point.stop.id} className={`mv2-clock-stop${stop.point.stop.category === 'hotel' ? ' is-stay' : ''}`} style={{ left: `${percent(stop.arrive)}%`, width: `${Math.max(1, percent(stop.depart) - percent(stop.arrive))}%` }}><i />{index === stops.length - 1 && <i className="mv2-clock-end" />}</span>)}
        {stops.map((stop, index) => <b key={`label-${stop.point.stop.id}`} className="mv2-clock-label" data-phone-label={index === 1 || index === stops.length - 1 ? 'true' : undefined}
          title={stop.point.title} style={{ left: `${percent(stop.arrive)}%`, width: `${Math.max(0, percent(stops[index + 1]?.arrive ?? end) - percent(stop.arrive))}%` }}>
          {stop.point.kind === 'start' ? 'Start' : stop.point.kind === 'destination' ? 'End' : stop.point.title.split(' · ')[0]}
        </b>)}
        <span className="mv2-clock-cursor" style={{ left: `${percent(minute)}%` }} />
      </div>
      <label className="sr-only" htmlFor={id}>Journey time. Arrow keys move by five minutes. Home and End jump to the start and end.</label>
      <input id={id} type="range" min={start} max={end} step={1} value={minute} disabled={!stops.length} aria-valuetext={`${formatHM(clockHM(minute), format)}${minute >= 1440 ? ', next day' : ''}. ${position?.label ?? 'No scheduled stops'}. ${current.cameraReveal ? 'Planned time.' : 'Road position unavailable.'}`}
        onChange={event => scrub(Number(event.target.value))}
        onKeyDown={event => {
          const next = ribbonKeyMinute(range, minute, event.key)
          if (next === null) return
          event.preventDefault()
          scrub(next)
        }} />
      <div className="mv2-clock-ticks" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index}>{formatHM(clockHM(start + (end - start) * index / 4), format)}</span>)}</div>
    </div>
    <output className="mv2-clock-reading">{formatHM(clockHM(minute), format)}<small>{preview ? 'Preview clock' : minute >= 1440 ? 'Next day' : position?.grade === 'estimated' ? 'Estimated travel' : 'Plan clock'}</small></output>
  </section>
}

export function MapPickCard({ fetchedAt, coverage, hit, trip, dayIndex, detourMin, reason, added, editable, busy, shortlisted, visitMin, budgetSharePct, source, freshness, actions, arriveMin, onAdd, onShortlist, onClose, onDirections }: {
  hit: PlaceHit; trip: Trip; dayIndex: number | null; detourMin: number | null; reason: string | null; added: boolean; editable: boolean; busy: boolean; shortlisted: boolean
  /** Projected visit length. Undefined = unprojected (existing fallback); null = unknown. */
  visitMin?: number | null
  /** Projected share of the day's detour budget; null or absent adds nothing. */
  budgetSharePct?: number | null
  /** Projected source. Undefined = unprojected; null = unknown source. */
  source?: PlaceHit['source'] | null
  /** Projected evidence freshness. Undefined = unprojected. */
  freshness?: JourneyFreshness
  /** Projected permissions. They can only restrict the existing controls. */
  actions?: JourneyActions
  /** Projected arrival clock for the existing hours note. */
  arriveMin?: number | null
  /** When this row's data was fetched. Null or absent shows no age. */
  fetchedAt?: number | null
  /** What the search covered. Null or absent shows nothing. */
  coverage?: DiscoveryCoverage | null
  onAdd: () => void; onShortlist: () => void; onClose: () => void; onDirections: () => void
}) {
  const format = useTimeFormat()
  const visit = visitMin !== undefined ? visitMin : intendedVisitMinutes(hit)
  const hours = hit.hours && visit != null ? hoursCardText(hoursDisplayFor(hit, { date: dayIndex == null ? null : visitDateForDay(trip.startDate, dayIndex), arrivalMin: arriveMin !== undefined ? arriveMin : null, visitMin: visit }), (open, close) => formatHMRange(open, close, format)) : null
  const sourceValue = source !== undefined ? source : hit.source
  const sourceLabel = sourceValue === 'google' ? 'Google Places' : sourceValue === 'osm' ? 'OpenStreetMap' : sourceValue === 'wikipedia' ? 'Wikipedia' : sourceValue === 'mappls' ? 'Mappls' : sourceValue === 'open-meteo' ? 'Open-Meteo' : 'Source not supplied'
  const freshnessLabel = freshness === undefined ? null : freshness === 'live' ? 'Live result' : freshness === 'retained' ? 'Retained result' : freshness === 'stale' ? 'Stale result' : 'Freshness unknown'
  // One display rule for the detour. An on-route detour hides its budget share.
  const detour = detourDisplay(detourMin)
  const [shownAt] = useState(() => Date.now())
  // Age and coverage are shown only when the row carries them.
  const dataFacts = [ageText(fetchedAt, shownAt), coverageText(coverage)].filter((fact): fact is string => fact != null)
  const canAdd = actions?.add ?? true
  const canShortlist = actions?.shortlist ?? true
  const canNavigate = actions?.navigate ?? true
  const hasReportedHours = (hit.hours != null && hit.hours.basis !== 'none') || !!hit.openTime || !!hit.closeTime
  const hoursNote = hours ? 'Reported opening hours' : hasReportedHours ? 'Visit hours need checking' : 'Hours unavailable'
  const costCells = knownCostCells([
    { key: 'drive', label: 'Extra driving', value: detourMin == null ? null : `${detourDisplayText(detourMin)}${detour.kind === 'extra' && budgetSharePct != null ? ` · ${Math.round(budgetSharePct)}% of budget` : ''}` },
    { key: 'visit', label: 'Visit', value: visit == null ? null : `${visit} min` },
    { key: 'placement', label: 'Placement', value: dayIndex == null ? null : `Day ${dayIndex + 1}` },
  ])
  return <article id="rail-detail" className="mv2-pick-card" tabIndex={-1} aria-label={`Place details: ${hit.name}`}>
    <div className="mv2-place-art"><CatIcon category={hit.category} size={38} /><span>{titleCase(hit.category ?? 'place')}</span><button className="mv2-icon-btn" type="button" aria-label="Close place details" onClick={onClose}><X size={18} /></button></div>
    <PlacePhotos hit={hit} />
    <div className="mv2-place-body">
      <span className="mv2-section-label">Along the drive · {dayIndex == null ? 'Choose a day' : `Day ${dayIndex + 1}`}</span>
      <h2>{hit.name}</h2>
      {hit.rating != null && <p className="mv2-rating"><Star size={14} aria-hidden /><strong>{hit.rating.toFixed(1)}</strong>{hit.ratingCount != null && <span>· {hit.ratingCount.toLocaleString('en-IN')} reviews</span>}</p>}
      {hit.description && <p className="mv2-place-description">{hit.description}</p>}
      {(hours || reason) && <div className="mv2-reason-chips">{hours && <span>{hours}</span>}{reason && <span>{reason}</span>}</div>}
      {costCells.length > 0 && <dl className="mv2-cost-strip">{costCells.map(cell => <div key={cell.key}><dt>{cell.label}</dt><dd>{cell.value}</dd></div>)}</dl>}
      <div className="mv2-preview-note"><Clock3 size={17} aria-hidden /><p>Check the impact before you keep it. Travel and visit time can move later stops.</p></div>
      {editable ? <div className="mv2-place-actions"><button type="button" className="btn btn-primary" disabled={added || busy || !canAdd} onClick={onAdd}>{added ? <Check size={17} /> : <Plus size={17} />}{added ? 'In your plan' : dayIndex == null ? 'Add to a day' : `Add to Day ${dayIndex + 1}`}</button><button className="mv2-icon-btn" type="button" disabled={added || busy || !canShortlist} aria-label={shortlisted ? 'Remove from shortlist' : 'Add to shortlist'} aria-pressed={shortlisted} onClick={onShortlist}><Heart size={18} fill={shortlisted ? 'currentColor' : 'none'} /></button></div> : <p className="mv2-viewer-note">You can explore this trip. Editing is available to its planners.</p>}
      <button type="button" className="mv2-directions" disabled={!canNavigate} onClick={onDirections}><ExternalLink size={15} aria-hidden />View place in Google Maps</button>
      <p className="mv2-source"><MapPin size={13} aria-hidden />{sourceLabel} · {hit.measuredRoadFact ? 'Road evidence supplied' : 'Driving estimate'} · {hoursNote}{freshnessLabel ? ` · ${freshnessLabel}` : ''}{dataFacts.map(fact => ` · ${fact}`).join('')}</p>
    </div>
  </article>
}

export function MapDeckHeader({ title, count, children, onFold }: { title: string; count: number; children?: ReactNode; onFold: () => void }) {
  return <header className="mv2-deck-header"><div><span className="mv2-section-label">Picks for your journey</span><h2>{title}<span>{count}</span></h2></div>{children}<button type="button" className="mv2-icon-btn" aria-label="Fold suggestions" onClick={onFold}><ArrowRight size={17} /></button></header>
}
