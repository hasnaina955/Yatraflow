import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(new URL(`../supabase/${file}`, import.meta.url), 'utf8')
const migration = 'migrations/20261126b_paywall_visibility_authorship.sql'
const owner = '10000000-0000-4000-8000-000000000001'
const buyer = '10000000-0000-4000-8000-000000000002'
const legacyCreator = '10000000-0000-4000-8000-000000000003'
const crew = '10000000-0000-4000-8000-000000000004'
const priced = '20000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const legacy = '20000000-0000-4000-8000-000000000003'
const privateStop = 'Private waterfront stop'

describe('publication and paid invite rules on PostgreSQL', () => {
  let db: PGlite
  const codes = new Map<string, string>()

  async function asCaller<T>(role: 'anon' | 'authenticated' | 'service_role', actor: string, sql: string, args: unknown[] = []) {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor])
    await db.exec(`set role ${role}`)
    try {
      return await db.query<T>(sql, args)
    } finally {
      await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false)")
    }
  }

  async function publicTrip(pub: string, actor = '') {
    return (await asCaller(actor ? 'authenticated' : 'anon', actor, 'select * from public.get_public_trip($1)', [pub])).rows
  }

  async function inviteTrip(tripId: string, actor: string) {
    return (await asCaller('authenticated', actor, 'select * from public.get_invite_trip($1)', [tripId])).rows
  }

  async function inviteCode(tripId: string, actor: string) {
    return (await asCaller('authenticated', actor, 'select * from public.get_trip_by_invite_code($1)', [codes.get(tripId)])).rows
  }

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text,
        raw_user_meta_data jsonb not null default '{}',
        raw_app_meta_data jsonb not null default '{}',
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select '{}'::jsonb
      $$;
      create publication supabase_realtime;
    `)
    await db.exec(read('schema.sql'))
    await db.exec(read('migrations/20260918_payments_rail.sql'))
    // The older payment migration replaces readers. Use its refund function,
    // then restore the current readers with the hotfix under test.
    await db.exec(read('migrations/20260918_payments_security.sql'))
    await db.exec(read('migrations/20261003_partial_refund_record.sql'))
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role;
      grant select on public.trips, public.published_itineraries to anon, authenticated;
      grant update, delete on public.published_itineraries to anon, authenticated;
      drop function public.get_trip_by_invite_code(text);
      create type public.legacy_trip_invite_preview as (id uuid);
      create function public.get_trip_by_invite_code(text)
        returns setof public.legacy_trip_invite_preview language sql as $$
          select null::uuid
        $$;
    `)
    await db.exec(read(migration))
    await db.exec(read(migration))
    for (const id of [owner, buyer, legacyCreator, crew]) {
      await db.query('insert into auth.users(id, email) values ($1, $2)', [id, `${id}@synthetic.invalid`])
    }
    for (const id of [priced, other, legacy]) {
      const days = [
        { id: 'free-day', index: 0, stops: [] },
        { id: 'paid-day', index: 1, stops: [{ title: privateStop, category: 'sightseeing' }] },
      ]
      await db.query(
        "insert into public.trips(id, owner_id, name, visibility, days) values ($1, $2, 'Fixture trip', 'public', $3::jsonb)",
        [id, owner, JSON.stringify(days)],
      )
      for (const action of ['bootstrap', 'invite']) {
        await asCaller('authenticated', owner, 'select public.change_trip_access($1, $2, null, null, null)', [id, action])
      }
      const state = await asCaller<{ state: { inviteCode: string } }>(
        'authenticated', owner, 'select public.trip_access_state($1) as state', [id],
      )
      codes.set(id, state.rows[0].state.inviteCode)
    }

    await asCaller('authenticated', crew, 'select public.join_trip($1)', [codes.get(legacy)])
    await db.query(`
      insert into public.published_itineraries
        (id, trip_id, creator_id, premium_price_inr, free_day_indexes, duration_days)
      values ('paid-guide', $1, $3, 499, '[0]', 2),
        ('free-alias', $1, $3, null, '[0,1]', 2),
        ('legacy-guide', $2, $4, 499, '[0]', 2)
    `, [priced, legacy, owner, legacyCreator])
    await db.query(`
      with orders as (
        insert into public.purchase_orders
          (user_id, pub_id, razorpay_order_id, amount_inr, status, price_snapshot_inr)
        values ($1, 'paid-guide', 'order_valid', 499, 'paid', 499),
          ($1, 'legacy-guide', 'order_legacy', 499, 'paid', 499)
        returning id, pub_id, user_id
      )
      insert into public.entitlements(order_id, pub_id, user_id, amount_paid_inr)
        select id, pub_id, user_id, 499 from orders
    `, [buyer])
  }, 60_000)

  afterAll(async () => db?.close())

  it('hides paid content when the visitor uses a free alias', async () => {
    const rows = await publicTrip('free-alias')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      days: [{ locked: true, stops: [] }, { locked: true, stops: [] }],
      expenses: [], fixed_commitments: [],
    })
    expect(JSON.stringify(rows)).not.toContain(privateStop)
  })

  it('refuses an entitlement from a different creator and still admits crew', async () => {
    expect(await publicTrip('legacy-guide', buyer)).toEqual([])
    expect(await inviteTrip(legacy, buyer)).toEqual([])
    expect(await inviteCode(legacy, buyer)).toEqual([])
    expect(JSON.stringify(await publicTrip('legacy-guide', crew))).toContain(privateStop)
  })

  it('gives buyers the guide without crew and revokes read access on a full refund', async () => {
    expect(JSON.stringify(await publicTrip('paid-guide', buyer))).toContain(privateStop)
    expect(JSON.stringify(await publicTrip('free-alias', buyer))).toContain(privateStop)
    expect(await inviteTrip(priced, buyer)).toHaveLength(1)
    expect(await inviteCode(priced, buyer)).toHaveLength(1)
    await expect(asCaller('authenticated', buyer, 'select public.join_trip($1)', [codes.get(priced)]))
      .rejects.toMatchObject({ code: 'PT403', message: 'Owner approval needed.' })
    expect((await db.query('select 1 from public.trip_members where trip_id = $1 and user_id = $2', [priced, buyer])).rows).toEqual([])
    expect((await db.query('select 1 from public.trip_member_access where trip_id = $1 and user_id = $2', [priced, buyer])).rows).toEqual([])

    const refund = await asCaller('service_role', '', "select public.apply_order_refund('order_valid', 49900, 49900) as outcome")
    expect(refund.rows).toEqual([{ outcome: 'revoked' }])
    expect(JSON.stringify(await publicTrip('paid-guide', buyer))).not.toContain(privateStop)
    expect(JSON.stringify(await publicTrip('free-alias', buyer))).not.toContain(privateStop)
    expect(await inviteTrip(priced, buyer)).toEqual([])
    expect(await inviteCode(priced, buyer)).toEqual([])
  })

  it('refuses hard DELETE for anon and for a creator who does not own the trip', async () => {
    const remove = 'delete from public.published_itineraries where id = $1 returning id'
    await expect(asCaller('anon', '', remove, ['legacy-guide'])).rejects.toMatchObject({ code: '42501' })
    expect((await asCaller('authenticated', legacyCreator, remove, ['legacy-guide'])).rows).toEqual([])
    expect((await asCaller('authenticated', owner, remove, ['legacy-guide'])).rows).toEqual([{ id: 'legacy-guide' }])
  })

  it('refuses to move a publication even between trips with the same owner', async () => {
    await expect(asCaller('authenticated', owner,
      "update public.published_itineraries set trip_id = $1 where id = 'free-alias'", [other]))
      .rejects.toMatchObject({ code: '23514', message: 'A publication cannot move to another trip.' })
  })

  it('replaces the earlier return type and fails if another signature remains', async () => {
    const signature = await db.query(`
      select pg_get_function_result('public.get_trip_by_invite_code(text)'::regprocedure) as result
    `)
    expect(signature.rows).toEqual([{ result: 'SETOF trips' }])
    await db.exec('create function public.get_trip_by_invite_code(uuid) returns uuid language sql as $$ select $1 $$')
    try {
      await expect(db.exec(read(migration))).rejects.toThrow('Unexpected get_trip_by_invite_code overload.')
    } finally {
      await db.exec('rollback; drop function public.get_trip_by_invite_code(uuid)')
    }
  })
})
