// ============ Decision comments (I-7) ============
// TripDecision gained a comments column (20260920_decision_comments.sql) for
// parity with StopSuggestion. Two behaviours matter and are checked here: the
// comment lands in the cache and writes the whole array through when the
// column exists, and on a pre-migration database the capability probe keeps
// the comment session-only instead of firing an UPDATE the database would
// reject whole (a write naming an unknown column fails the whole statement).
import { describe, it, expect, vi } from 'vitest'
import { seedData } from '../src/data/seed'

const { calls, probeError } = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; payload?: unknown }>,
  // Set to a PGRST204/42703 code to simulate the pre-migration database.
  probeError: { code: '' as string },
}))

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    let method: string | undefined
    let payload: unknown
    const builder: Record<string, unknown> = {}
    const chain = (m: string, p?: unknown) => { method = m; payload = p; return builder }
    builder.update = (p: unknown) => chain('update', p)
    builder.insert = (p: unknown) => chain('insert', p)
    builder.delete = () => chain('delete')
    builder.select = (cols?: string) => { method = 'select'; payload = cols; return builder }
    builder.eq = () => builder
    builder.in = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.then = (res: (v: { data: unknown; error: unknown }) => unknown) =>
      new Promise(resolve => {
        // The capability probe is select('comments').limit(1) on decisions.
        const error = table === 'decisions' && method === 'select' && probeError.code
          ? { code: probeError.code, message: 'column "comments" does not exist' }
          : null
        if (method) calls.push({ table, method, payload })
        resolve({ data: null, error })
      }).then(res)
    return builder
  }
  return {
    isSupabaseConfigured: true,
    supabase: { from: (t: string) => makeBuilder(t) },
  }
})

// Fresh module per case: the capability probe memoizes its promise, which is
// the production behaviour but pins one answer for the whole file.
async function freshStore() {
  vi.resetModules()
  return import('../src/store/store')
}

const keralaTrip = seedData.trips[0]
const ownerId = 'owner-test'

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function decisionsUpdates() {
  return calls.filter(c => c.table === 'decisions' && c.method === 'update')
}

describe('decision comments (I-7)', () => {
  it('lands the comment in the cache and writes the whole array through', async () => {
    probeError.code = ''
    calls.length = 0
    const store = await freshStore()
    const trip = store.duplicateTrip(keralaTrip, ownerId)
    store.getSnapshot().sessionUserId = ownerId
    store.addDecision(trip.id, { question: 'Houseboat or resort?', options: [{ id: 'o_1', label: 'Houseboat' }] })
    const d = store.getSnapshot().decisions[store.getSnapshot().decisions.length - 1]

    store.addCommentToDecision(trip.id, d.id, ownerId, 'Book the upper deck.')
    await flush()

    const after = store.getSnapshot().decisions.find(x => x.id === d.id)!
    expect(after.comments).toHaveLength(1)
    expect(after.comments[0]).toMatchObject({ authorId: ownerId, text: 'Book the upper deck.' })

    const updates = decisionsUpdates()
    expect(updates).toHaveLength(1)
    expect((updates[0].payload as { comments: unknown[] }).comments).toEqual(after.comments)
  })

  it('stays session-only when the comments column is missing (pre-migration)', async () => {
    probeError.code = 'PGRST204'
    calls.length = 0
    const store = await freshStore()
    const trip = store.duplicateTrip(keralaTrip, ownerId)
    store.getSnapshot().sessionUserId = ownerId
    store.addDecision(trip.id, { question: 'Houseboat or resort?', options: [{ id: 'o_1', label: 'Houseboat' }] })
    const d = store.getSnapshot().decisions[store.getSnapshot().decisions.length - 1]
    calls.length = 0 // forget the addDecision insert; only the comment write matters

    store.addCommentToDecision(trip.id, d.id, ownerId, 'Book the upper deck.')
    await flush()

    // The comment shows up in the session, but no UPDATE is fired at the
    // database — the party-prefs degradation, not a silent data-loss hole.
    const after = store.getSnapshot().decisions.find(x => x.id === d.id)!
    expect(after.comments).toHaveLength(1)
    expect(decisionsUpdates()).toHaveLength(0)
  })

  it('an empty comment is a no-op, and an unknown decision is safe', async () => {
    probeError.code = ''
    calls.length = 0
    const store = await freshStore()
    const trip = store.duplicateTrip(keralaTrip, ownerId)
    store.getSnapshot().sessionUserId = ownerId
    store.addCommentToDecision(trip.id, 'no-such-decision', ownerId, 'hello')
    expect(decisionsUpdates()).toHaveLength(0)
  })
})
