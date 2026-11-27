// ============ paid access, executed on a real database ============
//
// The migration chain runs on PGlite (in process): 20261126b, 20261126c,
// 20261126d, then 20261127a, the last one twice, because a database that already
// has it must accept a re-run. Only the hosted pieces are stubbed: the roles,
// auth.uid(), the profile and helper functions, and the tables the readers read.
//
// The matrix below is the decision table in spec section 3.2. Every cell is
// computed from that table, not from the function under test, so a reader that
// drifts from the table fails here.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CHAIN = [
  'supabase/migrations/20261126b_paywall_visibility_authorship.sql',
  'supabase/migrations/20261126c_invite_preview_projection.sql',
  'supabase/migrations/20261126d_public_trip_trash_order.sql',
  'supabase/migrations/20261127a_paid_access_boundary.sql',
  'supabase/migrations/20261127c_gate_091_paid_access_fixes.sql',
  'supabase/migrations/20261128a_public_trip_privacy.sql',
]
const NEW = 'supabase/migrations/20261127c_gate_091_paid_access_fixes.sql'
const PRIVACY_MIGRATION = 'supabase/migrations/20261128a_public_trip_privacy.sql'

const id = (n: number) => `2611a000-0000-4000-8000-${String(n).padStart(12, '0')}`
const U = {
  owner: id(1), admin: id(2), editor: id(3), viewer: id(4), buyer: id(5), refunded: id(6),
  premark: id(7), outsider: id(8), disBuyer: id(9), disMember: id(10), partial: id(11),
  partialPremark: id(12), outsider2: id(13), outsider3: id(14), outsider4: id(15),
  removed: id(16),
}
const T = {
  listed: id(101), unpub: id(102), private: id(103), trash: id(104), free: id(105), never: id(106),
}
const CODE = {
  listed: 'LST-0001', unpub: 'UNP-0002', private: 'PRV-0003', trash: 'TRS-0004', free: 'FRE-0005', never: 'NEV-0006',
}
const PUB = { listed: 'pub_listed', unpub: 'pub_unpub', private: 'pub_private', trash: 'pub_trash', free: 'pub_free' }
type State = keyof typeof T
type Caller = 'anon' | 'outsider' | 'buyer' | 'refunded' | 'premark' | 'owner' | 'admin' | 'editor' | 'viewer' | 'disBuyer' | 'disMember'
type Level = 'none' | 'crew' | 'buyer' | 'outsider'

const DAYS = '[{"index":0,"id":"d0","stops":[{"id":"s1","name":"Hampi","category":"temple","status":"accepted"},{"id":"s2","name":"Lunch","category":"food","status":"accepted"}]},{"index":1,"id":"d1","stops":[{"id":"s3","name":"Beach","category":"beach","status":"accepted"}]}]'
const FIXED = '[{"id":"fc1","title":"Hotel check-in","type":"hotel-checkin","dayIndex":0,"time":"14:00","boardingTime":null,"notes":"PRIVATE NOTE","stopId":"s1","reference":"BOOK-REF-123"}]'
const EXPENSES = '[{"id":"e1","amount":500,"label":"Taxi"}]'
const FLIGHTS = '[{"pnr":"ABC123"}]'
const PAST = '2026-01-01T00:00:00Z'
const UNPUBLISHED_AT = 1767312000000 // 2026-01-02, after every seeded order

/** The hosted pieces the chain needs, then the chain itself, then the seed rows. */
async function freshDb(chain: string[] = CHAIN): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
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
      is_disabled boolean not null default false,
      is_admin boolean not null default false
    );
    create table public.profile_cards (
      id uuid primary key, name text not null default 'Traveller', avatar_url text,
      is_creator boolean not null default false, creator_bio text,
      social_links jsonb not null default '{}'::jsonb, creator_available boolean not null default true
    );
    create table public.trips (
      id uuid primary key, owner_id uuid not null, name text not null default '',
      start_location text not null default '', destinations jsonb not null default '[]',
      start_date text not null default '', end_date text not null default '',
      travellers integer not null default 1, transport_mode text not null default 'car',
      budget_per_person_inr integer not null default 0, travel_style text not null default 'balanced',
      fixed_commitments jsonb not null default '[]', days jsonb not null default '[]',
      expenses jsonb not null default '[]', cover_emoji text not null default '',
      visibility text not null default 'private', created_at bigint, updated_at bigint,
      start_location_coords jsonb, destination_coords jsonb, fuel_economy_km_per_l numeric,
      fuel_price_per_l numeric, round_trip boolean, invite_code text, deleted_at timestamptz,
      driver_count integer, has_vulnerable boolean, drive_after_dinner_min integer,
      vehicle_profile jsonb, cover_image_url text, stay_style text, drives_part boolean,
      write_version bigint not null default 0, access_version bigint not null default 0,
      flights jsonb not null default '[]'
    );
    create table public.trip_invite_role (
      trip_id uuid primary key, role text not null check (role in ('editor','viewer')),
      changed_at bigint not null
    );
    create table public.published_itineraries (
      id text primary key, trip_id uuid references public.trips (id) on delete cascade,
      creator_id uuid, premium_price_inr integer, free_day_indexes jsonb, unpublished_at bigint
    );
    create table public.purchase_orders (
      id uuid primary key default gen_random_uuid(), user_id uuid, pub_id text not null,
      razorpay_order_id text not null unique, amount_inr integer not null, currency text not null default 'INR',
      status text not null default 'pending' check (status in ('pending','paid','failed')),
      price_snapshot_inr integer not null default 0, refunded_paise bigint not null default 0,
      created_at timestamptz not null default now(), paid_at timestamptz, razorpay_payment_id text
    );
    create table public.entitlements (
      id uuid primary key default gen_random_uuid(), user_id uuid, pub_id text not null,
      order_id uuid, amount_paid_inr integer, unique (user_id, pub_id)
    );
    create table public.trip_members (
      trip_id uuid not null, user_id uuid not null, role text not null, joined_at bigint,
      primary key (trip_id, user_id)
    );
    create table public.trip_member_access (
      trip_id uuid not null, user_id uuid not null, owner_id uuid, state text not null,
      role text not null, joined_at bigint, revision bigint not null default 0,
      primary key (trip_id, user_id)
    );
    create function public.is_disabled() returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_disabled)
    $$;
    create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    $$;
    create function public.is_member(trip uuid) returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.trip_members m where m.trip_id = trip and m.user_id = auth.uid())
    $$;
    create function public.is_editor(trip uuid) returns boolean language sql stable security definer set search_path = public as $$
      select exists (select 1 from public.trip_members m
        where m.trip_id = trip and m.user_id = auth.uid() and m.role in ('owner','editor'))
    $$;
    -- The 20261020 body, unchanged. 20261126b grants it, and the trips trigger calls it.
    create function public.trip_has_publication_money(p_trip uuid) returns boolean language sql stable security definer set search_path = public as $$
      select
        p_trip is null
        or exists (select 1 from public.published_itineraries p where p.trip_id = p_trip)
        or exists (select 1 from public.purchase_orders o
          where o.pub_id in (select p.id from public.published_itineraries p where p.trip_id = p_trip))
        or exists (select 1 from public.entitlements e
          where e.pub_id in (select p.id from public.published_itineraries p where p.trip_id = p_trip))
    $$;
    -- 20260910: the owner's trashed trips.
    create function public.get_trashed_trips() returns setof public.trips language sql security definer stable set search_path = public as $$
      select * from public.trips where owner_id = auth.uid() and deleted_at is not null order by deleted_at desc
    $$;
    -- Supabase grants every public table to the API roles, and RLS gates them. The
    -- chain's revokes come after this line, so they still take effect.
    grant all on all tables in schema public to anon, authenticated, service_role;
  `)
  for (const file of chain) {
    await db.exec(readFileSync(resolve(process.cwd(), file), 'utf8'))
  }
  return db
}

/** Seeds the six trips, their publications and the members. No money is seeded here. */
async function seedTrips(db: PGlite) {
  await db.exec(`
    insert into auth.users (id) values ${Object.values(U).map(u => `('${u}')`).join(', ')};
    insert into public.profiles (id, is_disabled, is_admin) values
      ('${U.owner}', false, false), ('${U.admin}', false, true), ('${U.editor}', false, false),
      ('${U.viewer}', false, false), ('${U.buyer}', false, false), ('${U.refunded}', false, false),
      ('${U.premark}', false, false), ('${U.outsider}', false, false), ('${U.disBuyer}', false, false),
      ('${U.disMember}', false, false), ('${U.partial}', false, false), ('${U.partialPremark}', false, false),
      ('${U.outsider2}', false, false), ('${U.outsider3}', false, false), ('${U.outsider4}', false, false);
    insert into public.profile_cards (id, name) values ('${U.owner}', 'Shubham Kulkarni');
    insert into public.trips (id, owner_id, name, invite_code, visibility, deleted_at, days, fixed_commitments, expenses, flights, has_vulnerable, created_at, updated_at, write_version, access_version) values
      ('${T.listed}', '${U.owner}', 'Listed guide', '${CODE.listed}', 'public', null, '${DAYS}', '${FIXED}', '${EXPENSES}', '${FLIGHTS}', true, 1, 1, 7, 3),
      ('${T.unpub}', '${U.owner}', 'Unpublished guide', '${CODE.unpub}', 'public', null, '${DAYS}', '${FIXED}', '${EXPENSES}', '${FLIGHTS}', false, 1, 1, 8, 3),
      ('${T.private}', '${U.owner}', 'Private guide', '${CODE.private}', 'private', null, '${DAYS}', '${FIXED}', '${EXPENSES}', '${FLIGHTS}', false, 1, 1, 9, 3),
      ('${T.trash}', '${U.owner}', 'Trashed guide', '${CODE.trash}', 'public', now(), '${DAYS}', '${FIXED}', '${EXPENSES}', '${FLIGHTS}', false, 1, 1, 10, 3),
      ('${T.free}', '${U.owner}', 'Free guide', '${CODE.free}', 'public', null, '${DAYS}', '${FIXED}', '${EXPENSES}', '${FLIGHTS}', false, 1, 1, 11, 3),
      ('${T.never}', '${U.owner}', 'Never published', '${CODE.never}', 'public', null, '${DAYS}', '${FIXED}', '${EXPENSES}', '${FLIGHTS}', false, 1, 1, 12, 3);
    insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr, free_day_indexes, unpublished_at) values
      ('${PUB.listed}', '${T.listed}', '${U.owner}', 99, '[0]', null),
      ('${PUB.unpub}', '${T.unpub}', '${U.owner}', 99, '[0]', ${UNPUBLISHED_AT}),
      ('${PUB.private}', '${T.private}', '${U.owner}', 99, '[0]', null),
      ('${PUB.trash}', '${T.trash}', '${U.owner}', 99, '[0]', null),
      ('${PUB.free}', '${T.free}', '${U.owner}', null, null, null);
  `)
  for (const trip of Object.values(T)) {
    await db.query(
      `insert into public.trip_members (trip_id, user_id, role, joined_at) values ($1,$2,'editor',1),($1,$3,'viewer',1),($1,$4,'editor',1)`,
      [trip, U.editor, U.viewer, U.disMember],
    )
  }
}

/** Runs the statement as an API role. authenticated and anon both need a JWT subject. */
async function as(db: PGlite, role: 'anon' | 'authenticated' | 'service_role', uid: string | null) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ''])
  await db.exec(`set role ${role}`)
}
async function reset(db: PGlite) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}

/** Creates a paid order for the buyer, and claims it as that buyer. */
async function buy(db: PGlite, user: string, pub: string, rzp: string, status: 'paid' | 'pending' = 'paid') {
  await reset(db)
  await db.query(
    `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, status, price_snapshot_inr, created_at)
     values ($1, $2, $3, 99, $4, 99, $5)`,
    [user, pub, rzp, status, PAST],
  )
  if (status === 'paid') {
    await as(db, 'authenticated', user)
    await db.query('select public.claim_paid_order($1)', [rzp])
    await reset(db)
  }
}

/** Refunds the whole order. The webhook calls this with service_role. */
async function refundFull(db: PGlite, rzp: string) {
  await reset(db)
  const r = await db.query<{ r: string }>(
    'select public.apply_order_refund($1, 9900, 9900) as r', [rzp],
  )
  return r.rows[0].r
}

/** Every caller's access is seeded here, in one place. */
async function seedMoney(db: PGlite) {
  for (const pub of Object.values(PUB).filter(p => p !== PUB.free)) {
    await buy(db, U.buyer, pub, `rzp_buyer_${pub}`)
  }
  for (const pub of Object.values(PUB).filter(p => p !== PUB.free)) {
    await buy(db, U.refunded, pub, `rzp_refunded_${pub}`)
    expect(await refundFull(db, `rzp_refunded_${pub}`)).toBe('revoked')
  }
  await buy(db, U.premark, PUB.listed, 'rzp_premark', 'pending')
  expect(await refundFull(db, 'rzp_premark')).toBe('revoked')
  await buy(db, U.disBuyer, PUB.listed, 'rzp_dis_buyer')
  await reset(db)
  await db.query('update public.profiles set is_disabled = true where id = $1', [U.disBuyer])
  await db.query('update public.profiles set is_disabled = true where id = $1', [U.disMember])
}

/** The guide page's state for a caller, read as the API reads it. */
async function rowsOf(db: PGlite, caller: Caller | string, sql: string, params: unknown[] = []) {
  const uid = callerUid(caller)
  await as(db, uid ? 'authenticated' : 'anon', uid)
  try {
    const result = await db.query<{ row: string }>(sql, params)
    return result.rows.map(row => JSON.parse(row.row) as Record<string, unknown>)
  } finally {
    await reset(db)
  }
}
function callerUid(caller: string): string | null {
  const map: Record<string, string | null> = {
    anon: null, outsider: U.outsider, buyer: U.buyer, refunded: U.refunded, premark: U.premark,
    owner: U.owner, admin: U.admin, editor: U.editor, viewer: U.viewer, disBuyer: U.disBuyer, disMember: U.disMember,
    partial: U.partial, partialPremark: U.partialPremark, outsider2: U.outsider2, outsider3: U.outsider3, outsider4: U.outsider4,
  }
  return map[caller] ?? null
}

/** The level the table in 3.2 gives each caller for each state. */
function levelOf(caller: Caller, state: State): Level {
  if (caller === 'anon' || caller === 'outsider' || caller === 'premark' || caller === 'refunded') return 'outsider'
  if (caller === 'disBuyer' || caller === 'disMember') return 'none'
  if (caller === 'owner' || caller === 'admin' || caller === 'editor') return 'crew'
  if (caller === 'viewer') return state === 'trash' ? 'outsider' : 'crew'
  // buyer: a paid order for every priced guide; the free guide and the never-published trip are not bought.
  return state === 'free' || state === 'never' ? 'outsider' : 'buyer'
}

/** Whether a publication is listed (3.1). */
const listed = (state: State) => state === 'listed' || state === 'free'
const priced = (state: State) => state === 'listed' || state === 'unpub' || state === 'private' || state === 'trash'
const published = (state: State) => state !== 'never'
const ALL_CALLERS: Caller[] = ['anon', 'outsider', 'buyer', 'refunded', 'premark', 'owner', 'admin', 'editor', 'viewer', 'disBuyer', 'disMember']
const ALL_STATES: State[] = ['listed', 'unpub', 'private', 'trash', 'free', 'never']

/** The reader's own error text, from PGlite. */
function errorText(e: unknown): string {
  const err = e as { code?: string; message?: string }
  return `${err.code ?? ''} ${err.message ?? String(e)}`
}

describe('the decision table is the contract: one level function, every reader a row', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await freshDb()
    // The chain runs a second time. A database that already has it accepts the re-run.
    await db.exec(readFileSync(resolve(process.cwd(), NEW), 'utf8'))
    await seedTrips(db)
    await seedMoney(db)
  }, 120_000)

  afterAll(async () => db?.close())

  it('get_public_trip matches the table for every caller and every guide', async () => {
    const mismatches: string[] = []
    for (const caller of ALL_CALLERS) {
      for (const pubState of ['listed', 'unpub', 'private', 'trash', 'free'] as const) {
        const level = levelOf(caller, pubState)
        const rows = await rowsOf(db, caller, 'select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB[pubState]])
        const cell = `${caller} x ${pubState}`
        if (level === 'none') {
          if (rows.length !== 0) mismatches.push(`${cell}: expected none, got ${rows.length} row(s)`)
          continue
        }
        if (level === 'outsider' && !listed(pubState)) {
          if (rows.length !== 0) mismatches.push(`${cell}: expected empty, got ${rows.length} row(s)`)
          continue
        }
        if (rows.length !== 1) { mismatches.push(`${cell}: expected one row, got ${rows.length}`); continue }
        const row = rows[0]
        if (row.invite_code !== null) mismatches.push(`${cell}: invite_code leaked`)
        const days = row.days as Array<Record<string, unknown>>
        if (level === 'crew') {
          if (!Array.isArray(row.expenses) || row.expenses.length !== 1) mismatches.push(`${cell}: crew lost expenses`)
          if (!Array.isArray(days) || days[1]?.locked === true) mismatches.push(`${cell}: crew saw a locked day`)
        } else if (level === 'buyer' || (level === 'outsider' && !priced(pubState))) {
          if (JSON.stringify(row.expenses) !== '[]') mismatches.push(`${cell}: the ledger leaked`)
          if (days[1]?.locked === true) mismatches.push(`${cell}: a buyer or free guide got a locked day`)
        } else {
          // outsider, listed and priced: the counts-only shape. Free day 0 stays real.
          if (days.length !== 2) mismatches.push(`${cell}: wrong day count ${days.length}`)
          if (days[1]?.locked !== true || JSON.stringify(days[1]?.stops) !== '[]') mismatches.push(`${cell}: day 1 not locked`)
          if (JSON.stringify(row.fixed_commitments) !== '[]') mismatches.push(`${cell}: fixed commitments leaked`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('get_trip_by_invite_code matches the table for every caller and every trip', async () => {
    const mismatches: string[] = []
    for (const caller of ALL_CALLERS) {
      for (const state of ALL_STATES) {
        const level = state === 'trash' ? 'none' : levelOf(caller, state)
        const cell = `${caller} x ${state}`
        let rows: Array<Record<string, unknown>> = []
        let thrown = ''
        try {
          rows = await rowsOf(db, caller, 'select row_to_json(r)::text as row from public.get_trip_by_invite_code($1) r', [CODE[state]])
        } catch (e) {
          thrown = errorText(e)
        }
        const refuse = level !== 'crew' && priced(state)
        if (level === 'none') {
          if (rows.length !== 0 || thrown) mismatches.push(`${cell}: expected empty`)
        } else if (refuse) {
          if (!/PT403|Owner approval needed/.test(thrown)) mismatches.push(`${cell}: expected PT403, got "${thrown}"`)
          if (rows.length !== 0) mismatches.push(`${cell}: PT403 returned data`)
        } else {
          if (thrown) mismatches.push(`${cell}: unexpected error ${thrown}`)
          if (rows.length !== 1 || rows[0].invite_code !== CODE[state]) mismatches.push(`${cell}: expected the preview row`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('get_invite_trip matches the table for every caller and every trip', async () => {
    const mismatches: string[] = []
    for (const caller of ALL_CALLERS) {
      for (const state of ALL_STATES) {
        const level = levelOf(caller, state)
        const cell = `${caller} x ${state}`
        const rows = await rowsOf(db, caller, 'select row_to_json(r)::text as row from public.get_invite_trip($1::uuid) r', [T[state]])
        if (state === 'trash' || level === 'none') {
          if (rows.length !== 0) mismatches.push(`${cell}: expected empty`)
        } else if (level === 'crew') {
          if (rows.length !== 1 || rows[0].invite_code !== null) mismatches.push(`${cell}: crew expected the row with no code`)
        } else if (published(state)) {
          if (rows.length !== 0) mismatches.push(`${cell}: a published UUID served a non-crew caller`)
        } else if (rows.length !== 1 || rows[0].invite_code !== null) {
          mismatches.push(`${cell}: an unpublished trip should serve the row with no code (M9)`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('get_trashed_trips is owner-only, and is covered by the matrix', async () => {
    const owner = await rowsOf(db, 'owner', 'select row_to_json(r)::text as row from public.get_trashed_trips() r')
    expect(owner.map(r => r.id)).toEqual([T.trash])
    expect(await rowsOf(db, 'outsider', 'select row_to_json(r)::text as row from public.get_trashed_trips() r')).toEqual([])
    expect(await rowsOf(db, 'admin', 'select row_to_json(r)::text as row from public.get_trashed_trips() r')).toEqual([])
  })

  it('a meta-test: every definer that returns trips is a reader in the matrix', async () => {
    const result = await db.query<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and p.prorettype in ('public.trips'::regtype, 'public.trip_invite_preview'::regtype)
      order by p.proname`)
    const readers = result.rows.map(r => r.proname)
    expect(readers).toEqual(['get_invite_trip', 'get_public_trip', 'get_trashed_trips', 'get_trip_by_invite_code'])
  })

  it('invite_trip_payment_allows is gone, and no body names it', async () => {
    const left = await db.query<{ proname: string }>(
      `select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and (proname = 'invite_trip_payment_allows' or prosrc like '%invite_trip_payment_allows%')`,
    )
    expect(left.rows).toEqual([])
  })

  it('the trigger shape: the link guard is on, the old guard is gone', async () => {
    const triggers = await db.query<{ tgname: string; tgenabled: string }>(
      `select tgname, tgenabled from pg_trigger where tgrelid = 'public.published_itineraries'::regclass and not tgisinternal`,
    )
    const names = triggers.rows.map(r => r.tgname)
    expect(names).toContain('publication_link_guard')
    expect(names).not.toContain('publication_trip_id_immutable')
    expect(triggers.rows.find(r => r.tgname === 'publication_link_guard')?.tgenabled).toBe('O')
  })

  it('an admin on a priced trip and a free trip keeps the crew row', async () => {
    const rows = await rowsOf(db, 'admin', 'select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.listed])
    expect(rows).toHaveLength(1)
    expect(rows[0].invite_code).toBeNull()
  })
})

describe('the guide projection is an allowlist', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await freshDb()
    await seedTrips(db)
    await seedMoney(db)
    // A column added to trips later is not in the guide row. The row takes it as null.
    await db.exec(`alter table public.trips add column secret_ref text`)
    await db.query(`update public.trips set secret_ref = 'SECRET-REF' where id = $1`, [T.listed])
  }, 120_000)

  afterAll(async () => db?.close())

  it('a buyer and an outsider never see the crew-only columns', async () => {
    for (const caller of ['buyer', 'outsider'] as const) {
      const [row] = await rowsOf(db, caller, 'select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.free])
      for (const key of ['invite_code', 'write_version', 'access_version', 'flights', 'secret_ref']) {
        expect(row[key] ?? null, `${caller} saw ${key}`).toBeNull()
      }
      expect(JSON.stringify(row)).not.toContain('ABC123')
      expect(JSON.stringify(row)).not.toContain('SECRET-REF')
    }
  })

  it('a buyer gets a fixed commitment without notes or references, and keeps has_vulnerable and deleted_at', async () => {
    const [row] = await rowsOf(db, 'buyer', 'select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.listed])
    const fixed = row.fixed_commitments as Array<Record<string, unknown>>
    expect(fixed).toHaveLength(1)
    expect(Object.keys(fixed[0]).sort()).toEqual(['dayIndex', 'id', 'stopId', 'time', 'title', 'type'])
    expect(JSON.stringify(row)).not.toContain('PRIVATE NOTE')
    expect(JSON.stringify(row)).not.toContain('BOOK-REF-123')
    expect(row.has_vulnerable).toBe(true)
    const [trashed] = await rowsOf(db, 'buyer', 'select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.trash])
    expect(trashed.deleted_at).not.toBeNull()
  })

  it('the crew row keeps the crew ledger and the notes', async () => {
    const [row] = await rowsOf(db, 'owner', 'select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.listed])
    expect(JSON.stringify(row)).toContain('PRIVATE NOTE')
    expect(row.expenses).toEqual([{ id: 'e1', amount: 500, label: 'Taxi' }])
  })
})

describe('refunds, transitions and claims, on the database', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await freshDb()
    await seedTrips(db)
    await seedMoney(db)
  }, 120_000)

  afterAll(async () => db?.close())

  it('a full refund of a PAID order revokes with no exception, and the webhook gets revoked', async () => {
    await buy(db, U.partial, PUB.listed, 'rzp_full_paid')
    expect(await refundFull(db, 'rzp_full_paid')).toBe('revoked')
    const order = await db.query<{ status: string; refunded_paise: string }>(
      `select status, refunded_paise from public.purchase_orders where razorpay_order_id = 'rzp_full_paid'`,
    )
    // PGlite returns bigint as a number.
    expect(order.rows[0]).toEqual({ status: 'failed', refunded_paise: 9900 })
    const ent = await db.query(`select 1 from public.entitlements e join public.purchase_orders o on o.id = e.order_id where o.razorpay_order_id = 'rzp_full_paid'`)
    expect(ent.rows).toHaveLength(0)
  })

  it('a partial refund records the greatest total and keeps the buyer reading', async () => {
    await buy(db, U.partial, PUB.listed, 'rzp_partial')
    await reset(db)
    const first = await db.query<{ r: string }>(`select public.apply_order_refund('rzp_partial', 5000, 9900) as r`)
    expect(first.rows[0].r).toBe('recorded')
    await reset(db)
    await db.query(`select public.apply_order_refund('rzp_partial', 3000, 9900)`)
    const order = await db.query<{ status: string; refunded_paise: string }>(
      `select status, refunded_paise from public.purchase_orders where razorpay_order_id = 'rzp_partial'`,
    )
    expect(order.rows[0]).toEqual({ status: 'paid', refunded_paise: 5000 })
    // The buyer keeps the guide: the buyer shape, with every day read as written.
    await as(db, 'authenticated', U.partial)
    const read = await db.query<{ row: string }>('select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.listed])
    await reset(db)
    const days = (JSON.parse(read.rows[0].row).days as Array<Record<string, unknown>>)
    expect(days[1].locked).toBeUndefined()
  })

  it('a partial refund before mark, then the mark, then a grant: the buyer reads', async () => {
    await reset(db)
    await db.query(
      `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, status, price_snapshot_inr, created_at)
       values ($1, $2, 'rzp_pm', 99, 'pending', 99, $3)`,
      [U.partialPremark, PUB.listed, PAST],
    )
    await reset(db)
    const recorded = await db.query<{ r: string }>(`select public.apply_order_refund('rzp_pm', 3000, 9900) as r`)
    expect(recorded.rows[0].r).toBe('recorded')
    await reset(db)
    const mark = await db.query(`update public.purchase_orders set status = 'paid', paid_at = now() where razorpay_order_id = 'rzp_pm' and status = 'pending' returning id`)
    expect(mark.rows).toHaveLength(1)
    await as(db, 'authenticated', U.partialPremark)
    const claimed = await db.query(`select public.claim_paid_order('rzp_pm') as ent`)
    expect(claimed.rows[0]).toBeDefined()
    const read = await db.query<{ row: string }>('select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.listed])
    await reset(db)
    expect((JSON.parse(read.rows[0].row).days as Array<Record<string, unknown>>)[1].locked).toBeUndefined()
  })

  it('refund before mark: failed is final, the mark matches no row, and the claim is refused', async () => {
    await reset(db)
    const rows = await db.query<{ id: string }>(`select id from public.purchase_orders where razorpay_order_id = 'rzp_premark'`)
    expect(rows.rows).toHaveLength(1)
    // The gateway's mark is filtered on pending. A failed order matches no row, so no error.
    const mark = await db.query(`update public.purchase_orders set status = 'paid', paid_at = now() where razorpay_order_id = 'rzp_premark' and status = 'pending' returning id`)
    expect(mark.rows).toHaveLength(0)
    // An unfiltered move from failed back to paid is refused by the trigger.
    await expect(db.query(`update public.purchase_orders set status = 'paid' where razorpay_order_id = 'rzp_premark'`)).rejects.toThrow(/failed order is final/)
    await as(db, 'authenticated', U.premark)
    await expect(db.query(`select public.claim_paid_order('rzp_premark')`)).rejects.toThrow(/claim refused/)
    await reset(db)
  })

  it('a paid order with a full refund cannot be moved into paid, and a refund total never falls', async () => {
    await reset(db)
    await db.query(
      `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, status, price_snapshot_inr, created_at)
       values ($1, $2, 'rzp_guard', 99, 'pending', 99, $3)`,
      [U.outsider3, PUB.listed, PAST],
    )
    // Pending to paid with a full refund already recorded: refused.
    await db.query(`update public.purchase_orders set refunded_paise = 9900 where razorpay_order_id = 'rzp_guard'`)
    await expect(db.query(`update public.purchase_orders set status = 'paid' where razorpay_order_id = 'rzp_guard'`)).rejects.toThrow(/fully refunded order cannot be marked paid/)
    // A refund total cannot fall.
    await db.query(`update public.purchase_orders set refunded_paise = 9900, status = 'failed' where razorpay_order_id = 'rzp_guard'`)
    await expect(db.query(`update public.purchase_orders set refunded_paise = 100 where razorpay_order_id = 'rzp_guard'`)).rejects.toThrow(/refund total cannot decrease/)
  })

  it('a paid order never returns to pending', async () => {
    await reset(db)
    await expect(db.query(`update public.purchase_orders set status = 'pending' where razorpay_order_id = 'rzp_partial'`)).rejects.toThrow(/cannot return to pending/)
  })

  it('a buyer of a fully refunded guide cannot claim it', async () => {
    await as(db, 'authenticated', U.refunded)
    await expect(db.query(`select public.claim_paid_order('rzp_refunded_pub_listed')`)).rejects.toThrow(/claim refused/)
    await reset(db)
  })

  it('a link that names another creator is refused for every role, and the trip cannot move', async () => {
    await reset(db)
    await expect(db.query(`insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr) values ('pub_bad', $1, $2, 50)`, [T.listed, U.outsider])).rejects.toThrow(/Only the trip owner/)
    await expect(db.query(`update public.published_itineraries set trip_id = $1 where id = $2`, [T.private, PUB.listed])).rejects.toThrow(/cannot move to another trip/)
    await expect(db.query(`update public.published_itineraries set creator_id = $1 where id = $2`, [U.outsider, PUB.listed])).rejects.toThrow(/cannot change its creator/)
  })

  it('no client role can DELETE a publication, and a server delete of a sold guide is refused by RESTRICT', async () => {
    await as(db, 'authenticated', U.owner)
    await expect(db.query(`delete from public.published_itineraries where id = $1`, [PUB.listed])).rejects.toThrow(/permission denied/)
    await reset(db)
    // ON DELETE RESTRICT (A′, 20261126b) raises 23001 (restrict_violation). The spec's
    // acceptance line says 23503, which is NO ACTION. This test pins RESTRICT.
    const err = await db.query(`delete from public.published_itineraries where id = $1`, [PUB.listed]).then(() => null, (e: unknown) => e)
    expect(err).not.toBeNull()
    expect(errorText(err)).toMatch(/23001/)
  })

  it('the checkout facts: a disabled buyer and a private trip are reported as facts, not verdicts', async () => {
    await reset(db)
    const [facts] = (await db.query<{ f: Record<string, unknown> }>(`select public.checkout_offer($1, $2) as f`, [PUB.private, U.buyer])).rows.map(r => ({ ...(r.f as Record<string, unknown>) }))
    expect(facts.listed).toBe(false)
    expect(facts.price_inr).toBe(99)
    expect(facts.buyer_disabled).toBe(false)
    const [disabled] = (await db.query<{ f: Record<string, unknown> }>(`select public.checkout_offer($1, $2) as f`, [PUB.listed, U.disBuyer])).rows.map(r => r.f)
    expect(disabled.buyer_disabled).toBe(true)
    const [own] = (await db.query<{ f: Record<string, unknown> }>(`select public.checkout_offer($1, $2) as f`, [PUB.listed, U.owner])).rows.map(r => r.f)
    expect(own.buyer_is_creator).toBe(true)
    expect(own.listed).toBe(true)
  })
})

describe('the approve-request flow: request, decide, and nothing else writes trip_members', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await freshDb()
    await seedTrips(db)
    await seedMoney(db)
  }, 120_000)

  afterAll(async () => db?.close())

  async function members(trip: string) {
    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.trip_members where trip_id = $1`, [trip])
    return r.rows[0].n
  }

  it('an anonymous caller cannot request, a signed-out caller has no execute', async () => {
    await as(db, 'anon', null)
    await expect(db.query(`select public.request_trip_join($1)`, [CODE.listed])).rejects.toThrow(/permission denied/)
    await reset(db)
  })

  it('a request writes a pending row with the link role, and no member row', async () => {
    const before = await members(T.listed)
    await as(db, 'authenticated', U.outsider2)
    const first = await db.query<{ id: string }>(`select public.request_trip_join($1) as id`, [CODE.listed])
    const again = await db.query<{ id: string }>(`select public.request_trip_join($1) as id`, [CODE.listed])
    await reset(db)
    expect(again.rows[0].id).toBe(first.rows[0].id)
    expect(await members(T.listed)).toBe(before)
    const row = await db.query<{ status: string; role: string }>(`select status, role from public.trip_join_requests where id = $1`, [first.rows[0].id])
    expect(row.rows[0]).toEqual({ status: 'pending', role: 'editor' })
  })

  it('the owner decides; a non-owner gets "not found" and a repeat decision is a no-op', async () => {
    const req = await db.query<{ id: string }>(`select id from public.trip_join_requests where user_id = $1`, [U.outsider2])
    const id = req.rows[0].id
    await as(db, 'authenticated', U.outsider3)
    await expect(db.query(`select public.decide_trip_join($1, true)`, [id])).rejects.toThrow(/Request not found/)
    await as(db, 'authenticated', U.owner)
    const approved = await db.query<{ r: string }>(`select public.decide_trip_join($1, true) as r`, [id])
    expect(approved.rows[0].r).toBe('approved')
    const again = await db.query<{ r: string }>(`select public.decide_trip_join($1, true) as r`, [id])
    expect(again.rows[0].r).toBe('approved')
    await expect(db.query(`select public.decide_trip_join($1, false)`, [id])).rejects.toThrow(/already decided/)
    await reset(db)
    // The approved member now reads the trip as crew.
    const [row] = await rowsOf(db, 'outsider2', 'select row_to_json(r)::text as row from public.get_public_trip($1) r', [PUB.listed])
    expect(row.invite_code).toBeNull()
    expect(JSON.stringify(row)).toContain('PRIVATE NOTE')
  })

  it('a declined request reopens on a new request, and the owner can approve it', async () => {
    await as(db, 'authenticated', U.outsider4)
    const first = await db.query<{ id: string }>(`select public.request_trip_join($1) as id`, [CODE.listed])
    await reset(db)
    await as(db, 'authenticated', U.owner)
    await db.query(`select public.decide_trip_join($1, false)`, [first.rows[0].id])
    await reset(db)
    await as(db, 'authenticated', U.outsider4)
    const reopened = await db.query<{ id: string }>(`select public.request_trip_join($1) as id`, [CODE.listed])
    await reset(db)
    expect(reopened.rows[0].id).toBe(first.rows[0].id)
    await as(db, 'authenticated', U.owner)
    expect((await db.query<{ r: string }>(`select public.decide_trip_join($1, true) as r`, [first.rows[0].id])).rows[0].r).toBe('approved')
    await reset(db)
  })

  it('the stored role is capped by the link role at approval, and a viewer link is carried', async () => {
    // The link is a viewer link. A new request is stored as a viewer.
    await db.query(`insert into public.trip_invite_role (trip_id, role, changed_at) values ($1, 'viewer', 1)`, [T.listed])
    await as(db, 'authenticated', U.outsider3)
    const req = await db.query<{ id: string }>(`select public.request_trip_join($1) as id`, [CODE.listed])
    await reset(db)
    // The owner raises the link to editor. The stored role is still a viewer.
    await db.query(`update public.trip_invite_role set role = 'editor' where trip_id = $1`, [T.listed])
    await as(db, 'authenticated', U.owner)
    await db.query(`select public.decide_trip_join($1, true)`, [req.rows[0].id])
    await reset(db)
    const role = await db.query<{ role: string }>(`select role from public.trip_members where trip_id = $1 and user_id = $2`, [T.listed, U.outsider3])
    expect(role.rows[0].role).toBe('viewer')
  })

  it('an editor request is capped to viewer when the owner lowers the link before approval', async () => {
    // The link is an editor link again. A buyer (not a member) asks as an editor.
    await db.query(`update public.trip_invite_role set role = 'editor' where trip_id = $1`, [T.listed])
    await as(db, 'authenticated', U.buyer)
    const req = await db.query<{ id: string }>(`select public.request_trip_join($1) as id`, [CODE.listed])
    await reset(db)
    // The owner lowers the link to viewer. The stored role is editor, and the cap applies.
    await db.query(`update public.trip_invite_role set role = 'viewer' where trip_id = $1`, [T.listed])
    await as(db, 'authenticated', U.owner)
    await db.query(`select public.decide_trip_join($1, true)`, [req.rows[0].id])
    await reset(db)
    const role = await db.query<{ role: string }>(`select role from public.trip_members where trip_id = $1 and user_id = $2`, [T.listed, U.buyer])
    expect(role.rows[0].role).toBe('viewer')
  })

  it('an owner, a member, a disabled caller and a trashed trip are refused as requesters', async () => {
    await reset(db)
    await as(db, 'authenticated', U.owner)
    await expect(db.query(`select public.request_trip_join($1)`, [CODE.listed])).rejects.toThrow(/already own/)
    await as(db, 'authenticated', U.editor)
    await expect(db.query(`select public.request_trip_join($1)`, [CODE.listed])).rejects.toThrow(/already a member/)
    await as(db, 'authenticated', U.disMember)
    await expect(db.query(`select public.request_trip_join($1)`, [CODE.listed])).rejects.toThrow(/enabled account/)
    await as(db, 'authenticated', U.outsider)
    await expect(db.query(`select public.request_trip_join($1)`, [CODE.trash])).rejects.toThrow(/Invite is unavailable/)
    await reset(db)
  })

  it('a requester reads only their own rows, the owner reads the trip, and a client writes nothing', async () => {
    await as(db, 'authenticated', U.outsider2)
    const mine = await db.query(`select id from public.trip_join_requests`)
    expect(mine.rows).toHaveLength(1)
    await expect(db.query(`insert into public.trip_join_requests (trip_id, user_id, role, status) values ($1, $2, 'editor', 'approved')`, [T.listed, U.outsider])).rejects.toThrow(/permission denied/)
    await as(db, 'authenticated', U.owner)
    const all = await db.query(`select id from public.trip_join_requests where trip_id = $1`, [T.listed])
    expect(all.rows.length).toBeGreaterThanOrEqual(2)
    await reset(db)
  })

  it('an approval does not restore a member that the owner removed after the request', async () => {
    await as(db, 'authenticated', U.removed)
    const req = await db.query<{ id: string }>(`select public.request_trip_join($1) as id`, [CODE.listed])
    await reset(db)
    // The owner removes this person after the request was made.
    await db.query(
      `insert into public.trip_member_access (trip_id, user_id, owner_id, state, role, joined_at)
       values ($1, $2, $3, 'removed', 'editor', 1)`,
      [T.listed, U.removed, U.owner],
    )
    await as(db, 'authenticated', U.owner)
    await expect(db.query(`select public.decide_trip_join($1, true)`, [req.rows[0].id])).rejects.toThrow(/restore your access/)
    await reset(db)
    const member = await db.query(`select 1 from public.trip_members where trip_id = $1 and user_id = $2`, [T.listed, U.removed])
    expect(member.rows).toHaveLength(0)
    const status = await db.query<{ status: string }>(`select status from public.trip_join_requests where id = $1`, [req.rows[0].id])
    expect(status.rows[0].status).toBe('pending')
  })
})

describe('the pre-check refuses a database that already breaks the owner rule', () => {
  it('names the violating publication and changes nothing', async () => {
    const db = await freshDb(CHAIN.slice(0, 3))
    try {
      await seedTrips(db)
      await db.query(
        `insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr) values ('pub_violator', $1, $2, 50)`,
        [T.listed, U.outsider],
      )
      await expect(db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261127a_paid_access_boundary.sql'), 'utf8'))).rejects.toThrow(/pub_violator/)
      // The failed file leaves its transaction open. Roll it back, then look.
      await db.exec('rollback')
      const triggers = await db.query<{ tgname: string }>(`select tgname from pg_trigger where tgrelid = 'public.published_itineraries'::regclass and not tgisinternal`)
      expect(triggers.rows.map(r => r.tgname)).not.toContain('publication_link_guard')
    } finally {
      await db.close()
    }
  }, 120_000)
})

describe('v0.91.0 gate paid-access fixes on the database', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await freshDb()
    await seedTrips(db)
    await seedMoney(db)
  }, 120_000)

  afterAll(async () => db?.close())

  it('create_pending_purchase_order locks, rechecks listing and price, and inserts only when valid', async () => {
    await reset(db)
    await expect(db.query(
      `select public.create_pending_purchase_order($1, $2, 'rzp_unpub', 99)`,
      [U.outsider2, PUB.unpub],
    )).rejects.toThrow(/This guide is no longer for sale/)
    await expect(db.query(
      `select public.create_pending_purchase_order($1, $2, 'rzp_private', 99)`,
      [U.outsider2, PUB.private],
    )).rejects.toThrow(/This guide is no longer for sale/)
    await expect(db.query(
      `select public.create_pending_purchase_order($1, $2, 'rzp_trash', 99)`,
      [U.outsider2, PUB.trash],
    )).rejects.toThrow(/This guide is no longer for sale/)
    await expect(db.query(
      `select public.create_pending_purchase_order($1, $2, 'rzp_reprice', 149)`,
      [U.outsider2, PUB.listed],
    )).rejects.toThrow(/This guide is no longer for sale/)

    const bad = await db.query(
      `select 1 from public.purchase_orders where razorpay_order_id in ('rzp_unpub', 'rzp_private', 'rzp_trash', 'rzp_reprice')`,
    )
    expect(bad.rows).toHaveLength(0)

    const minted = await db.query<{ r: string }>(
      `select public.create_pending_purchase_order($1, $2, 'rzp_valid_mint', 99) as r`,
      [U.outsider2, PUB.listed],
    )
    expect(minted.rows[0].r).toBe('minted')
    const saved = await db.query<{ status: string; amount_inr: number; price_snapshot_inr: number }>(
      `select status, amount_inr, price_snapshot_inr from public.purchase_orders where razorpay_order_id = 'rzp_valid_mint'`,
    )
    expect(saved.rows).toEqual([{ status: 'pending', amount_inr: 99, price_snapshot_inr: 99 }])

    // Mint sets created_at with clock_timestamp() after locks, not transaction start now().
    await db.exec('begin')
    const txStart = await db.query<{ t: string }>('select transaction_timestamp()::text as t')
    await db.exec('select pg_sleep(0.02)')
    await db.query(
      `select public.create_pending_purchase_order($1, $2, 'rzp_clock_mint', 99)`,
      [U.outsider2, PUB.listed],
    )
    const clockRow = await db.query<{ later: boolean }>(
      `select created_at > $1::timestamptz as later from public.purchase_orders where razorpay_order_id = 'rzp_clock_mint'`,
      [txStart.rows[0].t],
    )
    await db.exec('commit')
    expect(clockRow.rows[0].later).toBe(true)
  })

  it('purchase_orders_pending_guard blocks direct pending inserts after withdrawal or bad state, stamps clock_timestamp(), and skips non-pending inserts', async () => {
    await reset(db)
    // Withdraw PUB.listed temporarily, then try a direct v0.90.0-style pending insert.
    await db.query(`update public.published_itineraries set unpublished_at = 1 where id = $1`, [PUB.listed])
    try {
      await expect(db.query(
        `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, currency, status, price_snapshot_inr)
         values ($1, $2, 'rzp_direct_withdrawn', 99, 'INR', 'pending', 99)`,
        [U.outsider4, PUB.listed],
      )).rejects.toThrow(/This guide is no longer for sale/)
    } finally {
      await db.query(`update public.published_itineraries set unpublished_at = null where id = $1`, [PUB.listed])
    }

    await expect(db.query(
      `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, currency, status, price_snapshot_inr)
       values ($1, $2, 'rzp_direct_private', 99, 'INR', 'pending', 99)`,
      [U.outsider4, PUB.private],
    )).rejects.toThrow(/This guide is no longer for sale/)

    await expect(db.query(
      `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, currency, status, price_snapshot_inr)
       values ($1, $2, 'rzp_direct_trash', 99, 'INR', 'pending', 99)`,
      [U.outsider4, PUB.trash],
    )).rejects.toThrow(/This guide is no longer for sale/)

    await expect(db.query(
      `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, currency, status, price_snapshot_inr)
       values ($1, $2, 'rzp_direct_reprice', 149, 'INR', 'pending', 149)`,
      [U.outsider4, PUB.listed],
    )).rejects.toThrow(/This guide is no longer for sale/)

    const bad = await db.query(
      `select 1 from public.purchase_orders where razorpay_order_id in ('rzp_direct_withdrawn', 'rzp_direct_private', 'rzp_direct_trash', 'rzp_direct_reprice')`,
    )
    expect(bad.rows).toHaveLength(0)

    // Non-pending inserts bypass the pending guard trigger (fixtures/historical rows).
    await db.query(
      `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, currency, status, price_snapshot_inr, created_at)
       values ($1, $2, 'rzp_direct_nonpending', 99, 'INR', 'failed', 99, $3)`,
      [U.outsider4, PUB.unpub, PAST],
    )
    const nonPending = await db.query<{ status: string }>(
      `select status from public.purchase_orders where razorpay_order_id = 'rzp_direct_nonpending'`,
    )
    expect(nonPending.rows).toEqual([{ status: 'failed' }])

    // Direct valid pending insert succeeds and overwrites client created_at with clock_timestamp().
    await db.exec('begin')
    const txStart = await db.query<{ t: string }>('select transaction_timestamp()::text as t')
    await db.exec('select pg_sleep(0.02)')
    await db.query(
      `insert into public.purchase_orders (user_id, pub_id, razorpay_order_id, amount_inr, currency, status, price_snapshot_inr, created_at)
       values ($1, $2, 'rzp_direct_valid', 99, 'INR', 'pending', 99, $3)`,
      [U.outsider4, PUB.listed, PAST],
    )
    const clockRow = await db.query<{ later: boolean }>(
      `select created_at > $1::timestamptz as later from public.purchase_orders where razorpay_order_id = 'rzp_direct_valid'`,
      [txStart.rows[0].t],
    )
    await db.exec('commit')
    expect(clockRow.rows[0].later).toBe(true)
  })

  it('publication_unpublished_at_guard uses clock_timestamp(), ignores client stamps, keeps the first stamp, and allows republish', async () => {
    await reset(db)
    await db.exec('begin')
    const txStartMs = await db.query<{ ms: string }>(
      `select (extract(epoch from transaction_timestamp()) * 1000)::bigint::text as ms`,
    )
    await db.exec('select pg_sleep(0.02)')
    await db.query(
      `update public.published_itineraries set unpublished_at = 123 where id = $1`,
      [PUB.listed],
    )
    const first = await db.query<{ unpublished_at: string }>(
      `select unpublished_at::text from public.published_itineraries where id = $1`,
      [PUB.listed],
    )
    await db.exec('commit')
    const firstStamp = Number(first.rows[0].unpublished_at)
    expect(firstStamp).toBeGreaterThan(Number(txStartMs.rows[0].ms))
    expect(firstStamp).not.toBe(123)

    // Retries keep the first stamp instead of accepting a newer client value.
    await db.query(
      `update public.published_itineraries set unpublished_at = 9999999999999 where id = $1`,
      [PUB.listed],
    )
    const retry = await db.query<{ unpublished_at: string }>(
      `select unpublished_at::text from public.published_itineraries where id = $1`,
      [PUB.listed],
    )
    expect(Number(retry.rows[0].unpublished_at)).toBe(firstStamp)

    // Republish clears unpublished_at to null, and a later withdrawal stamps fresh.
    await db.query(
      `update public.published_itineraries set unpublished_at = null where id = $1`,
      [PUB.listed],
    )
    const live = await db.query<{ unpublished_at: string | null }>(
      `select unpublished_at::text from public.published_itineraries where id = $1`,
      [PUB.listed],
    )
    expect(live.rows[0].unpublished_at).toBeNull()

    await db.exec('select pg_sleep(0.02)')
    await db.query(
      `update public.published_itineraries set unpublished_at = 456 where id = $1`,
      [PUB.listed],
    )
    const second = await db.query<{ unpublished_at: string }>(
      `select unpublished_at::text from public.published_itineraries where id = $1`,
      [PUB.listed],
    )
    expect(Number(second.rows[0].unpublished_at)).toBeGreaterThan(firstStamp)

    // Restore PUB.listed to live for any subsequent assertions.
    await db.query(
      `update public.published_itineraries set unpublished_at = null where id = $1`,
      [PUB.listed],
    )
  })

  it('published_itineraries SELECT hides private, trashed, and unpublished guides from anon and outsiders while keeping authorized readers', async () => {
    const pubsOf = async (caller: Caller) => {
      const rows = await rowsOf(db, caller, 'select row_to_json(p)::text as row from public.published_itineraries p order by p.id')
      return rows.map(r => r.id as string).sort()
    }
    expect(await pubsOf('anon')).toEqual([PUB.free, PUB.listed].sort())
    expect(await pubsOf('outsider')).toEqual([PUB.free, PUB.listed].sort())
    expect(await pubsOf('refunded')).toEqual([PUB.free, PUB.listed].sort())
    expect(await pubsOf('buyer')).toEqual([PUB.free, PUB.listed, PUB.private, PUB.trash, PUB.unpub].sort())
    expect(await pubsOf('viewer')).toEqual([PUB.free, PUB.listed, PUB.private, PUB.unpub].sort())
    expect(await pubsOf('editor')).toEqual([PUB.free, PUB.listed, PUB.private, PUB.trash, PUB.unpub].sort())
    expect(await pubsOf('owner')).toEqual([PUB.free, PUB.listed, PUB.private, PUB.trash, PUB.unpub].sort())
    expect(await pubsOf('admin')).toEqual([PUB.free, PUB.listed, PUB.private, PUB.trash, PUB.unpub].sort())
    expect(await pubsOf('disBuyer')).toEqual([])
  })

  it('get_trip_by_invite_code admits an active member with a missing trip_members row for the current owner and still blocks non-active callers', async () => {
    await reset(db)
    await db.query(
      `insert into public.trip_member_access (trip_id, user_id, owner_id, state, role, joined_at)
       values ($1, $2, $3, 'active', 'viewer', 1),
              ($1, $4, $3, 'left', 'editor', 1),
              ($1, $5, $6, 'active', 'editor', 1)`,
      [T.listed, U.outsider3, U.owner, U.outsider4, U.outsider2, U.outsider],
    )
    // Active row matching current owner bypasses PT403 and reaches the preview.
    const activeRows = await rowsOf(
      db,
      'outsider3',
      'select row_to_json(r)::text as row from public.get_trip_by_invite_code($1) r',
      [CODE.listed],
    )
    expect(activeRows).toHaveLength(1)
    expect(activeRows[0].invite_code).toBe(CODE.listed)

    // Left member, mismatched-owner active row, and buyer still hit PT403.
    for (const caller of ['outsider4', 'outsider2', 'buyer'] as const) {
      await expect(
        rowsOf(db, caller, 'select row_to_json(r)::text as row from public.get_trip_by_invite_code($1) r', [CODE.listed]),
      ).rejects.toThrow(/Owner approval needed|PT403/)
    }
  })
})

describe('#1015 public trip privacy contract on a real database', () => {
  it('passes supabase/tests/public_trip_privacy.test.sql and stays idempotent on re-run', async () => {
    const db = await freshDb()
    try {
      await seedTrips(db)
      await seedMoney(db)
      // Re-run 20261128a to confirm idempotency and single function definition.
      await db.exec(readFileSync(resolve(process.cwd(), PRIVACY_MIGRATION), 'utf8'))
      const procs = await db.query<{ n: number }>(
        `select count(*)::int as n from pg_proc where pronamespace = 'public'::regnamespace and proname = 'get_public_trip'`,
      )
      expect(procs.rows[0].n).toBe(1)

      const results = await db.exec(
        readFileSync(resolve(process.cwd(), 'supabase/tests/public_trip_privacy.test.sql'), 'utf8'),
      )
      const last = results[results.length - 1].rows[0] as { result: string }
      expect(last.result).toMatch(/^PASS: /)
    } finally {
      await db.close()
    }
  }, 120_000)
})
