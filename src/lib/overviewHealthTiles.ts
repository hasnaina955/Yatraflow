// ============ The health card's three small tiles ============
// Each tile reads a number the product already computes. None of them invents
// an assessment, and none of them needs a time zone, a sunset or a new source.
//
//   · Drive load   — the engine's own travel/fatigue thresholds (210 / 300 min).
//   · Days planned — days with at least one non-rejected stop.
//   · Budget       — cost per person against the stated target, always an
//                    estimate, never actual spend and never a score.
import type { ScheduleWarning } from './engine'
import { isFuelEconomyMode } from './engine'

export type HealthTileKey = 'drive' | 'days' | 'budget'
export type HealthTileTone = 'ok' | 'watch' | 'risk' | 'quiet'

export interface HealthTile {
  key: HealthTileKey
  label: string
  value: string
  tone: HealthTileTone
  /** The full sentence a tooltip and a screen reader use. */
  note: string
}

const DAY_TRAVEL_LONG_MIN = 210
const DAY_TRAVEL_HEAVY_MIN = 300

export function overviewHealthTiles(input: {
  transportMode: string
  warnings: readonly ScheduleWarning[]
  budgetPerPersonInr: number
  costPerPersonInr: number
  daysWithStops: number
  totalDays: number
  formatMoney: (value: number) => string
}): HealthTile[] {
  const driveDays = new Set(
    input.warnings
      .filter(warning => (warning.code === 'travel' || warning.code === 'fatigue') && warning.dayIndex != null)
      .map(warning => warning.dayIndex),
  )
  const heavy = input.warnings.some(warning =>
    (warning.code === 'travel' || warning.code === 'fatigue') && warning.severity === 'high')
  const long = input.warnings.some(warning => warning.code === 'travel' && warning.severity === 'medium')
  const affected = driveDays.size
  const driveLabel = isFuelEconomyMode(input.transportMode) ? 'Drive load' : 'Travel load'

  const total = Math.max(0, input.totalDays)
  const withStops = Math.max(0, Math.min(total, input.daysWithStops))
  const missingDays = total - withStops

  const delta = input.budgetPerPersonInr - input.costPerPersonInr
  const hasTarget = input.budgetPerPersonInr > 0

  return [
    {
      key: 'drive',
      label: driveLabel,
      value: heavy ? 'Heavy' : long ? 'Long' : 'Steady',
      tone: heavy ? 'risk' : long ? 'watch' : 'ok',
      note: affected > 0
        ? `${affected} ${affected === 1 ? 'day is' : 'days are'} above the ${DAY_TRAVEL_LONG_MIN / 60} hour travel limit.`
        : `No day is above the ${DAY_TRAVEL_LONG_MIN / 60} hour travel limit.`,
    },
    {
      key: 'days',
      label: 'Days with stops',
      value: total > 0 ? `${withStops} of ${total} days` : 'No days',
      tone: total === 0 ? 'quiet' : missingDays === 0 ? 'ok' : withStops > 0 ? 'watch' : 'quiet',
      note: total === 0
        ? 'This trip has no days yet.'
        : missingDays === 0
          ? 'Every day has a stop.'
          : `${missingDays} ${missingDays === 1 ? 'day has' : 'days have'} no stop.`,
    },
    {
      key: 'budget',
      label: 'Budget',
      value: !hasTarget ? 'No target' : delta >= 0 ? 'Under' : 'Over',
      tone: !hasTarget ? 'quiet' : delta >= 0 ? 'ok' : 'risk',
      note: !hasTarget
        ? 'Add a per-person budget to compare.'
        : `${input.formatMoney(Math.abs(delta))} ${delta >= 0 ? 'under' : 'over'} the ${input.formatMoney(input.budgetPerPersonInr)} target. This is an estimate, not actual spend.`,
    },
  ]
}

/** Exported so a test can pin the thresholds the tile quotes. */
export const HEALTH_TILE_TRAVEL_LIMITS = {
  longMinutes: DAY_TRAVEL_LONG_MIN,
  heavyMinutes: DAY_TRAVEL_HEAVY_MIN,
} as const
