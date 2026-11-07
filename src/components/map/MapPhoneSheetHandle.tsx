// ============ The phone sheet handle (ticket 07) ============
//
// This is the 44px grip above the phone sheet. It replaces the inline
// `MapSheetHandle` in MapWorkspaceChrome, with the same props and the same
// markup, so a consumer only changes its import path.
//
// The decision logic lives in `src/lib/mapSheetGesture.ts`. This file keeps the
// DOM plumbing: pointer capture, the release, and the key event.
//
// It deliberately declares no pointermove handler and no global preventDefault.
// The handle's own `touch-action: none` (styles.css) is what keeps a drag from
// scrolling the page; the map behind it keeps its pan and pinch lane.
import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import {
  beginSheetGesture,
  cancelSheetGesture,
  clickSheetGesture,
  endSheetGesture,
  IDLE_SHEET_GESTURE,
  sheetSnapForKey,
  type SheetGestureState,
  type SheetSnap,
  type SheetSnapSource,
} from '../../lib/mapSheetGesture'

export function MapPhoneSheetHandle({ snap, onChange, onSnapSettled }: {
  snap: SheetSnap
  onChange: (snap: SheetSnap) => void
  /**
   * Optional. Called after `onChange`, once per committed change, with the
   * input that caused it. The phone sheet uses `keyboard` to move focus into
   * the content it just revealed. Omitting it keeps the previous behaviour.
   */
  onSnapSettled?: (snap: SheetSnap, source: SheetSnapSource) => void
}) {
  const gesture = useRef<SheetGestureState>(IDLE_SHEET_GESTURE)

  function commit(next: SheetSnap, source: SheetSnapSource) {
    if (next === snap) return
    onChange(next)
    onSnapSettled?.(next, source)
  }

  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    // A right or middle mouse button is not a sheet gesture. A non-primary
    // pointer is a second finger, and the model ignores it too.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.isPrimary === false) return

    const result = beginSheetGesture(gesture.current, event.pointerId, event.clientY)
    gesture.current = result.state
    if (result.state.pointerId !== event.pointerId) return

    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      gesture.current = cancelSheetGesture(gesture.current).state
    }
  }

  function pointerUp(event: PointerEvent<HTMLButtonElement>) {
    const result = endSheetGesture(gesture.current, snap, event.pointerId, event.clientY)
    gesture.current = result.state
    if (result.state.pointerId === null) {
      const target = event.currentTarget
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
    }
    if (result.snap) commit(result.snap, 'pointer')
  }

  function pointerCancel(event: PointerEvent<HTMLButtonElement>) {
    gesture.current = cancelSheetGesture(gesture.current, event.pointerId).state
  }

  function lostCapture(event: PointerEvent<HTMLButtonElement>) {
    gesture.current = cancelSheetGesture(gesture.current, event.pointerId).state
  }

  function click() {
    const result = clickSheetGesture(gesture.current, snap)
    gesture.current = result.state
    if (result.snap) commit(result.snap, 'pointer')
  }

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = sheetSnapForKey(snap, event.key)
    if (!next) return
    // Only the keys this control owns are stopped, so the page keeps its own.
    event.preventDefault()
    commit(next, 'keyboard')
  }

  return <button type="button" className="mv2-sheet-handle" aria-label={`Planning sheet ${snap} height. Use up and down arrows to resize.`}
    onPointerDown={pointerDown}
    onPointerUp={pointerUp}
    onPointerCancel={pointerCancel}
    onLostPointerCapture={lostCapture}
    onClick={click}
    onKeyDown={keyDown}><span aria-hidden="true" /></button>
}
