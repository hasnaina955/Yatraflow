// ============ #774 / #917: the paywall boundary, executed ============
//
// The migration is run on a real Postgres (PGlite, in process), and the SQL
// contract test calls the functions as each kind of viewer. A source scan
// cannot prove what a function returns. This file does.
//
// Only the hosted pieces are stubbed: the three roles, `auth.uid()`, and the
// tables the two functions read. No network, no live project.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { lockedDayCounts, wireLockedSummary } from '../src/lib/lockedDay'
import { rowToTrip, type TripRow } from '../src/lib/tripRow'
import { planBody } from '../api/_publicBody.js'

const readSql = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const MIGRATION = 'supabase/migrations/20261110_paywall_locked_day_boundary.sql'
const CONTRACT = 'supabase/tests/public_trip_paywall.test.sql'
const CREATOR = '77400000-0000-4000-8000-000000000001'
const BUYER = '77400000-0000-4000-8000-000000000002'
const STRANGER = '77400000-0000-4000-8000-000000000003'
const PRICED_TRIP = '77410000-0000-4000-8000-000000000001'

describe('20261110 paywall boundary on a real database', () => {
  let db: PGlite

  const as = async (role: 'anon' | 'authenticated', sub = '') => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${sub}',false); set role ${role};`)
  }
  const asSuper = async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','',false);`)
  }
  const publicTrip = async (pubId: string) => {
    const result = await db.query<TripRow>('select * from public.get_public_trip($1)', [pubId])
    return result.rows
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.trips (
        id uuid primary key, owner_id uuid not null, name text not null default '',
        start_location text, destinations jsonb, start_date text, end_date text, travellers integer,
        transport_mode text, budget_per_person_inr integer, travel_style text,
        fixed_commitments jsonb not null default '[]', days jsonb not null default '[]',
        expenses jsonb not null default '[]', cover_emoji text, visibility text not null default 'private',
        created_at bigint, updated_at bigint, start_location_coords jsonb, destination_coords jsonb,
        fuel_economy_km_per_l numeric, fuel_price_per_l numeric, round_trip boolean, invite_code text,
        deleted_at timestamptz, driver_count integer, has_vulnerable boolean, drive_after_dinner_min integer,
        vehicle_profile jsonb, cover_image_url text, stay_style text, drives_part boolean
      );
      create table public.trip_members (
        trip_id uuid not null, user_id uuid not null, role text not null, primary key (trip_id, user_id)
      );
      create table public.published_itineraries (
        id text primary key, trip_id uuid not null, creator_id uuid not null,
        premium_price_inr integer, free_day_indexes jsonb not null default '[]', unpublished_at timestamptz
      );
      create table public.entitlements (
        pub_id text not null, user_id uuid not null, primary key (pub_id, user_id)
      );
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      create function public.is_member(trip uuid) returns boolean
      language sql stable security definer set search_path = public as $$
        select exists (
          select 1 from public.trip_members m where m.trip_id = trip and m.user_id = auth.uid()
        )
      $$;
      -- The production read rule: the crew reads the table, and nobody else does.
      alter table public.trips enable row level security;
      create policy "trips read" on public.trips for select to authenticated
        using (auth.uid() = owner_id or public.is_member(trips.id) or public.is_admin());
      alter table public.entitlements enable row level security;
      grant usage on schema public to anon, authenticated, service_role;
      grant select on all tables in schema public to anon, authenticated;
    `)
    // Twice: the file must be safe to re-run.
    await db.exec(readSql(MIGRATION))
    await db.exec(readSql(MIGRATION))
  }, 60_000)

  afterAll(async () => db?.close())

  it('passes the SQL contract test: anon, non-buyer, buyer, creator, member', async () => {
    const results = await db.exec(readSql(CONTRACT))
    await asSuper()
    const last = results[results.length - 1].rows[0] as { result: string }
    expect(last.result).toMatch(/^PASS: /)
  })

  it('leaves one definition of each function after a second run', async () => {
    await asSuper()
    const result = await db.query<{ proname: string; n: number }>(`
      select proname, count(*)::int as n from pg_proc
      where pronamespace = 'public'::regnamespace and proname in ('get_public_trip', 'get_invite_trip')
      group by proname order by proname
    `)
    expect(result.rows).toEqual([{ proname: 'get_invite_trip', n: 1 }, { proname: 'get_public_trip', n: 1 }])
  })

  it('the response a stranger gets holds no locked place data, as a whole string', async () => {
    for (const [role, sub] of [['anon', ''], ['authenticated', STRANGER]] as const) {
      await as(role, sub)
      const rows = await publicTrip('pub_774_priced')
      expect(rows).toHaveLength(1)
      const wire = JSON.stringify(rows[0])
      expect(wire, role).not.toContain('SECRET774')
      expect(wire, role).not.toContain('774774')
      // The free day is still the creator's own day.
      expect(wire, role).toContain('FREE774 stop')
    }
    await asSuper()
  })

  it('a stranger cannot go around the function to the table', async () => {
    await as('anon')
    const direct = await db.query('select id from public.trips where id = $1', [PRICED_TRIP])
    expect(direct.rows).toHaveLength(0)
    await as('authenticated', STRANGER)
    const signedIn = await db.query('select id from public.trips where id = $1', [PRICED_TRIP])
    expect(signedIn.rows).toHaveLength(0)
    await asSuper()
  })

  it('the client maps the real wire row to counts, and the buyer row to a full day', async () => {
    await as('anon')
    const stranger = rowToTrip((await publicTrip('pub_774_priced'))[0], [])
    const locked = stranger.days[1]
    expect(locked.stops).toEqual([])
    expect(locked.title).toBeUndefined()
    const counts = lockedDayCounts(locked)
    expect(counts?.stopCount).toBe(3)
    expect(wireLockedSummary(locked, counts!)).toMatchObject({
      title: 'Day 2', placeCount: 2, pace: null, travelMinutes: 0,
      kinds: [{ kind: 'sight', count: 1 }, { kind: 'temple', count: 1 }],
    })
    expect(lockedDayCounts(stranger.days[0])).toBeNull()
    // The share page closes the same day and prints no title for it.
    const parts = planBody({ premium_price_inr: 499, free_day_indexes: [0, 1] }, stranger)
    expect(parts.map(part => part.open)).toEqual([true, false])
    expect(parts[1].title).toBe('')

    await as('authenticated', BUYER)
    const buyer = rowToTrip((await publicTrip('pub_774_priced'))[0], [])
    expect(lockedDayCounts(buyer.days[1])).toBeNull()
    expect(buyer.days[1].title).toBe('SECRET774 day title')
    expect(buyer.days[1].stops[0]).toMatchObject({ title: 'SECRET774 stop', lat: 34.774774, lng: 77.774774 })
    await asSuper()
  })

  it('a withdrawn plan and a trashed trip still serve the buyer and nobody new', async () => {
    await asSuper()
    await db.exec(`update public.published_itineraries set unpublished_at = now() where id = 'pub_774_priced'`)
    await as('anon')
    expect(await publicTrip('pub_774_priced')).toHaveLength(0)
    await as('authenticated', BUYER)
    expect(await publicTrip('pub_774_priced')).toHaveLength(1)
    await asSuper()
    await db.exec(`
      update public.published_itineraries set unpublished_at = null where id = 'pub_774_priced';
      update public.trips set deleted_at = now() where id = '${PRICED_TRIP}';
    `)
    await as('authenticated', STRANGER)
    expect(await publicTrip('pub_774_priced')).toHaveLength(0)
    await as('authenticated', CREATOR)
    const creatorRows = await publicTrip('pub_774_priced')
    expect(JSON.stringify(creatorRows[0])).toContain('SECRET774 stop')
    await asSuper()
    await db.exec(`update public.trips set deleted_at = null where id = '${PRICED_TRIP}'`)
  })

  it('a free-day list with a huge number frees nothing and does not fail', async () => {
    await asSuper()
    await db.exec(`update public.published_itineraries set free_day_indexes = '[99999999999, 1.5, "x", -1]'::jsonb where id = 'pub_774_priced'`)
    await as('anon')
    const rows = await publicTrip('pub_774_priced')
    expect(rows).toHaveLength(1)
    const days = rows[0].days as unknown as Array<{ locked?: boolean }>
    expect(days.map(day => day.locked)).toEqual([true, true])
    await asSuper()
    await db.exec(`update public.published_itineraries set free_day_indexes = '[0]'::jsonb where id = 'pub_774_priced'`)
  })
})

describe('20261110 source pins', () => {
  const sql = readSql(MIGRATION).replace(/\r\n/g, '\n').replace(/--[^\n]*/g, ' ')

  it('builds the locked day and copies no stored field into it', () => {
    // The old body edited each stored stop in place, which kept every field it did not name.
    expect(sql).not.toMatch(/jsonb_set\(v_stop/)
    expect(sql).not.toMatch(/jsonb_set\(v_day/)
    expect(sql).toMatch(/'locked', true/)
    expect(sql).toMatch(/'stops', '\[\]'::jsonb/)
  })

  it('drops the old function before it creates the new one, and names anon in the revoke', () => {
    for (const signature of ['get_public_trip(text)', 'get_invite_trip(uuid)']) {
      const drop = sql.indexOf(`drop function if exists public.${signature}`)
      const create = sql.indexOf(`create or replace function public.${signature.replace(/\(.*/, '(')}`)
      expect(drop, signature).toBeGreaterThan(-1)
      expect(create, signature).toBeGreaterThan(drop)
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon;`)
      expect(sql).toContain(`grant execute on function public.${signature} to anon, authenticated;`)
    }
  })

  it('the trip-id preview has no branch that serves a private trip unconditionally', () => {
    const at = sql.indexOf('create or replace function public.get_invite_trip(')
    expect(sql.slice(at)).not.toMatch(/or t\.visibility = 'private'/)
  })
})
