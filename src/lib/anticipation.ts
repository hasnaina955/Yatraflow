// ============ Anticipation - what the engine already knows ============
// The moment after a trip is created should promise something specific, not
// throw confetti. Everything here comes from the trip's own numbers or from a
// fact the caller passed in; nothing is invented to fill a slot.
//
// HONESTY CONTRACT:
//  - Items are emitted only when their inputs exist. No filler lines, no
//    "adventure awaits". A trip with nothing known produces no items.
//  - A fuel item states arithmetic the planner can check (km / tank range),
//    and names real halts only when the caller actually resolved them.
//  - Ranked: conflicts first (they need a human), then weather, then meals,
//    then fuel. Capped at four - this is a glance, not a report.
//
// Pure module: no react/network imports, node-testable.

export type AnticipationKind = 'conflict' | 'weather' | 'meal' | 'fuel' | 'scale'

export interface AnticipationItem {
  key: string
  kind: AnticipationKind
  headline: string
  /** The working behind the headline - the same transparency as the bill. */
  detail: string
}

export interface AnticipationInput {
  tripName: string
  days: number
  travellers: number
  /** Road distance as the engine sees it, or null before it resolves. */
  roadKm: number | null
  /** Km per tank from the trip's own fuel numbers (null when it does not drive). */
  rangeKm: number | null
  /** Real halts, when the caller resolved them. Empty is fine. */
  fuelHalts: { title: string; cumKm: number }[]
  /** The lunch stop the clock lands on, when the caller knows it. */
  lunch: { title: string; atMin: number } | null
  /** 0-based indexes of days the forecast says are wet. */
  rainyDays: number[]
  /** Sentences from the engine's own warning collector, each with its own
   *  explanation - the engine's words, not a paraphrase. */
  conflicts: { title: string; detail: string }[]
}

/** Minutes past midnight -> "12:40". */
export function clockLabel(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = Math.round(min % 60)
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`
}

function dayWord(indexes: number[]): string {
  const days = indexes.map(i => i + 1).sort((a, b) => a - b)
  if (days.length === 1) return `Day ${days[0]}`
  if (days.length === 2) return `Days ${days[0]} and ${days[1]}`
  return `Days ${days[0]}-${days[days.length - 1]}`
}

export function anticipate(input: AnticipationInput): AnticipationItem[] {
  const items: AnticipationItem[] = []

  // 1. Conflicts - the things a human has to decide about.
  for (const [i, c] of input.conflicts.slice(0, 2).entries()) {
    items.push({
      key: `conflict-${i}`,
      kind: 'conflict',
      headline: c.title,
      detail: c.detail,
    })
  }

  // 2. Weather - only when the forecast actually says something.
  if (input.rainyDays.length > 0 && input.days > 1) {
    const which = input.rainyDays.filter(i => i >= 0 && i < input.days)
    if (which.length > 0) {
      items.push({
        key: 'weather',
        kind: 'weather',
        headline: `Rain likely on ${dayWord(which)}`,
        detail: 'Worth putting the indoor stops on those days - the outdoor ones read better in the dry.',
      })
    }
  }

  // 3. The meal the clock lands on.
  if (input.lunch) {
    items.push({
      key: 'meal',
      kind: 'meal',
      headline: `Lunch lands near ${input.lunch.title} around ${clockLabel(input.lunch.atMin)}`,
      detail: 'From the clock walk over the drive time - the window is 11:30am to 2:30pm.',
    })
  }

  // 4. Fuel - real halts when we have them, honest arithmetic when we do not.
  if (input.fuelHalts.length > 0) {
    const stops = input.fuelHalts.slice(0, 3).map(h => `${h.title} (~${Math.round(h.cumKm)} km)`)
    items.push({
      key: 'fuel',
      kind: 'fuel',
      headline: `${input.fuelHalts.length} fuel halt${input.fuelHalts.length === 1 ? '' : 's'} on the way`,
      detail: stops.join(', ') + ' - both from the tank maths against the route.',
    })
  } else if (input.roadKm != null && input.rangeKm != null && input.rangeKm > 0 && input.roadKm > input.rangeKm) {
    const refuels = Math.ceil(input.roadKm / input.rangeKm) - 1
    items.push({
      key: 'fuel',
      kind: 'fuel',
      headline: `About ${refuels} refuel stop${refuels === 1 ? '' : 's'} on this run`,
      detail: `${Math.round(input.roadKm)} km against a ~${Math.round(input.rangeKm)} km tank - the workspace will place them once the route resolves.`,
    })
  }

  // 5. The shape, stated plainly - always true, never padded.
  if (input.roadKm != null && input.days > 1) {
    const perDay = Math.round(input.roadKm / input.days)
    items.push({
      key: 'scale',
      kind: 'scale',
      headline: `${input.days} days, ${input.travellers} traveller${input.travellers === 1 ? '' : 's'}, ~${Math.round(input.roadKm)} km`,
      detail: `About ${perDay} km a day on average - there is room in that for the stops you have not added yet.`,
    })
  }

  return items.slice(0, 4)
}
