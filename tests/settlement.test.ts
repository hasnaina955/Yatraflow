// ============ M6 · B4 — settlement math (pure extraction) ============
// The balances card and the greedy fewest-transfers settlement live in
// src/lib/settlement.ts; the store-action tests (m6-together.test.ts) cover
// the persistence wiring but never reach this arithmetic — this file is its
// only coverage. I-19 re-based the balances onto the OPEN tagged lines, so
// settling a line now genuinely removes it; the I-19 cases below are the
// regression guard for that. See the module header in settlement.ts.
import { describe, it, expect } from 'vitest'
import { computeBalances, settleBalances, fairSharePerHead, linesTotal, openTaggedLines } from '../src/lib/settlement'
import type { BalanceRow } from '../src/lib/settlement'
import type { User } from '../src/data/types'

const user = (id: string, name: string): User => ({
  id,
  email: `${id}@example.com`,
  profile: { name, avatarEmoji: '🙂' },
} as unknown as User)

describe('computeBalances', () => {
  const members = [{ userId: 'a' }, { userId: 'b' }, { userId: 'c' }]

  it('measures the OPEN tagged lines, split evenly as the fair share', () => {
    // 30_000 across 3 travellers → 10_000 each, and 'a' fronted all of it.
    const expenses = [{ id: 'e1', paidBy: 'a', amountInr: 30_000 }] as never[]
    const rows = computeBalances(members, expenses, 3)
    expect(rows.find(r => r.id === 'a')!.bal).toBe(20_000)
    expect(rows.find(r => r.id === 'b')!.bal).toBe(-10_000)
    expect(rows.find(r => r.id === 'c')!.bal).toBe(-10_000)
  })

  it('nets to zero across the crew (so the transfers have nothing left over)', () => {
    const expenses = [{ id: 'e1', paidBy: 'a', amountInr: 30_000 }] as never[]
    const rows = computeBalances(members, expenses, 3)
    expect(rows.reduce((s, r) => s + r.bal, 0)).toBeCloseTo(0, 6)
  })

  it('no lines yet → nobody owes anybody anything', () => {
    expect(computeBalances(members, [], 3).map(r => r.bal)).toEqual([0, 0, 0])
  })

  it('credits tagged lines to their payer', () => {
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 6_000 },
      { id: 'e2', paidBy: 'a', amountInr: 4_000 },
    ] as never[]
    // 10_000 of open lines over 3 heads; 'a' fronted all 10_000, so a is up
    // and b/c are down by the per-head share.
    const rows = computeBalances(members, expenses, 3)
    expect(rows.find(r => r.id === 'a')!.paid).toBe(10_000)
    expect(rows.find(r => r.id === 'a')!.bal).toBeCloseTo(10_000 - 10_000 / 3, 6)
    expect(rows.find(r => r.id === 'b')!.bal).toBeCloseTo(-10_000 / 3, 6)
  })

  it('I-19: a SETTLED line genuinely leaves the balances', () => {
    // e2 is squared up, so it is gone from BOTH sides — the fair share is the
    // 30_000 still open, and b's 6_000 credit is not counted at all.
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 30_000 },
      { id: 'e2', paidBy: 'b', amountInr: 6_000, settled: { by: 'a', at: 1 } },
    ] as never[]
    const rows = computeBalances(members, expenses, 3)
    expect(rows.find(r => r.id === 'b')!.paid).toBe(0)
    expect(rows.find(r => r.id === 'b')!.bal).toBe(-10_000)
    expect(rows.find(r => r.id === 'a')!.bal).toBe(20_000)
  })

  it('I-19: settling every line zeroes the card', () => {
    const settled = { by: 'a', at: 1 }
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 30_000, settled },
      { id: 'e2', paidBy: 'b', amountInr: 6_000, settled },
    ] as never[]
    expect(computeBalances(members, expenses, 3).map(r => r.bal)).toEqual([0, 0, 0])
  })

  it('expands a per-person line to the full head count', () => {
    // 2 travellers, per-person line of 2_000 → 'a' fronted 4_000, and the fair
    // share is that same 4_000 over the 2 heads.
    const expenses = [{ id: 'e1', paidBy: 'a', amountInr: 2_000, perPerson: true }] as never[]
    const rows = computeBalances(members.slice(0, 2), expenses, 2)
    expect(rows.find(r => r.id === 'a')!.paid).toBe(4_000)
    expect(rows.find(r => r.id === 'a')!.bal).toBe(2_000)
    expect(rows.find(r => r.id === 'b')!.bal).toBe(-2_000)
  })

  it('untagged lines stay in the shared kitty — no credit and no fair share', () => {
    const expenses = [{ id: 'e1', amountInr: 5_000 }] as never[]
    const rows = computeBalances(members, expenses, 3)
    expect(rows.every(r => r.paid === 0)).toBe(true)
    expect(rows.every(r => r.bal === 0)).toBe(true)
  })

  it('a payer who is not a member credits nobody (stale removed crew)', () => {
    const expenses = [{ id: 'e1', paidBy: 'ghost', amountInr: 9_000 }] as never[]
    const rows = computeBalances(members, expenses, 3)
    expect(rows.every(r => r.paid === 0)).toBe(true)
  })

  it('a 0 head count cannot divide by zero (floor of 1 traveller)', () => {
    // One line, one head: the only payer is exactly even and nothing is NaN.
    const expenses = [{ id: 'e1', paidBy: 'a', amountInr: 1_000 }] as never[]
    const rows = computeBalances(members, expenses, 0)
    expect(rows.find(r => r.id === 'a')!.bal).toBe(0)
    expect(rows.every(r => Number.isFinite(r.bal))).toBe(true)
  })

  it('sorts richest-first for the balances card', () => {
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 15_000 },
      { id: 'e2', paidBy: 'b', amountInr: 0 },
    ] as never[]
    const rows = computeBalances(members, expenses, 3)
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(rows[0].bal).toBeGreaterThanOrEqual(rows[rows.length - 1].bal)
  })

  it('resolves users through the injected lookup', () => {
    const rows = computeBalances(members, [], 3, id => user(id, `User ${id}`))
    expect(rows[0].user?.profile.name).toBe('User a')
  })
})

describe('openTaggedLines / linesTotal', () => {
  const settled = { by: 'a', at: 1 }

  it('keeps only the open lines that have a payer', () => {
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 1_000 },
      { id: 'e2', amountInr: 2_000 },
      { id: 'e3', paidBy: 'b', amountInr: 3_000, settled },
    ] as never[]
    expect(openTaggedLines(expenses).map(e => e.id)).toEqual(['e1'])
  })

  it('linesTotal expands per-person lines to the head count', () => {
    const expenses = [
      { id: 'e1', amountInr: 1_000 },
      { id: 'e2', amountInr: 1_000, perPerson: true },
    ] as never[]
    expect(linesTotal(expenses, 3)).toBe(4_000)
    // Floor of 1: a 0/undefined head count expands to one head, never to zero.
    expect(linesTotal(expenses, 0)).toBe(2_000)
  })

  it('is the figure the card measures and the nudge prints (they cannot drift)', () => {
    const expenses = [
      { id: 'e1', paidBy: 'a', amountInr: 30_000 },
      { id: 'e2', paidBy: 'b', amountInr: 6_000, settled },
    ] as never[]
    // The settled 6_000 is outside the open population, so the share comes off
    // the 30_000 alone — and every row is its own credits minus that share.
    expect(fairSharePerHead(2, linesTotal(openTaggedLines(expenses), 2))).toBe(15_000)
    const rows = computeBalances([{ userId: 'a' }, { userId: 'b' }], expenses, 2)
    expect(rows.map(r => r.bal)).toEqual([15_000, -15_000])
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
