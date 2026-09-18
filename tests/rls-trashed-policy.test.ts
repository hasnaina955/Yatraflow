import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The trashed-read policy's RESTRICTIVE flag is load-bearing — dropping it
// once turned "hide trashed" into "widen every live trip to every signed-in
// user" (Sep 14 2026; see AGENTS.md). The live contract runs in the dashboard
// SQL editor (supabase/tests/rls_contract.test.sql); these pin the repo's own
// sources so the offline gate catches the same mistake at commit time.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('trashed-read policy (repo sources of truth)', () => {
  const migration = read('../supabase/migrations/20260917_pin_trashed_read.sql')
  const schema = read('../supabase/schema.sql')

  it('the migration recreates the policy as RESTRICTIVE, with both halves', () => {
    // Restrictive: ANDs with "trips read" instead of widening it.
    expect(migration).toMatch(/create policy "trips read hide trashed" on public\.trips\s+as restrictive/)
    // Live rows pass exactly where the base read admits them…
    expect(migration).toMatch(/deleted_at is null/)
    // …and the added tombstoned row stays writable for its owner/editors
    // (without an accepter the UPDATE fails 42501 and "Delete" silently no-ops).
    expect(migration).toMatch(/auth\.uid\(\) = owner_id/)
    expect(migration).toMatch(/is_editor\(trips\.id\)/)
    expect(migration).toMatch(/is_admin\(\)/)
  })

  it('schema.sql carries the same restrictive shape, not the leaky permissive one', () => {
    const at = schema.indexOf('create policy "trips read hide trashed" on public.trips')
    expect(at).toBeGreaterThan(-1)
    const stmt = schema.slice(at, schema.indexOf(';', at) + 1)
    expect(stmt).toMatch(/as restrictive/)
    expect(stmt).toMatch(/deleted_at is null/)
    // The Sep-14 leak shape: a bare live-row branch with no restrictive flag.
    expect(stmt).not.toMatch(/^\s*for select using \(/m)
  })

  it('schema.sql reflects the crew-only base read (payments tightening)', () => {
    const at = schema.indexOf('create policy "trips read" on public.trips')
    expect(at).toBeGreaterThan(-1)
    const stmt = schema.slice(at, schema.indexOf(';', at) + 1)
    expect(stmt).toMatch(/to authenticated/)
    expect(stmt).toMatch(/is_member/)
    expect(stmt).not.toMatch(/visibility = 'public'/)
  })
})
