// ============ Shared price assumptions ============
// Single source for lodging rates so the Plan Bench and the trip engine can
// never drift (issue #125b — the engine used to hand-mirror this table with a
// comment admitting it). No imports: both consumers must be able to reach it
// without cycling.
export type StayTier = 'budget' | 'comfort' | 'luxury'

/** ₹ per room per night, two guests per room. */
export const STAY_RATE_PER_NIGHT: Record<StayTier, number> = {
  budget: 1200, comfort: 3200, luxury: 8000,
} as const
