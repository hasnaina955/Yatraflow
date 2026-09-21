// ============ Masteradmin console stats ============
// Pure derivations over the hydrated cache (node-testable). Fresh apps with
// zero users/trips render 0s, never NaN — every denominator is guarded.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  weekBucket, computeAdminOverview, computeGrowthSeries, computeFunnel, recentJoins,
  platformRevenue, type PlatformSale,
} from '../src/lib/adminStats'
import { buildSalesLedger } from '../src/lib/earnings'
import type { Trip, User } from '../src/data/types'

function user(id: string, createdAt: number, extra: Partial<User['profile']> = {}): User {
  return {
    id, email: `${id}@x.com`, createdAt,
    profile: { name: id, languages: ['en'], travelStyles: ['balanced'], isCreator: false, ...extra },
  }
}

function trip(id: string, owner: string, createdAt: number, visibility: Trip['visibility'] = 'private', members = 1): Trip {
  return {
    id, name: id, startLocation: 'A', destinations: ['B'], startDate: '', endDate: '',
    travellers: members, transportMode: 'car', budgetPerPersonInr: 0, travelStyle: 'balanced',
    fixedCommitments: [], days: [], expenses: [],
    members: Array.from({ length: members }, (_, i) => ({
      userId: i === 0 ? owner : `${id}-m${i}`, role: i === 0 ? 'owner' : 'editor', joinedAt: createdAt,
    })),
    coverEmoji: '🧭', visibility, createdAt, updatedAt: createdAt,
  }
}

describe('weekBucket', () => {
  it('buckets a whole week to Monday 00:00 UTC', () => {
    // 2026-09-09 is a Wednesday; Monday 2026-09-07 00:00 UTC is the bucket.
    const expected = Date.UTC(2026, 8, 7)
    expect(weekBucket(Date.UTC(2026, 8, 9, 15, 30))).toBe(expected)
    expect(weekBucket(Date.UTC(2026, 8, 7))).toBe(expected)
    expect(weekBucket(Date.UTC(2026, 8, 13, 23, 59))).toBe(expected)
    expect(weekBucket(Date.UTC(2026, 8, 14))).toBe(Date.UTC(2026, 8, 14))
  })
})

describe('computeAdminOverview', () => {
  it('returns zeros on an empty app, never NaN', () => {
    const o = computeAdminOverview([], [], [], [], [], [])
    expect(o.totalUsers).toBe(0)
    expect(o.avgMembersPerTrip).toBe(0)
    expect(o.privateTrips).toBe(0)
    expect(Number.isNaN(o.avgMembersPerTrip)).toBe(false)
  })
  it('splits visibility, counts members, slices activity weeks', () => {
    const now = Date.UTC(2026, 8, 9, 12)
    const users = [user('a', now - 1000), user('b', now - 2000, { isCreator: true, isDisabled: true })]
    const trips = [trip('t1', 'a', now - 1000, 'private', 2), trip('t2', 'b', now - 1000, 'public', 1)]
    const suggestions = [{ status: 'open' }, { status: 'accepted' }]
    const decisions = [{ status: 'resolved' }] as never[]
    const activity = [
      { id: 'x', tripId: 't1', actorId: 'a', verb: 'v', at: now - 86400000 },
      { id: 'y', tripId: 't1', actorId: 'a', verb: 'v', at: now - 10 * 86400000 },
    ] as never[]
    const o = computeAdminOverview(users, trips, suggestions, decisions, [], activity, now)
    expect(o.totalUsers).toBe(2)
    expect(o.disabledUsers).toBe(1)
    expect(o.creators).toBe(1)
    expect(o.privateTrips).toBe(1)
    expect(o.publicTrips).toBe(1)
    expect(o.totalMembers).toBe(3)
    expect(o.avgMembersPerTrip).toBeCloseTo(1.5)
    expect(o.openSuggestions).toBe(1)
    expect(o.resolvedSuggestions).toBe(1)
    expect(o.openDecisions).toBe(0)
    expect(o.resolvedDecisions).toBe(1)
    expect(o.activityLast7d).toBe(1)
    expect(o.activityPrev7d).toBe(1)
  })
})

describe('parseAdminRole', () => {
  it('accepts only the exact masteradmin role', async () => {
    const { parseAdminRole } = await import('../src/lib/admin')
    expect(parseAdminRole({ role: 'masteradmin' })).toBe(true)
    expect(parseAdminRole({ role: 'admin' })).toBe(false)
    expect(parseAdminRole({ role: 'masteradmin ' })).toBe(false)
    expect(parseAdminRole(null)).toBe(false)
    expect(parseAdminRole(undefined)).toBe(false)
    expect(parseAdminRole([])).toBe(false)
    expect(parseAdminRole({})).toBe(false)
    expect(parseAdminRole('masteradmin')).toBe(false)
  })
})

describe('computeGrowthSeries', () => {
  it('buckets signups and trips into trailing weeks', () => {
    const now = Date.UTC(2026, 8, 9, 12) // Wed
    const thisWeek = weekBucket(now)
    const users = [user('a', thisWeek + 1000), user('b', thisWeek - 7 * 86400000 + 1000)]
    const trips = [trip('t1', 'a', thisWeek + 2000, 'private')]
    const series = computeGrowthSeries(users, trips, 4, now)
    expect(series).toHaveLength(4)
    expect(series[3]).toMatchObject({ week: thisWeek, signups: 1, trips: 1 })
    expect(series[2]).toMatchObject({ signups: 1, trips: 0 })
    expect(series[0]).toMatchObject({ signups: 0, trips: 0 })
  })
  it('ignores future-dated rows', () => {
    const now = Date.UTC(2026, 8, 9, 12)
    const series = computeGrowthSeries([user('a', now + 30 * 86400000)], [], 4, now)
    expect(series.reduce((s, p) => s + p.signups, 0)).toBe(0)
  })
})

describe('computeFunnel', () => {
  it('guards every denominator on empty input', () => {
    const f = computeFunnel([], [], [])
    expect(f).toMatchObject({ activationPct: 0, collabPct: 0, publishPct: 0, viewToCopyPct: 0 })
  })
  it('computes activation, collab, publish and view-to-copy rates', () => {
    const users = [user('a', 1), user('b', 1), user('c', 1)]
    const trips = [trip('t1', 'a', 1, 'public', 2), trip('t2', 'b', 1, 'private', 1)]
    const pubs = [{ tripId: 't1', views: 100, copies: 10 }] as never[]
    const f = computeFunnel(users, trips, pubs)
    expect(f.usersWithTrips).toBe(2)
    expect(f.activationPct).toBeCloseTo((2 / 3) * 100)
    expect(f.collabPct).toBe(50)
    expect(f.publishPct).toBe(50)
    expect(f.viewToCopyPct).toBe(10)
  })
})

describe('recentJoins', () => {
  it('counts only joins within 30 days', () => {
    const now = 1000000000000
    const members = [
      { userId: 'a', role: 'owner', joinedAt: now - 1000 },
      { userId: 'b', role: 'editor', joinedAt: now - 31 * 86400000 },
    ] as never[]
    expect(recentJoins(members, now)).toBe(1)
    expect(recentJoins([], now)).toBe(0)
  })
})

describe('platformRevenue (the console\u2019s Analytics tab)', () => {
  const sale = (over: Partial<PlatformSale>): PlatformSale => ({
    grantedAt: 1000, amountPaidInr: 199, pubId: 'p1', creatorId: 'c1', ...over,
  })

  it('charges the ladder PER CREATOR, not once over the platform\u2019s total', () => {
    // The platform\u2019s total crosses \u20b925,000 long before most creators\u2019 do, so one
    // ladder over the total would charge the cheaper rate on money that was
    // actually charged the dearer one. Two creators at \u20b920,000 each sit entirely
    // inside the 15% tier: \u20b93,000 apiece, \u20b96,000 together. A single shared ladder
    // over \u20b940,000 would claim \u20b95,250 \u2014 understating what was collected.
    const rev = platformRevenue([
      sale({ creatorId: 'c1', amountPaidInr: 20_000, pubId: 'pa' }),
      sale({ creatorId: 'c2', amountPaidInr: 20_000, pubId: 'pb' }),
    ])
    expect(rev.sales.grossInr).toBe(40_000)
    expect(rev.sales.feeInr).toBe(6_000)
    expect(rev.sales.netInr).toBe(34_000)
    expect(rev.creators).toBe(2)
  })

  it('equals the sum of the creators\u2019 own ledgers \u2014 one ladder, two readers', () => {
    // The console\u2019s cut and a creator\u2019s fee column must come from the same ladder
    // and the same attribution order, or one of the two surfaces is lying.
    const rows = [
      sale({ creatorId: 'c1', amountPaidInr: 199, pubId: 'pa', grantedAt: 1 }),
      sale({ creatorId: 'c1', amountPaidInr: 25_000, pubId: 'pa', grantedAt: 2 }),
      sale({ creatorId: 'c2', amountPaidInr: 499, pubId: 'pb', grantedAt: 3 }),
    ]
    const rev = platformRevenue(rows)
    const perCreator = ['c1', 'c2'].map(id => buildSalesLedger(
      rows.filter(r => r.creatorId === id)
        .map(r => ({ pubId: r.pubId, amountPaidInr: r.amountPaidInr, grantedAt: r.grantedAt })),
      pubId => pubId,
    ))
    expect(rev.sales.feeInr).toBe(perCreator.reduce((s, l) => s + l.feeInr, 0))
    expect(rev.sales.grossInr).toBe(perCreator.reduce((s, l) => s + l.grossInr, 0))
    expect(rev.sales.netInr).toBe(perCreator.reduce((s, l) => s + l.netInr, 0))
  })

  it('buckets windows that add up to the totals, newest window first', () => {
    const monday = new Date(2026, 8, 21, 9, 0, 0).getTime()
    const rev = platformRevenue([
      sale({ creatorId: 'c1', amountPaidInr: 199, grantedAt: monday }),
      sale({ creatorId: 'c2', amountPaidInr: 499, grantedAt: monday + 86_400_000 }),
      sale({ creatorId: 'c1', amountPaidInr: 149, grantedAt: monday + 7 * 86_400_000 }),
    ])
    expect(rev.periods).toHaveLength(2)
    expect(rev.periods[0]!.runAt).toBeGreaterThan(rev.periods[1]!.runAt)
    expect(rev.periods.reduce((s, p) => s + p.grossInr, 0)).toBe(rev.sales.grossInr)
    expect(rev.periods.reduce((s, p) => s + p.feeInr, 0)).toBe(rev.sales.feeInr)
    expect(rev.periods.reduce((s, p) => s + p.salesCount, 0)).toBe(rev.sales.rows.length)
  })

  it('is an honest zero on an empty platform, never NaN', () => {
    const rev = platformRevenue([])
    expect(rev).toMatchObject({ periods: [], creators: 0 })
    expect(rev.sales).toMatchObject({ rows: [], grossInr: 0, feeInr: 0, netInr: 0, soldPubIds: [] })
  })
})

describe('the console renders the books, or says it could not read them', () => {
  // The Analytics tab needs an admin session to render, which a node test cannot
  // supply, so the wiring is pinned at the source: these are the ways a correctly
  // computed figure could still reach the operator wrong.
  const page = readFileSync(new URL('../src/pages/AdminPage.tsx', import.meta.url), 'utf8')
  const unlock = readFileSync(new URL('../src/lib/unlock.ts', import.meta.url), 'utf8')
  const sql = readFileSync(new URL('../supabase/migrations/20260921_admin_revenue.sql', import.meta.url), 'utf8')

  it('shows the revenue row instead of promising it', () => {
    expect(page).toMatch(/aria-label="Platform revenue"/)
    expect(page).toMatch(/aria-label="Platform revenue by week"/)
    expect(page).toMatch(/platformRevenue\(rows\)/)
    // The copy that said this tab reads nothing from the ledger is gone.
    expect(page).not.toContain('reads nothing from them yet')
    expect(page).not.toMatch(/revenue row \(payout periods, gross → net\) is still to/)
  })

  it('reports a failed read rather than a zero it cannot vouch for', () => {
    // Entitlements are not in the hydrated cache, so unlike every other figure on
    // this tab the revenue read is a network call that can fail \u2014 and \u20b90 revenue
    // over a failed read is the one wrong answer an operator cannot detect.
    expect(page).toMatch(/The sales ledger could not be read/)
    expect(page).toMatch(/fetchAdminRevenue\(\)/)
    expect(page).toMatch(/aria-label="Platform revenue"/)
  })

  it('carries the payee the per-creator ladder needs, and never the buyer', () => {
    // The RPC returns creator_id and the mapping must keep it: dropping it would
    // silently collapse every creator into one ladder.
    expect(unlock).toMatch(/creatorId: row\.creator_id as string/)
    expect(sql).toMatch(/p\.creator_id/)
    const selectList = sql.slice(sql.indexOf('return query'), sql.indexOf('from public.entitlements'))
    expect(selectList.length).toBeGreaterThan(0)
    expect(selectList).not.toMatch(/user_id/)
    // Admin-only, and reachable to authenticated callers alone.
    expect(sql).toMatch(/if not public\.is_admin\(\) then/)
    expect(sql).toMatch(/revoke all on function public\.admin_revenue\(integer, timestamptz\) from public, anon;/)
  })
})
