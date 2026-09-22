// ============================================================================
// YatraFlow — the fixture KIT (reusable seeding primitives for any surface)
// ============================================================================
// Everything here is transport and session plumbing that any fixture can
// reuse; NO plan and NO orchestration lives here. A fixture is:
//
//   * its own PLAN module (pure numbers, importable by tests — the
//     `fixtureFunnelPlan.mjs` precedent), and
//   * a thin CLI that imports THIS kit for the writes.
//
// The rule that got the funnel plan extracted (AGENTS §3, 2026-09-21) general-
// izes here: a fixture CLI cannot be imported by a test, but the surfaces it
// drives — session-gated money and analytics screens — need a browser check
// with an answer key, not only node assertions. The kit is what keeps "seed
// the fixture" from being re-implemented (and re-drifted) per surface.
//
// GUARANTEES every kit consumer inherits:
//   * sign-in-or-sign-up sessions (the harness's own idiom),
//   * ownership writes through the owner's OWN session (RLS authorizes),
//   * one elevated writer — service-role REST or `PGCONN` pg — for the rows no
//     client may write,
//   * chunked bulk inserts,
//   * JSON-only row shapes, so the printed SQL and the elevated path cannot
//     diverge (both come from the same builder in the consumer).
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ------------------------------------------------------------------ env read
// Read once, the way the CLI does. `KIT` proves the import actually happened
// (the whole point of the kit is being importable and inspectable).
export const KIT = true

function readEnvFile(file) {
  try {
    return Object.fromEntries(
      readFileSync(resolve(file), 'utf8')
        .split(/\r?\n/)
        .filter(l => l.includes('=') && !l.trim().startsWith('#'))
        .map(l => {
          const i = l.indexOf('=')
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
        }),
    )
  } catch {
    return {}
  }
}

const ENV = { ...readEnvFile('.env'), ...readEnvFile('.env.local') }

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? ENV.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? ENV.VITE_SUPABASE_ANON_KEY ?? ''
/** Either elevation enables the sales/rows no client may write. */
export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ENV.SUPABASE_SERVICE_ROLE_KEY ?? ''
export const PG_CONN = process.env.PGCONN ?? ENV.PGCONN ?? ''

export function hasElevation() {
  return Boolean(SERVICE_ROLE_KEY || PG_CONN)
}

/** The template value `vite.config.ts` refuses to build with — meaningless as
 *  a project URL here too. */
export function isTemplateUrl(url) {
  return /YOUR-PROJECT/.test(url)
}

// ------------------------------------------------------------------- clients
function anonClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Sign in, or sign up then sign in. Signup is best-effort: an existing
 *  account answers "already registered", which is not a failure here. */
export async function sessionFor(url, anonKey, who) {
  const sb = anonClient(url, anonKey)
  await sb.auth.signUp({ email: who.email, password: who.pass }).catch(() => {})
  const { data, error } = await sb.auth.signInWithPassword({ email: who.email, password: who.pass })
  if (error) throw new Error(`${who.email}: ${error.message}`)
  return { sb, userId: data.user.id }
}

/**
 * Ownership writes go through the owner's OWN session — the point: those are
 * exactly the writes a real user makes, and RLS is what authorizes them.
 */
export async function insertAsUser(sb, table, rows) {
  const { error } = await sb.from(table).insert(rows)
  if (error) throw new Error(`${table}: ${error.message}`)
}

/**
 * The elevated writer over whichever elevation the machine already has: the
 * service-role REST client, or a `pg` connection. One interface, two
 * transports. `jsonb_populate_recordset` writes any of these shapes from the
 * same JSON the REST path posts, so the pg branch is a single statement
 * rather than a hand-built column list that would drift from the tables.
 */
export async function makeSqlRunner(url, serviceKey, pgConn) {
  if (serviceKey) {
    const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    return {
      async insert(table, rows) {
        const { error } = await svc.from(table).insert(rows)
        if (error) throw new Error(`${table}: ${error.message}`)
      },
      async remove(table, column, values) {
        const { error } = await svc.from(table).delete().in(column, values)
        if (error) throw new Error(`${table}: ${error.message}`)
      },
    }
  }
  if (pgConn) {
    const { Client } = await import('pg')
    const client = new Client({ connectionString: pgConn, ssl: { rejectUnauthorized: false } })
    await client.connect()
    return {
      async insert(table, rows) {
        await client.query(
          `insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`,
          [JSON.stringify(rows)],
        )
      },
      async remove(table, column, values) {
        await client.query(`delete from public.${table} where ${column} = any($1)`, [values])
      },
    }
  }
  return null
}

/** Bulk insert, chunked: pub_events alone runs past a thousand rows. */
export async function insertInChunks(sql, table, rows, size = 250) {
  for (let i = 0; i < rows.length; i += size) {
    await sql.insert(table, rows.slice(i, i + size))
  }
}

/**
 * Give an account the `masteradmin` role the console gates on.
 *
 * `auth.admin.updateUserById` REPLACES `app_metadata` — call this only for a
 * fresh fixture signup with nothing else in there. Needs the service-role
 * key; an anon client cannot set another user's metadata at all, and seeding
 * an account that silently fails the console's gate would look like a broken
 * console rather than a missing key.
 */
export async function promoteMasteradmin(url, serviceKey, userId, email) {
  if (!serviceKey) return false
  const svc = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { error } = await svc.auth.admin.updateUserById(userId, { app_metadata: { role: 'masteradmin' } })
  if (error) throw new Error(`promote ${email}: ${error.message}`)
  return true
}
