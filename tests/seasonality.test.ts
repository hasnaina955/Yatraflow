// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { SEASONALITY, seasonalityFor, seasonNoteFor, monthName, monthOfIso } from '../src/lib/seasonality'

describe('seasonality - what the month means for this route', () => {
  it('every region is coherent: best and caution months are real and do not overlap', () => {
    for (const s of SEASONALITY) {
      expect(s.label.trim(), s.label).not.toBe('')
      expect(s.matches.length, s.label).toBeGreaterThan(0)
      expect(s.best.length, s.label).toBeGreaterThan(0)
      for (const m of [...s.best, ...s.caution]) {
        expect(m, s.label).toBeGreaterThanOrEqual(1)
        expect(m, s.label).toBeLessThanOrEqual(12)
      }
      for (const m of s.best) expect(s.caution, s.label).not.toContain(m)
      expect(s.note.length, s.label).toBeGreaterThan(30)
    }
  })

  it('matches a region from the destination text, case-insensitively', () => {
    expect(seasonalityFor(['Munnar, Kerala'])?.label).toBe('Kerala')
    expect(seasonalityFor(['leh, ladakh'])?.label).toBe('Ladakh')
    expect(seasonalityFor(['Panaji, Goa'])?.label).toBe('the Konkan coast')
    expect(seasonalityFor(['Shillong, Meghalaya'])?.label).toBe('the North-East')
  })

  it('an unknown region says nothing rather than something generic', () => {
    expect(seasonalityFor(['Bhopal, Madhya Pradesh'])).toBeNull()
    expect(seasonNoteFor(['Bhopal, Madhya Pradesh'], 2)).toBeNull()
    expect(seasonalityFor([])).toBeNull()
    expect(seasonNoteFor([''], 2)).toBeNull()
  })

  it('a month outside 1-12 is refused, not guessed', () => {
    expect(seasonNoteFor(['Kerala'], 0)).toBeNull()
    expect(seasonNoteFor(['Kerala'], 13)).toBeNull()
    expect(seasonNoteFor(['Kerala'], Number.NaN)).toBeNull()
  })

  it('the note distinguishes the good window, the rough stretch, and the in-between', () => {
    const good = seasonNoteFor(['Munnar, Kerala'], 2)!
    expect(good).toContain('good window')
    expect(good).toContain('February')
    const rough = seasonNoteFor(['Munnar, Kerala'], 7)!
    expect(rough).toContain('rough stretch')
    expect(rough).toContain('monsoon')
    const between = seasonNoteFor(['Munnar, Kerala'], 5)!
    expect(between).toContain('between')
  })

  it('the note carries the region and its own sentence - no generic filler', () => {
    const note = seasonNoteFor(['Jaipur, Rajasthan'], 5)!
    expect(note).toContain('Rajasthan')
    expect(note).toContain('45C')
    const snow = seasonNoteFor(['Leh, Ladakh'], 1)!
    expect(snow).toContain('snowbound')
  })

  it('the copy never sells - no urgency, no exclamation stacking, no "book now"', () => {
    for (const s of SEASONALITY) {
      const note = s.note.toLowerCase()
      expect(note, s.label).not.toMatch(/hurry|book now|limited|offer|discount|don't miss/)
      expect(s.note, s.label).not.toMatch(/!{2,}/)
    }
  })

  it('month helpers are total', () => {
    expect(monthName(1)).toBe('January')
    expect(monthName(12)).toBe('December')
    expect(monthName(0)).toBe('')
    expect(monthName(13)).toBe('')
    expect(monthOfIso('2026-02-14')).toBe(2)
    expect(monthOfIso('2026-12-01')).toBe(12)
    expect(monthOfIso('nonsense')).toBeNull()
    expect(monthOfIso('2026-13-01')).toBeNull()
  })
})
