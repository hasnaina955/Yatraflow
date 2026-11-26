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
const MIGRATION = '20261126b_paywall_visibility_authorship.sql'
const migration = read(`supabase/migrations/${MIGRATION}`)
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
  return [...body.slice(start, end).matchAll(/'([a-z_]+)', (?:t|v_row)\.[a-z_]+/g)].map(match => match[1])
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
      expect(text, label).toContain('returns setof public.trips')
      expect(text, label).toContain('security definer')
      expect(text, label).toContain('set search_path = public')
      expect(text, label).toContain(' stable ')
    }
  })

  it('both copies project the same 33 columns in the same order', () => {
    const live = projection(migration)
    expect(live).toHaveLength(33)
    expect(new Set(live).size).toBe(33)
    expect(projection(schema)).toEqual(live)
  })

  it('both copies hold the same gates', () => {
    const gates = [
      'upper(t.invite_code) = upper(trim(p_code))',
      't.deleted_at is null',
      'owner_id = auth.uid()',
      'public.is_member(',
      'public.is_admin()',
      'not public.is_disabled()',
      'public.invite_trip_payment_allows(t.id)',
    ]
    for (const gate of gates) {
      expect(flat(liveBody), `the migration must keep: ${gate}`).toContain(gate)
      expect(flat(schemaBody), `schema.sql must keep: ${gate}`).toContain(gate)
    }
  })

  it('both build paths apply the same payment check', () => {
    const helper = 'create or replace function public.invite_trip_payment_allows('
    for (const source of [migration, schema]) {
      const start = source.indexOf(helper)
      const code = flat(source.slice(start, source.indexOf('$$;', start)))
      expect(code).toContain("to_regclass('public.entitlements') is null")
      expect(code).toContain('join public.entitlements e on e.pub_id = p.id')
      expect(code.match(/p\.premium_price_inr is not null/g)).toHaveLength(2)
      expect(code).not.toContain('creator_id')
    }
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
  async function asCaller<T>(role: 'anon' | 'authenticated', actor: string, sql: string, args: unknown[] = []) {
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

  it('a priced publication hides the trip from a caller who cannot be a buyer', async () => {
    // No payments rail exists in this build, so no entitlement row can exist.
    expect(await rowsFor('', codes[PRICED_TRIP])).toEqual([])
    expect(await rowsFor(STRANGER, codes[PRICED_TRIP])).toEqual([])
    // The owner and the publication's creator still resolve it.
    expect(await rowsFor(OWNER, codes[PRICED_TRIP])).toHaveLength(1)
  })

  it('requires the linked trip owner on publication inserts and updates', async () => {
    const insert = (actor: string, pub: string, trip: string) => asCaller(
      'authenticated', actor,
      'insert into public.published_itineraries(id, trip_id, creator_id) values($1,$2,$3)',
      [pub, trip, actor],
    )
    await expect(insert(STRANGER, 'other_owner', PRICED_TRIP)).rejects.toThrow(/row-level security/)
    await insert(OWNER, 'owner_publication', PRIVATE_TRIP)

    const otherTrip = '20000000-0000-4000-8000-000000000003'
    await db.query('insert into public.trips(id,owner_id,name) values($1,$2,$3)', [otherTrip, STRANGER, 'Other trip'])
    await insert(STRANGER, 'own_publication', otherTrip)
    await expect(asCaller('authenticated', STRANGER,
      'update public.published_itineraries set trip_id=$1 where id=$2',
      [PRICED_TRIP, 'own_publication'],
    )).rejects.toThrow(/row-level security/)
  })

  it('a buyer resolves it once the payments rail exists, and a stranger still does not', async () => {
    // The rail arrives after the bootstrap, as a migration would. This is the
    // branch the to_regclass guard defers, so it must work once it is reached.
    await db.exec('create table public.entitlements(pub_id text, user_id uuid)')
    await db.query('insert into public.entitlements(pub_id,user_id) values($1,$2)', [PUB, BUYER])
    expect(await rowsFor(BUYER, codes[PRICED_TRIP])).toHaveLength(1)
    expect(await rowsFor(STRANGER, codes[PRICED_TRIP])).toEqual([])
  })

  it('keeps both preview RPCs and joining locked on the migrated database', async () => {
    await db.exec('alter table public.published_itineraries add column unpublished_at timestamptz')
    await db.exec(migration)
    await db.exec(migration)

    const code = codes[PRICED_TRIP]
    const uuidRows = (actor: string) => asCaller<{ invite_code: string | null }>(
      'authenticated', actor, 'select invite_code from public.get_invite_trip($1)', [PRICED_TRIP],
    )
    const join = (actor: string) => asCaller(
      'authenticated', actor, 'select public.join_trip($1)', [code],
    )
    await db.query(
      'insert into public.published_itineraries(id,trip_id,creator_id) values($1,$2,$3)',
      ['legacy_publication', PRICED_TRIP, STRANGER],
    )
    await db.query('insert into public.entitlements values($1,$2)', ['legacy_publication', STRANGER])
    await db.query('update public.published_itineraries set premium_price_inr=0 where id=$1', [PUB])
    expect(await rowsFor('', code)).toEqual([])
    expect(await rowsFor(STRANGER, code)).toEqual([])
    expect((await uuidRows(STRANGER)).rows).toEqual([])
    await expect(join(STRANGER)).rejects.toThrow(/Invite is unavailable/)
    expect(await rowsFor(BUYER, code)).toHaveLength(1)
    expect((await uuidRows(BUYER)).rows).toEqual([{ invite_code: null }])
    await join(BUYER)

    await db.query('update public.trips set visibility=$1 where id=$2', ['public', PRICED_TRIP])
    await db.query('delete from public.entitlements where pub_id=$1', ['legacy_publication'])
    expect((await asCaller('authenticated', STRANGER,
      'select id from public.get_public_trip($1)', ['legacy_publication'],
    )).rows).toEqual([])
    expect((await asCaller('authenticated', BUYER,
      'select id from public.get_public_trip($1)', [PUB],
    )).rows).toEqual([{ id: PRICED_TRIP }])
  })

  it('preserves a newer invite projection when the hotfix runs after it', async () => {
    await db.exec('drop function public.get_trip_by_invite_code(text)')
    await db.exec('create type public.trip_invite_preview as (id uuid)')
    await db.exec('create function public.get_trip_by_invite_code(text) returns setof public.trip_invite_preview language sql as $$ select null::uuid where false $$')
    await db.exec(migration)

    const result = await db.query<{ preserves_projection: boolean }>(
      "select prorettype = 'public.trip_invite_preview'::regtype as preserves_projection from pg_proc where oid = 'public.get_trip_by_invite_code(text)'::regprocedure",
    )
    expect(result.rows).toEqual([{ preserves_projection: true }])
  })
})
