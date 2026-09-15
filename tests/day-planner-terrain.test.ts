// ============ #124 — the clock walk must respect the terrain mix ============
// SPEC FIRST. This file encodes the required behaviour before the fix exists.
// The Day Planner walks anchors on ONE blended rate (totalKm / driveMinutes),
// so on a day whose terrain differs from the trip's average every position —
// lunch, tea, the night halt — and every ETA is wrong, in the direction of the
// mismatch: too far along when the day is slow, too short when it is fast.
//
// Scenario (the issue's own): 900 km where the first 100 km is ghat
// (240 min ≈ 25 km/h) and the remaining 800 km is highway (800 min = 60 km/h).
// The planner is handed the totals 900 km / 1040 min → blended 51.9 km/h.
//
// The oracle below converts WHEEL minutes → km through the terrain spec. The
// walk's dwell accounting (a lunch stop spends 45 min not moving) is the
// planner's existing, separately-tested behaviour; these fixtures pin only the
// conversion it currently gets wrong.
//
// EXPECTED ON TODAY'S CODE: the four `MUST` tests fail (positions and times come
// out blended), while the default-preservation test passes — that is the
// contract the fix must not break.
import { describe, expect, it } from 'vitest'
import { planDriveDays, planTravelClock } from '../src/lib/ridePlan'

/** Terrain spec: cumulative wheel minutes at each distance — the shape the fix consumes. */
type TerrainProfile = { km: number; min: number }[]

const GHAT_THEN_HIGHWAY: TerrainProfile = [
  { km: 0, min: 0 },
  { km: 100, min: 240 },   // 100 km of ghat in 4 h  (25 km/h)
  { km: 900, min: 1040 },  // then 800 km of highway (60 km/h)
]
const TOTAL_KM = 900
const DRIVE_MIN = 1040

/** The oracle: road km after `wheelMinutes` of driving, interpolated across the terrain. */
function kmAfterWheelMinutes(wheelMinutes: number, profile: TerrainProfile = GHAT_THEN_HIGHWAY): number {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]
    const b = profile[i]
    if (wheelMinutes <= b.min) {
      const t = (wheelMinutes - a.min) / (b.min - a.min)
      return a.km + t * (b.km - a.km)
    }
  }
  return profile[profile.length - 1].km
}

/** The inverse: wheel minutes needed to cover `km`. */
function wheelMinutesForKm(km: number, profile: TerrainProfile = GHAT_THEN_HIGHWAY): number {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1]
    const b = profile[i]
    if (km <= b.km) {
      const t = (km - a.km) / (b.km - a.km)
      return a.min + t * (b.min - a.min)
    }
  }
  return profile[profile.length - 1].min
}

// 08:30 start. Lunch at 11:30 = 180 wheel minutes in; +45 min dwell; tea at
// 16:30 = 255 wheel minutes after lunch resumes. Dwell is time, not distance.
const LUNCH_KM = kmAfterWheelMinutes(180)              // 75 km
const TEA_KM = kmAfterWheelMinutes(180 + 45 + 255)     // 295 km
const LUNCH_KM_BLENDED = Math.round(180 * (TOTAL_KM / DRIVE_MIN)) // 156 km — today's answer

describe('#124 — mixed terrain (ghat first 100 km, then highway)', () => {
  it('MUST place lunch where the ghat actually puts the car at 11:30', () => {
    const v = planTravelClock({ totalKm: TOTAL_KM, driveMinutes: DRIVE_MIN, dayStart: '08:30', profile: GHAT_THEN_HIGHWAY })
    expect(v.verdict).toBe('ok')
    if (v.verdict !== 'ok') return
    const lunch = v.days[0].anchors.find(a => a.name === 'lunch')
    expect(lunch, 'day 1 has a lunch anchor').toBeDefined()
    expect(lunch!.km).toBeGreaterThan(LUNCH_KM - 5)
    expect(lunch!.km).toBeLessThan(LUNCH_KM + 5)
  })

  it('MUST place tea at the true 16:30 position (lunch dwell is not distance)', () => {
    const v = planTravelClock({ totalKm: TOTAL_KM, driveMinutes: DRIVE_MIN, dayStart: '08:30', profile: GHAT_THEN_HIGHWAY })
    if (v.verdict !== 'ok') return
    const tea = v.days[0].anchors.find(a => a.name === 'tea')
    expect(tea, 'day 1 has a tea anchor').toBeDefined()
    expect(tea!.km).toBeGreaterThan(TEA_KM - 6)
    expect(tea!.km).toBeLessThan(TEA_KM + 6)
  })

  it('MUST balance the split by TIME, not by distance', () => {
    // Equal km is equal wheel time only when the terrain is uniform. Here the
    // time-balanced boundary sits where cumulative wheel time = 1040 / 2 =
    // 520 min → 380 km (100 km ghat + 280 km highway), giving 520 + 520 minutes.
    const timeBalancedKm = kmAfterWheelMinutes(DRIVE_MIN / 2)
    const split = planDriveDays({ totalKm: TOTAL_KM, driveMinutes: DRIVE_MIN, profile: GHAT_THEN_HIGHWAY })
    expect(split).not.toBeNull()
    expect(split!.nightHalts[0]).toBeGreaterThan(timeBalancedKm - 10)
    expect(split!.nightHalts[0]).toBeLessThan(timeBalancedKm + 10)
  })

  it('MUST report a max daily wheel time that survives the terrain', () => {
    // Today the split reports `perDay / blendedRate` ≈ 520 min for BOTH days,
    // while day 1 really takes 590 min on this terrain — the understated number
    // the banner and the fatigue verdict are built on.
    const split = planDriveDays({ totalKm: TOTAL_KM, driveMinutes: DRIVE_MIN, profile: GHAT_THEN_HIGHWAY })
    const boundary = split!.nightHalts[0] ?? TOTAL_KM
    const trueMax = Math.max(wheelMinutesForKm(boundary), wheelMinutesForKm(TOTAL_KM - boundary))
    expect(split!.maxDailyWheelMin).toBeGreaterThanOrEqual(trueMax - 5)
  })

  it('keeps the blended behaviour when no profile is supplied (the fix must not move existing trips)', () => {
    const v = planTravelClock({ totalKm: TOTAL_KM, driveMinutes: DRIVE_MIN, dayStart: '08:30' })
    if (v.verdict !== 'ok') return
    const lunch = v.days[0].anchors.find(a => a.name === 'lunch')
    expect(lunch!.km).toBeCloseTo(LUNCH_KM_BLENDED, -1) // ~156 km, exactly as today
  })
})

// NOTE ON GRANULARITY — deliberately NOT asserted here because it is a property
// of the fix's DATA SOURCE, not of the walk: the app routes leg-by-leg between
// stops, so when no stop sits at a terrain boundary the cumulative profile built
// from measured legs degenerates to [{0,0},{900,1040}] — the blended rate in
// profile clothing. This fixture (ghat 0-100 km, highway after) is only
// satisfiable from leg data when a stop splits the terrains; otherwise the
// profile must come from finer data (provider per-step / per-coordinate
// durations) or a stated terrain speed model. See the #124 evaluation.
