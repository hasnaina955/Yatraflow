// ============ #1020 — the invite lookup in schema.sql answers like the live one ============
//
// `supabase/schema.sql` is the second build path: a fresh database can be built
// from that file alone. It held the pre-paywall `select t.*` body of
// get_trip_by_invite_code long after the live function grew its paywall, its
// trash filter and its approved projection, so a fresh install resolved a priced
// plan for anyone who held the invite code.
//
// Both definitions call the same payment check. It handles a schema-only
// install where the payments rail is absent and no buyer can exist yet.
//
// The second half runs the function on a schema-only PGlite database. A source
// scan cannot prove what an anon caller receives.
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

const NAME = 'get_trip_by_invite_code'
// 20261127a redefines both readers and adds trip_access_level. It is the newest
// definition of each, and the parity checks below read it.
const MIGRATION = '20261127a_paid_access_boundary.sql'
const PUBLIC_TRIP_MIGRATION = '20261127a_paid_access_boundary.sql'
const migration = read(`supabase/migrations/${MIGRATION}`)
const hotfix = read('supabase/migrations/20261126b_paywall_visibility_authorship.sql')
const schema = read('supabase/schema.sql')

/** The definition of the function in a source file, comments included. */
function definition(source: string): string {
  const start = source.indexOf(`create or replace function public.${NAME}(`)
  if (start < 0) return ''
  const end = source.indexOf('$$;', start)
  return end < 0 ? '' : source.slice(start, end + 3)
}

/** Code only, with every whitespace run collapsed, so a fragment is found whatever the indentation. */
const flat = (sql: string) => sql.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * The approved projection: the column names the caller receives, left to right.
 *
 * This list is what an anon caller may receive, so an added, dropped or
 * reordered column is a disclosure change and not a style change.
 */
function projection(sql: string): string[] {
  const body = flat(sql)
  const start = body.indexOf('jsonb_build_object(')
  const end = body.indexOf(') as projected', start)
  if (start < 0 || end < 0) return []
  return [...body.slice(start, end).matchAll(/'([a-z_]+)', /g)].map(match => match[1])
}

/** The definition of any function in a source file, ending at its `$$;`. */
function fnDefinition(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`)
  if (start < 0) return ''
  const end = source.indexOf('$$;', start)
  return end < 0 ? '' : source.slice(start, end + 3)
}

const liveBody = definition(migration)
const schemaBody = definition(schema)

describe('#1020 schema.sql invite lookup matches the live definition', () => {
  it('the newest migration that defines the function is the one this test reads', () => {
    const defining = readdirSync('supabase/migrations')
      .filter(name => name.endsWith('.sql'))
      .sort()
      .filter(name => read(`supabase/migrations/${name}`).includes(`function public.${NAME}(`))
    expect(defining.at(-1), 'a newer migration redefines the function: update MIGRATION and this test').toBe(MIGRATION)
  })

  it('both copies exist and declare the same signature and safety', () => {
    expect(liveBody).not.toBe('')
    expect(schemaBody).not.toBe('')
    for (const [label, body] of [['the migration', liveBody], ['schema.sql', schemaBody]] as const) {
      const text = flat(body)
      expect(text, label).toContain('returns setof public.trip_invite_preview')
      expect(text, label).toContain('security definer')
      expect(text, label).toContain('set search_path = public')
      expect(text, label).toContain(' stable ')
    }
  })

  it('both copies project the same 35 columns in the same order', () => {
    const live = projection(liveBody)
    expect(live).toHaveLength(35)
    expect(new Set(live).size).toBe(35)
    expect(live.slice(-2)).toEqual(['owner_first_name', 'invite_role'])
    expect(projection(schemaBody)).toEqual(live)
  })

  it('the invite reader carries the access-level gate and the owner-approval refusal', () => {
    expect(flat(schemaBody)).toBe(flat(liveBody))
    const gates = [
      'upper(t.invite_code) = upper(trim(p_code))',
      't.deleted_at is null',
      'v_level := public.trip_access_level(v_row.id)',
      "if v_level <> 'crew' and public.trip_has_priced_publication(v_row.id) then",
      "raise exception 'Owner approval needed.' using errcode = 'PT403'",
    ]
    for (const gate of gates) {
      expect(flat(liveBody), `the migration must keep: ${gate}`).toContain(gate)
    }
    expect(flat(liveBody)).not.toMatch(/public\.entitlements|premium_price_inr|owner_id = auth\.uid\(\)/)
    expect(flat(liveBody)).toContain('public.invite_first_name(pc.name)')
    expect(flat(liveBody)).toContain("coalesce(r.role, 'editor')")
    expect(schema).toContain('revoke all on function public.invite_first_name(text) from public, anon, authenticated;')
  })

  it('the one access function keeps the membership, admin and trash gates in both build paths', () => {
    // The gates the invite reader used to carry now live here.
    const gates = [
      'public.is_disabled()',
      'v_owner = auth.uid() or public.is_admin()',
      'public.is_editor(p_trip_id)',
      'v_deleted is null and public.is_member(p_trip_id)',
      "to_regclass('public.entitlements') is not null",
    ]
    for (const [label, source] of [['the migration', migration], ['schema.sql', schema]] as const) {
      const access = flat(fnDefinition(source, 'trip_access_level'))
      expect(access, `${label} defines trip_access_level`).not.toBe('')
      for (const gate of gates) {
        expect(access, `${label} must keep: ${gate}`).toContain(gate)
      }
    }
  })

  it('schema.sql no longer carries the dropped payment helper', () => {
    expect(schema).not.toContain('invite_trip_payment_allows')
  })

  it('the newest migration that defines get_public_trip is the one this test reads', () => {
    const defining = readdirSync('supabase/migrations')
      .filter(name => name.endsWith('.sql'))
      .sort()
      .filter(name => read(`supabase/migrations/${name}`).includes('function public.get_public_trip('))
    expect(defining.at(-1), 'a newer migration redefines get_public_trip: update PUBLIC_TRIP_MIGRATION').toBe(PUBLIC_TRIP_MIGRATION)
  })

  it('uses the same public trip reader in the newest migration and bootstrap schema', () => {
    const readPublicTrip = (source: string) => {
      const start = source.indexOf('drop function if exists public.get_public_trip(text);')
      expect(start).toBeGreaterThan(-1)
      const grant = 'grant execute on function public.get_public_trip(text) to anon, authenticated;'
      return source.slice(start, source.indexOf(grant, start) + grant.length)
    }
    const newest = read(`supabase/migrations/${PUBLIC_TRIP_MIGRATION}`)
    expect(readPublicTrip(schema)).toBe(readPublicTrip(newest))
  })

  it('both copies carry the same grants and revokes', () => {
    for (const [label, source] of [['the migration', migration], ['schema.sql', schema]] as const) {
      expect(source, label).toContain(`revoke execute on function public.${NAME}(text) from public, anon;`)
      expect(source, label).toContain(`grant execute on function public.${NAME}(text) to anon, authenticated;`)
    }
  })
})

describe('#1020 the invite lookup answers with the live gates on a schema-only build', () => {
  const OWNER = '10000000-0000-4000-8000-000000000001'
  const BUYER = '10000000-0000-4000-8000-000000000002'
  const STRANGER = '10000000-0000-4000-8000-000000000003'
  const PRIVATE_TRIP = '20000000-0000-4000-8000-000000000001'
  const PRICED_TRIP = '20000000-0000-4000-8000-000000000002'
  const PUB = 'pub_invite_1020'
  const codes: Record<string, string> = {}
  let db: PGlite

  /** Runs one statement as a caller, so RLS and the JWT subject behave as they do in the app. */
  async function asCaller<T>(role: 'anon' | 'authenticated' | 'service_role', actor: string, sql: string, args: unknown[] = []) {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
    await db.exec(`set role ${role}`)
    try {
      return await db.query<T>(sql, args)
    } finally {
      await db.exec('reset role')
    }
  }

  /** The rows the function returns to this caller, as PostgREST sends them. */
  async function rowsFor(actor: string, code: string): Promise<Array<Record<string, unknown>>> {
    const result = await asCaller<{ row: string }>(
      'anon',
      actor,
      'select row_to_json(r)::text as row from public.get_trip_by_invite_code($1) r',
      [code],
    )
    return result.rows.map(row => JSON.parse(row.row) as Record<string, unknown>)
  }

  async function seedEntitlement(pub: string, user: string) {
    await db.query(`
      with paid_order as (
        insert into public.purchase_orders
          (user_id, pub_id, razorpay_order_id, amount_inr, status, price_snapshot_inr)
        values ($1, $2, $2, 499, 'paid', 499)
        returning id, user_id, pub_id
      )
      insert into public.entitlements(order_id, user_id, pub_id, amount_paid_inr)
        select id, user_id, pub_id, 499 from paid_order
    `, [user, pub])
  }

  beforeAll(async () => {
    db = new PGlite()
    // Only the hosted pieces are stubbed: the roles, the auth schema and its
    // helpers, and the realtime publication. The file itself builds the rest.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create table auth.users(
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb not null default '{}'::jsonb,
        raw_app_meta_data jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb
      $$;
      create publication supabase_realtime;
    `)
    await db.exec(schema)
    // Supabase's default privileges are not part of schema.sql.
    await db.exec(`
      grant usage on schema public to anon, authenticated, service_role;
      grant all on all tables in schema public to anon, authenticated, service_role;
      grant all on all sequences in schema public to anon, authenticated, service_role;
      grant all on all functions in schema public to anon, authenticated, service_role;
    `)
    for (const id of [OWNER, BUYER, STRANGER]) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${id}@synthetic.invalid`])
    }
    await db.query('insert into public.trips(id,owner_id,name,visibility) values($1,$2,$3,$4)', [PRIVATE_TRIP, OWNER, 'Code trip', 'private'])
    await db.query('insert into public.trips(id,owner_id,name,visibility) values($1,$2,$3,$4)', [PRICED_TRIP, OWNER, 'Priced trip', 'private'])
    await db.query(
      `insert into public.published_itineraries(id,trip_id,creator_id,title,premium_price_inr,free_day_indexes)
       values($1,$2,$3,$4,$5,$6::jsonb)`,
      [PUB, PRICED_TRIP, OWNER, 'Priced trip', 499, '[0]'],
    )
    // A direct write cannot set an invite code (guard_trip_invite nulls it on
    // insert), so each code is minted through the access command, as the app does.
    for (const trip of [PRIVATE_TRIP, PRICED_TRIP]) {
      for (const action of ['bootstrap', 'invite']) {
        await asCaller('authenticated', OWNER, 'select public.change_trip_access($1,$2,null,null,null) as result', [trip, action])
      }
      const state = await asCaller<{ state: { inviteCode: string } }>(
        'authenticated',
        OWNER,
        'select public.trip_access_state($1) as state',
        [trip],
      )
      codes[trip] = state.rows[0].state.inviteCode
    }
  }, 60_000)

  afterAll(async () => db?.close())

  it('a private trip resolves by code, and the row carries write_version', async () => {
    const rows = await rowsFor('', codes[PRIVATE_TRIP])
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('Code trip')
    const stored = await db.query<{ write_version: number }>(
      'select write_version from public.trips where id=$1',
      [PRIVATE_TRIP],
    )
    // A JSON number, because the client checks it before it renders a preview.
    expect(typeof rows[0].write_version).toBe('number')
    expect(rows[0].write_version).toBe(stored.rows[0].write_version)
  })

  it('a trashed trip resolves for nobody', async () => {
    await db.query('update public.trips set deleted_at=now() where id=$1', [PRIVATE_TRIP])
    expect(await rowsFor('', codes[PRIVATE_TRIP])).toEqual([])
    await db.query('update public.trips set deleted_at=null where id=$1', [PRIVATE_TRIP])
    expect(await rowsFor('', codes[PRIVATE_TRIP])).toHaveLength(1)
  })

  it('a priced publication asks a caller who cannot be a buyer for owner approval', async () => {
    // No payments rail exists in this build, so no entitlement row can exist.
    // The reader raises PT403 for these callers. It never returns the trip.
    await expect(rowsFor('', codes[PRICED_TRIP])).rejects.toThrow('Owner approval needed.')
    await expect(rowsFor(STRANGER, codes[PRICED_TRIP])).rejects.toThrow('Owner approval needed.')
    // The owner and the publication's creator still resolve it.
    expect(await rowsFor(OWNER, codes[PRICED_TRIP])).toHaveLength(1)
  })

  it('requires the linked trip owner on publication inserts and updates', async () => {
    const insert = (actor: string, pub: string, trip: string) => asCaller(
      'authenticated', actor,
      'insert into public.published_itineraries(id, trip_id, creator_id) values($1,$2,$3)',
      [pub, trip, actor],
    )
    // The link guard refuses a creator who is not the trip owner. It runs before
    // RLS on insert, so either refusal is correct; the guard's is the one that fires.
    await expect(insert(STRANGER, 'other_owner', PRICED_TRIP)).rejects.toThrow(/Only the trip owner can publish this trip|row-level security/)
    await insert(OWNER, 'owner_publication', PRIVATE_TRIP)

    const otherTrip = '20000000-0000-4000-8000-000000000003'
    await db.query('insert into public.trips(id,owner_id,name) values($1,$2,$3)', [otherTrip, STRANGER, 'Other trip'])
    await insert(STRANGER, 'own_publication', otherTrip)
    await expect(asCaller('authenticated', STRANGER,
      'update public.published_itineraries set trip_id=$1 where id=$2',
      [PRICED_TRIP, 'own_publication'],
    )).rejects.toThrow('A publication cannot move to another trip.')
  })

  it('a buyer reaches the buyer level once the payments rail exists, and a stranger does not', async () => {
    // The rail arrives after the bootstrap, as a migration would. This is the
    // branch the to_regclass guard defers, so it must work once it is reached.
    await db.exec(read('supabase/migrations/20260918_payments_rail.sql'))
    await db.exec(read('supabase/migrations/20260918_payments_security.sql'))
    // The buyer branch reads refunded_paise, which 20261003 adds to the rail.
    await db.exec(read('supabase/migrations/20261003_partial_refund_record.sql'))
    await seedEntitlement(PUB, BUYER)
    const levelFor = async (actor: string) => (await asCaller<{ level: string }>(
      'service_role', actor, 'select public.trip_access_level($1) as level', [PRICED_TRIP],
    )).rows[0].level
    expect(await levelFor(BUYER)).toBe('buyer')
    expect(await levelFor(STRANGER)).toBe('outsider')
    // A buyer joins by request, not by code. The code reader refuses a buyer too (D4).
    await expect(rowsFor(BUYER, codes[PRICED_TRIP])).rejects.toThrow('Owner approval needed.')
  })

  it('keeps both preview RPCs and joining locked on the migrated database', async () => {
    await db.exec(hotfix)
    await db.exec(migration)
    await db.exec(migration)

    const code = codes[PRICED_TRIP]
    const uuidRows = (actor: string) => asCaller<{ invite_code: string | null }>(
      'authenticated', actor, 'select invite_code from public.get_invite_trip($1)', [PRICED_TRIP],
    )
    const join = (actor: string) => asCaller(
      'authenticated', actor, 'select public.join_trip($1)', [code],
    )
    // A pre-guard row: its creator is not the trip owner. The link guard refuses
    // that on write, so replica mode writes it the way old data was written.
    await db.query('set session_replication_role = replica')
    await db.query(
      'insert into public.published_itineraries(id,trip_id,creator_id) values($1,$2,$3)',
      ['legacy_publication', PRICED_TRIP, STRANGER],
    )
    await db.query('set session_replication_role = origin')
    await seedEntitlement('legacy_publication', STRANGER)
    await db.query('update public.published_itineraries set premium_price_inr=0 where id=$1', [PUB])
    // The code reader refuses every non-crew caller on a priced trip, buyer included.
    await expect(rowsFor('', code)).rejects.toThrow('Owner approval needed.')
    await expect(rowsFor(STRANGER, code)).rejects.toThrow('Owner approval needed.')
    await expect(rowsFor(BUYER, code)).rejects.toThrow('Owner approval needed.')
    // The UUID reader returns no trip to a non-crew caller on a priced trip.
    expect((await uuidRows(STRANGER)).rows).toEqual([])
    expect((await uuidRows(BUYER)).rows).toEqual([])
    await expect(join(STRANGER)).rejects.toMatchObject({ code: 'PT403' })
    await expect(join(BUYER)).rejects.toMatchObject({ code: 'PT403' })

    await db.query('update public.trips set visibility=$1 where id=$2', ['public', PRICED_TRIP])
    await db.query('delete from public.entitlements where pub_id=$1', ['legacy_publication'])
    expect((await asCaller('authenticated', STRANGER,
      'select id from public.get_public_trip($1)', ['legacy_publication'],
    )).rows).toEqual([])
    expect((await asCaller('authenticated', BUYER,
      'select id from public.get_public_trip($1)', [PUB],
    )).rows).toEqual([{ id: PRICED_TRIP }])
  })

})
