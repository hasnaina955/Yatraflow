// ============ Map v2 edit boundaries: the cards ============
// Presentational only. They hold no state and call no writer. MapTab owns the
// session (see editSession.ts) and passes the facts and the handlers in.
// Class names start with `map-edit-` so package B can style them in one block.
import React from 'react'
import { VISIT_STEP_MIN, type FixedGuard } from './stopEdit'
import type { AddPreview, PreviewLeg, PreviewUnknownReason, UnknownFact } from './addPreview'
import { outcomeMessage, type EditOutcome } from './outcomes'

const UNKNOWN_REASON: Record<PreviewUnknownReason, string> = {
  'day-missing': 'The day is not on this trip, so there is nothing to preview.',
  'position-unknown': 'The road order for this place is not known, so the new times are not known.',
  'coordinates-unknown': 'This place has no usable position, so the new road is not known.',
  'visit-unknown': 'The visit length is not known, so the new times are not known.',
  'not-active': 'This stop would not be on the plan, so there is nothing to preview.',
}

const UNKNOWN_FACT: Record<UnknownFact, string> = {
  'opening-hours': 'Opening hours are not known.',
  'admission-price': 'Admission price is not known.',
}

function legLine(leg: PreviewLeg): string {
  const how = leg.measured ? 'measured road' : 'estimate'
  return `${leg.fromTitle} → ${leg.toTitle}: ${Math.round(leg.distanceKm)} km, ${Math.round(leg.durationMin)} min (${how})`
}

/** The outcome line. A kept change is a status. Every other outcome is an alert. */
function OutcomeLine({ outcome }: { outcome: EditOutcome | null }): React.ReactElement | null {
  if (!outcome) return null
  const calm = outcome.kind === 'kept' || outcome.kind === 'rejected'
  return (
    <p className={`map-edit-outcome map-edit-outcome-${outcome.kind}`} role={calm ? 'status' : 'alert'}>
      {outcomeMessage(outcome)}
    </p>
  )
}

export function AddPreviewCard({ preview, busy = false, outcome = null, canUndo = false, onKeep, onReject, onUndo }: {
  preview: AddPreview
  busy?: boolean
  outcome?: EditOutcome | null
  canUndo?: boolean
  onKeep: () => void
  onReject: () => void
  onUndo?: () => void
}): React.ReactElement {
  if (preview.kind === 'unknown') {
    return (
      <section className="map-edit-card map-edit-preview" aria-label="Preview before you add">
        <h3 className="map-edit-kicker">If you add it · Preview</h3>
        <p className="map-edit-unknown">{UNKNOWN_REASON[preview.reason]}</p>
      </section>
    )
  }
  const kept = outcome?.kind === 'kept'
  const place = preview.insertion.afterTitle ? `after ${preview.insertion.afterTitle}` : 'first on the day'
  return (
    <section className="map-edit-card map-edit-preview" aria-label="Preview before you add" aria-busy={busy}>
      <h3 className="map-edit-kicker">If you add it · Preview</h3>
      <ul className="map-edit-list">
        <li>{`Lands as stop ${preview.insertion.order} of ${preview.insertion.total}, ${place}.`}</li>
        {preview.road.legIn && <li>{legLine(preview.road.legIn)}</li>}
        {preview.road.legOut && <li>{legLine(preview.road.legOut)}</li>}
        {preview.road.replaced && <li className="map-edit-replaced">{`Replaces ${legLine(preview.road.replaced)}`}</li>}
        {preview.clocks.map(clock => (
          <li key={clock.stopId}>
            {clock.deltaMin === 0
              ? `${clock.title} does not move (${clock.to}).`
              : <>{clock.title} <s>{clock.from}</s> → <b>{clock.to}</b></>}
          </li>
        ))}
        {preview.warnings.added.map(w => (
          <li key={`add-${w.code}-${w.title}`} className={w.severe ? 'map-edit-warn map-edit-warn-severe' : 'map-edit-warn'}>
            {`New warning: ${w.title}`}
          </li>
        ))}
        {preview.warnings.cleared.map(w => (
          <li key={`clear-${w.code}-${w.title}`} className="map-edit-cleared">{`Clears: ${w.title}`}</li>
        ))}
        {preview.unknownFacts.map(fact => <li key={fact} className="map-edit-unknown">{UNKNOWN_FACT[fact]}</li>)}
      </ul>
      <OutcomeLine outcome={outcome} />
      <div className="map-edit-actions">
        {kept ? (
          canUndo && onUndo && <button type="button" className="map-edit-undo" onClick={onUndo}>Undo</button>
        ) : (
          <>
            <button type="button" className="map-edit-keep" disabled={busy} onClick={onKeep}>
              {busy ? 'Saving…' : `Add as stop ${preview.insertion.order}`}
            </button>
            <button type="button" className="map-edit-reject" disabled={busy} onClick={onReject}>Not now</button>
          </>
        )}
      </div>
    </section>
  )
}

export function FixedTimeConfirm({ guard, onConfirm, onCancel }: {
  guard: FixedGuard
  onConfirm: () => void
  onCancel: () => void
}): React.ReactElement | null {
  if (!guard.needsConfirm) return null
  return (
    <section className="map-edit-confirm" role="alert" aria-label="Fixed time at risk">
      <ul className="map-edit-list">
        {guard.touched.map(t => (
          <li key={t.stopId}>
            {t.change === 'unlinked'
              ? `${t.commitTitle} (${t.commitTime}) would lose its stop, ${t.title}.`
              : t.change === 'late'
                ? `${t.title} would arrive ${t.to}, after the ${t.commitTime} time for ${t.commitTitle}.`
                : `${t.title} would move from ${t.from ?? 'an unknown time'} to ${t.to ?? 'an unknown time'}. ${t.commitTitle} is fixed at ${t.commitTime}.`}
          </li>
        ))}
      </ul>
      <div className="map-edit-actions">
        <button type="button" className="map-edit-keep" onClick={onConfirm}>Change it anyway</button>
        <button type="button" className="map-edit-reject" onClick={onCancel}>Keep it as it is</button>
      </div>
    </section>
  )
}

export function StopEditorCard({ title, clockLabel, visitMinutes, days, fixed, busy = false, onStep, onMoveToDay, onSwap, onRemove }: {
  title: string
  /** The stop's own clock line, such as "12:05–12:50". Null when it is not known. */
  clockLabel: string | null
  visitMinutes: number | null
  days: readonly { index: number; label: string }[]
  fixed: boolean
  busy?: boolean
  onStep: (direction: 1 | -1) => void
  onMoveToDay: (dayIndex: number) => void
  onSwap: () => void
  onRemove: () => void
}): React.ReactElement {
  const known = visitMinutes !== null
  return (
    <section className="map-edit-card map-edit-editor" aria-label={`Edit ${title}`}>
      <h3 className="map-edit-title">{title}</h3>
      <p className="map-edit-clock">{clockLabel ?? 'Clock not known'}</p>
      <div className="map-edit-stepper" role="group" aria-label={`Stay length, ${VISIT_STEP_MIN} minute steps`}>
        <button type="button" aria-label={`Shorten by ${VISIT_STEP_MIN} minutes`} disabled={busy || !known} onClick={() => onStep(-1)}>−</button>
        <output aria-live="polite">{known ? `${visitMinutes} min` : 'Not known'}</output>
        <button type="button" aria-label={`Lengthen by ${VISIT_STEP_MIN} minutes`} disabled={busy || !known} onClick={() => onStep(1)}>+</button>
      </div>
      <div className="map-edit-actions">
        <label className="map-edit-move">
          <span>Move to day</span>
          <select disabled={busy || days.length === 0} value="" onChange={e => { if (e.target.value !== '') onMoveToDay(Number(e.target.value)) }}>
            <option value="">Choose a day</option>
            {days.map(d => <option key={d.index} value={d.index}>{d.label}</option>)}
          </select>
        </label>
        <button type="button" className="map-edit-swap" disabled={busy} onClick={onSwap}>Swap</button>
        <button type="button" className="map-edit-remove" disabled={busy} onClick={onRemove}>Remove</button>
      </div>
      {fixed && (
        <p className="map-edit-fixed">This stop has a fixed time. Reorder cannot move it, and a change to its time asks first.</p>
      )}
    </section>
  )
}
