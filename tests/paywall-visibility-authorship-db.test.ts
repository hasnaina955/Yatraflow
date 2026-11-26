import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const read = (file: string) => readFileSync(new URL(`../supabase/${file}`, import.meta.url), 'utf8')
const migration = 'migrations/20261126b_paywall_visibility_authorship.sql'
const trashOrder = 'migrations/20261126d_public_trip_trash_order.sql'
const owner = '10000000-0000-4000-8000-000000000001'
const buyer = '10000000-0000-4000-8000-000000000002'
const legacyCreator = '10000000-0000-4000-8000-000000000003'
const crew = '10000000-0000-4000-8000-000000000004'
const admin = '10000000-0000-4000-8000-000000000005'
const priced = '20000000-0000-4000-8000-000000000001'
const other = '20000000-0000-4000-8000-000000000002'
const legacy = '20000000-0000-4000-8000-000000000003'
const privateStop = 'Private waterfront stop'
const trashed = '20000000-0000-4000-8000-000000000004'
const trashedFree = '20000000-0000-4000-8000-000000000005'
const viewer = '10000000-0000-4000-8000-000000000006'
const commenter = '10000000-0000-4000-8000-000000000007'
const editor = '10000000-0000-4000-8000-000000000008'
const stranger = '10000000-0000-4000-8000-000000000009'

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
      create role service_role nologin bypassrls;
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
        select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
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
      grant usage on schema public, auth to anon, authenticated, service_role;
      grant select on public.trips, public.published_itineraries to anon, authenticated;
      grant update, delete on public.published_itineraries to anon, authenticated;
      grant select, update on public.trips to service_role;
      grant update on public.trips to authenticated;
      grant select, delete on public.published_itineraries to service_role;
      drop function public.get_trip_by_invite_code(text);
      create type public.legacy_trip_invite_preview as (id uuid);
      create function public.get_trip_by_invite_code(text)
        returns setof public.legacy_trip_invite_preview language sql as $$
          select null::uuid
        $$;
    `)
    await db.exec(read(migration))
    await db.exec(read(migration))
    await db.exec(read(trashOrder))
    await db.exec(read(trashOrder))
    for (const id of [owner, buyer, legacyCreator, crew, admin]) {
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

    for (const id of [priced, other, legacy]) {
      await asCaller('authenticated', crew, 'select public.join_trip($1)', [codes.get(id)])
    }
    await db.query(`
      insert into public.published_itineraries
        (id, trip_id, creator_id, premium_price_inr, free_day_indexes, duration_days)
      values ('paid-guide', $1, $2, 499, '[0]', 2),
        ('free-alias', $1, $2, null, '[0,1]', 2)
    `, [priced, owner])
    // A pre-guard row: its creator is not the trip owner. The publication link
    // guard refuses that shape on write, and 20261127a's pre-check refuses to run
    // over it. Replica mode writes it the way old data was written, so this
    // chain can still exercise the reader rule that refuses it.
    await db.query("set session_replication_role = replica")
    await db.query(
      `insert into public.published_itineraries
        (id, trip_id, creator_id, premium_price_inr, free_day_indexes, duration_days)
      values ('legacy-guide', $1, $2, 499, '[0]', 2)`,
      [legacy, legacyCreator],
    )
    await db.query("set session_replication_role = origin")
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

  it('blocks a handover of a published trip for the owner, admin, and operator', async () => {
    const handover = 'update public.trips set owner_id = $1 where id = $2 returning owner_id'
    const blocked = { code: '42501', message: 'A trip with a published guide cannot change owner.' }
    await expect(asCaller('authenticated', owner, handover, [crew, priced])).rejects.toMatchObject(blocked)

    await db.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify({ app_metadata: { role: 'masteradmin' } }),
    ])
    try {
      await expect(asCaller('authenticated', admin, handover, [crew, priced])).rejects.toMatchObject(blocked)
    } finally {
      await db.exec("select set_config('request.jwt.claims', '', false)")
    }

    await expect(asCaller('service_role', '', handover, [crew, priced])).rejects.toMatchObject(blocked)
    await expect(db.query(handover, [crew, priced])).rejects.toMatchObject(blocked)
    expect((await asCaller('authenticated', owner, handover, [owner, priced])).rows).toEqual([{ owner_id: owner }])
  })

  it('repairs a missing member row on a priced trip and keeps the active role', async () => {
    await db.query("update public.trip_member_access set role = 'viewer' where trip_id = $1 and user_id = $2", [priced, crew])
    const removed = await db.query('delete from public.trip_members where trip_id = $1 and user_id = $2 returning role', [priced, crew])
    expect(removed.rows).toEqual([{ role: 'editor' }])

    const joined = await asCaller('authenticated', crew, 'select public.join_trip($1) as id', [codes.get(priced)])
    expect(joined.rows).toEqual([{ id: priced }])
    const member = await db.query('select role from public.trip_members where trip_id = $1 and user_id = $2', [priced, crew])
    expect(member.rows).toEqual([{ role: 'viewer' }])
  })

  it('refuses hard deletes and keeps the order and entitlement on a sold guide', async () => {
    const remove = 'delete from public.published_itineraries where id = $1'
    await expect(asCaller('anon', '', remove, ['paid-guide'])).rejects.toMatchObject({ code: '42501' })
    await expect(asCaller('authenticated', owner, remove, ['paid-guide'])).rejects.toMatchObject({ code: '42501' })
    await expect(asCaller('service_role', '', remove, ['paid-guide'])).rejects.toMatchObject({ code: '23001' })
    const records = await db.query(`
      select o.razorpay_order_id, o.status, e.user_id
      from public.purchase_orders o
      join public.entitlements e on e.order_id = o.id and e.pub_id = o.pub_id
      where o.pub_id = 'paid-guide'
    `)
    expect(records.rows).toEqual([{ razorpay_order_id: 'order_valid', status: 'paid', user_id: buyer }])
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

  it('refuses to move a publication even between trips with the same owner', async () => {
    await expect(asCaller('authenticated', owner,
      "update public.published_itineraries set trip_id = $1 where id = 'free-alias'", [other]))
      .rejects.toMatchObject({ code: '23514', message: 'A publication cannot move to another trip.' })
  })

  it('allows a no-JWT handover of a trip with no publication', async () => {
    const handover = 'update public.trips set owner_id = $1 where id = $2 returning owner_id'
    const changed = await asCaller('service_role', '', handover, [crew, other])
    expect(changed.rows).toEqual([{ owner_id: crew }])
  })

  it('gives a trashed trip to no viewer or commenter, on a free or a priced link', async () => {
    for (const id of [viewer, commenter, editor, stranger]) {
      await db.query('insert into auth.users(id, email) values ($1, $2)', [id, `${id}@synthetic.invalid`])
    }
    for (const [trip, pub, premium] of [[trashed, 'trashed-paid', 499], [trashedFree, 'trashed-free', null]] as const) {
      await db.query(
        "insert into public.trips(id, owner_id, name, visibility, days) values ($1, $2, 'Trashed trip', 'public', $3::jsonb)",
        [trip, owner, JSON.stringify([{ id: 'paid-day', index: 1, stops: [{ title: privateStop, category: 'sightseeing' }] }])],
      )
      await db.query(
        "insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr, free_day_indexes, duration_days) values ($1, $2, $3, $4, '[0]', 2)",
        [pub, trip, owner, premium],
      )
      for (const [user, role] of [[viewer, 'viewer'], [commenter, 'commenter'], [editor, 'editor']] as const) {
        await db.query(
          "insert into public.trip_member_access(trip_id, user_id, owner_id, state, role, joined_at) values ($1, $2, $3, 'active', $4, $5)",
          [trip, user, owner, role, Date.now()],
        )
        await db.query('insert into public.trip_members(trip_id, user_id, role, joined_at) values ($1, $2, $3, $4)', [trip, user, role, Date.now()])
      }
      await db.query('update public.trips set deleted_at = now() where id = $1', [trip])
    }
    for (const pub of ['trashed-paid', 'trashed-free']) {
      expect(await publicTrip(pub, viewer), `viewer on ${pub}`).toEqual([])
      expect(await publicTrip(pub, commenter), `commenter on ${pub}`).toEqual([])
    }
  })

  it('keeps a trashed trip in full for its owner, its editor and an admin', async () => {
    for (const pub of ['trashed-paid', 'trashed-free']) {
      for (const actor of [owner, editor]) {
        const rows = await publicTrip(pub, actor)
        expect(rows, `${actor} on ${pub}`).toHaveLength(1)
        expect(JSON.stringify(rows), `${actor} on ${pub}`).toContain(privateStop)
      }
    }
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ app_metadata: { role: 'masteradmin' } })])
    try {
      for (const pub of ['trashed-paid', 'trashed-free']) {
        const rows = await publicTrip(pub, admin)
        expect(rows, `admin on ${pub}`).toHaveLength(1)
        expect(JSON.stringify(rows), `admin on ${pub}`).toContain(privateStop)
      }
    } finally {
      await db.exec("select set_config('request.jwt.claims', '', false)")
    }
  })

  it('serves an active trip to a viewer in full, and to a stranger locked', async () => {
    for (const trip of [trashed, trashedFree]) {
      await db.query('update public.trips set deleted_at = null where id = $1', [trip])
    }
    for (const pub of ['trashed-paid', 'trashed-free']) {
      const rows = await publicTrip(pub, viewer)
      expect(rows, `viewer on ${pub}`).toHaveLength(1)
      expect(JSON.stringify(rows), `viewer on ${pub}`).toContain(privateStop)
    }
    const locked = await publicTrip('trashed-paid', stranger)
    expect(locked).toHaveLength(1)
    expect(JSON.stringify(locked)).not.toContain(privateStop)
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
