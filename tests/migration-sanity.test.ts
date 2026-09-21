// ============ Migrations: a PL/pgSQL block names only variables it declares ==
//
// Nothing else in the gate reads SQL. `tsc` does not, and this suite has no
// database, so a migration that cannot even compile passes the whole gate -
// which is what happened to `20260922_pub_events_retention.sql`: its function
// assigned to `v_keep_days` while its DECLARE block listed only `v_horizon` and
// `v_deleted`. Every local check was green; the first real run was the Dashboard
// SQL editor, which answered
//   ERROR: 42601: "v_keep_days" is not a known variable
//
// What is pinned here is the one purely syntactic class a text reader can see
// without a database: a `v_*` variable that is ASSIGNED in a file which never
// declares it. It is deliberately narrow - it does not try to parse PL/pgSQL -
// because a check that cannot false-positive is one a later edit will not be
// tempted to delete. Behaviour (policies, grants, the live schema) stays
// `supabase/tests/rls_contract.test.sql`'s job.
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const DIR = new URL('../supabase/migrations/', import.meta.url)
/** Normalised: this repo checks out CRLF on Windows (`core.autocrlf=true`). */
const read = (file: string) => readFileSync(new URL(file, DIR), 'utf8').replace(/\r\n/g, '\n')

const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

/** Every name declared by any `declare ... begin` block in one file.
 *
 *  All blocks in a file pool into one set, so a variable declared in an outer
 *  block and assigned in an inner one is not reported - permissive on purpose,
 *  since a false positive here would fail a migration that applies fine. */
function declaredNames(sql: string): Set<string> {
  const names = new Set<string>()
  for (const block of sql.matchAll(/\bdeclare\b([\s\S]*?)\n\s*begin\b/gi)) {
    for (const line of block[1].split('\n')) {
      // A declaration line is `name type...` - `v_days integer;`, `v_free int[];`
      const m = line.match(/^\s*([a-z_][a-z_0-9]*)\s+[a-z]/i)
      if (m && !/^(begin|declare)$/i.test(m[1])) names.add(m[1].toLowerCase())
    }
  }
  return names
}

/** The `v_*` names a file assigns with `:=` (PL/pgSQL's assignment operator). */
function assignedNames(sql: string): string[] {
  const seen = new Set<string>()
  for (const m of sql.matchAll(/\b(v_[a-z_0-9]+)\s*:=/gi)) seen.add(m[1])
  return [...seen]
}

describe('migrations: PL/pgSQL names only variables it declares', () => {
  it('finds migrations to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(files)('%s', (file) => {
    const sql = read(file)
    const declared = declaredNames(sql)
    const offenders = assignedNames(sql).filter(name => !declared.has(name.toLowerCase()))
    expect(
      offenders,
      `${file} assigns ${offenders.join(', ')} but never declares it/them - applying this fails with 42601`,
    ).toEqual([])
  })
})
