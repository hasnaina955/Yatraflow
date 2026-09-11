// ============ Trip workspace — Timeline tab (shell) ============
// restructure Phase 3: the day surfaces live in ./timeline/ — this file keeps
// the tab state (accordion open-day, Plan/Inspect mode, StopEditor, warnings
// grouping) and composes the extracted modules. Prop-identity discipline
// (M3.3) is why handlers here are useCallback-stable.
// ============ Trip workspace — Timeline tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
// Includes DaySection, DayWeatherChip, TravelPanel, HaltPlanRow, DaySpark,
// MoveStopModal and ClampedText — the whole timeline hot path.
import React, { useCallback, useMemo, useState } from 'react'
import {
  
  Eye, 
  PenLine,   TriangleAlert, 
} from 'lucide-react'
import type { Trip, ItineraryStop } from '../../data/types'
import { updateTrip, setStopStatus } from '../../store/store'
import {
  computeTotals, minutesToHM, formatInr,
  collectWarnings, buildJourney, 
  
} from '../../lib/engine'
import type { LegEstimate, ScheduleWarning } from '../../lib/engine'
import type { ImpactResult } from '../../lib/impact'
import { loadOpenDay, saveOpenDay } from '../../lib/uiPrefs'
import { accordionNext } from '../../lib/daySummary'
import { scrollBehavior } from '../../lib/motion'
import { toast } from '../../components/ui'
import { StopEditor, type StopFormValues } from '../../components/StopEditor'
import { stopInitialValues, stopLegContext, stopEditorKey, stopDayIndex, type StopEditorTarget } from '../../lib/stopForm'
import { useSuggestionCache } from '../../hooks/useSuggestionCache'
import { kmFromStartForHit } from '../../lib/providers/hits'
import { useTimelineMode, type TimelineMode } from './timeline/useTimelineMode'
import { PillNav } from '../../components/PillNav'
import { DaySection } from './timeline/DaySection'
import { MoveStopModal } from './timeline/MoveStopModal'

/** Shared empty array so the memoized DaySections' `warnings` prop keeps a
 *  stable reference for days without warnings (`?? []` would defeat the memo). */
const NO_WARNINGS: ScheduleWarning[] = []
// ================= Timeline =================

export function TimelineTab({ trip, editable, applyChange, legCorrections, suggestionCache, onOpenBoard }: {
  trip: Trip
  editable: boolean
  applyChange: (mutator: (d: Trip) => void, kind: ImpactResult['kind'], dayIndex: number) => void
  legCorrections?: Record<string, LegEstimate>
  suggestionCache: ReturnType<typeof useSuggestionCache>
  /** M5: the doc's §6.3 "Open in Board" bridge — Board now exists. */
  onOpenBoard?: () => void
}) {
  const [editorState, setEditorState] = useState<StopEditorTarget>(null)
  const [moveModalStop, setMoveModalStop] = useState<ItineraryStop | null>(null)

  // Sorted once per trip change — a stable array of stable day references so
  // the memoized DaySections below only re-render when their own data changes.
  const days = useMemo(() => [...trip.days].sort((a, b) => a.index - b.index), [trip.days])

  // --- Collapsed-by-default accordion (docs/TIMELINE-PLAN.md Phase 1) ---
  // ONE open day per trip, persisted per trip id (uiPrefs `yatraflow_open_day`);
  // NO_OPEN_DAY = every day collapsed, which is the default. Collapse state is
  // LIFTED here so the summary rows + jump rail can drive it; the old per-day
  // collapsed map is retired (per-day booleans can't express accordion).
  const [openDayIndex, setOpenDayIndex] = useState(() => loadOpenDay(trip.id))
  // (TripWorkspace keys this component by trip id, so a trip switch remounts
  // it and this init re-reads the right trip — no reset effect needed.)
  // Persisted inside the updater: React may re-run updaters in dev StrictMode,
  // but saveOpenDay is idempotent so the write stays correct.
  const toggleDay = useCallback((dayIndex: number) => {
    setOpenDayIndex(prev => {
      const next = accordionNext(prev, dayIndex)
      saveOpenDay(trip.id, next)
      return next
    })
  }, [trip.id])
  /** Open without toggling (jump rail, + Add here) — no-op when already open. */
  const openDay = useCallback((dayIndex: number) => {
    setOpenDayIndex(prev => {
      if (prev === dayIndex) return prev
      saveOpenDay(trip.id, dayIndex)
      return dayIndex
    })
  }, [trip.id])

  // M3.3: every DaySection prop below must keep a stable identity between
  // commits that don't touch the trip, or the React.memo on DaySection never
  // bites (an unrelated store commit re-renders TimelineTab via the tab counts).
  const handleAdd = useCallback((dayIndex: number) => {
    openDay(dayIndex) // adding into a collapsed day would hide the result — expand it
    setEditorState({ mode: 'add', dayIndex })
  }, [openDay])
  const handleEdit = useCallback((stopId: string) => setEditorState({ mode: 'edit', stopId }), [])

  function handleSave(v: StopFormValues) {
    if (!editorState) return
    // legFromSource is display-only - never persist it onto the stop
    const { legFromSource: _drop, ...legFields } = v
    if (editorState.mode === 'add') {
      const dayIndex = editorState.dayIndex
      applyChange(draft => {
        const day = draft.days.find(d => d.index === dayIndex)!
        day.stops.push({
          ...(legFields as unknown as ItineraryStop),
          id: 'pending_' + Math.random().toString(36).slice(2),
          orderInDay: day.stops.length + 1,
        })
      }, 'add', dayIndex)
    } else {
      const stopId = editorState.stopId
      applyChange(draft => {
        for (const day of draft.days) {
          const s = day.stops.find(x => x.id === stopId)
          if (s) { Object.assign(s, legFields); break }
        }
      }, 'edit', stopDayIndex(trip, stopId))
    }
    setEditorState(null)
  }

  // Deletions go through the impact-preview flow, whose Keep / Remove buttons
  // already act as the confirmation + undo step for this destructive action.
  const handleDelete = useCallback((stopId: string, dayIndex: number) => {
    applyChange(draft => {
      for (const day of draft.days) day.stops = day.stops.filter(s => s.id !== stopId)
    }, 'remove', dayIndex)
  }, [applyChange])

  const handleMoveWithinDay = useCallback((fromIdx: number, toIdx: number, dayIndex: number) => {
    applyChange(draft => {
      const day = draft.days.find(d => d.index === dayIndex)!
      const arr = [...day.stops].sort((a, b) => a.orderInDay - b.orderInDay)
      const [moved] = arr.splice(fromIdx, 1)
      arr.splice(toIdx, 0, moved)
      arr.forEach((s, i) => { s.orderInDay = i + 1 })
      day.stops = arr
    }, 'reorder', dayIndex)
  }, [applyChange])

  /** Cross-day drag: lift a stop out of its day and insert it at `position` of `toDayIndex`. */
  const handleMoveStopInto = useCallback((stopId: string, fromDayIndex: number, toDayIndex: number, position: number) => {
    applyChange(draft => {
      let moved: ItineraryStop | undefined
      for (const d of draft.days) {
        const idx = d.stops.findIndex(s => s.id === stopId)
        if (idx >= 0) {
          [moved] = d.stops.splice(idx, 1)
          d.stops.forEach((s, j) => { s.orderInDay = j + 1 })
          break
        }
      }
      const target = draft.days.find(d => d.index === toDayIndex)
      if (moved && target) {
        const pos = Math.max(0, Math.min(position, target.stops.length))
        moved.orderInDay = pos + 1
        target.stops.splice(pos, 0, moved)
        target.stops.forEach((s, j) => { s.orderInDay = j + 1 })
      }
    }, 'move-day', toDayIndex)
  }, [applyChange])

  // warnings grouped by day index — powers the per-day progress-bar colour
  const dayWarnings = useMemo(() => {
    const map: Record<number, ScheduleWarning[]> = {}
    for (const w of collectWarnings(trip)) {
      const m = /^Day (\d+):/.exec(w.title)
      if (m) { const di = Number(m[1]) - 1; (map[di] ??= []).push(w) }
    }
    return map
  }, [trip])
  const warnDayCount = Object.keys(dayWarnings).length
  // M4: sticky trip-total strip (doc §6.3) — same engine numbers as Overview.
  const totals = useMemo(() => computeTotals(trip, legCorrections), [trip, legCorrections])

  /** Day-jump rail: open the day (accordion) and scroll a long timeline
   *  straight to its card. */
  function jumpToDay(dayIndex: number) {
    openDay(dayIndex)
    const el = document.getElementById(`day-card-${dayIndex}`)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight
    if (!isVisible) el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
  }

  /** Inline day rename — a lightweight label change, applied directly (no impact preview). */
  const handleRenameDay = useCallback((dayIndex: number, title: string) => {
    updateTrip(trip.id, { days: trip.days.map(d => d.index === dayIndex ? { ...d, title: title.trim() || undefined } : d) })
    toast('Day renamed')
  }, [trip])

  /** Duplicate this day's stops onto the next day (base-camp style planning). */
  const handleCopyDay = useCallback((dayIndex: number) => {
    applyChange(draft => {
      const src = draft.days.find(d => d.index === dayIndex)
      const dst = draft.days.find(d => d.index === dayIndex + 1)
      if (!src || !dst) return
      const sorted = [...src.stops].sort((a, b) => a.orderInDay - b.orderInDay)
      for (const s of sorted) {
        dst.stops.push({
          ...structuredClone(s),
          id: 'pending_' + Math.random().toString(36).slice(2),
          orderInDay: dst.stops.length + 1,
        })
      }
    }, 'add', dayIndex + 1)
  }, [applyChange])

  /** One-click add from the empty-day suggestions (route continuation / nearby POI). */
  const handleAddQuickStop = useCallback((dayIndex: number, stop: Omit<ItineraryStop, 'id' | 'orderInDay'>) => {
    applyChange(draft => {
      const day = draft.days.find(d => d.index === dayIndex)!
      day.stops.push({ ...stop, id: 'pending_' + Math.random().toString(36).slice(2), orderInDay: day.stops.length + 1 })
    }, 'add', dayIndex)
  }, [applyChange])

  /** Ride start time for a day — a lightweight plan field, applied directly (like rename). */
  const handleSetDayStart = useCallback((dayIndex: number, time: string) => {
    updateTrip(trip.id, { days: trip.days.map(d => d.index === dayIndex ? { ...d, startTime: time || undefined } : d) })
    toast(time ? `Day ${dayIndex + 1} now starts ${time}` : 'Ride start reset to the default')
  }, [trip])

  /** Insert a batch of long-ride break halts, each at a user-chosen km point, ordered by
      distance along the route so the arrival clock and map reflect true stop order. Impact
      preview applies the whole-day change. */
  const handleAddPlannedHalts = useCallback((dayIndex: number, halts: { km: number; stop: Omit<ItineraryStop, 'id' | 'orderInDay'> }[]) => {
    if (halts.length === 0) return
    applyChange(draft => {
      const day = draft.days.find(d => d.index === dayIndex)!
      const j = buildJourney(draft, day) // existing stop → km lookup
      const posOf = (p: { lat: number; lng: number }) => kmFromStartForHit({ latitude: p.lat, longitude: p.lng }, j.points) ?? 0
      const merged = [
        ...day.stops.map(s => ({ km: posOf(s), s: structuredClone(s) })),
        ...halts.map(h => ({ km: h.km, s: { ...h.stop, id: 'pending_' + Math.random().toString(36).slice(2), orderInDay: 0 } })),
      ].sort((a, b) => a.km - b.km)
      day.stops = merged.map((m, i) => ({ ...m.s, orderInDay: i + 1 }))
    }, 'add', dayIndex)
  }, [applyChange])

  const handleStatus = useCallback((stop: ItineraryStop, status: ItineraryStop['status']) => {
    // Status flips are lightweight group signals — applied directly.
    setStopStatus(trip.id, status, stop.id)
    toast(`“${stop.title}” marked ${status === 'needs-booking' ? 'needs booking' : status}`)
  }, [trip.id])

  // --- Plan / Inspect (docs/TIMELINE-PLAN.md Phase 3): Inspect is the study
  // view — same data, every editing affordance off (the existing `editable`
  // seam renders it: no drag, delete, add, rename or impact sheet). The mode
  // persists per user like the theme. ---
  const { mode, setMode } = useTimelineMode()
  const planEditable = editable && mode === 'plan'
  function changeMode(m: TimelineMode) {
    setMode(m)
    if (m === 'inspect') { setEditorState(null); setMoveModalStop(null) }
  }

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <div>
          <h2>Day-by-day timeline</h2>
          {/* key={mode} crossfades the copy; min-height in CSS reserves the
              two-line block so switching modes never shifts the layout. */}
          <p key={mode} className="muted small tl-mode-copy">{mode === 'plan'
            ? 'Drag stops to reorder within a day — or drop them onto another day to move them there. On touch devices: press and hold a stop, then drag it. Every change shows its impact before saving.'
            : 'Read-only study view — clocks, costs and risks without the edit handles. Switch to Plan mode to make changes.'}</p>
        </div>
        {editable && (
          <div className="row" style={{ gap: 8 }}>
            {onOpenBoard && (
              <button className="btn btn-outline btn-sm" onClick={onOpenBoard} title="Arrange stops across days with the route in view">Open in Board →</button>
            )}
            {/* Same mechanic and surface as the workspace tab rail: a glass
                capsule whose glider paints the active side (PillNav + tab-btn),
                so switching modes animates exactly like Board→Map→Timeline. */}
            <PillNav className="mode-pillbar" role="group" aria-label="Timeline mode" activeKey={mode}>
              <button type="button" data-pill-key="plan" className={`tab-btn${mode === 'plan' ? ' active' : ''}`}
                onClick={() => changeMode('plan')} aria-pressed={mode === 'plan'}>
                <PenLine size={14} aria-hidden />Plan
              </button>
              <button type="button" data-pill-key="inspect" className={`tab-btn${mode === 'inspect' ? ' active' : ''}`}
                onClick={() => changeMode('inspect')} aria-pressed={mode === 'inspect'}>
                <Eye size={14} aria-hidden />Inspect
              </button>
            </PillNav>
            {/* Stays rendered in both modes (disabled + dimmed in Inspect) so
                toggling never reflows the header — that reflow was the jerk. */}
            <button className="btn btn-primary btn-sm" disabled={mode !== 'plan'}
              title={mode !== 'plan' ? 'Switch to Plan mode to edit' : undefined}
              onClick={() => setEditorState({ mode: 'add', dayIndex: 0 })}>+ Add stop</button>
          </div>
        )}
      </div>

      <div className="tl-total-strip">
        <span className="tl-total-label">Trip total</span>
        <span>{Math.round(totals.totalDistanceKm).toLocaleString('en-IN')} km</span>
        <span className="tl-total-dot" aria-hidden="true">·</span>
        <span>{minutesToHM(totals.totalTravelMinutes)} driving</span>
        <span className="tl-total-dot" aria-hidden="true">·</span>
        <span>{formatInr(totals.totalCostInr)} estimated</span>
        {warnDayCount > 0 && (
          <span className="tl-total-warn"><TriangleAlert size={12} aria-hidden style={{ verticalAlign: '-2px', marginRight: 3 }} />{warnDayCount} day{warnDayCount !== 1 ? 's' : ''} need{warnDayCount === 1 ? 's' : ''} attention</span>
        )}
      </div>

      {days.length >= 4 && (
        <div className="day-rail" role="navigation" aria-label="Jump to day">
          <span className="day-rail-label">Jump to day</span>
          <div className="day-rail-chips">
            {days.map(d => {
              const hasWarn = (dayWarnings[d.index] ?? []).length > 0
              return (
                <button key={d.id} type="button" className={`day-rail-chip ${hasWarn ? 'warn' : ''}`} onClick={() => jumpToDay(d.index)}>
                  Day {d.index + 1}{hasWarn && <TriangleAlert size={11} aria-hidden style={{ verticalAlign: '-1px', marginLeft: 3 }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {days.map(day => (
        <DaySection key={day.id} day={day} trip={trip} editable={planEditable} open={openDayIndex === day.index} onToggleOpen={toggleDay} legCorrections={legCorrections} suggestionCache={suggestionCache} dayTotals={totals.byDay[Math.min(day.index, totals.byDay.length - 1)]}
          onAdd={handleAdd}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onMoveWithinDay={handleMoveWithinDay}
          onMoveBetweenDays={setMoveModalStop}
          onMoveStopIn={handleMoveStopInto}
          onRenameDay={handleRenameDay}
          onCopyDay={handleCopyDay}
          onAddQuickStop={handleAddQuickStop}
          onSetDayStart={handleSetDayStart}
          onAddPlannedHalts={handleAddPlannedHalts}
          warnings={dayWarnings[day.index] ?? NO_WARNINGS}
          onStatus={handleStatus}
        />
      ))}

      <StopEditor
        open={!!editorState}
        onClose={() => setEditorState(null)}
        initial={stopInitialValues(editorState, trip)}
        resetKey={stopEditorKey(editorState)}
        onSave={handleSave}
        dayLabel={editorState?.mode === 'add' ? `Day ${editorState.dayIndex + 1}` : undefined}
        legContext={stopLegContext(editorState, trip)}
      />

      <MoveStopModal
        stop={moveModalStop}
        trip={trip}
        onClose={() => setMoveModalStop(null)}
        onMove={(toDay) => {
          if (!moveModalStop) return
          const stopId = moveModalStop.id
          applyChange(draft => {
            let moved: ItineraryStop | undefined
            for (const d of draft.days) {
              const idx = d.stops.findIndex(s => s.id === stopId)
              if (idx >= 0) { [moved] = d.stops.splice(idx, 1); break }
            }
            const target = draft.days.find(d => d.index === toDay)
            if (moved && target) {
              moved.orderInDay = target.stops.length + 1
              target.stops.push(moved)
            }
          }, 'move-day', moveModalStop ? stopDayIndex(trip, stopId) : 0)
          setMoveModalStop(null)
        }}
      />
    </div>
  )
}
