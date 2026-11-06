import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const styles = readFileSync('src/styles.css', 'utf8')
// The lane is the 841 append, which ends where the Map V2 rules begin. The Map
// workspace CSS follows this block, so slicing to end-of-file would judge it as
// part of the toast lane.
const laneStart = styles.indexOf('/* Issue 841.')
const laneEnd = styles.indexOf('/* Map workspace.')
const appended = styles.slice(laneStart, laneEnd === -1 ? undefined : laneEnd)
const ui = readFileSync('src/components/ui.tsx', 'utf8')
const standards = readFileSync('docs/standards/ui-and-design-system.md', 'utf8')

describe('toast / impact-sheet lane contract (#841)', () => {
  it('fixes the two hosts with a measured lane, not a child z-index', () => {
    expect(appended).toContain('bottom: var(--toast-lane-h, 0px)')
    expect(appended).toContain('max-height: calc(100dvh - var(--toast-lane-h, 0px))')
    expect(appended).not.toContain('z-index:')
    expect(appended).not.toContain('toast-zone--actionable')
  })

  it('leaves the toast pills hit-testable so hover and focus hold survive', () => {
    expect(appended).not.toContain('pointer-events: none')
    expect(appended).not.toContain('pointer-events: auto')
    expect(ui).not.toContain('toast-zone--actionable')
    expect(ui).toContain('onMouseEnter')
    expect(ui).toContain('onMouseLeave')
    expect(ui).toContain('onFocus')
    expect(ui).toContain('onBlur')
  })

  it('publishes the lane from ToastZone and keeps the real timers', () => {
    expect(ui).toContain('--toast-lane-h')
    expect(ui).toContain('ResizeObserver')
    expect(ui).toContain('ref={zoneRef}')
    expect(ui).toContain('const TOAST_DWELL = 3400')
    expect(ui).toContain('const TOAST_DWELL_UNDO = 7000')
    expect(ui).toContain('dismissToastFn?.(t.id)')
  })

  it('keeps the standards guarantees the repair relies on', () => {
    expect(standards).toContain('a transient toast must never cover the Keep/Remove controls')
    expect(standards).toContain('Toast hover and focus hold still work')
    expect(standards).toContain('impact sheet 210 > toast 200')
  })

  it('bounds the lane on short viewports so the sheet keeps a usable height', () => {
    expect(appended).toContain('max-height: calc(100dvh - 178px)')
    expect(appended).toContain('overflow-y: auto')
    expect(ui).toContain('scrollTop = el.scrollHeight')
  })
})
