import { describe, expect, it } from 'vitest'
// @ts-expect-error The target checker is a standalone Node script.
import { checkCompactTarget } from '../scripts/compactCardChecks.mjs'

const card = (key: string, height: number) => ({ key, width: 260, height, top: 0, coverWidth: 260, coverHeight: 120 })
const fonts = { interface: true, editorial: true, editorialTypeInUse: true }
const conditions = {
  surface: 'explore', width: 1440, theme: 'light', state: 'populated', scenario: 'mixed',
  images: 'reference', exploreAuth: 'signed-in', fontMode: 'allowed', motion: 'reduce',
}
const geometry = {
  trips: [],
  catalog: [card('/pub/a', 500)],
  trending: [card('/pub/b', 500)],
  creators: [card('/creator/a', 300)],
}
const baseline = { ...conditions, fonts, compactGeometry: geometry }
const compact = {
  ...conditions, fonts,
  compactGeometry: {
    trips: [],
    catalog: [card('/pub/a', 420)],
    trending: [card('/pub/b', 420)],
    creators: [card('/creator/a', 280)],
  },
}

describe('compact target wiring', () => {
  it('records without comparing outside target mode', () => {
    expect(checkCompactTarget(compact, [baseline], false)).toEqual({ mode: 'record' })
  })
  it('skips fixtures outside the populated mixed scope', () => {
    for (const extra of [{ scenario: 'sparse' }, { state: 'empty' }]) {
      const verdict = checkCompactTarget({ ...compact, ...extra }, [baseline], true)
      expect(verdict.mode).toBe('skip')
    }
  })
  it('fails loudly when no baseline matches the capture conditions', () => {
    const verdict = checkCompactTarget({ ...compact, fontMode: 'blocked' }, [baseline], true)
    expect(verdict.mode).toBe('fail')
    expect(verdict.failures.join(' ')).toMatch(/no baseline capture matches/)
  })
  it('fails when either side lacks loaded fonts', () => {
    const unready = { ...conditions, fonts: { interface: false, editorialTypeInUse: false } }
    for (const [side, other] of [[unready, compact], [compact, unready]]) {
      const verdict = checkCompactTarget(side as typeof compact, [{ ...baseline, ...other }], true)
      expect(verdict.mode).toBe('fail')
      expect(verdict.failures.join(' ')).toMatch(/both sides/)
    }
  })
  it('fails on an empty surface group instead of passing vacuously', () => {
    const empty = { ...compact, compactGeometry: { ...compact.compactGeometry, catalog: [] } }
    const verdict = checkCompactTarget(empty, [baseline], true)
    expect(verdict.mode).toBe('fail')
    expect(verdict.failures.join(' ')).toMatch(/no recorded cards/)
  })
  it('compares matching populated captures', () => {
    expect(checkCompactTarget(compact, [baseline], true).failures).toEqual([])
    const tall = { ...compact, compactGeometry: { ...compact.compactGeometry, catalog: [card('/pub/a', 480)] } }
    expect(checkCompactTarget(tall, [baseline], true).failures.join(' ')).toMatch(/15 percent/)
  })
  it('skips surfaces without card geometry', () => {
    const verdict = checkCompactTarget({ ...compact, surface: 'timeline' }, [baseline], true)
    expect(verdict.mode).toBe('skip')
  })
  it('omits only a proven suppression, never a silent exemption', () => {
    const emptyTrending = {
      ...compact,
      compactGeometry: { ...compact.compactGeometry, trending: [] },
    }
    expect(checkCompactTarget(emptyTrending, [baseline], true).mode).toBe('fail')
    const verdict = checkCompactTarget(emptyTrending, [baseline], true, ['trending'])
    expect(verdict.mode).toBe('compare')
    expect(verdict.failures).toEqual([])
  })
})
