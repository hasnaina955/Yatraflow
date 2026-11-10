// ============ Map v2 edit boundaries: the cards ============
// Presentational only. They hold no state and call no writer. MapTab owns the
// session (see editSession.ts) and passes the facts and the handlers in.
// Class names start with `map-edit-` so package B can style them in one block.
import React from 'react'
import { ArrowLeftRight, ChevronDown, GripVertical, LockKeyhole, Minus, Plus } from 'lucide-react'
import { dayColor } from '../../../../lib/mapStyles/dayColors'
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

/** A small listbox pill. The keyboard keeps focus on the list: arrows, Enter and Esc. */
function ChoiceMenu({ label, text = label, icon, choices, onChoose, disabled = false, busy = false }: {
  label: string
  /** The visible pill text. It defaults to the accessible name. */
  text?: string
  icon: React.ReactNode
  choices: readonly { id: string; label: string }[]
  onChoose: (id: string) => void
  disabled?: boolean
  busy?: boolean
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const list = React.useRef<HTMLUListElement>(null)
  const id = React.useId()
  React.useEffect(() => {
    if (open) list.current?.focus()
  }, [open])
  React.useEffect(() => {
    if (!open) return
    function onDown(event: MouseEvent) {
      const target = event.target as Node
      if (!list.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  function close() {
    setOpen(false)
    trigger.current?.focus()
  }
  function choose(choice: { id: string }) {
    onChoose(choice.id)
    close()
  }
  function onListKey(event: React.KeyboardEvent<HTMLUListElement>) {
    const last = choices.length - 1
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(a => (a >= last ? 0 : a + 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(a => (a <= 0 ? last : a - 1)) }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0) }
    else if (event.key === 'End') { event.preventDefault(); setActive(last) }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const choice = choices[active]; if (choice) choose(choice) }
    else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    else if (event.key === 'Tab') { setOpen(false) }
  }
  return (
    <div className="map-edit-menu">
      <button
        ref={trigger}
        type="button"
        className="map-edit-pill"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-label={label}
        disabled={busy || disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={event => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); setOpen(true) }
        }}
      >
        {icon}<span className="map-edit-pill-label">{text}</span>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="map-edit-menu-list"
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
        >
          {choices.map((choice, i) => (
            <li
              key={choice.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="map-edit-menu-item"
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(choice)}
            >
              {choice.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The stop editor. It shows only the facts it knows, and it calls the page's handlers. */
export function StopEditorCard({ title, clockLabel, placeLabel = null, order = null, dayIndex = null, visitMinutes, days, swapOptions = [], fixed, busy = false, onStep, onMoveToDay, onSwap, onRemove, onReorderKey }: {
  title: string
  /** The stop's own clock line, such as "12:05–12:50". Null when it is not known. */
  clockLabel: string | null
  /** The stop's place name, such as "Kattappana". Null when it is not known. */
  placeLabel?: string | null
  /** The stop's place in its day, counted from 1. Null hides the day dot. */
  order?: number | null
  /** The day index. It picks the day colour of the dot. */
  dayIndex?: number | null
  visitMinutes: number | null
  days: readonly { index: number; label: string }[]
  swapOptions?: readonly { id: string; label: string }[]
  fixed: boolean
  busy?: boolean
  onStep: (direction: 1 | -1) => void
  onMoveToDay: (dayIndex: number) => void
  onSwap: (targetId: string) => void
  onRemove: () => void
  /** The existing Alt+arrow reorder, bound to the grip. */
  onReorderKey?: React.KeyboardEventHandler<HTMLButtonElement>
}): React.ReactElement {
  const known = visitMinutes !== null
  const subline = [clockLabel, placeLabel && placeLabel !== title ? placeLabel : null].filter(part => typeof part === 'string' && part !== '').join(' · ')
  return (
    <section className="map-edit-card map-edit-editor" aria-label={order === null ? `Edit ${title}` : `Edit ${title}, stop ${order}`}>
      <div className="map-edit-editor-head">
        {order !== null && (
          <span className="map-edit-day-dot" style={{ '--day': dayColor(dayIndex ?? 0) } as React.CSSProperties} aria-hidden="true">{order}</span>
        )}
        <span className="map-edit-head-copy">
          <h3 className="map-edit-title">{title}</h3>
          {subline !== '' && <span className="map-edit-clock">{subline}</span>}
        </span>
        <button
          type="button"
          className="map-edit-grip"
          aria-label="Reorder this stop with Alt and the up or down arrow"
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          onKeyDown={onReorderKey}
        >
          <GripVertical size={15} aria-hidden />
        </button>
      </div>
      <div className="map-edit-stay-row">
        <span className="map-edit-stay-label">{`Stay length · ${VISIT_STEP_MIN} min steps`}</span>
        <div className="map-edit-stepper" role="group" aria-label={`Stay length, ${VISIT_STEP_MIN} minute steps`}>
          <button type="button" aria-label={`Shorten by ${VISIT_STEP_MIN} minutes`} disabled={busy || !known} onClick={() => onStep(-1)}><Minus size={15} aria-hidden /></button>
          <output aria-live="polite">{known ? `${visitMinutes} min` : 'Not known'}</output>
          <button type="button" aria-label={`Lengthen by ${VISIT_STEP_MIN} minutes`} disabled={busy || !known} onClick={() => onStep(1)}><Plus size={15} aria-hidden /></button>
        </div>
      </div>
      <div className="map-edit-actions">
        <ChoiceMenu
          label="Move to day"
          icon={<ChevronDown size={15} aria-hidden />}
          choices={days.map(d => ({ id: String(d.index), label: d.label }))}
          onChoose={value => onMoveToDay(Number(value))}
          busy={busy}
          disabled={days.length === 0}
        />
        <ChoiceMenu
          label="Swap with another stop"
          text="Swap"
          icon={<ArrowLeftRight size={15} aria-hidden />}
          choices={swapOptions}
          onChoose={onSwap}
          busy={busy}
          disabled={swapOptions.length === 0}
        />
        <button type="button" className="map-edit-remove" disabled={busy} onClick={onRemove}>Remove</button>
      </div>
      {fixed && (
        <p className="map-edit-fixed"><LockKeyhole size={14} aria-hidden />{`${title} is a fixed time: it cannot be dragged, and editing its time asks first.`}</p>
      )}
      <p className="map-edit-hint">Reorder with Alt and the up or down arrow on a focused stop.</p>
    </section>
  )
}
