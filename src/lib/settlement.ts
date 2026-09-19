// Settlement math (M6 · B4) — the one part of the settle-up feature that is
// arithmetic rather than wiring, extracted from BudgetTab so it can carry unit
// tests (the store-action tests never reach this code). Pure: no store, no
// React, no dates — members in, balances and transfers out.
//
// Semantics preserved verbatim from the component (do not "improve" here
// without updating the component AND these tests):
//  - Fair share is the whole trip estimate split per head (travellers floor of
//    1, so a 0/undefined head count cannot divide by zero).
//  - Only lines TAGGED with a payer move a balance; untagged lines stay in the
//    shared kitty and move nobody.
//  - A per-person line is multiplied by the head count — whoever fronted it
//    paid for everyone.
//  - A payer who is not a member (stale row, removed crew member) credits
//    nobody: balances are computed over members only.
import type { Expense, ID, User } from '../data/types'

export interface BalanceRow {
  id: ID
  user?: User
  /** Total amount this member fronted (tagged lines, perPerson expanded). */
  paid: number
  /** paid − fairShare. Positive = owed money; negative = owes. */
  bal: number
}

export interface Transfer {
  from: { id: ID; user?: User }
  to: { id: ID; user?: User }
  amount: number
}

/** The per-head fair share the balances are measured against (exported for the
 *  card's copy, which prints it even when balances are hidden). */
export function fairSharePerHead(travellers: number, totalCostInr: number): number {
  return totalCostInr / Math.max(1, travellers)
}

/**
 * Per-member balances for a trip: everyone's fair share is `totalCostInr`
 * split per head; tagged expenses credit whoever fronted them, with per-person
 * lines expanded to the full head count. Sorted richest-first (the balances
 * card's display order). `getUser` is an injected lookup so this module never
 * imports the store.
 */
export function computeBalances(
  members: { userId: ID }[],
  expenses: Expense[],
  travellers: number,
  totalCostInr: number,
  getUser?: (id: ID) => User | undefined,
): BalanceRow[] {
  const fairShare = fairSharePerHead(travellers, totalCostInr)
  const paid = new Map<ID, number>()
  for (const e of expenses) {
    if (!e.paidBy) continue
    const amt = e.perPerson ? e.amountInr * travellers : e.amountInr
    paid.set(e.paidBy, (paid.get(e.paidBy) ?? 0) + amt)
  }
  return members
    .map(m => ({
      id: m.userId,
      user: getUser?.(m.userId),
      paid: paid.get(m.userId) ?? 0,
      bal: (paid.get(m.userId) ?? 0) - fairShare,
    }))
    .sort((a, b) => b.bal - a.bal)
}

/**
 * Greedy fewest-transfers settlement: richest creditor meets biggest debtor
 * until everyone is even. The ±0.5 threshold is the rounding tolerance —
 * sub-50-paise residues (float dust from the per-head split) are treated as
 * settled rather than minting a 1-paise transfer. Rows are copied before
 * mutating; the input is never touched.
 *
 * Note on the returned transfers: `from`/`to` are references into the copied
 * working rows, so by the time the loop finishes their `bal` carries the
 * POST-settlement residual (≈ 0), not the balance the row started with. No
 * caller reads `bal` off a transfer today — the card renders `user` and
 * `amount` — but treat `from.bal`/`to.bal` as scratch, not data.
 */
export function settleBalances(balances: BalanceRow[]): Transfer[] {
  const creditors = balances.filter(b => b.bal > 0.5).map(b => ({ ...b })).sort((a, b) => b.bal - a.bal)
  const debtors = balances.filter(b => b.bal < -0.5).map(b => ({ ...b })).sort((a, b) => a.bal - b.bal)
  const out: Transfer[] = []
  let ci = 0, di = 0
  while (ci < creditors.length && di < debtors.length) {
    const amt = Math.min(creditors[ci].bal, -debtors[di].bal)
    out.push({ from: debtors[di], to: creditors[ci], amount: amt })
    creditors[ci].bal -= amt
    debtors[di].bal += amt
    if (creditors[ci].bal <= 0.5) ci++
    if (-debtors[di].bal <= 0.5) di++
  }
  return out
}
