// ============ Create readiness - what is left, said plainly ============
// The checklist that replaces submit-validation anxiety: four required things
// (name, route, dates, party) and two optional ones that say they are optional.
// Pure module - no react imports, node-testable.
//
// CONTRACT: this mirrors the page's own submit() validation exactly. Nothing
// here may claim the trip is ready when submit would reject it, and nothing may
// block when submit would accept. The optional rows never move the percentage.

export interface ReadyItem {
  key: 'name' | 'route' | 'dates' | 'party' | 'budget' | 'cover' | 'commitments'
  label: string
  done: boolean
  /** The honest one-liner: what is already true, or what is missing. */
  why: string
  optional: boolean
}

export interface Readiness {
  items: ReadyItem[]
  /** 0-100, over the REQUIRED items only. */
  pct: number
  /** How many required items are still open. */
  remaining: number
  /** True when submit() would accept the form. */
  ready: boolean
}

export interface ReadinessInput {
  name: string
  startLocation: string
  stopCount: number
  roadKm: number | null
  startDate: string
  endDate: string
  days: number
  travellers: number
  budgetPerPersonInr: number
  hasCover: boolean
  commitmentCount: number
  /** Crew members collected for the invite (P5). Optional by definition. */
  crewCount?: number
}

function inr(v: number): string {
  return '\u20B9' + v.toLocaleString('en-IN')
}

/** Dates are usable when both ends exist and the end is not before the start -
 *  the same rule submit() enforces. */
function datesOk(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) return false
  return new Date(endDate) >= new Date(startDate)
}

export function createReadiness(input: ReadinessInput): Readiness {
  const named = input.name.trim().length > 0
  const routeOk = input.startLocation.trim().length > 0 && input.stopCount > 0
  const whenOk = datesOk(input.startDate, input.endDate)
  const partyOk = Number.isFinite(input.travellers) && input.travellers >= 1
  // The page prefills a budget from its own rough bill, so this is normally
  // satisfied - it is listed because it is a real input, not to nag.
  const budgetOk = Number.isFinite(input.budgetPerPersonInr) && input.budgetPerPersonInr >= 0

  const items: ReadyItem[] = [
    {
      key: 'name', label: 'Trip name', done: named, optional: false,
      why: named ? input.name.trim() : 'name it to make it yours',
    },
    {
      key: 'route', label: 'Route', done: routeOk, optional: false,
      why: routeOk
        ? `${input.stopCount} stop${input.stopCount === 1 ? '' : 's'}${input.roadKm != null ? `, ~${input.roadKm} km` : ''}`
        : 'add a stop and a starting point',
    },
    {
      key: 'dates', label: 'Dates', done: whenOk, optional: false,
      why: whenOk ? `${input.days} day${input.days === 1 ? '' : 's'}` : 'pick the window',
    },
    {
      key: 'party', label: 'Party', done: partyOk, optional: false,
      why: partyOk ? `${input.travellers} traveller${input.travellers === 1 ? '' : 's'}` : 'at least one traveller',
    },
    {
      key: 'budget', label: 'Budget', done: budgetOk, optional: false,
      why: budgetOk ? `${inr(input.budgetPerPersonInr)} / head` : 'a budget cannot be negative',
    },
    {
      key: 'cover', label: 'Cover image', done: input.hasCover, optional: true,
      why: input.hasCover ? 'set' : 'optional',
    },
    {
      key: 'commitments', label: 'Fixed plans', done: input.commitmentCount > 0, optional: true,
      why: input.commitmentCount > 0
        ? `${input.commitmentCount} pinned`
        : (input.crewCount ?? 0) > 0 ? 'optional' : 'optional',
    },
  ]

  const required = items.filter(i => !i.optional)
  const doneCount = required.filter(i => i.done).length
  const remaining = required.length - doneCount
  return {
    items,
    pct: Math.round((doneCount / required.length) * 100),
    remaining,
    ready: remaining === 0,
  }
}

/** The one line that goes next to the submit button: honest about nearness. */
export function readinessLine(r: Readiness): string {
  if (r.ready) return 'Ready to plan'
  if (r.remaining === 1) {
    const missing = r.items.find(i => !i.optional && !i.done)
    return missing ? `One thing left - ${missing.label.toLowerCase()}` : 'One thing left'
  }
  return `${r.remaining} things left`
}
