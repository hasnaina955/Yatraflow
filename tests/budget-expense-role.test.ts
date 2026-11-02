// ============ PW-13 review — expense writers check the acting user ============
//
// The Budget tab's editor can be open when a realtime downgrade removes the
// edit right. The store's expense writers now take the acting user and refuse
// before they mutate the cache, so a stale save or Undo cannot write under a
// role the trip no longer grants. This pins the store half; the component's
// `canWrite` guard is pinned in budget-artboard.test.ts.
import { describe, expect, it, vi } from 'vitest'
import { seedData } from '../src/data/seed'

vi.mock('../src/lib/supabase', () => {
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {}
    builder.update = () => builder
    builder.insert = () => builder
    builder.delete = () => builder
    builder.select = () => builder
    builder.eq = () => builder
    builder.in = () => builder
    builder.order = () => builder
    builder.limit = () => builder
    builder.maybeSingle = () => builder
    builder.single = () => builder
    builder.then = (res: (v: { data: unknown; error: unknown }) => unknown) =>
      new Promise(resolve => resolve({ data: null, error: null })).then(res)
    return builder
  }
  return { isSupabaseConfigured: false, supabase: { from: () => makeBuilder() } }
})

import {
  addExpense, deleteExpense, duplicateTrip, restoreExpense, tripById, updateExpense,
  _setTripWriteDebounceMs,
} from '../src/store/store'
import type { Expense } from '../src/data/types'

_setTripWriteDebounceMs(0)

let seq = 0
const EDITOR = 'role-editor'
const VIEWER = 'role-viewer'

function tripWithLine(): { tripId: string; line: Expense; ownerId: string } {
  const ownerId = `role-owner-${++seq}`
  const trip = duplicateTrip(seedData.trips[0], ownerId)
  addExpense(trip.id, { label: 'Probe line', category: 'food', amountInr: 500 }, ownerId)
  const stored = tripById(trip.id)!
  stored.members = [
    ...(stored.members ?? []),
    { userId: EDITOR, role: 'editor', joinedAt: 1 },
    { userId: VIEWER, role: 'viewer', joinedAt: 2 },
  ]
  const line = stored.expenses.find(e => e.label === 'Probe line')!
  return { tripId: trip.id, line, ownerId }
}

const lineNow = (tripId: string, id: string) => tripById(tripId)!.expenses.find(e => e.id === id)
const lineCount = (tripId: string) => tripById(tripId)!.expenses.length

describe('PW-13 — an expense write needs the acting user’s edit right', () => {
  it('the owner and an editor can write', () => {
    const { tripId, line, ownerId } = tripWithLine()
    expect(updateExpense(tripId, line.id, { amountInr: 900 }, ownerId)).toBe('applied')
    expect(lineNow(tripId, line.id)?.amountInr).toBe(900)
    expect(updateExpense(tripId, line.id, { label: 'Edited by the editor' }, EDITOR)).toBe('applied')
    expect(lineNow(tripId, line.id)?.label).toBe('Edited by the editor')
    const beforeAdd = lineCount(tripId)
    expect(addExpense(tripId, { label: 'Second line', category: 'food', amountInr: 100 }, ownerId)).toBe('applied')
    expect(lineCount(tripId)).toBe(beforeAdd + 1)
    const edited = lineNow(tripId, line.id)!
    expect(deleteExpense(tripId, line.id, ownerId)).toBe('applied')
    expect(lineNow(tripId, line.id)).toBeUndefined()
    expect(deleteExpense(tripId, line.id, ownerId)).toBe('no-such-line')
    expect(restoreExpense(tripId, edited, 0, ownerId)).toBe('applied')
    expect(lineNow(tripId, line.id)?.amountInr).toBe(900)
    expect(lineNow(tripId, line.id)?.label).toBe('Edited by the editor')
    expect(restoreExpense(tripId, edited, 0, ownerId)).toBe('duplicate')
  })

  it('a viewer is refused on add, edit, delete and restore', () => {
    const { tripId, line, ownerId } = tripWithLine()
    const before = lineCount(tripId)

    expect(addExpense(tripId, { label: 'Viewer line', category: 'food', amountInr: 100 }, VIEWER)).toBe('refused')
    expect(lineCount(tripId)).toBe(before)
    expect(updateExpense(tripId, line.id, { amountInr: 900 }, VIEWER)).toBe('refused')
    expect(lineNow(tripId, line.id)?.amountInr).toBe(500)
    expect(deleteExpense(tripId, line.id, VIEWER)).toBe('refused')
    expect(lineNow(tripId, line.id)).toBeDefined()

    expect(deleteExpense(tripId, line.id, ownerId)).toBe('applied')
    expect(restoreExpense(tripId, line, 0, VIEWER)).toBe('refused')
    expect(lineNow(tripId, line.id)).toBeUndefined()
  })

  it('an Undo after a role downgrade is refused, so it cannot claim success', () => {
    const { tripId, line, ownerId } = tripWithLine()
    expect(deleteExpense(tripId, line.id, ownerId)).toBe('applied')
    expect(restoreExpense(tripId, line, 0, VIEWER)).toBe('refused')
    expect(lineNow(tripId, line.id)).toBeUndefined()
  })

  it('an invalid amount is invalid, not a role refusal', () => {
    const { tripId, line, ownerId } = tripWithLine()
    const before = lineCount(tripId)
    expect(addExpense(tripId, { label: 'Bad amount', category: 'food', amountInr: 0 }, ownerId)).toBe('invalid')
    expect(lineCount(tripId)).toBe(before)
    const bad: Expense = { ...line, id: 'invalid-restore', amountInr: 0 }
    expect(restoreExpense(tripId, bad, 0, ownerId)).toBe('invalid')
    expect(lineNow(tripId, bad.id)).toBeUndefined()
  })

  it('a session-less caller is refused by the same gate', () => {
    const { tripId, line, ownerId } = tripWithLine()
    const before = lineCount(tripId)
    expect(addExpense(tripId, { label: 'No session', category: 'food', amountInr: 100 }, null)).toBe('refused')
    expect(lineCount(tripId)).toBe(before)
    expect(updateExpense(tripId, line.id, { amountInr: 900 }, null)).toBe('refused')
    expect(lineNow(tripId, line.id)?.amountInr).toBe(500)
    expect(deleteExpense(tripId, line.id, null)).toBe('refused')
    expect(lineNow(tripId, line.id)).toBeDefined()
    expect(deleteExpense(tripId, line.id, ownerId)).toBe('applied')
    expect(restoreExpense(tripId, line, 0, null)).toBe('refused')
    expect(lineNow(tripId, line.id)).toBeUndefined()
  })

  it('a missing line is still reported before the role refusal', () => {
    const { tripId } = tripWithLine()
    expect(updateExpense(tripId, 'not-a-real-line', { amountInr: 100 }, VIEWER)).toBe('no-such-line')
  })
})
