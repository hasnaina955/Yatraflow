// ============ invite preview projection, executed on a real database ============
//
// The migration is run on a real Postgres (PGlite, in process) and the row is
// read the way an anonymous client reads it. A source scan cannot prove what an
// unauthenticated caller receives, and this function is callable by anyone
// holding a code, so the shape is the disclosure boundary. Three things are
// pinned here:
//
//   1. the two added fields arrive, and the row carries nothing they should not;
//   2. the server normalises the name on its own, so a client is never the only
//      thing standing between a display name and an anonymous page;
//   3. the gates from #1020 are unchanged — a priced publication still hides the
//      trip from a caller who cannot be a buyer.
//
// Only the hosted pieces are stubbed: the roles, auth.uid(), and the tables the
// function reads.
import { beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const MIGRATION = 'supabase/migrations/20261126_invite_preview_projection.sql'
const OWNER = '1126a000-0000-4000-8000-000000000001'
const STRANGER = '1126a000-0000-4000-8000-000000000002'
const NAMED_TRIP = '1126a000-0000-4000-8000-000000000011'
const PRICED_TRIP = '1126a000-0000-4000-8000-000000000012'
const ORPHAN_TRIP = '1126a000-0000-4000-8000-000000000013'
const PUB = 'pub_invite_1126'
const CODE = 'GOA-K7QF'
const PRICED_CODE = 'MUN-N3RT'
const ORPHAN_CODE = 'COO-R8DK'

/** The 33 approved trip columns, then the two this migration adds. This is the order the RPC answers in. */
const SHAPE = [
  'id', 'owner_id', 'name', 'start_location', 'destinations', 'start_date', 'end_date',
  'travellers', 'transport_mode', 'budget_per_person_inr', 'travel_style',
  'fixed_commitments', 'days', 'expenses', 'cover_emoji', 'visibility', 'created_at',
  'updated_at', 'start_location_coords', 'destination_coords', 'fuel_economy_km_per_l',
  'fuel_price_per_l', 'round_trip', 'invite_code', 'deleted_at', 'driver_count',
  'has_vulnerable', 'drive_after_dinner_min', 'vehicle_profile', 'cover_image_url',
  'stay_style', 'drives_part', 'write_version', 'owner_first_name', 'invite_role',
]

describe('the invite preview projects a first name and the link role', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.trips (
        id uuid primary key, owner_id uuid not null, name text not null default '',
        start_location text, destinations jsonb, start_date text, end_date text, travellers integer,
        transport_mode text, budget_per_person_inr integer, travel_style text,
        fixed_commitments jsonb not null default '[]', days jsonb not null default '[]',
        expenses jsonb not null default '[]', cover_emoji text,
        visibility text not null default 'private',
        created_at bigint, updated_at bigint, start_location_coords jsonb, destination_coords jsonb,
        fuel_economy_km_per_l numeric, fuel_price_per_l numeric, round_trip boolean, invite_code text,
        deleted_at timestamptz, driver_count integer, has_vulnerable boolean,
        drive_after_dinner_min integer, vehicle_profile jsonb, cover_image_url text,
        stay_style text, drives_part boolean, write_version bigint not null default 0
      );
      create table public.profile_cards (
        id uuid primary key, name text not null default 'Traveller', avatar_url text,
        is_creator boolean not null default false, creator_bio text,
        social_links jsonb not null default '{}'::jsonb,
        creator_available boolean not null default true
      );
      create table public.trip_invite_role (
        trip_id uuid primary key, role text not null check (role in ('editor','viewer')),
        changed_at bigint not null
      );
      create table public.published_itineraries (
        id text primary key, trip_id uuid, creator_id uuid, premium_price_inr integer
      );
      create table public.entitlements (pub_id text, user_id uuid);
      create function public.is_member(trip uuid) returns boolean language sql stable as $$ select false $$;
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;

      insert into public.profile_cards (id, name) values ('${OWNER}', 'Shubham Kulkarni');
      insert into public.trips (id, owner_id, name, invite_code, visibility, created_at, updated_at, write_version)
        values ('${NAMED_TRIP}', '${OWNER}', 'Goa 2026', '${CODE}', 'private', 1, 1, 7),
               ('${PRICED_TRIP}', '${OWNER}', 'Munnar guide', '${PRICED_CODE}', 'public', 1, 1, 8),
               ('${ORPHAN_TRIP}', '${OWNER}', 'Coorg', '${ORPHAN_CODE}', 'private', 1, 1, 9);
      insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr)
        values ('${PUB}', '${PRICED_TRIP}', '${OWNER}', 499);
    `)
    await db.exec(readFileSync(resolve(process.cwd(), MIGRATION), 'utf8'))
  })

  /** The row as PostgREST sends it: one JSON object per trip, read as anon. */
  async function rowsFor(code: string, actor = ''): Promise<Array<Record<string, unknown>>> {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
    await db.exec('set role anon')
    try {
      const result = await db.query<{ row: string }>(
        'select row_to_json(r)::text as row from public.get_trip_by_invite_code($1) r',
        [code],
      )
      return result.rows.map(row => JSON.parse(row.row) as Record<string, unknown>)
    } finally {
      await db.exec('reset role')
    }
  }

  async function nameFor(raw: string | null): Promise<string | null> {
    const result = await db.query<{ name: string | null }>(
      'select public.invite_first_name($1) as name',
      [raw],
    )
    return result.rows[0].name
  }

  it('an anonymous caller receives the owner first name and the link role', async () => {
    await db.query("insert into public.trip_invite_role(trip_id,role,changed_at) values($1,'viewer',1) on conflict(trip_id) do update set role='viewer'", [NAMED_TRIP])
    const rows = await rowsFor(CODE)
    expect(rows).toHaveLength(1)
    expect(rows[0].owner_first_name).toBe('Shubham')
    expect(rows[0].invite_role).toBe('viewer')
  })

  it('the row is exactly the approved shape, with nothing else on it', async () => {
    const rows = await rowsFor(CODE)
    expect(Object.keys(rows[0]).sort()).toEqual([...SHAPE].sort())
    const serialised = JSON.stringify(rows[0])
    expect(serialised).not.toContain('@')
    expect(serialised).not.toContain('Kulkarni')
  })

  it('a trip whose link role was never set reads as an editor link', async () => {
    const rows = await rowsFor(ORPHAN_CODE)
    expect(rows).toHaveLength(1)
    expect(rows[0].invite_role).toBe('editor')
  })

  it('a trip whose owner card is gone answers with no name at all', async () => {
    await db.query('delete from public.profile_cards where id=$1', [OWNER])
    const rows = await rowsFor(CODE)
    expect(rows[0].owner_first_name).toBeNull()
  })

  it('a priced publication still hides the trip from a caller who cannot be a buyer', async () => {
    expect(await rowsFor(PRICED_CODE)).toEqual([])
    expect(await rowsFor(PRICED_CODE, OWNER)).toHaveLength(1)
  })

  it('a trashed trip resolves for nobody', async () => {
    await db.query('update public.trips set deleted_at=now() where id=$1', [NAMED_TRIP])
    expect(await rowsFor(CODE)).toEqual([])
    await db.query('update public.trips set deleted_at=null where id=$1', [NAMED_TRIP])
    expect(await rowsFor(CODE)).toHaveLength(1)
  })

  it('normalises the name on the server, whatever a stored display name looks like', async () => {
    expect(await nameFor('  Shubham   Kulkarni ')).toBe('Shubham')
    expect(await nameFor('@shubham_k')).toBe('shubham_k')
    expect(await nameFor('Shubham@Example.com')).toBeNull()
    expect(await nameFor('https://instagram.com/shubham')).toBeNull()
    expect(await nameFor('+91 98765 43210')).toBeNull()
    // Schemeless: a dotted alphanumeric token is a web address or a dotted phone.
    expect(await nameFor('www.example.com')).toBeNull()
    expect(await nameFor('98765.43210')).toBeNull()
    expect(await nameFor('+91.98765.43210')).toBeNull()
    expect(await nameFor('(022).123.4567')).toBeNull()
    expect(await nameFor('+91-98765-43210')).toBeNull()
    // A trailing full stop is punctuation, not a domain.
    expect(await nameFor('Riya.')).toBe('Riya')
    expect(await nameFor('Riya')).toBe('Riya')
    // 24 characters at most, and the ellipsis is part of the 24.
    const long = await nameFor('Bartholomewmaximilianjones')
    expect(long).toBe('Bartholomewmaximilianjo…')
    expect(long!.length).toBe(24)
  })

  it('answers nothing for a name that is empty or only whitespace', async () => {
    expect(await nameFor('')).toBeNull()
    expect(await nameFor('   ')).toBeNull()
    expect(await nameFor(null)).toBeNull()
  })

  it('the name helper is not callable by a client role', async () => {
    await db.exec('set role anon')
    try {
      await expect(db.query('select public.invite_first_name($1)', ['Shubham'])).rejects.toThrow(/permission denied/)
    } finally {
      await db.exec('reset role')
    }
  })

  it('the real row drives the real invite copy end to end', async () => {
    const { classifyInviteRows, invitePreviewIdentity } = await import('../src/lib/inviteLookup')
    const { rowToTrip } = await import('../src/lib/tripRow')
    const { recipientInviteCopy } = await import('../src/lib/inviteLandingCopy')

    await db.query("insert into public.profile_cards (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name", [OWNER, 'Shubham Kulkarni'])
    await db.query("insert into public.trip_invite_role(trip_id,role,changed_at) values($1,'viewer',1) on conflict(trip_id) do update set role='viewer'", [NAMED_TRIP])

    const verdict = classifyInviteRows(await rowsFor(CODE))
    expect(verdict.kind).toBe('found')
    if (verdict.kind !== 'found') return
    const preview = invitePreviewIdentity(verdict.row)
    const trip = rowToTrip(verdict.row, [])

    // The role travels beside the trip, never on it (#1012).
    expect(preview).toEqual({ ownerFirstName: 'Shubham', inviteRole: 'viewer' })
    expect('inviteRole' in trip).toBe(false)

    const copy = recipientInviteCopy({
      tripTitle: trip.name,
      inviterFirstName: preview.ownerFirstName,
      role: preview.inviteRole,
    })
    expect(copy.headline).toBe('Shubham added you to Goa 2026.')
    expect(copy.roleLine).toContain('You can’t edit it, comment or vote.')
    expect(copy.roleLine).not.toContain('you can vote')
  })

  it('a row without the projection keeps the anonymous wording the client already has', async () => {
    // The state of a deployment where the migration is not applied yet: the same
    // trip, answered by the older 33-column shape.
    const { invitePreviewIdentity } = await import('../src/lib/inviteLookup')
    const { recipientInviteCopy } = await import('../src/lib/inviteLandingCopy')
    expect(invitePreviewIdentity({ id: NAMED_TRIP, name: 'Goa 2026' })).toEqual({ ownerFirstName: null, inviteRole: null })
    expect(recipientInviteCopy({ tripTitle: 'Goa 2026', ...invitePreviewIdentity({}) }).headline)
      .toBe('You were added to Goa 2026.')
  })
})
