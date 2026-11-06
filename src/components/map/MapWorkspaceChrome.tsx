import { useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { ArrowRight, Car, Check, ChevronLeft, ChevronRight, Clock3, ExternalLink, Heart, Home, LockKeyhole, MapPin, Plus, Route, Star, X } from 'lucide-react'
import type { Trip } from '../../data/types'
import type { Journey, JourneyPoint, LegEstimate } from '../../lib/engine'
import { legKey, minutesToHM } from '../../lib/engine'
import { CatIcon } from '../icons'
import { useTimeFormat, formatHM, formatHMRange } from '../../lib/timefmt'
import { clockHM } from '../../lib/clockOverlay'
import { hoursCardText, hoursDisplayFor, intendedVisitMinutes, visitDateForDay } from '../../lib/hoursContext'
import type { PlaceHit } from '../../lib/geocode'
import type { JourneyActions, JourneyFreshness } from '../../lib/journeyProjection'
import { titleCase } from '../../lib/labels'
import { ribbonStops, ribbonPosition, type RibbonPosition } from '../../lib/mapJourneyRibbon'

export type SheetSnap = 'peek' | 'half' | 'full'

export function MapPhoneDay({ trip, journey, activeDay, allDays, onShowAll, onDayChange }: { trip: Trip; journey: Journey | null; activeDay: number; allDays: boolean; onShowAll: () => void; onDayChange: (index: number) => void }) {
  const days = [...trip.days].sort((a, b) => a.index - b.index)
  const at = days.findIndex(day => day.index === activeDay)
  return <div className="mv2-phone-day" aria-label="Map day">
    <button type="button" className="mv2-icon-btn" disabled={at <= 0} aria-label="Previous map day" onClick={() => { const day = days[at - 1]; if (day) onDayChange(day.index) }}><ChevronLeft size={17} /></button>
    <strong>Day {activeDay + 1}<span>{journey?.startTitle}{journey && ' → '}{journey?.endTitle}</span></strong>
    <button type="button" className="mv2-icon-btn" aria-label="Show all map days" aria-pressed={allDays} onClick={onShowAll}>All</button>
    <button type="button" className="mv2-icon-btn" disabled={at < 0 || at >= days.length - 1} aria-label="Next map day" onClick={() => { const day = days[at + 1]; if (day) onDayChange(day.index) }}><ChevronRight size={17} /></button>
  </div>
}

export function MapSheetHandle({ snap, onChange }: { snap: SheetSnap; onChange: (snap: SheetSnap) => void }) {
  const start = useRef({ y: 0, id: -1, dragged: false })
  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (start.current.id !== event.pointerId) return
    const delta = event.clientY - start.current.y
    start.current.id = -1
    if (Math.abs(delta) < 24) return
    start.current.dragged = true
    onChange(delta < 0 ? (snap === 'peek' ? 'half' : 'full') : (snap === 'full' ? 'half' : 'peek'))
  }
  return <button type="button" className="mv2-sheet-handle" aria-label={`Planning sheet ${snap} height. Use up and down arrows to resize.`}
    onPointerDown={event => { start.current = { y: event.clientY, id: event.pointerId, dragged: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
    onPointerUp={finish} onPointerCancel={() => { start.current.id = -1 }}
    onClick={() => { if (!start.current.dragged) onChange(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek'); start.current.dragged = false }}
    onKeyDown={event => {
      if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      onChange(event.key === 'Home' ? 'peek' : event.key === 'End' ? 'full' : event.key === 'ArrowUp' ? (snap === 'peek' ? 'half' : 'full') : (snap === 'full' ? 'half' : 'peek'))
    }}><span aria-hidden="true" /></button>
}

export function MapItinerary({ trip, journey, corrections, activeDay, budgetMin, selectedStop, allDays, onShowAll, onDayChange, onSelect, onOpenDay, onFold }: {
  trip: Trip; journey: Journey | null; activeDay: number; budgetMin: number; selectedStop: string | null
  corrections?: Record<string, LegEstimate>
  allDays: boolean; onShowAll: () => void
  onDayChange: (index: number) => void; onSelect: (point: JourneyPoint) => void; onOpenDay?: (index: number) => void; onFold: () => void
}) {
  const timeFormat = useTimeFormat()
  const days = [...trip.days].sort((a, b) => a.index - b.index)
  const position = days.findIndex(day => day.index === activeDay)
  const day = days[position]
  const date = day && visitDateForDay(trip.startDate, day.index)
  const dateLabel = date ? new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : ''
  const locks = new Set(trip.fixedCommitments?.filter(lock => lock.dayIndex === activeDay).flatMap(lock => lock.stopId ? [lock.stopId] : []))
  const points = journey?.points ?? []
  const estimated = points.some((point, index) => {
    if (!point.legIn) return false
    const previous = points[index - 1]
    const leg = previous ? corrections?.[legKey(previous, point)] : undefined
    return !leg || leg.estimated === true
  })
  return <aside className="mv2-itinerary" aria-label="Day itinerary">
    <header className="mv2-day-header">
      <div className="mv2-day-arrows">
        <button type="button" className="mv2-icon-btn" disabled={position <= 0} aria-label="Previous day" onClick={() => { const previous = days[position - 1]; if (previous) onDayChange(previous.index) }}><ChevronLeft size={18} /></button>
        <span>Day {activeDay + 1}{dateLabel && ` · ${dateLabel}`}</span>
        <button type="button" className="mv2-icon-btn" disabled={position < 0 || position >= days.length - 1} aria-label="Next day" onClick={() => { const next = days[position + 1]; if (next) onDayChange(next.index) }}><ChevronRight size={18} /></button>
      </div>
      <h2>{journey ? <>{journey.startTitle}<ArrowRight size={17} aria-hidden />{journey.endTitle}</> : day?.title || 'Your day on the map'}</h2>
      <p>{journey ? `${Math.round(journey.distanceKm)} km · ${minutesToHM(journey.driveMinutes)} travel · ${estimated ? 'estimate' : 'planned'}` : 'Add a stop to start this day.'}</p>
      <button type="button" className="mv2-fold-day mv2-icon-btn" aria-label="Fold day itinerary" onClick={onFold}><ChevronLeft size={16} /></button>
    </header>
    <div className="mv2-budget"><Route size={17} aria-hidden /><div><strong>{budgetMin} min detour budget</strong><span>Extra return driving. Visits use free time.</span></div></div>
    <ol className="mv2-stops">
      {journey?.points.map((point, index) => <li key={point.stop.id}>
        {index > 0 && point.legIn && <div className="mv2-travel-leg"><span />{Math.round(point.legIn.distanceKm)} km · {minutesToHM(point.legIn.durationMinutes)}</div>}
        <button type="button" className={`mv2-stop${selectedStop === point.stop.id ? ' is-selected' : ''}`} onClick={() => onSelect(point)} aria-pressed={selectedStop === point.stop.id}>
          <time>{formatHM(point.arrive, timeFormat)}</time>
          <span className={`mv2-stop-mark${point.kind === 'halt' || point.stop.category === 'hotel' ? ' is-stay' : ''}`}>
            {point.kind === 'start' || point.kind === 'destination' ? <Car size={13} /> : point.stop.category === 'hotel' ? <Home size={15} /> : index}
          </span>
          <span className="mv2-stop-copy"><strong>{point.title}</strong><small>{point.stop.category === 'travel' ? 'Journey anchor' : `${titleCase(point.stop.category)}${point.dwellMinutes > 0 ? ` · ${point.dwellMinutes} min` : ''}`}</small></span>
          {locks.has(point.stop.id) && <LockKeyhole size={13} aria-label="Fixed time" />}
        </button>
      </li>)}
    </ol>
    <footer className="mv2-day-footer">
      {onOpenDay && <button type="button" className="mv2-timeline-link" onClick={() => onOpenDay(activeDay)}>Open day in Timeline<ArrowRight size={15} aria-hidden /></button>}
      <span className="mv2-section-label">Days on the map</span>
      <div className="mv2-day-strip" role="group" aria-label="Choose map day"><button type="button" aria-label="Show all map days" aria-pressed={allDays} onClick={onShowAll}>All</button>{days.map(item => <button key={item.index} type="button" aria-pressed={!allDays && item.index === activeDay} onClick={() => onDayChange(item.index)}><span aria-hidden="true" />{item.index + 1}</button>)}</div>
    </footer>
  </aside>
}

export function MapJourneyRibbon({ journey, corrections, onScrub }: {
  journey: Journey | null; corrections?: Record<string, LegEstimate>; onScrub: (position: RibbonPosition, minute: number) => void
}) {
  const format = useTimeFormat()
  const stops = journey ? ribbonStops(journey) : []
  const start = stops[0]?.arrive ?? 0
  const end = Math.max(start + 1, stops[stops.length - 1]?.depart ?? start + 1)
  const signature = stops.map(stop => `${stop.point.stop.id}:${stop.arrive}:${stop.depart}`).join('|')
  const [cursor, setCursor] = useState({ signature, minute: start })
  const minute = cursor.signature === signature ? Math.max(start, Math.min(end, cursor.minute)) : start
  const position = ribbonPosition(stops, minute, corrections)
  const id = useId()
  const percent = (value: number) => Math.max(0, Math.min(100, (value - start) / (end - start) * 100))
  function scrub(next: number) {
    const value = Math.max(start, Math.min(end, next))
    setCursor({ signature, minute: value })
    const target = ribbonPosition(stops, value, corrections)
    if (target) onScrub(target, value)
  }
  if (!stops.length) return <section className="mv2-ribbon" aria-label="Journey clock"><span className="mv2-ribbon-title">Journey clock</span><span>No scheduled stops yet.</span></section>
  return <section className="mv2-ribbon" aria-label="Journey clock">
    <div className="mv2-ribbon-title"><span>Journey</span><strong>Day {(journey?.dayIndex ?? 0) + 1}</strong><small>{position?.grade === 'estimated' ? 'Road position unavailable' : 'Planned times'}</small></div>
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
      <label className="sr-only" htmlFor={id}>Journey time. Arrow keys move by five minutes.</label>
      <input id={id} type="range" min={start} max={end} step={1} value={minute} disabled={!stops.length} aria-valuetext={`${formatHM(clockHM(minute), format)}${minute >= 1440 ? ', next day' : ''}. ${position?.label ?? 'No scheduled stops'}. ${position?.grade === 'estimated' ? 'Road position unavailable.' : 'Planned time.'}`}
        onChange={event => scrub(Number(event.target.value))}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
          event.preventDefault()
          scrub(minute + (event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 5 : -5))
        }} />
      <div className="mv2-clock-ticks" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index}>{formatHM(clockHM(start + (end - start) * index / 4), format)}</span>)}</div>
    </div>
    <output className="mv2-clock-reading">{formatHM(clockHM(minute), format)}<small>{minute >= 1440 ? 'Next day' : position?.grade === 'estimated' ? 'Estimated travel' : 'Plan clock'}</small></output>
  </section>
}

export function MapPickCard({ hit, trip, dayIndex, detourMin, reason, added, editable, busy, shortlisted, visitMin, budgetSharePct, source, freshness, actions, arriveMin, onAdd, onShortlist, onClose, onDirections }: {
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
  onAdd: () => void; onShortlist: () => void; onClose: () => void; onDirections: () => void
}) {
  const format = useTimeFormat()
  const visit = visitMin !== undefined ? visitMin : intendedVisitMinutes(hit)
  const hours = hit.hours && visit != null ? hoursCardText(hoursDisplayFor(hit, { date: dayIndex == null ? null : visitDateForDay(trip.startDate, dayIndex), arrivalMin: arriveMin !== undefined ? arriveMin : null, visitMin: visit }), (open, close) => formatHMRange(open, close, format)) : null
  const sourceValue = source !== undefined ? source : hit.source
  const sourceLabel = sourceValue === 'google' ? 'Google Places' : sourceValue === 'osm' ? 'OpenStreetMap' : sourceValue === 'wikipedia' ? 'Wikipedia' : sourceValue === 'mappls' ? 'Mappls' : sourceValue === 'open-meteo' ? 'Open-Meteo' : 'Source not supplied'
  const freshnessLabel = freshness === undefined ? null : freshness === 'live' ? 'Live result' : freshness === 'retained' ? 'Retained result' : freshness === 'stale' ? 'Stale result' : 'Freshness unknown'
  const canAdd = actions?.add ?? true
  const canShortlist = actions?.shortlist ?? true
  const canNavigate = actions?.navigate ?? true
  const hasReportedHours = (hit.hours != null && hit.hours.basis !== 'none') || !!hit.openTime || !!hit.closeTime
  const hoursNote = hours ? 'Reported opening hours' : hasReportedHours ? 'Visit hours need checking' : 'Hours unavailable'
  return <article className="mv2-pick-card" tabIndex={-1} aria-label={`Place details: ${hit.name}`}>
    <div className="mv2-place-art"><CatIcon category={hit.category} size={38} /><span>{titleCase(hit.category ?? 'place')}</span><button className="mv2-icon-btn" type="button" aria-label="Close place details" onClick={onClose}><X size={18} /></button></div>
    <div className="mv2-place-body">
      <span className="mv2-section-label">Along the drive · {dayIndex == null ? 'Choose a day' : `Day ${dayIndex + 1}`}</span>
      <h2>{hit.name}</h2>
      {hit.rating != null && <p className="mv2-rating"><Star size={14} aria-hidden /><strong>{hit.rating.toFixed(1)}</strong>{hit.ratingCount != null && <span>· {hit.ratingCount.toLocaleString('en-IN')} reviews</span>}</p>}
      {hit.description && <p className="mv2-place-description">{hit.description}</p>}
      {(hours || reason) && <div className="mv2-reason-chips">{hours && <span>{hours}</span>}{reason && <span>{reason}</span>}</div>}
      <dl className="mv2-cost-strip"><div><dt>Extra driving</dt><dd>{detourMin == null ? 'Unknown' : detourMin > 0 ? `+${Math.round(detourMin)} min` : 'On route'}{budgetSharePct != null ? ` · ${Math.round(budgetSharePct)}% of budget` : ''}</dd></div><div><dt>Visit</dt><dd>{visit == null ? 'Unknown' : `${visit} min`}</dd></div><div><dt>Placement</dt><dd>{dayIndex == null ? 'Choose day' : `Day ${dayIndex + 1}`}</dd></div></dl>
      <div className="mv2-preview-note"><Clock3 size={17} aria-hidden /><p>Check the impact before you keep it. Travel and visit time can move later stops.</p></div>
      {editable ? <div className="mv2-place-actions"><button type="button" className="btn btn-primary" disabled={added || busy || !canAdd} onClick={onAdd}>{added ? <Check size={17} /> : <Plus size={17} />}{added ? 'In your plan' : 'Add to a day'}</button><button className="mv2-icon-btn" type="button" disabled={added || busy || !canShortlist} aria-label={shortlisted ? 'Remove from shortlist' : 'Add to shortlist'} aria-pressed={shortlisted} onClick={onShortlist}><Heart size={18} fill={shortlisted ? 'currentColor' : 'none'} /></button></div> : <p className="mv2-viewer-note">You can explore this trip. Editing is available to its planners.</p>}
      <button type="button" className="mv2-directions" disabled={!canNavigate} onClick={onDirections}><ExternalLink size={15} aria-hidden />View place in Google Maps</button>
      <p className="mv2-source"><MapPin size={13} aria-hidden />{sourceLabel} · {hit.measuredRoadFact ? 'Road evidence supplied' : 'Driving estimate'} · {hoursNote}{freshnessLabel ? ` · ${freshnessLabel}` : ''}</p>
    </div>
  </article>
}

export function MapDeckHeader({ title, count, children, onFold }: { title: string; count: number; children?: ReactNode; onFold: () => void }) {
  return <header className="mv2-deck-header"><div><span className="mv2-section-label">Picks for your journey</span><h2>{title}<span>{count}</span></h2></div>{children}<button type="button" className="mv2-icon-btn" aria-label="Fold suggestions" onClick={onFold}><ArrowRight size={17} /></button></header>
}
