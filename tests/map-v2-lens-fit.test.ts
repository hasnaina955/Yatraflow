import { describe, expect, it } from 'vitest'
import { fitCopy, lensFit, LENS_FIT_BUFFER_MIN } from '../src/pages/trip/map/lensFit'

const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
const evening = { startMin: 17 * 60, endMin: 20 * 60 }

describe('lens fit rule', () => {
  it('uses a 10 minute buffer', () => {
    expect(LENS_FIT_BUFFER_MIN).toBe(10)
  })

  it('fits a short visit and returns the clock facts', () => {
    const fit = lensFit(evening, null, 6, 60)
    expect(fit).toEqual({ fits: true, leaveMin: 1020, arriveMin: 1026, backMin: 1092, spareMin: 98 })
  })

  it('leaves late when the group is busy until later', () => {
    expect(lensFit(evening, 18 * 60, 10, 60)?.leaveMin).toBe(1080)
  })

  it('does not fit when the return and the buffer pass the window end', () => {
    const fit = lensFit(evening, null, 30, 115)
    expect(fit?.fits).toBe(false)
    expect(fit?.spareMin).toBe(-5)
  })

  it('fits exactly at the buffer edge', () => {
    expect(lensFit(evening, null, 30, 110)?.spareMin).toBe(0)
  })

  it('returns null for an unknown travel time or visit, never a guess', () => {
    expect(lensFit(evening, null, null, 60)).toBeNull()
    expect(lensFit(evening, null, 10, null)).toBeNull()
  })

  it('returns null for an invalid window or a negative input', () => {
    expect(lensFit({ startMin: 600, endMin: 600 }, null, 10, 10)).toBeNull()
    expect(lensFit(evening, null, -1, 10)).toBeNull()
    expect(lensFit(evening, Number.NaN, 10, 10)).toBeNull()
  })

  it('writes the fit line with the caller clock', () => {
    const window = { startMin: 14 * 60 + 10, endMin: 16 * 60 }
    const fit = lensFit(window, null, 25, 50)!
    expect(fitCopy(window, fit, 25, 50, clock)).toBe('Fits 14:10–16:00 · 25 min away · 50 min visit · back by 15:50')
  })

  it('writes no fit line when the visit does not fit', () => {
    const fit = lensFit(evening, null, 30, 115)!
    expect(fitCopy(evening, fit, 30, 115, clock)).toBeNull()
  })
})
