// ============ The fixture kit: one write path for every fixture =============
// `scripts/fixtureKit.mjs` is the transport/session plumbing any future
// fixture reuses (the next session-gated surface's browser check);
// `seedCreatorFixture.mjs` is its first consumer. What a node suite can pin
// is the SHAPE of that arrangement: the CLI must not grow a second copy of
// the kit's write path — that copy is exactly how two fixtures start
// authorizing writes differently.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('the fixture kit is the only write path', () => {
  it('is the kit the CLI consumes, not a second copy of it', () => {
    const script = read('../scripts/seedCreatorFixture.mjs')
    const kit = read('../scripts/fixtureKit.mjs')
    // The CLI imports the kit...
    expect(script).toContain("from './fixtureKit.mjs'")
    // ...and no longer carries its own Supabase client construction (the one
    // thing that would fork authorization behavior between fixtures).
    expect(script).not.toContain('createClient(')
    expect(kit).toContain('createClient(')
    // The elevated writer — the only path rows no client may write can take —
    // exists once, in the kit, with both transports.
    expect(kit).toContain('export async function makeSqlRunner')
    expect(kit).toContain('jsonb_populate_recordset')
    expect(script).toContain('makeSqlRunner(URL, SERVICE, PGCONN)')
    // Sessions and ownership writes likewise single-sourced.
    expect(kit).toContain('export async function sessionFor')
    expect(kit).toContain('export async function insertAsUser')
    // The promotion REPLACES app_metadata — documented as fixture-only.
    expect(kit).toContain('export async function promoteMasteradmin')
  })

  it('reads the same env files the harness idiom reads', () => {
    const kit = read('../scripts/fixtureKit.mjs')
    // `.env.local` first, process.env overriding — the same precedence the
    // original script (and integrationHarness.mjs) used, so moving a fixture
    // onto the kit cannot silently change which credentials win.
    expect(kit).toContain("readEnvFile('.env.local')")
    expect(kit).toContain('process.env.VITE_SUPABASE_URL ?? ENV.VITE_SUPABASE_URL')
  })
})
