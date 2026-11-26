import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { beginToastExit, leaveIfNotHeld, toastExitDuration, toastIconKind } from '../src/lib/toastTiming'

const ui = readFileSync('src/components/ui.tsx', 'utf8')
const css = readFileSync('src/styles/components/toast.css', 'utf8')
const tokens = readFileSync('src/styles/tokens.css', 'utf8')

describe('#1053 — the exit lifecycle', () => {
  it('unmounts only after the exit token duration (fake timers)', () => {
    vi.useFakeTimers()
    try {
      const markLeaving = vi.fn()
      const unmount = vi.fn()
      const duration = toastExitDuration(false)
      expect(duration).toBe(160)
      beginToastExit(markLeaving, unmount, false)
      expect(markLeaving).toHaveBeenCalledOnce()
      expect(unmount).not.toHaveBeenCalled()
      vi.advanceTimersByTime(duration - 1)
      expect(unmount).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(unmount).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes at once under reduced motion, with no leaving frame', () => {
    const markLeaving = vi.fn()
    const unmount = vi.fn()
    expect(toastExitDuration(true)).toBe(0)
    beginToastExit(markLeaving, unmount, true)
    expect(markLeaving).not.toHaveBeenCalled()
    expect(unmount).toHaveBeenCalledOnce()
  })

  it('a held toast does not leave; a released one does (fake timers)', () => {
    vi.useFakeTimers()
    try {
      const startLeave = vi.fn()
      let held = true
      setTimeout(() => leaveIfNotHeld(() => held, startLeave), 7000)
      vi.advanceTimersByTime(7000)
      expect(startLeave).not.toHaveBeenCalled()
      held = false
      setTimeout(() => leaveIfNotHeld(() => held, startLeave), 7000)
      vi.advanceTimersByTime(7000)
      expect(startLeave).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses one exit clock per toast and sends Undo through the same exit', () => {
    expect(ui).toContain('const exitTimers = useRef(new Map<number, () => void>())')
    expect(ui).toContain('if (exitTimers.current.has(id)) return')
    expect(ui).toContain('dismissToastFn = startLeave')
    expect(ui).toContain('leaveIfNotHeld(() => held.current, () => startLeave(id))')
    expect(ui).toContain('beginToastExit(')
  })
})

describe('#1053 — the icon by kind', () => {
  it('checks for ok, alerts for err and draws none for a neutral toast', () => {
    expect(toastIconKind('ok')).toBe('check')
    expect(toastIconKind('err')).toBe('alert')
    expect(toastIconKind('neutral')).toBeNull()
    expect(toastIconKind('')).toBeNull()
  })

  it('marks the icon decorative and renders it only for a known kind', () => {
    expect(ui).toContain('className="toast-icon" aria-hidden="true"')
    expect(ui).toContain("icon === 'check'")
    expect(ui).toContain("icon === 'alert'")
    expect(ui).toContain('TriangleAlert size={12}')
  })
})

describe('#1053 — the toast surface', () => {
  it('gives the Undo button a 44px tap height', () => {
    expect(css).toMatch(/\.toast-action\s*\{[^}]*min-height:\s*44px/s)
  })

  it('keeps the Undo label in sentence case', () => {
    expect(css).not.toMatch(/\.toast-action\s*\{[^}]*text-transform:\s*uppercase/s)
  })

  it('rides the motion tokens for the entrance, the exit and the icon pop', () => {
    expect(css).toContain('animation: toast-in var(--motion-med) var(--ease-paper) both')
    expect(css).toContain('animation: toast-out var(--motion-fast) var(--ease-exit) both')
    expect(css).toContain('animation: toast-icon-pop var(--motion-fast) var(--ease-settle) both')
    expect(css).not.toMatch(/animation:[^;]*\b\d+ms/)
  })

  it('gives an ok toast the paper fill in dark mode', () => {
    expect(css).toContain("[data-theme='dark'] .toast.ok { background: var(--toast-night-paper); color: var(--toast-night-ink); }")
    expect(css).toContain("[data-theme='dark'] .toast.ok .toast-icon { background: var(--toast-night-action); color: var(--pw-on-cover); }")
    expect(css).toContain("[data-theme='dark'] .toast:not(.err) .toast-action {")
    expect(css).toContain('background: transparent; color: var(--toast-night-action);')
  })

  it('keeps the error fill at night and the paper tokens in the token file', () => {
    expect(tokens).toContain('--toast-night-paper: #E8EFF5')
    expect(tokens).toContain('--toast-night-ink: #142329')
    expect(css).toContain("[data-theme='dark'] .toast.err { background: var(--danger); color: var(--pw-on-sea); }")
  })

  it('drops rise, settle and sink under reduced motion', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce) {\n  .toast, .toast.leaving, .toast-icon { animation: none; }\n}')
  })
})
