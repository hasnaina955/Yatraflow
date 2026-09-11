// ============ Trip workspace — Timeline DaySection (extracted from TimelineTab.tsx,
// restructure Phase 3) — the day header/summary row, the animated body, the stop
// rows and the empty-day suggestions. The 19-prop signature is the shared contract
// between the shell and this module; treat it as load-bearing (see the memo notes).
// ============ Trip workspace — Timeline tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
// Includes DaySection, DayWeatherChip, TravelPanel, HaltPlanRow, DaySpark,
// MoveStopModal and ClampedText — the whole timeline hot path.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight, Ban, Car, ChevronDown, ChevronUp, CircleCheck, CircleHelp, Clock, CloudRain, CloudSun,
  Copy, Droplets, ExternalLink, Flag, MapPin,
  MoveHorizontal, PenLine, Pencil, Pin, Plus,   Ticket, Trash2, TriangleAlert, 
} from 'lucide-react'
import type { Trip, ItineraryStop } from '../../../data/types'
import {
  simulateDay, originOf, getAssumptions, coLocates, minutesToHM, hmToMinutes, formatInr,
  predecessorOf, nextAfter, buildJourney, 
  computeCategoryBias,
} from '../../../lib/engine'
import type { LegEstimate, ScheduleWarning } from '../../../lib/engine'
import { routeChain, stayDaySummary, dwellSegments, visibleStops } from '../../../lib/daySummary'
import { openExternal } from '../../../lib/native'
import { useTimeFormat, formatHM, formatHMRange } from '../../../lib/timefmt'
import { prefersReducedMotion } from '../../../lib/motion'
import { stopKindOf, STOP_KIND_LABELS } from '../../../lib/stopKind'
import { statusLabel } from '../../../lib/labels'
import { Chip, EmptyState, useReorder } from '../../../components/ui'
import { useSuggestionCache } from '../../../hooks/useSuggestionCache'
import { searchNearbyPois } from '../../../lib/geocode'
import type { PlaceHit } from '../../../lib/geocode'
import { MetaIcon } from '../../../components/icons'
import { fetchDailyWeather, forecastAvailable, isoAddDays, wmoInfo } from '../../../lib/weather'
import type { DayWeather } from '../../../lib/weather'
import { TravelPanel } from './TravelPanel'
import { DaySpark } from './DaySpark'

/** Compact forecast chip for a single trip day (Timeline day headers). */
function DayWeatherChip({ trip, dayIndex }: { trip: Trip; dayIndex: number }) {
  const [w, setW] = useState<DayWeather | null>(null)
  const date = isoAddDays(trip.startDate, dayIndex)
  useEffect(() => {
    if (!forecastAvailable(trip.startDate)) return
    let cancelled = false
    fetchDailyWeather(
      trip.days.flatMap(d => d.stops)[0]?.lat ?? 10.5,
      trip.days.flatMap(d => d.stops)[0]?.lng ?? 76.5,
      date, 1,
    ).then(res => { if (!cancelled) setW(res[date] ?? null) }).catch(() => {})
    return () => { cancelled = true }
  }, [date]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!w) return null
  const info = wmoInfo(w.code)
  return (
    <span className="weather-chip" title={`${info.label} · ${Math.round(w.tempMinC)}–${Math.round(w.tempMaxC)}°C · ${w.rainChancePct}% rain chance`}>
      {info.icon} {Math.round(w.tempMaxC)}°<Droplets size={11} aria-hidden style={{ verticalAlign: '-1px', marginLeft: 4, marginRight: 2 }} />{w.rainChancePct}%
    </span>
  )
}

// ============ Clamp long stop descriptions behind a "Show more" toggle (#3) ============
// Renders text clamped to 2 lines; shows a toggle only when the text actually
// overflows. Detection uses a hidden always-clamped twin, so the toggle stays
// present even while the visible block is expanded (measurement never flips).
function ClampedText({ children, className }: { children: React.ReactNode; className?: string }) {
  const measurerRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const el = measurerRef.current
    if (!el) return
    const check = () => setOverflows(el.scrollHeight > el.clientHeight + 1)
    check()
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(check)
      ro.observe(el)
      return () => ro.disconnect()
    }
  }, [children])

  return (
    <div className="clamp-wrap">
      {/* invisible always-clamped twin: keeps overflow detection independent of expansion */}
      <div ref={measurerRef} aria-hidden="true" className="clamp-measure">{children}</div>
      <div className={`${className ?? ''} ${expanded ? '' : 'clamp-lines'}`}>{children}</div>
      {overflows && (
        <button type="button" className="clamp-toggle" onClick={() => setExpanded(x => !x)} aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

/** Collapsed-row dwell chart (docs/TIMELINE-PLAN.md Phase 1): one bar per
 *  visible stop, amber on the stop that eats the most of the day. Pure data
 *  from dwellSegments; hides itself when the chart would say nothing. */
function DwellBars({ day }: { day: Trip['days'][number] }) {
  const segs = dwellSegments(day)
  if (!segs) return null
  return (
    <span className="dwell-bars" aria-hidden="true">
      {segs.map(s => (
        <i
          key={s.stop.id}
          className={s.busiest ? 'dwell-bar busiest' : 'dwell-bar'}
          style={{ flexGrow: s.weight }}
          title={`${s.stop.title} · ${minutesToHM(s.minutes)} at the stop`}
        />
      ))}
    </span>
  )
}

/** Smooth open/close for a day body: the wrapper animates grid rows 0fr→1fr
 *  (height-agnostic, no max-height guessing), mounting the body just before
 *  the expand and unmounting it just after the collapse — so a closed day
 *  still costs nothing (the collapsed-by-default premise) while the motion
 *  stays smooth. A section that mounts already-open does NOT animate (no
 *  surprise motion on page load). */
function SmoothCollapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [expanded, setExpanded] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setExpanded(true)) })
      return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
    }
    setExpanded(false)
    const t = window.setTimeout(() => setMounted(false), 280)
    return () => window.clearTimeout(t)
  }, [open])
  if (!mounted) return null
  return (
    <div className={`day-body-clip${expanded ? ' open' : ''}`} aria-hidden={!expanded}>
      <div className="day-body-clip-inner">{children}</div>
    </div>
  )
}

// React.memo on the timeline hot path: TimelineTab re-renders on every store
// commit (the shell's useDb feeds the tab counts), but with stable props each
// DaySection now bails out unless ITS day/trip data actually changed (M3.1 made
// trip references immutable, so `day`/`trip` are stable between commits).
export const DaySection = React.memo(function DaySection({ day, trip, editable, open, onToggleOpen, onAdd, onEdit, onDelete, onMoveWithinDay, onMoveBetweenDays, onMoveStopIn, onRenameDay, onCopyDay, onAddQuickStop, onSetDayStart, onAddPlannedHalts, warnings, onStatus, legCorrections, suggestionCache, dayTotals }: {
  day: Trip['days'][number]
  trip: Trip
  editable: boolean
  /** accordion state, owned by TimelineTab (one open day per trip) */
  open: boolean
  onToggleOpen: (dayIndex: number) => void
  legCorrections?: Record<string, LegEstimate>
  suggestionCache: ReturnType<typeof useSuggestionCache>
  /** this day's slice of computeTotals().byDay — transport + expenses + entry fees */
  dayTotals?: { dayIndex: number; expensesInr: number; transportInr: number; totalInr: number; stops: number; distanceKm: number }
  onAdd: (dayIndex: number) => void
  onEdit: (stopId: string) => void
  onDelete: (stopId: string, dayIndex: number) => void
  onMoveWithinDay: (from: number, to: number, dayIndex: number) => void
  onMoveBetweenDays: (stop: ItineraryStop) => void
  /** cross-day drag landed on this day: insert the stop at `position` */
  onMoveStopIn: (stopId: string, fromDayIndex: number, toDayIndex: number, position: number) => void
  onRenameDay: (dayIndex: number, title: string) => void
  onCopyDay: (dayIndex: number) => void
  onAddQuickStop: (dayIndex: number, stop: Omit<ItineraryStop, 'id' | 'orderInDay'>) => void
  /** set the day's ride/drive start time (long-ride planner) */
  onSetDayStart: (dayIndex: number, time: string) => void
  /** insert planned break halts, each at a user-chosen km point, ordered by distance */
  onAddPlannedHalts: (dayIndex: number, halts: { km: number; stop: Omit<ItineraryStop, 'id' | 'orderInDay'> }[]) => void
  warnings: ScheduleWarning[]
  onStatus: (stop: ItineraryStop, status: ItineraryStop['status']) => void
}) {
  const sim = simulateDay(day, trip, originOf(trip, day.index), day.index, legCorrections)
  // One unified journey per day — start → halts/visits → destination with an
  // arrival clock — regardless of distance. This is the single travel system.
  const journey = useMemo(() => buildJourney(trip, day, legCorrections), [trip, day, legCorrections])
  const visitCount = journey.points.filter(p => p.kind === 'visit').length
  // A stay day: the journey never leaves its base — no chain, no synthesized
  // destination. Intermediate days of a round trip parked at the destination.
  // The travelling card belongs to the departure day, the return day, real
  // transfers, and any day where the user adds travel manually.
  const isStayDay = journey.points.length <= 1 && journey.distanceKm < 0.5
  const A = getAssumptions(trip)
  const ordered = useMemo(() => [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay), [day.stops])
  // --- Liquid drag (bencho-style, BoardView parity): the DOM order NEVER
  // changes mid-drag. The carried row is pinned to the pointer by the engine
  // (lib/touchDnd.ts) and its skin warps with the throw; rows between the
  // carried slot and the cursor target glide out of the way in real time
  // (transform transition). Drop resolves through the insertion index and the
  // arrangement settles ONCE via the FLIP pass on commit. ---
  const stopsRef = useRef<HTMLDivElement>(null)
  const [insertIdx, setInsertIdx] = useState<number | null>(null)
  const insertRef = useRef(insertIdx)
  insertRef.current = insertIdx
  /** viewport rect of the row as it was carried at release — the FLIP pass
      below springs it from there into its new slot (same-list drops AND
      foreign drops landing here both consume it) */
  const dropRect = useRef<{ id: string; x: number; y: number } | null>(null)
  const { dndHandlers, dayDropHandlers, dragging, foreignOver, moveUp, moveDown, takeCarryRect } = useReorder(
    ordered,
    (fromIdx) => {
      // idx counts positions in the full list (dragged slot included), so a
      // slot past the dragged index shifts down once it is removed.
      const idx = insertRef.current ?? fromIdx
      const toIdx = idx > fromIdx ? idx - 1 : idx
      if (toIdx !== fromIdx) {
        const rect = takeCarryRect()
        if (rect && ordered[fromIdx]) dropRect.current = { id: ordered[fromIdx].id, x: rect.x, y: rect.y }
        onMoveWithinDay(fromIdx, toIdx, day.index)
      }
      setInsertIdx(null)
    },
    {
      dragPayload: (s) => JSON.stringify({ stopId: s.id, fromDay: day.index }),
      onForeignDrop: (payload, toIdx) => {
        try {
          const p = JSON.parse(payload) as { stopId?: string; fromDay?: number }
          if (p.stopId && typeof p.fromDay === 'number' && p.fromDay !== day.index) {
            const rect = takeCarryRect()
            if (rect) dropRect.current = { id: p.stopId, x: rect.x, y: rect.y }
            onMoveStopIn(p.stopId, p.fromDay, day.index, toIdx)
          }
        } catch { /* malformed payload — ignore */ }
      },
      /** engine hover → insertion slot: the hovered row's midpoint decides
          before/after; an index past the rows means "at the end". The hole
          stays where it last read while the finger is outside the list —
          the same clamp-the-reading, free-the-finger rule bencho uses. */
      onOwnHover: (idx, _x, y) => {
        const rows = stopsRef.current?.querySelectorAll<HTMLElement>('[data-stop-id]')
        if (!rows || rows.length === 0) return
        let next: number
        if (idx >= rows.length) {
          next = rows.length
        } else {
          const r = rows[idx].getBoundingClientRect()
          next = y < r.top + r.height / 2 ? idx : idx + 1
        }
        if (insertRef.current !== next) setInsertIdx(next)
      },
    },
  )
  useEffect(() => { if (dragging === null) setInsertIdx(null) }, [dragging])

  /** Live glide offset for row i while a drag is open: rows between the
   *  carried slot and the insertion index slide by the carried row's height
   *  (plus its row gap), so a clean gap opens at the target. */
  function glideOffset(i: number): number | null {
    if (dragging === null || insertIdx === null || insertIdx === dragging || i === dragging) return null
    const row = stopsRef.current?.querySelectorAll<HTMLElement>('[data-stop-id]')[dragging]
    const h = row ? row.offsetHeight + 8 : 0
    if (insertIdx > dragging && i > dragging && i < insertIdx) return h
    if (insertIdx < dragging && i >= insertIdx && i < dragging) return -h
    return null
  }

  // FLIP slot-in (BoardView parity): when this day's arrangement changes
  // (same-day reorder, or a stop slotting in from another day), every row
  // animates from its previous position to the new one — compositor-only.
  // The row that was CARRIED springs from where the finger released it (the
  // engine's carry rect) rather than from its old slot; every other row
  // animates from its pre-drag position. Fires once per committed
  // arrangement, never during the drag itself.
  const prevRects = useRef<Map<string, { x: number; y: number }> | null>(null)
  useLayoutEffect(() => {
    const rootEl = stopsRef.current
    if (!rootEl) return
    const now = new Map<string, { x: number; y: number }>()
    for (const el of Array.from(rootEl.querySelectorAll<HTMLElement>('[data-stop-id]'))) {
      const r = el.getBoundingClientRect()
      now.set(el.dataset.stopId!, { x: r.left, y: r.top })
    }
    const prev = prevRects.current
    const dropped = dropRect.current
    dropRect.current = null
    if (prev && !prefersReducedMotion()) {
      for (const [id, p] of now) {
        const q = dropped && dropped.id === id ? dropped : prev.get(id)
        if (!q) continue
        const dx = q.x - p.x
        const dy = q.y - p.y
        if (dx || dy) {
          rootEl.querySelector<HTMLElement>(`[data-stop-id="${CSS.escape(id)}"]`)
            ?.animate(
              [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
              { duration: 240, easing: 'cubic-bezier(.22, .61, .36, 1)' },
            )
        }
      }
    }
    prevRects.current = now
  }, [ordered])
  const commitmentsToday = trip.fixedCommitments.filter(fc => fc.dayIndex === day.index)

  // --- Collapsed-by-default accordion (docs/TIMELINE-PLAN.md Phase 1) ---
  // Collapse state lives in TimelineTab (one open day per trip, persisted via
  // uiPrefs.loadOpenDay). This component is controlled: `open` in, `onToggleOpen`
  // out — the old local collapsed useState + per-day localStorage map is retired.
  const collapsed = !open
  const timeFormat = useTimeFormat()
  const onCollapseClick = useCallback(() => onToggleOpen(day.index), [onToggleOpen, day.index])
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(day.title ?? '')
  const [nearby, setNearby] = useState<PlaceHit[]>([])
  const nextAnchor = useMemo(() => nextAfter(trip, day.index), [trip]) // eslint-disable-line react-hooks/exhaustive-deps
  // "Continue to X" only makes sense while X is still ahead of you. The day
  // wakes up where the previous day's JOURNEY ended — when that IS the next
  // anchor (you arrived at the trip's destination on day 1, so every later
  // unplanned day is parked there), the chip would offer a drive to where
  // you already stand. Suppress it; nearby-idea chips are unaffected.
  const alreadyAtNext = useMemo(
    () => !!nextAnchor && coLocates(originOf(trip, day.index), nextAnchor.point),
    [trip, nextAnchor], // eslint-disable-line react-hooks/exhaustive-deps
  )

  // anchor suggestions on where you'd arrive from; only for unplanned days
  useEffect(() => {
    if (!editable || ordered.length > 0) { setNearby([]); return }
    let cancelled = false
    const anchor = predecessorOf(trip, day.index)?.point ?? trip.startLocationCoords
    if (!anchor) return
    searchNearbyPois(anchor.lat, anchor.lng, 10000, 6, {
      includeFuel: trip.transportMode === 'car' || trip.transportMode === 'motorcycle',
      homeCenter: trip.startLocationCoords ?? null,
      categoryBias: computeCategoryBias(trip),
    })
      .then(hits => { if (!cancelled) setNearby(hits.slice(0, 3)) })
      .catch(() => { /* suggestions are best-effort */ })
    return () => { cancelled = true }
  }, [editable, ordered.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // day progress: how much of the realistic window (start–20:00) the plan consumes
  const dayStartHM = day.startTime ?? A.dayStart
  const startMin = hmToMinutes(dayStartHM)
  const windowMin = Math.max(1, hmToMinutes(A.dayEnd) - startMin)
  const used = Math.max(0, Math.min(1, (hmToMinutes(sim.endsAt) - startMin) / windowMin))
  const sev = warnings.some(w => w.severity === 'high') ? 'high' : warnings.some(w => w.severity === 'medium') ? 'medium' : 'ok'
  // Header stats as segments — rendered with a dimmed pipe separator, which
  // tracks better across a long line than a cramped mid-dot at 12px.
  const statSegments: React.ReactNode[] = isStayDay
    ? [
        `Based in ${journey.startTitle}`,
        ...(visitCount > 0 ? [`${visitCount} visit${visitCount !== 1 ? 's' : ''}`] : []),
      ]
    : [
        `${journey.startTitle} → ${journey.endTitle}`,
        `~${Math.round(journey.distanceKm)} km`,
        `drive ~${minutesToHM(journey.driveMinutes)}`,
        ...(journey.halts.length > 0 ? [`${journey.halts.length} halt${journey.halts.length !== 1 ? 's' : ''}`] : []),
        ...(visitCount > 0 ? [`${visitCount} visit${visitCount !== 1 ? 's' : ''}`] : []),
        `start ${formatHM(journey.startTime, timeFormat)} → ends ~${formatHM(sim.endsAt, timeFormat)}`,
      ]
  // The route chain is only worth a line when the day's PLANNED stops add
  // something the stats route (start → end) doesn't already say — auto
  // anchors and single-stop days would just repeat it back.
  const chainStops = visibleStops(day).filter(s => !s.auto)

  return (
    <div className={`day-section${collapsed ? ' day-closed' : ''}${collapsed && isStayDay ? ' day-stay-collapsed' : ''}`} id={`day-card-${day.index}`}>
      <div className="day-header">
        {/* Stable name + state attribute (UI audit F-09); the collapsible body
            is a fragment of siblings, so there's no single aria-controls id. */}
        <button className="day-collapse" onClick={onCollapseClick} aria-expanded={!collapsed} aria-label={`Day ${day.index + 1} stops`}>
          <ChevronDown size={16} aria-hidden className="day-collapse-icon" />
        </button>
        <div className="day-badge"><small>Day</small><b>{day.index + 1}</b></div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div className="day-title-row">
            {editingTitle ? (
              <input
                autoFocus
                className="input"
                value={titleDraft}
                style={{ maxWidth: 300, marginBottom: 4 }}
                placeholder={`Day ${day.index + 1}`}
                aria-label={`Rename Day ${day.index + 1}`}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={() => { setEditingTitle(false); if (titleDraft.trim() !== (day.title ?? '')) onRenameDay(day.index, titleDraft) }}
                onKeyDown={e => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  if (e.key === 'Escape') { setTitleDraft(day.title ?? ''); setEditingTitle(false) }
                }}
              />
            ) : editable ? (
              <button type="button" className="day-title-btn" onClick={() => { setTitleDraft(day.title ?? ''); setEditingTitle(true) }}
                title="Click to rename this day"
                aria-label={`Rename Day ${day.index + 1}`}
              >
                {day.title ?? `Day ${day.index + 1}`}
              </button>
            ) : (
              <h3>{day.title ?? `Day ${day.index + 1}`}</h3>
            )}
            {collapsed && (
              <span className={`day-kind ${isStayDay ? 'stay' : 'drive'}`}>{isStayDay ? 'Stay day' : 'Drive day'}</span>
            )}
          </div>
          {/* Collapsed extra line: only when it adds something the stats line
              doesn't already say. Stay days get their quiet "no driving" line;
              drive days get the stop-name chain when there are ≥2 planned
              stops. It's a button that opens the day, like the mockup; names
              wrap rather than truncate (full chain rides in the tooltip). */}
          {collapsed && (isStayDay ? (
            <button type="button" className="day-route" onClick={onCollapseClick}>
              <span className="day-route-text">{stayDaySummary(visitCount)}</span>
            </button>
          ) : chainStops.length >= 2 ? (
            <button type="button" className="day-route" onClick={onCollapseClick} title={routeChain(day)}>
              {chainStops.slice(0, 5).map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <span className="day-route-sep" aria-hidden="true">→</span>}
                  <span className="day-route-stop">{s.title}</span>
                </React.Fragment>
              ))}
              {chainStops.length > 5 && <span className="day-route-more">+{chainStops.length - 5} more</span>}
            </button>
          ) : null)}
          <div className="small muted num">
            {statSegments.map((seg, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="stat-sep" aria-hidden="true">|</span>}
                {seg}
              </React.Fragment>
            ))}
          </div>
          <div className={`day-progress ${collapsed ? 'compact' : ''}`} title={`${Math.round(used * 100)}% of the ${formatHM(dayStartHM, timeFormat)}–${formatHM(A.dayEnd, timeFormat)} window`}>
            <div className={`day-progress-fill sev-${sev}`} style={{ width: `${Math.round(used * 100)}%` }} />
          </div>
          {!collapsed && <DayWeatherChip trip={trip} dayIndex={day.index} />}
        </div>
        {/* Per-day cost + time-at-stops: intelligence the engine already
            computes (computeTotals().byDay + simulateDay dwell), surfaced where
            the plan is edited. Hidden while collapsed so a folded day's header
            stays calm. */}
        {!collapsed && dayTotals != null && dayTotals.totalInr > 0 && (
          <span
            className="day-cost-chip"
            title={`≈ ${formatInr(dayTotals.transportInr)} travel · ${formatInr(dayTotals.expensesInr)} day costs (incl. entry fees)`}
          >
            ≈ {formatInr(dayTotals.totalInr)}
          </span>
        )}
        {!collapsed && sim.dwellMinutes > 0 && (
          <span className="day-dwell-chip" title="Time at the stops (visits + buffers) — driving time is in the summary line">
            {minutesToHM(sim.dwellMinutes)} at stops
          </span>
        )}
        {sev !== 'ok' && (
          <span className={`day-warn-pill sev-${sev}`} title={warnings.map(w => w.title).join('\n')}>
            <TriangleAlert size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />{warnings[0].title.replace(/^Day \d+:\s*/, '')}{warnings.length > 1 ? ` · +${warnings.length - 1} more` : ''}
          </span>
        )}
        {ordered.filter(s => s.status !== 'rejected').length >= 2 && <DaySpark stops={ordered.filter(s => s.status !== 'rejected')} />}
        {/* Collapsed-only dwell chart: one bar per stop, amber on the stop
            that eats the most of the day (mockup P1's "busiest stop"). */}
        {collapsed && <DwellBars day={day} />}
        {editable && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className="btn btn-outline btn-sm"
              disabled={ordered.length === 0 || day.index + 1 >= trip.days.length}
              onClick={() => onCopyDay(day.index)}
              title={ordered.length ? `Copy these stops to Day ${day.index + 2}` : 'Nothing to copy yet'}
            ><Copy size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />Copy</button>
            <button className="btn btn-outline btn-sm" onClick={() => onAdd(day.index)}>+ Add here</button>
          </div>
        )}
      </div>

      <SmoothCollapse open={!collapsed}>
      {commitmentsToday.map(fc => (
        <div key={fc.id} className="warn-item sev-low" style={{ marginBottom: 8 }}>
          <span className="warn-icon"><Pin size={13} aria-hidden /></span>
          <div>
            <div className="warn-title">{fc.title}</div>
            <div className="warn-fix">Fixed at {formatHM(fc.time, timeFormat)}{fc.notes ? ` — ${fc.notes}` : ''}</div>
          </div>
        </div>
      ))}

      {/* Warning state lives inside the affected day (doc §6.3) — the "Day N:"
          prefix is redundant here, the pill + card already say which day. */}
      {warnings.map((w, i) => (
        <div key={i} className={`warn-item ${w.severity === 'high' ? 'sev-high' : w.severity === 'medium' ? '' : 'sev-low'}`} style={{ marginBottom: 8 }}>
          <span className="warn-icon">{w.severity === 'high' ? <Ban size={13} aria-hidden /> : <TriangleAlert size={13} aria-hidden />}</span>
          <div>
            <div className="warn-title">{w.title.replace(/^Day \d+:\s*/, '')}</div>
            {w.fix && <div className="warn-fix">{w.fix}</div>}
          </div>
        </div>
      ))}

      <TravelPanel trip={trip} day={day} editable={editable} journey={journey} suggestionCache={suggestionCache}
        onSetDayStart={onSetDayStart} onAddPlannedHalts={onAddPlannedHalts} />

      {ordered.length === 0 && (<>
        <EmptyState icon={<CloudSun size={38} aria-hidden />} title="Nothing planned yet" body="Add your first stop for this day — or drag one here from another day."
          action={editable ? <button className="btn btn-primary btn-sm" onClick={() => onAdd(day.index)}>+ Add stop</button> : undefined} />
        {editable && ((nextAnchor && !alreadyAtNext) || nearby.length > 0) && (
          <div className="day-suggest">
            {nextAnchor && !alreadyAtNext && (
              <button className="chip-btn" onClick={() => onAddQuickStop(day.index, nextWaypointStop(nextAnchor))} title="Add this as a route waypoint">
                <ArrowRight size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />Continue to {nextAnchor.name.replace(/ \((start|end)\)$/, '')}
              </button>
            )}
            {nearby.map(h => (
              <button key={h.name} className="chip-btn" onClick={() => onAddQuickStop(day.index, poiQuickStop(h))} title="Add this nearby idea">
                <Plus size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />{h.name}
              </button>
            ))}
          </div>
        )}
      </>)}

      <div className={`tl${dragging !== null ? ' is-dragging' : ''}`} ref={stopsRef}>
        {ordered.map((s, i) => {
          // Auto anchors (trip start/end, route-continuation waypoints) are pure
          // route endpoints, not activities. The rich travel summary (mode,
          // distance, fuel, departure→ETA, halts) lives in TravelPanel above;
          // here we just anchor the timeline leg with a clean marker.
          const isAnchor = s.auto === true
          if (isAnchor) {
            const cleanName = (s.locationName || s.title).replace(/ \((start|end)\)$/, '')
            // The day's final anchor (when the journey ends at a stored stop,
            // not a synthesized one) reads as the destination with its arrival.
            const isFinal = i !== 0 && journey.points[journey.points.length - 1].stop.id === s.id
            // Stay day: the journey never leaves this place — a plain base
            // marker, not a travelling card (that belongs to the departure
            // day, the return day, and manually planned travel days).
            if (isStayDay) {
              return (
                <div key={s.id} data-stop-id={s.id} className="tl-row tl-anchor" style={{ transform: glideOffset(i) != null ? `translateY(${glideOffset(i)}px)` : undefined }} {...(editable ? dndHandlers(i) : {})}>
                  <div className="tl-gutter" aria-hidden="true" />
                  <div className="travel-endpoint">
                    <span className="travel-anchor-ico"><MapPin size={13} aria-hidden /></span>
                    <span>Based in {cleanName}</span>
                  </div>
                </div>
              )
            }
            return (
              <div key={s.id} data-stop-id={s.id} className="tl-row tl-anchor" style={{ transform: glideOffset(i) != null ? `translateY(${glideOffset(i)}px)` : undefined }} {...(editable ? dndHandlers(i) : {})}>
                <div className="tl-gutter" aria-hidden="true">
                  <span className="tl-time">{isFinal ? (sim.arrivalTimes[i] ? formatHM(sim.arrivalTimes[i], timeFormat) : '--:--') : (sim.departures[i] ? formatHM(sim.departures[i], timeFormat) : '--:--')}</span>
                </div>
                <div className="travel-endpoint">
                  <span className="travel-anchor-ico">{i === 0 || isFinal ? <Flag size={13} aria-hidden /> : <MapPin size={13} aria-hidden />}</span>
                  <span>
                    {i === 0 ? `Start — ${cleanName}` : isFinal ? `Destination — ${cleanName}` : cleanName}
                  </span>
                  {isFinal && <span className="small muted" style={{ marginLeft: 6 }}>arrives ~{sim.arrivalTimes[i] ? formatHM(sim.arrivalTimes[i], timeFormat) : '--:--'}</span>}
                </div>
              </div>
            )
          }
          const kind = stopKindOf(s)
          return (
            <React.Fragment key={s.id}>
              <div
                className="tl-row"
                data-stop-id={s.id}
                style={{ transform: glideOffset(i) != null ? `translateY(${glideOffset(i)}px)` : undefined }}
                {...(editable ? dndHandlers(i) : {})}
              >
                <div className="tl-gutter" aria-hidden="true">
                  <span className="tl-time tl-arr">{sim.arrivalTimes[i] ? formatHM(sim.arrivalTimes[i], timeFormat) : '--:--'}</span>
                  <span className="tl-line" />
                  <span className="tl-time tl-dep">{sim.departures[i] ? formatHM(sim.departures[i], timeFormat) : '--:--'}</span>
                </div>
                <div
                  className={`stop-card kind-${kind} status-${s.status} ${foreignOver === i && dragging === null ? 'foreign-over' : ''}`}
                >
                <div className={`stop-num cat-${s.category}`}>{i + 1}</div>
              <div className="stop-main">
                <div className="stop-toprow">
                  <span className="stop-title">{s.title}</span>
                  <Chip tone={statusTone(s.status)}>{statusLabel(s.status)}</Chip>
                  <span className={`stop-kind-tag kind-${kind}`}>{STOP_KIND_LABELS[kind]}</span>
                  {s.priority === 'must-do' && <Chip tone="danger">Must do</Chip>}
                  {s.priority === 'optional' && <Chip tone="saffron">Optional</Chip>}
                  {s.weatherSensitive && <Chip tone="info"><CloudRain size={11} aria-hidden style={{ verticalAlign: '-1px', marginRight: 3 }} />weather-sensitive</Chip>}
                </div>
                <div className="stop-meta">
                  <span><MetaIcon icon={ MapPin } tone="place" />{s.locationName}</span>
                  <span><MetaIcon icon={ Clock } tone="time" />{minutesToHM(s.visitMinutes)}</span>
                  {s.openTime && <span><MetaIcon icon={ Clock } tone="time" />{formatHMRange(s.openTime, s.closeTime, timeFormat)}</span>}
                  <span><MetaIcon icon={ Ticket } tone="ticket" />₹{s.entryFeeInrPerPerson}/person</span>
                  <span><MetaIcon icon={ Car } tone="money" />₹{s.transportCostInrTotal} transport</span>
                  {s.departTime && s.arrivalTime && (
                    <span><MetaIcon icon={ Clock } tone="time" />dep {formatHM(s.departTime, timeFormat)} · arr {formatHM(s.arrivalTime, timeFormat)}{s.legDistanceKm ? ` · ${s.legDistanceKm.toFixed(0)} km` : ''}</span>
                  )}
                </div>
                {s.description && <ClampedText className="stop-desc">{s.description}</ClampedText>}
                {s.notes && <ClampedText className="stop-desc muted"><PenLine size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />{s.notes}</ClampedText>}
                {s.sourceUrl && <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="small" onClick={e => { e.preventDefault(); openExternal(s.sourceUrl!) }}>Source <ExternalLink size={11} aria-hidden style={{ verticalAlign: '-2px', marginLeft: 2 }} /></a>}
              </div>
              {editable && (
                <div className="stop-actions">
                  <div className="move-btns">
                    <button className="move-btn" disabled={i === 0} onClick={() => moveUp(i)} aria-label={`Move ${s.title} up`}><ChevronUp size={12} aria-hidden /></button>
                    <button className="move-btn" disabled={i === ordered.length - 1} onClick={() => moveDown(i)} aria-label={`Move ${s.title} down`}><ChevronDown size={12} aria-hidden /></button>
                  </div>
                  <button className="icon-btn" onClick={() => onEdit(s.id)} aria-label={`Edit ${s.title}`}><Pencil size={14} aria-hidden /></button>
                  {s.status !== 'confirmed'
                    ? <button className="icon-btn" title="Mark confirmed" aria-label={`Mark ${s.title} confirmed`} onClick={() => onStatus(s, 'confirmed')}><CircleCheck size={14} aria-hidden /></button>
                    : <button className="icon-btn" title="Mark maybe" aria-label={`Mark ${s.title} maybe`} onClick={() => onStatus(s, 'maybe')}><CircleHelp size={14} aria-hidden /></button>}
                  <button className="icon-btn" title="Move to another day" aria-label={`Move ${s.title} to another day`} onClick={() => onMoveBetweenDays(s)}><MoveHorizontal size={14} aria-hidden /></button>
                  <button className="icon-btn" onClick={() => onDelete(s.id, day.index)} aria-label={`Delete ${s.title}`}><Trash2 size={14} aria-hidden /></button>
                </div>
              )}
              </div>
            </div>

            {i < ordered.length - 1 && !(ordered[i + 1].auto === true) && (() => {
                const leg = sim.legs[i]
                if (!leg) return null
                return (
                  <div className="tl-legrow" {...(editable ? dayDropHandlers(i + 1) : {})}>
                    <div className="tl-gutter tl-gutter-leg"><span className="tl-line tl-line-leg" /></div>
                    <div className={`travel-leg ${foreignOver === i + 1 && dragging === null ? 'foreign-over' : ''}`}>
                      <MetaIcon icon={ Car } tone="money" />~{leg.distanceKm.toFixed(0)} km · ~{Math.round(leg.durationMinutes)} min from {leg.fromTitle.replace(/ \((start|end)\)$/, '')} · est ₹{Math.round(leg.distanceKm * (A.inrPerKm ?? 8))} ({A.mode})
                    </div>
                  </div>
                )
              })()}
            </React.Fragment>
          )
        })}
        {/* The engine-closed journey: a destination the day doesn't hold as a
            stored stop gets its own endpoint row with the arrival clock. */}
        {(() => {
          const last = journey.points[journey.points.length - 1]
          if (!(last.synthesized && last.kind === 'destination')) return null
          return (
            <>
              {last.legIn && last.legIn.distanceKm >= 0.5 && (
                <div className="tl-legrow">
                  <div className="tl-gutter tl-gutter-leg"><span className="tl-line tl-line-leg" /></div>
                  <div className="travel-leg">
                    <MetaIcon icon={ Car } tone="money" />~{last.legIn.distanceKm.toFixed(0)} km · ~{Math.round(last.legIn.durationMinutes)} min from {last.legIn.fromTitle} · est ₹{Math.round(last.legIn.distanceKm * (A.inrPerKm ?? 8))} ({A.mode})
                  </div>
                </div>
              )}
              <div className="tl-row tl-anchor">
                <div className="tl-gutter" aria-hidden="true">
                  <span className="tl-time tl-arr">{last.arrive ? formatHM(last.arrive, timeFormat) : '--:--'}</span>
                </div>
                <div className="travel-endpoint">
                  <span className="travel-anchor-ico"><Flag size={13} aria-hidden /></span>
                  <span>{journey.direction === 'return' ? `Home — ${last.title}` : `Destination — ${last.title}`}</span>
                  <span className="small muted" style={{ marginLeft: 6 }}>arrives ~{last.arrive ? formatHM(last.arrive, timeFormat) : '--:--'}</span>
                </div>
              </div>
            </>
          )
        })()}
        {ordered.length > 0 && (
          <div className="tl-end" {...(editable ? dayDropHandlers(ordered.length) : {})}>
            {foreignOver === ordered.length && dragging === null && <div className="tl-drop-line">Drop to add here</div>}
          </div>
        )}
      </div>
      </SmoothCollapse>
    </div>
  )
})

/** One-click "continue the route" waypoint for an empty day. */
function nextWaypointStop(a: { name: string; point: { lat: number; lng: number } }): Omit<ItineraryStop, 'id' | 'orderInDay'> {
  const name = a.name.replace(/ \((start|end)\)$/, '')
  return {
    title: name, category: 'travel', locationName: name,
    lat: a.point.lat, lng: a.point.lng,
    description: '', notes: 'Route continuation',
    visitMinutes: 0, openTime: '', closeTime: '',
    entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', sourceUrl: '', status: 'confirmed', auto: true,
  }
}

/** One-click nearby-POI stop for an empty day. */
function poiQuickStop(h: PlaceHit): Omit<ItineraryStop, 'id' | 'orderInDay'> {
  return {
    title: h.name, category: (h.category as ItineraryStop['category']) ?? 'sightseeing', locationName: h.description ?? h.name,
    lat: h.latitude, lng: h.longitude,
    description: h.description ?? '', notes: 'Nearby idea',
    visitMinutes: h.category === 'food' ? 45 : h.category === 'hotel' ? 0 : 60, openTime: '', closeTime: '',
    entryFeeInrPerPerson: 0, transportCostInrTotal: 0,
    priority: 'nice-to-have', sourceUrl: '', status: 'suggested',
  }
}

function statusTone(s: string): 'teal' | 'saffron' | 'danger' | 'ok' | 'info' {
  return s === 'confirmed' ? 'teal' : s === 'needs-booking' ? 'saffron' : s === 'rejected' ? 'danger' : 'info'
}
