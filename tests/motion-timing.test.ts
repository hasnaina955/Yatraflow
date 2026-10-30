import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MOTION_STAGGER_MAX_STEP,
  MOTION_STAGGER_STEPS,
  motionExitTiming,
  motionTiming,
  staggerDelay,
  staggerStep,
} from '../src/lib/motion'

afterEach(() => vi.unstubAllGlobals())

function styleWith(duration: string) {
  vi.stubGlobal('window', {})
  vi.stubGlobal('document', { documentElement: {} })
  vi.stubGlobal('getComputedStyle', () => ({
    getPropertyValue: (name: string) => {
      if (name === '--ease-glide') return 'ease-out'
      if (name === '--ease-exit') return 'exit-ease'
      return duration
    },
  }))
}

describe('motionTiming', () => {
  it.each(['180ms', '.18s', '0.18s', ' 180ms '])('keeps a 180ms timer for CSS time %s', value => {
    styleWith(value)
    expect(motionTiming('--motion-med')).toEqual({ duration: 180, easing: 'ease-out' })
  })

  it.each(['', 'auto', '-1ms', '180'])('uses the token default for invalid CSS time %s', value => {
    styleWith(value)
    expect(motionTiming('--motion-med').duration).toBe(240)
  })

  it('preserves a zero duration for immediate reduced-motion lifecycles', () => {
    styleWith('0s')
    expect(motionTiming('--motion-med').duration).toBe(0)
  })

  it('converts a panel duration in seconds', () => {
    styleWith('.56s')
    expect(motionTiming('--motion-slower').duration).toBe(560)
  })

  it('uses the token default without a browser', () => {
    expect(motionTiming('--motion-slower').duration).toBe(560)
    expect(motionTiming('--motion-slow').duration).toBe(360)
  })

  it('uses the full named exit lifetime', () => {
    styleWith('240ms')
    expect(motionExitTiming('--motion-med')).toEqual({ duration: 240, easing: 'exit-ease' })
  })

  it('keeps a short exit aligned with the CSS duration', () => {
    styleWith('90ms')
    expect(motionExitTiming('--motion-fast').duration).toBe(90)
  })

  it('keeps an immediate reduced-motion exit at zero', () => {
    styleWith('0s')
    expect(motionExitTiming('--motion-med')).toEqual({ duration: 0, easing: 'exit-ease' })
  })

  it('keeps the obsolete ratio and reduced fade out of the helper', () => {
    const source = readFileSync(new URL('../src/lib/motion.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('MOTION_EXIT_RATIO')
    expect(source).not.toContain('REDUCED_MOTION_FADE_MS')
  })
})

describe('stagger cap', () => {
  it('uses six items and keeps later items on the sixth step', () => {
    expect(MOTION_STAGGER_STEPS).toBe(6)
    expect(MOTION_STAGGER_MAX_STEP).toBe(5)
    expect([0, 1, 2, 3, 4, 5, 6, 8].map(staggerStep)).toEqual([0, 1, 2, 3, 4, 5, 5, 5])
  })

  it('treats a bad index as the first item', () => {
    expect(staggerStep(-2)).toBe(0)
    expect(staggerStep(Number.NaN)).toBe(0)
    expect(staggerStep(2.9)).toBe(2)
  })

  it('returns a token-based delay', () => {
    expect(staggerDelay(0)).toBe('calc(var(--stagger-step) * 0)')
    expect(staggerDelay(9)).toBe('calc(var(--stagger-step) * 5)')
  })
})
