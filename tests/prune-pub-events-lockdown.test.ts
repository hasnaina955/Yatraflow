// ============ #356 — a bulk delete is not a user-facing API ==================
//
// `prune_pub_events` deletes from `pub_events` on a predicate that is purely
// `at < horizon`: not scoped to a publication, a creator, or a caller. That is
// right for retention and wrong as a grant — it shipped `to authenticated`, so
// any logged-in account could wipe every creator's traffic history, and the
// only symptom would be that a funnel trend reads "nothing recorded".
//
// This is the hardest kind of fix to test, and worth saying why: it changes a
// GRANT. No presence probe can see it (the function exists before and after),
// no ordinary unit test can execute it (it needs a live role), and the code it
// protects is a single `delete`. So it is pinned three ways — the SQL that must
// be applied, the mirror a fresh schema.sql build produces, and the assertion
// the contract suite makes against the real database.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
/** Code only: these files explain themselves at length, so a claim about what a
 *  file DOES must never be satisfied by a sentence describing it. This matters
 *  more than usual here — the header above the lockdown's revoke discusses the
 *  `authenticated` grant it removes. */
const codeOf = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')

const LOCKDOWN = '20260927_prune_pub_events_lockdown.sql'
const ORIGINAL = '20260922_pub_events_retention.sql'
/** One literal pattern, capturing the role list: the role names are compared
 *  rather than interpolated into a built pattern. */
const GRANT = /grant\s+execute\s+on\s+function\s+public\.prune_pub_events\(integer\)\s+to\s+([a-z_,\s]+);/gi

/** The roles a file grants EXECUTE on the pruner to. */
const grantedTo = (source: string) => [...codeOf(source).matchAll(GRANT)]
  .flatMap(m => m[1].split(',').map(role => role.trim().toLowerCase()))
  .filter(Boolean)

describe('#356 — the retention pruner is an operator action, not a user one', () => {
  const lockdown = read(`../supabase/migrations/${LOCKDOWN}`)

  it('takes the grant away from every role a browser can hold', () => {
    // The repo's twice-learned Supabase lesson: `revoke … from public` does NOT
    // revoke from anon, and revoking from anon does not revoke from
    // authenticated. All three have to be named, or the door stays open.
    expect(codeOf(lockdown)).toMatch(
      /revoke all on function public\.prune_pub_events\(integer\) from public, anon, authenticated/,
    )
  })

  it('leaves exactly one way in, and a user token cannot reach it', () => {
    expect(grantedTo(lockdown)).toEqual(['service_role'])
  })

  it('moves no bytes of the function, so the clamp cannot drift as a side effect', () => {
    // A grants-only file cannot disturb the 730-day pairing that keeps pruning
    // from manufacturing a "recording began" date the log never had.
    const code = codeOf(lockdown)
    expect(code).not.toMatch(/create\s+or\s+replace\s+function/i)
    expect(code).not.toMatch(/\bdelete\s+from\b/i)
    expect(code).not.toMatch(/p_keep_days/)
  })

  it('is the last word on the grant, or a fresh apply hands the door back', () => {
    const dir = new URL('../supabase/migrations/', import.meta.url)
    const files = readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .sort()
      .filter(f => grantedTo(read(`../supabase/migrations/${f}`)).length > 0)

    // Two files grant on this function, and name order decides which survives a
    // fresh in-order apply — so the lockdown must sort LAST.
    expect(files.length).toBeGreaterThan(1)
    expect(files[files.length - 1]).toBe(LOCKDOWN)

    // And the file before it really does hand `authenticated` the door, which
    // is the whole reason the ordering is load-bearing rather than cosmetic.
    expect(grantedTo(read(`../supabase/migrations/${ORIGINAL}`))).toContain('authenticated')
  })

  it('the fresh-instance build, schema.sql, carries the locked-down grant too', () => {
    // Otherwise a database built from schema.sql rather than from the migration
    // series would come up with the hole this issue is about.
    const schema = read('../supabase/schema.sql')
    expect(grantedTo(schema)).toEqual(['service_role'])
    expect(codeOf(schema)).toMatch(
      /revoke all on function public\.prune_pub_events\(integer\) from public, anon, authenticated/,
    )
  })

  it('the real database gets asked the same question, both directions', () => {
    // The grant is only true if the LIVE role list says so, which is what the
    // contract suite checks with aclexplode. Without the negative assertion the
    // migration could be skipped and every test here would still pass.
    const contract = codeOf(read('../supabase/tests/rls_contract.test.sql'))
    const prunerBlock = contract.slice(contract.indexOf("p.proname = 'prune_pub_events'"))
    expect(prunerBlock).toMatch(/rolname = 'authenticated'/)
    expect(prunerBlock).toMatch(/rolname = 'service_role'/)
    // …and the clamp pairing it already pinned must survive this change.
    expect(contract).toMatch(/least\(coalesce\(p_keep_days, 730\), 730\)/)
  })
})
