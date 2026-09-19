// ============ M6 · B4 — settlement math (pure extraction) ============
// The balances card and the greedy fewest-transfers settlement live in
// src/lib/settlement.ts; the store-action tests (m6-together.test.ts) cover
// the persistence wiring but never reach this arithmetic — this file is its
// only coverage. Semantics are the BudgetTab's original ones, preserved
// verbatim: see the module header there and in settlement.ts.
import { describe, it, expect } from 'vitest'
import { computeBalances, settleBalances } from '../src/lib/settlement'
import type { BalanceRow } from '../src/lib/settlement'
import type { User } from '../src/data/types'

const user = (id: string, name: string): User => ({
  id,
  email: `${id}@example.com`,
  profile: { name, avatarEmoji: '🙂' },
} as unknown as User)

describe('computeBalances', () => {
  const members = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]

  it('splits the estimate evenly as the fair share', () => {
    // 30_000 estimate, 3 travellers → each owes 10_000; no tagged lines.
    const rows = computeBalances(members, [], 3, 30_000)
    expect(rows.map(r => r.bal)).toEqual([-10_000, -10_000, -10_000])
  })

  it('credits tagged lines to their payer', () => {
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 6_000 },
      { id: 'e2', paidBy: 'a', amountInr: 4_000 },
    ] as never[]
    // Everyone's share is 10_000; 'a' fronted all 10_000 → even; b/c owe.
    const rows = computeBalances(members, expenses, 3, 30_000)
    expect(rows.find(r => r.id === 'a')!.bal).toBe(0)
    expect(rows.find(r => r.id === 'b')!.bal).toBe(-10_000)
  })

  it('expands a per-person line to the full head count', () => {
    // 2 travellers, per-person line of 2_000 → 'a' actually fronted 4_000.
    const expenses = [{ id: 'e1', paidBy: 'a', amountInr: 2_000, perPerson: true }] as never[]
    const rows = computeBalances(members.slice(0, 2), expenses, 2, 10_000)
    expect(rows.find(r => r.id === 'a')!.paid).toBe(4_000)
    expect(rows.find(r => r.id === 'a')!.bal).toBe(-1_000)
  })

  it('untagged lines stay in the shared kitty — they move nobody', () => {
    const expenses = [{ id: 'e1', amountInr: 5_000 }] as never[]
    const rows = computeBalances(members, expenses, 3, 30_000)
    expect(rows.every(r => r.paid === 0)).toBe(true)
    expect(rows.every(r => r.bal === -10_000)).toBe(true)
  })

  it('a payer who is not a member credits nobody (stale removed crew)', () => {
    const expenses = [{ id: 'e1', paidBy: 'ghost', amountInr: 9_000 }] as never[]
    const rows = computeBalances(members, expenses, 3, 30_000)
    expect(rows.every(r => r.paid === 0)).toBe(true)
  })

  it('a 0 head count cannot divide by zero (floor of 1 traveller)', () => {
    const rows = computeBalances(members, [], 0, 30_000)
    expect(rows.map(r => r.bal)).toEqual([-30_000, -30_000, -30_000])
  })

  it('sorts richest-first for the balances card', () => {
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 15_000 },
      { id: 'e2', paidBy: 'b', amountInr: 0 },
    ] as never[]
    const rows = computeBalances(members, expenses, 3, 30_000)
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(rows[0].bal).toBeGreaterThanOrEqual(rows[rows.length - 1].bal)
  })

  it('resolves users through the injected lookup', () => {
    const rows = computeBalances(members, [], 3, 30_000, id => user(id, `User ${id}`))
    expect(rows[0].user?.profile.name).toBe('User a')
  })
})

describe('settleBalances', () => {
  const row = (id: string, bal: number, name?: string): BalanceRow => ({ id, bal, user: name ? user(id, name) : undefined })

  it('settles a single debtor→creditor pair for the exact amount', () => {
    const transfers = settleBalances([row('a', 500), row('b', -500)])
    expect(transfers).toEqual([
      { from: expect.objectContaining({ id: 'b' }), to: expect.objectContaining({ id: 'a' }), amount: 500 },
    ])
  })

  it('netting: a mid-position member neither pays nor receives', () => {
    // a is owed 500, b owes 500 directly to a, c is even.
    const transfers = settleBalances([row('a', 500), row('b', -500), row('c', 0)])
    expect(transfers).toHaveLength(1)
    expect(transfers[0].from.id).toBe('b')
    expect(transfers[0].to.id).toBe('a')
  })

  it('balances 3-way debt with the fewest transfers (2, not 3)', () => {
    // b and c each owe 1_000; a fronted everything.
    const transfers = settleBalances([row('a', 2_000), row('b', -1_000), row('c', -1_000)])
    expect(transfers).toHaveLength(2)
    const totalToA = transfers.filter(t => t.to.id === 'a').reduce((s, t) => s + t.amount, 0)
    expect(totalToA).toBe(2_000)
  })

  it('splits a big debtor across two creditors', () => {
    // a and b are each owed 600; c owes 1_200 → two transfers from c.
    const transfers = settleBalances([row('a', 600), row('b', 600), row('c', -1_200)])
    expect(transfers).toHaveLength(2)
    expect(transfers.every(t => t.from.id === 'c')).toBe(true)
    expect(transfers.map(t => t.amount).sort((x, y) => y - x)).toEqual([600, 600])
  })

  it('treats float dust (< 0.5) as settled — no 1-paise transfers', () => {
    // 10_000 split 3 ways leaves a repeating residue; settle must not mint a
    // transfer for fractions of a paise.
    const rows = [
      row('a', 0.1),
      row('b', -0.07),
      row('c', -0.03),
    ]
    expect(settleBalances(rows)).toEqual([])
  })

  it('does not mutate the input rows', () => {
    const input = [row('a', 500), row('b', -500)]
    const before = JSON.stringify(input)
    settleBalances(input)
    expect(JSON.stringify(input)).toBe(before)
  })

  it('returns nothing when everyone is even', () => {
    expect(settleBalances([row('a', 0), row('b', 0)])).toEqual([])
  })
})
