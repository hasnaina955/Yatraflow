// ============ The demo seed marker is once-only, on a real database (#1054) ============
// `20261127b_demo_seed_once.sql` adds `profiles.demo_seeded_at` and backfills it
// for accounts that already own a trip. The client's claim is one conditional
// update, so the rule that makes two tabs safe is decided here, by the row lock
// and by the two policies that gate the write.
//
// The chain runs on PGlite (in process), in the shape of
// `tests/paid-access-matrix-db.test.ts`. The hosted pieces are stubbed: the
// roles, `auth.uid()`, and the small part of `profiles` and `trips` that the
// migration and its policies read. The three policies are the shipped text of
// `supabase/schema.sql:576,618-622`, and the setup asserts that text still
// matches, so the stubs cannot drift from what ships.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20261127b_demo_seed_once.sql'

const U = {
  /** Owns no trip, so the backfill leaves the marker empty. The claiming user. */
  a: '2711b000-0000-4000-8000-000000000001',
  /** Owns no trip. Tries to claim A's row. */
  b: '2711b000-0000-4000-8000-000000000002',
  /** Owns a live trip, so the backfill marks it. */
  live: '2711b000-0000-4000-8000-000000000003',
  /** Owns only a trashed trip, and counts as seeded all the same. */
  trash: '2711b000-0000-4000-8000-000000000004',
  /** Owns nothing and never claims. Stays unseeded. */
  none: '2711b000-0000-4000-8000-000000000005',
  /** A disabled account. The restrictive policy refuses its own write. */
  off: '2711b000-0000-4000-8000-000000000006',
}
const T = { live: '2711b000-0000-4000-8000-000000000101', trash: '2711b000-0000-4000-8000-000000000102' }

const CLAIM = (id: string) =>
  `update public.profiles set demo_seeded_at = now() where id = '${id}' and demo_seeded_at is null returning id`

let db: PGlite

/** The hosted pieces, then the seed rows, then the migration under test. */
async function freshDb(): Promise<PGlite> {
  const local = new PGlite()
  await local.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table public.profiles (
      id uuid primary key references auth.users (id),
      is_disabled boolean not null default false
    );
    create table public.trips (
      id uuid primary key, owner_id uuid not null references public.profiles (id),
      creation_kind text, deleted_at timestamptz
    );
    create function public.is_disabled() returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_disabled)
    $$;
    grant all on all tables in schema public to anon, authenticated, service_role;
    alter table public.profiles enable row level security;
    -- supabase/schema.sql:576
    create policy "deny disabled" on public.profiles as restrictive for all to authenticated using (not public.is_disabled());
    -- supabase/schema.sql:618-622
    create policy "profiles read self" on public.profiles
      for select to authenticated using (auth.uid() = id);
    create policy "profiles update self" on public.profiles
      for update using (auth.uid() = id) with check (auth.uid() = id);
  `)
  await local.exec(`
    insert into auth.users (id) values ${Object.values(U).map(u => `('${u}')`).join(', ')};
    insert into public.profiles (id, is_disabled) values
      ('${U.a}', false), ('${U.b}', false), ('${U.live}', false),
      ('${U.trash}', false), ('${U.none}', false), ('${U.off}', true);
    insert into public.trips (id, owner_id, creation_kind, deleted_at) values
      ('${T.live}', '${U.live}', 'demo', null),
      ('${T.trash}', '${U.trash}', 'demo', now());
  `)
  await local.exec(readFileSync(resolve(process.cwd(), MIGRATION), 'utf8'))
  return local
}

/** Runs the statement as an API role. authenticated and anon both carry a JWT subject. */
async function as(target: PGlite, role: 'anon' | 'authenticated' | 'service_role', uid: string | null) {
  await target.exec('reset role')
  await target.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ''])
  await target.exec(`set role ${role}`)
}

/** The marker of one account as an ISO string, read with no role set, so RLS
 *  does not hide it. PGlite hands a timestamptz back as a Date, and a Date
 *  compares by identity, so the value is normalized to one string form. */
async function markerOf(target: PGlite, id: string): Promise<string | null> {
  await target.exec('reset role')
  const res = await target.query<{ demo_seeded_at: string | Date | null }>(
    `select demo_seeded_at from public.profiles where id = '${id}'`,
  )
  const value = res.rows[0]?.demo_seeded_at ?? null
  return value === null ? null : new Date(value).toISOString()
}

beforeAll(async () => {
  // The stubs must carry the shipped policies, or this file proves nothing
  // about the app. A change to either policy has to change this text too.
  const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8').replace(/\r\n/g, '\n')
  expect(schema).toContain('create policy "profiles update self" on public.profiles\n  for update using (auth.uid() = id) with check (auth.uid() = id);')
  expect(schema).toContain('create policy "deny disabled" on public.profiles as restrictive for all to authenticated using (not public.is_disabled());')
  expect(schema).toContain('create policy "profiles read self" on public.profiles\n  for select to authenticated using (auth.uid() = id);')
  expect(schema).toContain('demo_seeded_at timestamptz,')
  db = await freshDb()
})

afterAll(async () => {
  await db?.close()
})

describe('the demo seed marker is claimed once (#1054)', () => {
  it('case 1: the first claim matches one row, and the second matches none', async () => {
    await as(db, 'authenticated', U.a)
    const first = await db.query(CLAIM(U.a))
    expect(first.rows).toHaveLength(1)

    const second = await db.query(CLAIM(U.a))
    expect(second.rows).toHaveLength(0)
  })

  it('case 2: another account cannot claim the row', async () => {
    await as(db, 'authenticated', U.b)
    const attempt = await db.query(CLAIM(U.a))
    expect(attempt.rows).toHaveLength(0)
  })

  it('case 3: an anonymous caller claims nothing', async () => {
    await as(db, 'anon', null)
    // RLS hides the row, so the answer is no rows. A missing grant would refuse
    // the statement instead; both answers mean no seed.
    try {
      const attempt = await db.query(CLAIM(U.a))
      expect(attempt.rows).toHaveLength(0)
    } catch (e) {
      expect((e as { code?: string }).code).toBe('42501')
    }
  })

  it('case 4: a disabled account cannot claim its own row', async () => {
    await as(db, 'authenticated', U.off)
    const attempt = await db.query(CLAIM(U.off))
    expect(attempt.rows).toHaveLength(0)
    expect(await markerOf(db, U.off)).toBeNull()
  })

  it('case 5: the backfill marks every account that owns a trip, trashed or live', async () => {
    expect(await markerOf(db, U.live)).not.toBeNull()
    expect(await markerOf(db, U.trash)).not.toBeNull()
    expect(await markerOf(db, U.none)).toBeNull()
  })

  it('case 6: a re-run changes no marker and raises no error', async () => {
    const before = await markerOf(db, U.a)
    expect(before).not.toBeNull()
    await db.exec(readFileSync(resolve(process.cwd(), MIGRATION), 'utf8'))
    expect(await markerOf(db, U.a)).toBe(before)
    expect(await markerOf(db, U.none)).toBeNull()
  })
})
