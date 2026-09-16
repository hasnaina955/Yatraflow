// ============ The gallery pipeline's engine gate (Gate 2) ============
// docs/examples/itineraries/*.golden.json are the shelf's source files. This test
// is the pin that makes "imports clean and scores high by default" mechanical:
//
//   Gate 1 (structure)  — scripts/validate-itinerary.mjs, spawned here so CI runs it
//   Gate 2 (engine truth) — the real computeHealth / computeTotals, never a re-derivation
//
// It also pins the validator's enum tables to src/data/types.ts, so a schema change
// that isn't mirrored in the CLI fails here instead of silently rejecting good imports.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { computeHealth, computeTotals, simulateDay, originOf } from '../src/lib/engine'
import {
  TRANSPORT_MODES, TRAVEL_STYLES, STOP_CATEGORIES, STOP_STATUSES, EXPENSE_CATEGORIES,
} from '../src/data/types'
import type { Trip, ItineraryDay } from '../src/data/types'

const DIR = 'docs/examples/itineraries'
const VALIDATOR = 'scripts/validate-itinerary.mjs'

/** The import JSON omits tool-managed trip fields (id/createdAt/updatedAt) — the
 *  importer assigns them. The test synthesizes the same, so the engine sees a
 *  real Trip, not a partial one. */
function toTrip(raw: { trip: Record<string, unknown> }, slug: string): Trip {
  const now = Date.now()
  return {
    id: `golden:${slug}`,
    createdAt: now,
    updatedAt: now,
    members: [],
    fixedCommitments: [],
    expenses: [],
    ...(raw.trip as unknown as Trip),
  }
}

const files = readdirSync(DIR).filter(f => f.endsWith('.golden.json'))

describe('golden itineraries — the gallery pipeline gate', () => {
  it('has at least one golden file (a vacuity guard — an empty shelf cannot pass)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('the validator CLI implements the same enums as src/data/types.ts', () => {
    // Drift tripwire: the CLI's accepted vocabulary must be exactly the type's.
    const src = readFileSync(VALIDATOR, 'utf8')
    for (const list of [TRANSPORT_MODES, TRAVEL_STYLES, STOP_CATEGORIES, STOP_STATUSES, EXPENSE_CATEGORIES]) {
      for (const v of list) {
        expect(src.includes(`'${v}'`), `validator is missing enum value "${v}"`).toBe(true)
      }
    }
  })

  for (const f of files) {
    describe(f, () => {
      const file = join(DIR, f)
      const raw = JSON.parse(readFileSync(file, 'utf8')) as { trip: Record<string, unknown> }
      const trip = toTrip(raw, f)

      it('passes the structural validator (Gate 1, the CLI itself)', () => {
        // execFileSync throws on a non-zero exit, with the report on stdout — surface it.
        try {
          execFileSync(process.execPath, [VALIDATOR, file], { encoding: 'utf8' })
        } catch (e) {
          const out = (e as { stdout?: string }).stdout ?? ''
          throw new Error(`Gate 1 rejected ${f}:\n${out}`)
        }
      })

      it('prices honestly — the declared budget is within ±15% of the engine estimate', () => {
        const engine = computeTotals(trip)
        const declared = trip.budgetPerPersonInr
        const drift = Math.abs(declared - engine.costPerPersonInr) / engine.costPerPersonInr
        // Printed so the authoring loop can set the number from the engine, not from guesswork.
        console.log(
          `${f}: engine ₹${Math.round(engine.costPerPersonInr)}/person · declared ₹${declared} · drift ${(drift * 100).toFixed(1)}% · ` +
          `₹${Math.round(engine.totalCostInr)} total · ${Math.round(engine.totalDistanceKm)} km · lodging ₹${Math.round(engine.lodgingInr)} (${engine.lodgingNights}×${engine.lodgingRooms})`,
        )
        // Per-day travel load — the number the >5 h realism rule judges, printed so
        // the author sees which day is too heavy instead of guessing from the warning.
        for (const d of trip.days) {
          const sim = simulateDay(d, trip, originOf(trip, d.index), d.index)
          const over = sim.totalTravelMinutes > 300 ? '  ← OVER the 5 h rule' : ''
          console.log(`    day ${d.index + 1}: ${Math.round(sim.totalTravelMinutes)} min · ${Math.round(sim.totalDistanceKm)} km${over}`)
        }
        expect(engine.costPerPersonInr).toBeGreaterThan(0)
        expect(drift).toBeLessThanOrEqual(0.15)
      })

      it('scores high by default — engine health ≥ 85 with no high-severity warnings', () => {
        const health = computeHealth(trip)
        const describe = (w: { code: string; title: string; detail: string; fix: string }) => `${w.code}: ${w.title} — ${w.detail} (fix: ${w.fix})`
        for (const w of health.warnings) console.log(`    ⚠ [${w.severity}] ${describe(w)}`)
        const bad = health.warnings.filter(w => w.severity === 'high')
        expect(bad, `${f} has blocking engine warnings: ${bad.map(describe).join(' | ')}`).toHaveLength(0)
        expect(health.score, `${f} health score ${health.score} (band ${health.band})`).toBeGreaterThanOrEqual(85)
      })

      it('keeps the publication describing the same trip (no fork-side surprises)', () => {
        const pub = (raw as { publication?: Record<string, unknown> }).publication
        if (!pub) return
        const days = (raw.trip as { days: ItineraryDay[] }).days
        expect(pub.durationDays).toBe(days.length)
        expect(pub.estimatedBudgetPerPersonInr).toBe(trip.budgetPerPersonInr)
        expect(pub.travelStyle).toBe(trip.travelStyle)
      })
    })
  }
})
