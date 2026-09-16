// ============ Shared price assumptions ============
// Single source for lodging rates so the Plan Bench and the trip engine can
// never drift (issue #125b — the engine used to hand-mirror this table with a
// comment admitting it).
//
// The tier vocabulary is imported as a TYPE from data/types.ts. `import type`
// is fully erased at compile time, so this stays a no-runtime-import module
// (nothing cycles) while the key set is guaranteed to match the pills, the
// bench's stay control and `stayKeyFor` in engine.ts — it used to be a fourth
// hand-written copy of the same three strings (#213 Phase 5).
import type { StayStyle } from '../data/types'

/** ₹ per room per night, two guests per room. */
export const STAY_RATE_PER_NIGHT: Record<StayStyle, number> = {
  budget: 1200, comfort: 3200, luxury: 8000,
} as const
