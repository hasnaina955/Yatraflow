// Migration status check (scripts/checkMigrations.mjs) — the gate that answers
// "is this migration actually applied?" against the live project.
//
// Why this file exists: the check is the only thing in the repo that can see a
// release's database half. `npm run verify` typechecks, tests and builds, and
// says nothing about SQL that has never run — so the check itself must not be
// the unverified part. Three kinds of test here:
//
//   1. Coverage — every migration on disk is either probed or declared with a
//      reason, so a new migration cannot ship unexamined. This is the ratchet
//      that keeps the check honest as the directory grows.
//   2. Parser shapes — the derivation is pinned against the real SQL this repo
//      writes, including the migration whose `add column` wraps onto its own
//      line (that one was silently missed by the first draft).
//   3. Hermetic end-to-end — a stub server replays the response bodies the live
//      project really returns (recorded 2026-09-21) so classification, output
//      and exit codes are exercised offline, with no credentials and no
//      database. CI never needs a Supabase key to run this file.
//
// The GET-only invariant is a test, not a comment: probing RPC existence the
// obvious way (POST /rest/v1/rpc/<fn>) EXECUTES the function, so a future edit
// that adds a mutating verb has to fail here rather than quietly call one.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT = 'scripts/checkMigrations.mjs'
const SCRIPT_ABS = fileURLToPath(new URL('../scripts/checkMigrations.mjs', import.meta.url))
const MIGRATIONS_DIR = new URL('../supabase/migrations/', import.meta.url)
const source = readFileSync(SCRIPT, 'utf8')

const migrationFiles = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()

/** Environment for every spawned run. Blanking the four credential names keeps
 *  a developer's `.env.local` from reaching a test that asserts what happens
 *  without one; a stub's URL is passed back in per test. */
function childEnv(opts: { env?: Record<string, string>; cwd?: string } = {}) {
  return {
    env: {
      ...process.env,
      VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '', SUPABASE_ANON_KEY: '',
      ...opts.env,
    },
    cwd: opts.cwd ?? process.cwd(),
  }
}

/** Run the CLI and wait. Sync on purpose for the runs that touch no network. */
function runSync(args: string[], opts: { env?: Record<string, string>; cwd?: string } = {}) {
  const res = spawnSync(process.execPath, [SCRIPT_ABS, ...args], { encoding: 'utf8', ...childEnv(opts) })
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' }
}

type ChildResult = { status: number | null; stdout: string; stderr: string }

function spawnOnce(args: string[], opts: { env?: Record<string, string>; cwd?: string }): Promise<ChildResult> {
  return new Promise<ChildResult>((resolve) => {
    const child = spawn(process.execPath, [SCRIPT_ABS, ...args], childEnv(opts))
    let stdout = '', stderr = ''
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
  })
}

/** Run the CLI while a stub server lives in THIS process. It cannot be
 *  spawnSync: that blocks the event loop, so the stub could never answer and
 *  every probe in the child would sit until its own timeout — which reads like
 *  a slow check rather than like a deadlocked test.
 *
 *  The retry is narrow and named on purpose. Running the full parallel suite on
 *  this box, a spawned node child occasionally dies before executing anything —
 *  seen as an empty stdout, and once as Windows `0xC0000409` (V8's fastfail) —
 *  while the identical test passes in isolation and the check itself runs fine
 *  from a shell. Every real outcome of the check prints something, including
 *  exit 2 (which writes to stderr), so "exited non-zero with no output at all"
 *  can only mean the process never ran. That is retried once; a second time it
 *  throws naming the environment failure, rather than failing as an assertion
 *  on an empty string — which is what makes a spawn problem look like a broken
 *  check. A child that produces output is never retried, and never was: a
 *  wrong verdict must fail here. */
async function runAsync(args: string[], opts: { env?: Record<string, string>; cwd?: string } = {}) {
  const first = await spawnOnce(args, opts)
  if (first.status === 0 || first.stdout !== '' || first.stderr !== '') return first
  const second = await spawnOnce(args, opts)
  if (second.status !== 0 && second.stdout === '' && second.stderr === '') {
    throw new Error(`the check produced no output twice (status ${second.status}) — the spawned process never ran, ` +
      `which is an environment failure and not a verdict about the database`)
  }
  return second
}



type Plan = { migrations: { file: string; probes: string[]; noProbeSurface: string | null; optional: boolean }[] }

function plan(): Plan {
  const res = runSync(['--list', '--json'])
  expect(res.status, res.stderr).toBe(0)
  return JSON.parse(res.stdout) as Plan
}

// ---------------------------------------------------------------------------
// A stub of the two endpoints the check talks to, replaying the bodies the live
// project returned when this was built:
//   table present   200 []            table absent   404 PGRST205
//   column present  200 []            column absent  400 42703
//   bucket present  400 NoSuchKey     bucket absent  400 NoSuchBucket
// ---------------------------------------------------------------------------
type StubReply = { status: number; body: unknown }

function startStub(reply: (path: string) => StubReply) {
  const server = createServer((req, res) => {
    const path = req.url ?? ''
    const { status, body } = reply(path)
    // `Connection: close` per response, and closeAllConnections on teardown: the
    // child's fetch (undici) keeps sockets alive, and a server.close() waiting on
    // a live keep-alive socket never calls back — which hangs the whole suite
    // rather than failing a test.
    res.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' })
    res.end(JSON.stringify(body))
  })
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((done) => {
          server.close(() => done())
          server.closeAllConnections()
        }),
      })
    })
  })
}

const PGRST205 = (table: string) => ({ code: 'PGRST205', details: null, hint: null, message: `Could not find the table 'public.${table}' in the schema cache` })
const COLUMN_42703 = (table: string, column: string) => ({ code: '42703', details: null, hint: null, message: `column ${table}.${column} does not exist` })
const NO_SUCH_KEY = { statusCode: '404', error: 'not_found', message: 'Object not found', code: 'NoSuchKey' }
const NO_SUCH_BUCKET = { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found', code: 'NoSuchBucket' }

/** The steady state: every artifact answers present. */
const allPresent = (path: string): StubReply =>
  path.startsWith('/storage/')
    ? { status: 400, body: NO_SUCH_KEY }
    : { status: 200, body: [] }

async function withStub<T>(reply: (path: string) => StubReply, fn: (base: string) => Promise<T>): Promise<T> {
  const stub = await startStub(reply)
  try {
    return await fn(stub.url)
  } finally {
    await stub.close()
  }
}

const creds = (base: string) => ({ SUPABASE_URL: base, SUPABASE_ANON_KEY: 'stub-anon-key' })

describe('migration status — every migration is accounted for', () => {
  it('plans one entry per migration file', () => {
    expect(plan().migrations.map((m) => m.file)).toEqual(migrationFiles)
  })

  it('every migration is either probed or declared with a reason', () => {
    // The ratchet: a new migration with neither derived probes nor a
    // NO_PROBE_SURFACE reason is "undeclared" and fails the check itself. This
    // asserts the directory is clean of that state so the failure surfaces here
    // with a file name rather than only in a live run.
    for (const m of plan().migrations) {
      expect(m.probes.length > 0 || Boolean(m.noProbeSurface), `${m.file} is neither probed nor declared`).toBe(true)
    }
  })

  it('every declared no-probe-surface entry names a file that exists', () => {
    // The reverse direction: a registry entry outliving its migration would
    // hide a real one, since a declared file is never reported as undeclared.
    const declared = [...source.matchAll(/^\s{2}'([^']+\.sql)':\s*\{/gm)].map((m) => m[1])
    expect(declared.length).toBeGreaterThan(0)
    for (const file of declared) expect(migrationFiles).toContain(file)
  })

  it('stays read-only: no mutating verb anywhere in the check', () => {
    // Probing RPC existence with POST /rest/v1/rpc/<fn> EXECUTES the function
    // (verified live: PostgREST answers the same 404 PGRST202 for a missing
    // function and for an existing one called without parameters, so execution
    // is the only way to tell). The check therefore reads only, and this pins
    // it — the file is run against production.
    expect(source).not.toMatch(/'POST'|"POST"|'PATCH'|"PATCH"|'PUT'|"PUT"|'DELETE'|"DELETE"/)
    expect(source).not.toMatch(/\bmethod:\s*['"`]/)
    expect(source).toContain('refusing to probe unsafe identifier')
    expect(source).toContain('GET only')
  })
})

describe('migration status — artifacts are read back out of the real SQL', () => {
  const byFile = () => new Map(plan().migrations.map((m) => [m.file, m]))

  it('reads multi-column migrations', () => {
    expect(byFile().get('20260829_fuel_columns.sql')?.probes).toEqual([
      'public.trips.fuel_economy_km_per_l',
      'public.trips.fuel_price_per_l',
      'public.trips.round_trip',
    ])
  })

  it('reads an `add column` that wraps onto its own line', () => {
    // 20260906_published_refreshed_at.sql writes `alter table public.x` then
    // `add column if not exists y` on the next line. A line-anchored regex
    // misses it and the file silently reports "no probe surface".
    const probes = byFile().get('20260906_published_refreshed_at.sql')?.probes
    expect(probes).toEqual(['public.published_itineraries.refreshed_at'])
  })

  it('reads a table and a column from the same migration', () => {
    expect(byFile().get('20260909_masteradmin.sql')?.probes).toEqual([
      'table public.admin_audit',
      'public.profiles.is_disabled',
    ])
  })

  it('reads the Storage bucket out of the insert', () => {
    expect(byFile().get('20260919_covers_bucket.sql')?.probes).toEqual(["Storage bucket 'covers'"])
  })

  it('derives nothing from a comment-heavy migration that creates no artifact', () => {
    expect(byFile().get('20260910_trip_trash_rpc.sql')?.probes).toEqual([])
  })
})

// The derivation itself, on fixtures rather than on the repo's files. Spawned
// with `--input-type=module -e` because the check is a .mjs with no type
// declarations — the same reason the other script tests spawn instead of
// importing. `deriveProbes` is pure, so this is the cheap end of the suite.
function deriveLabels(sql: string): string[] {
  const href = JSON.stringify(pathToFileURL(SCRIPT_ABS).href)
  const code = `import { deriveProbes } from ${href};` +
    `console.log(JSON.stringify(deriveProbes(process.env.SQL_FIXTURE).map((p) => p.label)))`
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    env: { ...process.env, SQL_FIXTURE: sql },
  })
  expect(res.status, res.stderr).toBe(0)
  return JSON.parse(res.stdout) as string[]
}

describe('migration status — the derivation, against fixtures', () => {
  it('reads the three artifact shapes', () => {
    expect(deriveLabels([
      'create table if not exists public.admin_audit (',
      'alter table public.trips add column if not exists stay_style text;',
      "insert into storage.buckets (id, name, public) values ('covers', 'covers', true);",
    ].join('\n'))).toEqual(['table public.admin_audit', 'public.trips.stay_style', "Storage bucket 'covers'"])
  })

  it('ignores a commented-out statement — prose is not a claim about the database', () => {
    expect(deriveLabels([
      '-- create table if not exists public.ghost (',
      '-- alter table public.trips add column if not exists ghost text;',
      '/* replace table public.other add column if not exists ghost_2 int; */',
      "-- insert into storage.buckets (id) values ('ghost-bucket');",
    ].join('\n'))).toEqual([])
  })

  it('ignores shapes it cannot probe rather than guessing at them', () => {
    // A non-public schema has no PostgREST route, and a quoted identifier (or
    // anything else the safe-identifier rule rejects) is skipped rather than
    // interpolated into a URL. Both would otherwise be probed as if they were
    // `public` artifacts and report a false MISSING.
    expect(deriveLabels([
      'create table if not exists analytics.events (',
      'create table if not exists public."weird-name" (',
      'alter table public.trips add column if not exists "quoted-col" text;',
    ].join('\n'))).toEqual([])
  })

  it('reports each artifact once, however often the file names it', () => {
    expect(deriveLabels([
      'alter table public.trips add column if not exists c1 text;',
      'alter table public.trips add column if not exists c1 text;',
    ].join('\n'))).toEqual(['public.trips.c1'])
  })

  it('handles CRLF and a statement that wraps mid-clause', () => {
    // Every migration in this repo is CRLF in the working tree, and `add column`
    // wraps onto its own line in 20260906_published_refreshed_at.sql.
    expect(deriveLabels('create table if not exists public.a (\r\n  id uuid\r\n);\r\n'
      + 'alter table public.b\r\n  add column if not exists c2 text;\r\n'))
      .toEqual(['table public.a', 'public.b.c2'])
  })
})

describe('migration status — verdicts against a replay of the live responses', () => {
  it('passes when every probed artifact answers present', async () => {
    await withStub(allPresent, async (base) => {
      const res = await runAsync([], { env: creds(base) })
      expect(res.status, res.stdout).toBe(0)
      expect(res.stdout).toContain('Every migration this check can probe is live.')
      expect(res.stdout).toContain('0 missing')
    })
  })

  it('counts every migration exactly once in the summary line', async () => {
    // The rendered tally has to add up to the file count: the optional scheduler
    // is already inside the no-probe-surface bucket, and the first draft added
    // it again, reporting 20 migrations out of 19.
    await withStub(allPresent, async (base) => {
      const json = await runAsync(['--json'], { env: creds(base) })
      const { summary } = JSON.parse(json.stdout) as {
        summary: { migrations: number; applied: number; missing: number; noProbeSurface: number; optional: number }
      }
      const res = await runAsync([], { env: creds(base) })
      expect(res.stdout).toContain(`${summary.migrations} migrations`)
      expect(res.stdout).toContain(`${summary.applied} applied`)
      expect(res.stdout).toContain(`${summary.noProbeSurface} no probe surface (${summary.optional} optional)`)
      expect(summary.applied + summary.missing + summary.noProbeSurface).toBe(summary.migrations)
    })
  })

  it('fails, names the artifact and names the file when a column is absent', async () => {
    // The failure this check was built for: 20260914_trip_stay_budget.sql was
    // never applied to production, and its absence is invisible in the app —
    // the store's optional-column probe reports stayStyle: false and the dial
    // silently reverts on reload.
    await withStub(
      (path) => (path.includes('select=stay_style') ? { status: 400, body: COLUMN_42703('trips', 'stay_style') } : allPresent(path)),
      async (base) => {
        const res = await runAsync([], { env: creds(base) })
        expect(res.status).toBe(1)
        expect(res.stdout).toContain('MISS')
        expect(res.stdout).toContain('20260914_trip_stay_budget.sql')
        expect(res.stdout).toContain('public.trips.stay_style')
        expect(res.stdout).toContain('supabase/migrations/20260914_trip_stay_budget.sql')
      },
    )
  })

  it('fails when a whole table is absent', async () => {
    await withStub(
      (path) => (path.startsWith('/rest/v1/admin_audit') ? { status: 404, body: PGRST205('admin_audit') } : allPresent(path)),
      async (base) => {
        const res = await runAsync([], { env: creds(base) })
        expect(res.status).toBe(1)
        expect(res.stdout).toContain('table public.admin_audit')
      },
    )
  })

  it('fails when a bucket is absent, and passes when only the object is', async () => {
    await withStub(
      (path) => (path.startsWith('/storage/') ? { status: 400, body: NO_SUCH_BUCKET } : allPresent(path)),
      async (base) => {
        const res = await runAsync([], { env: creds(base) })
        expect(res.status).toBe(1)
        expect(res.stdout).toContain("Storage bucket 'covers'")
      },
    )
  })

  it('treats an unauthorised read as present, not as absence', async () => {
    // A missing table always answers 404 PGRST205, so a 401/403 means the
    // artifact exists and the anon key may not see it — reporting that as
    // missing would make the check cry wolf on every locked-down table.
    await withStub(
      (path) => (path.startsWith('/storage/') ? { status: 400, body: NO_SUCH_KEY }
        : { status: 403, body: { code: '42501', message: 'permission denied for table trips' } }),
      async (base) => {
        const res = await runAsync([], { env: creds(base) })
        expect(res.status, res.stdout).toBe(0)
      },
    )
  })

  it('fails on a probe that could not answer, rather than passing it', async () => {
    // An unchecked artifact has proved nothing. Silence here would be the same
    // bug the check exists to catch, one level up.
    await withStub(
      (path) => (path.startsWith('/rest/v1/trips') ? { status: 500, body: { message: 'boom' } } : allPresent(path)),
      async (base) => {
        const res = await runAsync([], { env: creds(base) })
        expect(res.status).toBe(1)
        expect(res.stdout).toContain('could not check')
        expect(res.stdout).toContain('20260829_fuel_columns.sql')
      },
    )
  })

  it('reports machine-readably with --json', async () => {
    await withStub(
      (path) => (path.includes('select=stay_style') ? { status: 400, body: COLUMN_42703('trips', 'stay_style') } : allPresent(path)),
      async (base) => {
        const res = await runAsync(['--json'], { env: creds(base) })
        expect(res.status).toBe(1)
        const report = JSON.parse(res.stdout) as {
          summary: { migrations: number; applied: number; missing: number; noProbeSurface: number }
          migrations: { file: string; verdict: string; probes: { label: string; verdict: string }[] }[]
        }
        expect(report.summary.migrations).toBe(migrationFiles.length)
        expect(report.summary.missing).toBe(1)
        expect(report.summary.applied + report.summary.missing + report.summary.noProbeSurface).toBe(report.summary.migrations)
        const gone = report.migrations.find((m) => m.file === '20260914_trip_stay_budget.sql')
        expect(gone?.verdict).toBe('missing')
        expect(gone?.probes[0]).toMatchObject({ label: 'public.trips.stay_style', verdict: 'missing' })
      },
    )
  })

  it('can be run as a report instead of a gate', async () => {
    await withStub(
      (path) => (path.includes('select=stay_style') ? { status: 400, body: COLUMN_42703('trips', 'stay_style') } : allPresent(path)),
      async (base) => {
        const res = await runAsync(['--allow-missing'], { env: creds(base) })
        expect(res.status).toBe(0)
        expect(res.stdout).toContain('public.trips.stay_style')
      },
    )
  })

  it('--quiet prints only what is not applied', async () => {
    await withStub(
      (path) => (path.includes('select=stay_style') ? { status: 400, body: COLUMN_42703('trips', 'stay_style') } : allPresent(path)),
      async (base) => {
        const res = await runAsync(['--quiet'], { env: creds(base) })
        expect(res.stdout).toContain('20260914_trip_stay_budget.sql')
        expect(res.stdout).not.toContain('20260829_fuel_columns.sql')
      },
    )
  })

  it('--only narrows the sweep', async () => {
    await withStub(allPresent, async (base) => {
      const res = await runAsync(['--only', 'covers'], { env: creds(base) })
      expect(res.status).toBe(0)
      expect(res.stdout).toContain('20260919_covers_bucket.sql')
      expect(res.stdout).not.toContain('20260829_fuel_columns.sql')
    })
  })

  it('exits 2 with a readable message when there are no credentials', () => {
    // cwd is a directory with no .env.local, so nothing can leak in. This is the
    // state CI and a fresh clone are in — it must be a clear "set these two
    // variables", never a stack trace or a green run that checked nothing.
    const res = runSync([], { cwd: tmpdir() })
    expect(res.status).toBe(2)
    expect(res.stderr).toContain('missing credentials')
    expect(res.stderr).toContain('VITE_SUPABASE_URL')
  })

  it('documents itself', () => {
    const res = runSync(['--help'])
    expect(res.status).toBe(0)
    expect(res.stdout).toContain('--list')
    expect(res.stdout).toContain('.env.local')
  })
})
