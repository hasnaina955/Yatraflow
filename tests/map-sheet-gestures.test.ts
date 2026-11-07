// ============ The phone sheet's gesture model (ticket 07) ============
//
// These pin the behaviour a browser listener cannot show in this repo's node
// test environment: one snap per gesture, a suppressed trailing click, a cancel
// that does not eat a tap's click, a second pointer that cannot take over, and
// a release that reads the live snap instead of the one at press time.
//
// The last describe pins the call sites. A helper that exists but is not used
// proves nothing (CODING_STANDARDS "Tests for helper use must check the call
// site"), and the ticket owns a 44px handle, a 148px peek and a local
// `touch-action`, so those are read from the real CSS.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  IDLE_SHEET_GESTURE,
  SHEET_DRAG_THRESHOLD,
  SHEET_SNAPS,
  beginSheetGesture,
  cancelSheetGesture,
  clickSheetGesture,
  collapseSheetSnap,
  cycleSheetSnap,
  endSheetGesture,
  expandSheetSnap,
  sheetSnapForDrag,
  sheetSnapForKey,
  type SheetGestureState,
} from '../src/lib/mapSheetGesture'
import { readCssSource } from '../scripts/css-source-graph.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const handleSource = readFileSync(join(root, 'src', 'components', 'map', 'MapPhoneSheetHandle.tsx'), 'utf8')
const css = readCssSource('src/styles.css')

/** A press that starts at 400px and has not moved. */
const pressed = (pointerId = 1, y = 400): SheetGestureState => beginSheetGesture(IDLE_SHEET_GESTURE, pointerId, y).state

describe('the snap ladder', () => {
  it('is exactly peek, half and full, in that order', () => {
    expect(SHEET_SNAPS).toEqual(['peek', 'half', 'full'])
  })

  it('expands one step and stops at full', () => {
    expect(expandSheetSnap('peek')).toBe('half')
    expect(expandSheetSnap('half')).toBe('full')
    expect(expandSheetSnap('full')).toBe('full')
  })

  it('collapses one step and stops at peek', () => {
    expect(collapseSheetSnap('full')).toBe('half')
    expect(collapseSheetSnap('half')).toBe('peek')
    expect(collapseSheetSnap('peek')).toBe('peek')
  })

  it('cycles a tap through all three and wraps', () => {
    expect(cycleSheetSnap('peek')).toBe('half')
    expect(cycleSheetSnap('half')).toBe('full')
    expect(cycleSheetSnap('full')).toBe('peek')
  })
})

describe('the keyboard', () => {
  it('owns exactly up, down, Home and End', () => {
    expect(sheetSnapForKey('peek', 'ArrowUp')).toBe('half')
    expect(sheetSnapForKey('full', 'ArrowDown')).toBe('half')
    expect(sheetSnapForKey('full', 'Home')).toBe('peek')
    expect(sheetSnapForKey('peek', 'End')).toBe('full')
  })

  it('clamps at both ends instead of wrapping', () => {
    expect(sheetSnapForKey('full', 'ArrowUp')).toBe('full')
    expect(sheetSnapForKey('peek', 'ArrowDown')).toBe('peek')
  })

  it('claims no key it does not own, so the page keeps its scroll keys', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Escape', 'Enter', ' ', 'a', 'Tab']) {
      expect(sheetSnapForKey('half', key), `${key} must stay unclaimed`).toBeNull()
    }
  })
})

describe('the drag distance', () => {
  it('keeps the 24px threshold the handle was reviewed at', () => {
    expect(SHEET_DRAG_THRESHOLD).toBe(24)
  })

  it('does not move under the threshold, in either direction', () => {
    for (const delta of [0, 23, -23, 0.5]) {
      expect(sheetSnapForDrag('half', delta), `${delta}px`).toBe('half')
    }
  })

  it('moves exactly at the threshold', () => {
    expect(sheetSnapForDrag('peek', -24)).toBe('half')
    expect(sheetSnapForDrag('full', 24)).toBe('half')
  })

  it('treats an unusable number as no drag', () => {
    expect(sheetSnapForDrag('half', Number.NaN)).toBe('half')
    expect(sheetSnapForDrag('half', Number.POSITIVE_INFINITY)).toBe('half')
  })

  it('stops at the ends, like the keyboard does', () => {
    expect(sheetSnapForDrag('peek', 200)).toBe('peek')
    expect(sheetSnapForDrag('full', -200)).toBe('full')
  })
})

describe('one gesture, one snap', () => {
  it('lets a short press fall through to the click, which cycles once', () => {
    const up = endSheetGesture(pressed(), 'peek', 1, 405)
    expect(up.snap).toBeNull()
    expect(up.state.suppressClick).toBe(false)

    const first = clickSheetGesture(up.state, 'peek')
    expect(first.snap).toBe('half')

    const second = clickSheetGesture(first.state, 'half')
    expect(second.snap).toBe('full')
  })

  it('commits a long drag once and swallows the click that follows it', () => {
    const up = endSheetGesture(pressed(), 'peek', 1, 340)
    expect(up.snap).toBe('half')
    expect(up.state.suppressClick).toBe(true)

    const trailing = clickSheetGesture(up.state, 'half')
    expect(trailing.snap, 'the trailing click must not add a second step').toBeNull()
  })

  it('a boundary drag reports nothing but still swallows the click', () => {
    const up = endSheetGesture(pressed(), 'peek', 1, 460)
    expect(up.snap).toBeNull()
    expect(clickSheetGesture(up.state, 'peek').snap).toBeNull()
  })

  it('ignores a repeated release from the same pointer', () => {
    const first = endSheetGesture(pressed(), 'peek', 1, 340)
    const second = endSheetGesture(first.state, 'half', 1, 300)
    expect(second.snap).toBeNull()
  })

  it('starts a fresh gesture after the last one finished', () => {
    const afterDrag = endSheetGesture(pressed(), 'peek', 1, 340).state
    const again = beginSheetGesture(afterDrag, 7, 400)
    expect(again.state.pointerId).toBe(7)
    expect(again.state.suppressClick).toBe(false)
    expect(endSheetGesture(again.state, 'half', 7, 360).snap).toBe('full')
  })
})

describe('cancel and lost capture', () => {
  it('cancels a live gesture without a snap, and swallows the click', () => {
    const cancelled = cancelSheetGesture(pressed())
    expect(cancelled.snap).toBeNull()
    expect(cancelled.state.pointerId).toBeNull()
    expect(clickSheetGesture(cancelled.state, 'peek').snap).toBeNull()
  })

  it('is a no-op while idle, so the lost capture after a tap cannot eat its click', () => {
    const tap = endSheetGesture(pressed(), 'peek', 1, 404)
    // The browser reports lostpointercapture after every normal release.
    const lost = cancelSheetGesture(tap.state)
    expect(lost.state).toBe(tap.state)
    expect(lost.state.suppressClick).toBe(false)
    expect(clickSheetGesture(lost.state, 'peek').snap).toBe('half')
  })

  it('ignores a cancel from a pointer that does not own the handle', () => {
    const live = pressed(1)
    const foreign = cancelSheetGesture(live, 2)
    expect(foreign.state).toBe(live)
    expect(endSheetGesture(foreign.state, 'peek', 1, 340).snap).toBe('half')
  })

  it('accepts the next gesture cleanly after a cancel', () => {
    const afterCancel = cancelSheetGesture(pressed()).state
    const next = beginSheetGesture(afterCancel, 2, 400)
    const up = endSheetGesture(next.state, 'half', 2, 370)
    expect(up.snap).toBe('full')
  })
})

describe('two fingers and double activation', () => {
  it('keeps the first pointer and ignores the second', () => {
    const first = pressed(1)
    const second = beginSheetGesture(first, 2, 300)
    expect(second.state).toBe(first)
    expect(second.snap).toBeNull()
  })

  it('ignores the second pointer release and applies the first once', () => {
    const first = beginSheetGesture(pressed(1), 2, 300).state
    expect(endSheetGesture(first, 'peek', 2, 200).snap).toBeNull()
    expect(endSheetGesture(first, 'peek', 1, 340).snap).toBe('half')
  })

  it('ignores a click while a pointer is still down', () => {
    expect(clickSheetGesture(pressed(), 'peek').snap).toBeNull()
  })
})

describe('stale props', () => {
  it('reads the snap at release, so a sheet moved mid-drag expands from there', () => {
    const live = pressed()
    // The parent moved the sheet from peek to half while the finger was down.
    expect(endSheetGesture(live, 'half', 1, 340).snap).toBe('full')
  })

  it('collapses from the release-time snap too', () => {
    const live = pressed()
    expect(endSheetGesture(live, 'full', 1, 460).snap).toBe('half')
  })
})

describe('the component calls the model', () => {
  it('plumbs every event into the pure helper', () => {
    expect(handleSource).toContain('beginSheetGesture(')
    expect(handleSource).toContain('endSheetGesture(')
    expect(handleSource).toContain('cancelSheetGesture(')
    expect(handleSource).toContain('clickSheetGesture(')
    expect(handleSource).toContain('sheetSnapForKey(')
  })

  it('keeps the reviewed markup and accessible name', () => {
    expect(handleSource).toContain('className="mv2-sheet-handle"')
    expect(handleSource).toContain('Planning sheet ${snap} height. Use up and down arrows to resize.')
    expect(handleSource).toContain('<span aria-hidden="true" />')
  })

  it('captures the pointer and handles the capture being lost', () => {
    expect(handleSource).toContain('setPointerCapture(')
    expect(handleSource).toContain('releasePointerCapture(')
    expect(handleSource).toContain('onLostPointerCapture=')
  })

  it('declares no pointermove handler, so a drag never vetoes the map pan', () => {
    expect(handleSource).not.toMatch(/onPointerMove\s*=/)
  })

  it('stops only the key it owns: exactly one preventDefault in the file', () => {
    expect(handleSource.match(/preventDefault\(/g)).toHaveLength(1)
  })
})

describe('the CSS keeps the approved sheet geometry', () => {
  const handleRule = css.match(/\.mv2-sheet-handle \{[^}]*\}/)?.[0] ?? ''

  it('keeps the handle a 44px target with its own touch-action', () => {
    expect(handleRule, 'the handle rule is missing').not.toBe('')
    expect(handleRule).toMatch(/height: 44px;/)
    expect(handleRule).toMatch(/touch-action: none;/)
  })

  it('keeps the 148px peek, the 56px ribbon and the two taller snaps', () => {
    expect(css).toContain('--mv2-sheet-height: 148px;')
    expect(css).toContain(".mv2-workspace[data-snap='half']")
    expect(css).toContain(".mv2-workspace[data-snap='full']")
    expect(css).toContain('min-height: 56px; height: 56px;')
  })

  it('rides the named motion token, not a raw millisecond value', () => {
    expect(css).toContain('transition: height var(--motion-med) var(--ease-resize);')
  })
})
