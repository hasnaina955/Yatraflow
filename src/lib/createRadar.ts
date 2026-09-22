// ============ Create radar - the calm pre-create check ============
// The plan's P8.3: surface the tension between pinned plans and the drive at
// create time, when it is a service - the same tension found later would read
// as a bug.
//
// HONESTY CONTRACT:
//  - Only what is computable from the form's own numbers: which day a pinned
//    plan sits on, whether that day also carries the drive home, and how many
//    fixed times share a day. Per-day road km is NOT known until the route
//    resolves in the workspace, so no line claims to know it.
//  - Calm by construction: no line blocks, no urgency, no scolding. The engine
//    protects fixed times; these lines just say so early.
//  - Capped at two. Pure module: no react/network imports, node-testable.

export interface RadarCommitment {
  title: string
  /** One of the app's commitment types; used for the readable label. */
  type: 'hotel-checkin' | 'train-departure' | 'flight-departure' | 'event' | 'other'
  dayIndex: number
  /** "HH:MM" 24h, as the form stores it. */
  time: string
}

export interface RadarInput {
  commitments: RadarCommitment[]
  days: number
  /** The ticket's road estimate, or null before it resolves. */
  roadKm: number | null
  roundTrip: boolean
  startName: string
}

export interface RadarLine {
  headline: string
  detail: string
}

const TYPE_LABEL: Record<RadarCommitment['type'], string> = {
  'hotel-checkin': 'check-in',
  'train-departure': 'train departure',
  'flight-departure': 'flight',
  event: 'event',
  other: 'plan',
}

/** "02:00" -> "2:00 pm" - the form stores 24h, people read 12h. */
export function commitmentTimeLabel(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return hhmm
  const h = Number(m[1])
  const min = m[2]
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${min}${ampm}`
}

export function radarLines(input: RadarInput): RadarLine[] {
  const lines: RadarLine[] = []
  const commits = input.commitments.filter(c => c.title.trim())
  if (commits.length === 0) return lines

  // 1. a pinned plan on the last day of a round trip shares the day with the
  //    drive home - genuinely the tightest combination a planner can set up.
  if (input.roundTrip && input.roadKm != null && input.days >= 2) {
    const last = commits.filter(c => c.dayIndex === input.days - 1)
    for (const [i, c] of last.slice(0, 1).entries()) {
      const backKm = Math.round(input.roadKm / 2)
      lines.push({
        headline: `${c.title} is on the last day - the same one drives ~${backKm} km back to ${input.startName}`,
        detail: `The ${TYPE_LABEL[c.type]} at ${commitmentTimeLabel(c.time)} is protected; the engine plans the drive home around it.`,
      })
      void i
    }
  }

  // 2. two fixed times on one day - doable, but the crew should know early.
  const byDay = new Map<number, RadarCommitment[]>()
  for (const c of commits) {
    const list = byDay.get(c.dayIndex) ?? []
    list.push(c)
    byDay.set(c.dayIndex, list)
  }
  for (const [day, list] of byDay) {
    if (list.length < 2) continue
    lines.push({
      headline: `Day ${day + 1} carries ${list.length} fixed times`,
      detail: list.map(c => `${c.title} at ${commitmentTimeLabel(c.time)}`).join(', ') + '. Doable - worth telling the crew early.',
    })
    break
  }

  return lines.slice(0, 2)
}
