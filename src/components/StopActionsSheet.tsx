// One phone bottom sheet for a stop's actions. The desktop timeline keeps its
// small ⋯ popover; this surface is used only at phone widths. Every mutation is
// handed back to the timeline, which owns the impact preview and the undo path.
import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, ChevronsUpDown, MapPin, MoveHorizontal, Pencil, Trash2, X } from 'lucide-react'
import type { StopStatus } from '../data/types'
import { statusLabel } from '../lib/labels'
import { motionExitTiming, prefersReducedMotion } from '../lib/motion'

export type StopActionsSheetProps = {
  open: boolean
  onClose: () => void
  stopTitle: string
  dayNumber: number
  timeLabel?: string
  stopNumber: number
  stopCount: number
  /** The stop's real current status. The sheet never invents a status. */
  status: StopStatus
  /** Day numbers of the other days on this trip, for the move hint. */
  otherDayNumbers: number[]
  /** A viewer gets no editable control at all. */
  editable: boolean
  /** The kind glyph, supplied by the timeline that already draws it. */
  kindIcon?: React.ReactNode
  isFirst: boolean
  isLast: boolean
  onEdit: () => void
  onStatus: (status: StopStatus) => void
  onMove: () => void
  onReorderUp: () => void
  onReorderDown: () => void
  onShowOnMap: () => void
  onRemove: () => void
}

/** The three statuses the artboard shows, mapped to real `STOP_STATUSES`. */
const SHEET_STATUSES: StopStatus[] = ['confirmed', 'maybe', 'needs-booking']

const DRAG_CLOSE_PX = 90

/** The sheet's handlers, kept pure so the remove-to-undo wiring is testable
 *  without a DOM. Every action runs, then closes the sheet. */
export function stopSheetHandlers(
  props: Pick<StopActionsSheetProps,
    'onEdit' | 'onStatus' | 'onMove' | 'onReorderUp' | 'onReorderDown' | 'onShowOnMap' | 'onRemove'>,
  close: () => void,
) {
  const wrap = (action: () => void) => () => { action(); close() }
  return {
    edit: wrap(props.onEdit),
    status: (s: StopStatus) => wrap(() => props.onStatus(s))(),
    move: wrap(props.onMove),
    up: wrap(props.onReorderUp),
    down: wrap(props.onReorderDown),
    map: wrap(props.onShowOnMap),
    remove: wrap(props.onRemove),
  }
}

export function StopActionsSheet(props: StopActionsSheetProps) {
  const {
    open, onClose, stopTitle, dayNumber, timeLabel, stopNumber, stopCount,
    status, otherDayNumbers, editable, kindIcon, isFirst, isLast,
  } = props
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const [present, setPresent] = useState(open)
  const [dragging, setDragging] = useState(false)
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number | null>(null)
  if (open && !present) setPresent(true)

  // The exit animation is the phone sheet's named contract. A reduced-motion
  // user gets an immediate hide; a desktop dialog does not use this surface.
  useEffect(() => {
    if (open) return
    const duration = prefersReducedMotion() ? 0 : motionExitTiming('--motion-med').duration
    const timer = window.setTimeout(() => setPresent(false), duration)
    return () => window.clearTimeout(timer)
  }, [open])

  // One focus trap and one Escape handler, the same contract as the shared
  // Modal. Focus returns to the ⋯ that opened the sheet when it closes.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(el => !el.hasAttribute('disabled') && !el.closest('[inert]'))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const t = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('.stop-sheet-close')?.focus()
    }, 30)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      window.clearTimeout(t)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [open, onClose])

  if (!open && !present) return null

  const meta = [`Day ${dayNumber}`]
  if (timeLabel) meta.push(timeLabel)
  meta.push(`stop ${stopNumber} of ${stopCount}`)

  const onPointerDown = (e: React.PointerEvent) => {
    if (prefersReducedMotion()) return
    dragStart.current = e.clientY
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current == null) return
    setDragY(Math.max(0, e.clientY - dragStart.current))
  }
  const onPointerUp = () => {
    if (dragStart.current == null) return
    dragStart.current = null
    setDragging(false)
    const distance = dragY
    setDragY(0)
    if (distance >= DRAG_CLOSE_PX) onClose()
  }

  const h = stopSheetHandlers(props, onClose)

  const shell = (
    <div
      className={`stop-sheet-overlay${!open ? ' stop-sheet-overlay-exiting' : ''}`}
      onPointerDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dialogRef}
        className="stop-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-dragging={dragging ? 'true' : undefined}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        inert={!open ? true : undefined}
      >
        <span
          className="stop-sheet-handle"
          aria-hidden="true"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="stop-sheet-head">
          <span className="stop-sheet-tile" aria-hidden="true">{kindIcon}</span>
          <div className="stop-sheet-titles">
            <h2 id={titleId}>{stopTitle}</h2>
            <span className="stop-sheet-meta">{meta.join(' · ')}</span>
          </div>
          <button type="button" className="stop-sheet-close" onClick={onClose} aria-label="Close stop actions">
            <X size={18} aria-hidden />
          </button>
        </div>

        {editable && (
          <>
            <div className="stop-sheet-status" role="radiogroup" aria-label="Status, shared with the group">
              <span className="stop-sheet-label">Status · the group sees this</span>
              <div className="stop-sheet-segment">
                {SHEET_STATUSES.map(s => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={s === status}
                    className={s === status ? 'is-selected' : undefined}
                    onClick={() => h.status(s)}
                  >
                    {statusLabel(s)}
                  </button>
                ))}
              </div>
            </div>

            <div className="stop-sheet-actions">
              <button type="button" className="stop-sheet-action" onClick={h.edit}>
                <Pencil size={18} aria-hidden />Edit details
              </button>
              <button type="button" className="stop-sheet-action" onClick={h.move}>
                <MoveHorizontal size={18} aria-hidden />
                <span className="stop-sheet-action-text">Move to another day</span>
                {otherDayNumbers.length > 0 && (
                  <span className="stop-sheet-hint">Day {otherDayNumbers.join(', ')}</span>
                )}
              </button>
              <div className="stop-sheet-action stop-sheet-reorder">
                <ChevronsUpDown size={18} aria-hidden />
                <span className="stop-sheet-action-text">Reorder in Day {dayNumber}</span>
                <button
                  type="button"
                  className="stop-sheet-step"
                  disabled={isFirst}
                  onClick={h.up}
                  aria-label={`Move ${stopTitle} earlier`}
                >
                  <ChevronUp size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  className="stop-sheet-step"
                  disabled={isLast}
                  onClick={h.down}
                  aria-label={`Move ${stopTitle} later`}
                >
                  <ChevronDown size={18} aria-hidden />
                </button>
              </div>
              <button type="button" className="stop-sheet-action" onClick={h.map}>
                <MapPin size={18} aria-hidden />Show on the map
              </button>
            </div>

            <button type="button" className="stop-sheet-remove" onClick={h.remove}>
              <Trash2 size={18} aria-hidden />Remove from Day {dayNumber}
            </button>
            <p className="stop-sheet-note">You see the impact first, and you can undo it.</p>
          </>
        )}
      </div>
    </div>
  )

  // The portal keeps the sheet above the fixed navigation. Static markup
  // renders in place so the node-env tests can read the same structure.
  if (typeof document === 'undefined') return shell
  return createPortal(shell, document.body)
}
