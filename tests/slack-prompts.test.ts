// Horizon 3.6: slack prompts.
// After any itinerary change the day's leftover slack surfaces one nearby
// pick that fits: "you have ~90 min slack in Jodhpur — X is 15 min away".
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { daySlackMin, pickSlackHit, slackPrompt } from '../src/lib/slackPrompts'

describe('slack prompts', () => {
  it('computes leftover slack inside the day window, floored at zero', () => {
    // 08:30 → 21:00 window (750 min), 600 committed → 150 slack
    expect(daySlackMin({ dayEndMin: 1260, startMin: 510, driveMin: 400, dwellMin: 100, planMin: 80, bufferMin: 20 })).toBe(150)
    expect(daySlackMin({ dayEndMin: 1260, startMin: 510, driveMin: 800, dwellMin: 0, planMin: 0, bufferMin: 0 })).toBe(0)
  })

  it('picks the closest fitting candidate (there-and-back + visit)', () => {
    const cands = [
      { name: 'Far Fort', detourMin: 40, category: 'fort' },
      { name: 'Jaswant Thada', detourMin: 15, category: 'museum' },
    ]
    // 90 slack: Far Fort needs 80+60=140 (no fit at 60-min visit), Thada 30+90=120 no...
    // museum visit is 90: 30+90=120 > 90. Use food stop instead.
    const eats = [
      { name: 'Far Dhaba', detourMin: 40, category: 'food' },
      { name: 'Near Dhaba', detourMin: 10, category: 'food' },
    ]
    expect(pickSlackHit(90, eats)?.name).toBe('Near Dhaba')
    expect(pickSlackHit(90, cands)).toBeNull()
  })

  it('stays quiet on thin slack and speaks on roomy days', () => {
    const eats = [{ name: 'Near Dhaba', detourMin: 10, category: 'food' }]
    expect(slackPrompt(20, 'Jodhpur', eats)).toBeNull()
    const text = slackPrompt(90, 'Jodhpur', eats)
    expect(text).not.toBeNull()
    expect(text!).toContain('90 min slack')
    expect(text!).toContain('Jodhpur')
    expect(text!).toContain('Near Dhaba')
  })
})

describe('a supplied visit fact wins over the category default', () => {
  it('rejects a 180-minute park in 110 minutes but accepts a 45-minute waterfall', () => {
    const park = { name: 'Wonderla Park', detourMin: 20, category: 'sightseeing', visitMin: 180 }
    const waterfall = { name: 'Athirapally Falls', detourMin: 20, category: 'nature', visitMin: 45 }
    // 20 + 180 = 200 > 110; 20 + 45 = 65 fits.
    expect(pickSlackHit(110, [park])).toBeNull()
    expect(pickSlackHit(110, [park, waterfall])?.name).toBe('Athirapally Falls')
  })

  it('keeps the exact category fallback when no visit fact is supplied', () => {
    const generic = { name: 'Generic Sight', detourMin: 40, category: 'sightseeing' }
    const park = { name: 'Park', detourMin: 40, category: 'sightseeing', visitMin: 180 }
    // Absent fact: 40 + 60 = 100 fits. Supplied 180: 220 does not.
    expect(pickSlackHit(110, [generic])?.name).toBe('Generic Sight')
    expect(pickSlackHit(110, [park])).toBeNull()
  })

  it('rejects invalid explicit facts instead of treating them as zero', () => {
    for (const visitMin of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      // With the old fallback a food pick (45) at detour 40 would fit 110.
      expect(pickSlackHit(110, [{ name: 'Bad', detourMin: 40, category: 'food', visitMin }])).toBeNull()
    }
    // A real zero is a known value, not an invalid one.
    expect(pickSlackHit(50, [{ name: 'Hotel', detourMin: 10, category: 'hotel', visitMin: 0 }])?.name).toBe('Hotel')
  })

  it('spends the there-and-back detour once', () => {
    const once = { name: 'Once', detourMin: 50, category: 'food', visitMin: 45 }
    // 50 + 45 = 95; doubling the detour would need 145.
    expect(pickSlackHit(95, [once])?.name).toBe('Once')
    expect(pickSlackHit(94, [once])).toBeNull()
  })

  it('keeps the 45-minute prompt threshold', () => {
    const zero = [{ name: 'Zero', detourMin: 0, category: 'food' }]
    expect(slackPrompt(44, 'Day', zero)).toBeNull()
    expect(slackPrompt(45, 'Day', zero)).not.toBeNull()
  })

  it('forwards the already-computed visit fact from TravelPanel', () => {
    // Source pin only: this proves the forwarding expression, not a click.
    const src = readFileSync(new URL('../src/pages/trip/timeline/TravelPanel.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    expect(src).toContain('visitMin: intendedVisitMinutes(o.hit)')
  })
})
