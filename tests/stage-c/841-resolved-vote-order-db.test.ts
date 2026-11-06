import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSql = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const owner = '10000000-0000-4000-8000-000000000001'
const editor = '10000000-0000-4000-8000-000000000002'
const viewer = '10000000-0000-4000-8000-000000000003'
const command = (id: number) => `50000000-0000-4000-8000-${String(id).padStart(12, '0')}`
const trip = (id: number) => `20000000-0000-4000-8000-${String(id).padStart(12, '0')}`
const decision = (id: number) => `40000000-0000-4000-8000-${String(id).padStart(12, '0')}`

describe('stage-c/841 atomic ordered resolved-vote insertion', () => {
  let db: PGlite
  let sequence = 0

  const actor = async (id: string) => {
    await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`)
  }
  const call = async (commandId: string, payload: unknown, tripId: string) => {
    const result = await db.query<{ receipt: Record<string, unknown> }>(
      'select public.submit_collab_command($1,$2,$3::jsonb) as receipt',
      [commandId, tripId, JSON.stringify(payload)],
    )
    return result.rows[0].receipt
  }
  const state = async (tripId: string) => {
    await db.exec('reset role')
    const result = await db.query<{ days: Array<{ id: string; index: number; stops: Array<Record<string, unknown>> }>; write_version: number }>(
      'select days, write_version from public.trips where id=$1', [tripId],
    )
    const decisionResult = await db.query<{ status: string; resolved_option_id: string | null; resolved_stop_id: string | null; options: unknown; votes_by_user_id: unknown }>(
      'select status, resolved_option_id, resolved_stop_id, options, votes_by_user_id from public.decisions where trip_id=$1', [tripId],
    )
    const ledger = await db.query<{ count: number }>('select count(*)::int as count from public.collab_commands')
    const activity = await db.query<{ count: number }>('select count(*)::int as count from public.activity')
    await actor(editor)
    return { trip: result.rows[0], decision: decisionResult.rows[0], ledger: ledger.rows[0].count, activity: activity.rows[0].count }
  }
  const fresh = async (options: { days: unknown; place: unknown; votes?: unknown }) => {
    sequence += 1
    const tripId = trip(sequence)
    const decisionId = decision(sequence)
    await db.exec('reset role')
    await db.query('insert into public.trips(id,owner_id,days) values($1,$2,$3::jsonb)', [tripId, owner, JSON.stringify(options.days)])
    await db.query(`insert into public.trip_members(trip_id,user_id,role) values($1,$2,'owner'),($1,$3,'editor'),($1,$4,'viewer')`, [tripId, owner, editor, viewer])
    await db.query('insert into public.decisions(id,trip_id,question,options,votes_by_user_id,comments,status,raised_by) values($1,$2,$3,$4::jsonb,$5::jsonb,\'[]\',\'open\',$6)',
      [decisionId, tripId, 'Pick a lunch stop', JSON.stringify([
        { id: 'slot:lunch:winner', label: 'Winner', place: options.place },
        { id: 'slot:lunch:other', label: 'Other' },
      ]), JSON.stringify(options.votes ?? { [editor]: 'slot:lunch:other' }), owner])
    await actor(editor)
    return { tripId, decisionId }
  }
  const winner = (over: Record<string, unknown> = {}) => ({
    title: 'Cafe', category: 'food', locationName: 'Cafe', lat: 12.91, lng: 77.61,
    visitMinutes: 45, dayId: 'day-a', dayIndex: 0, ...over,
  })
  const days = (stops: unknown[] = []) => [
    { id: 'day-a', index: 0, title: 'First day', stops },
    { id: 'day-b', index: 4, title: 'Second day', stops: [] },
  ]
  const resolveCommand = (decisionId: string, extra: Record<string, unknown> = {}) => ({
    type: 'decision.resolve', decisionId, optionId: 'slot:lunch:winner', expectedRevision: 7, ...extra,
  })

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create table public.profiles(id uuid primary key);
      create table public.trips(id uuid primary key, owner_id uuid not null, days jsonb not null default '[]', write_version bigint not null default 7, deleted_at timestamptz);
      create table public.trip_members(trip_id uuid not null references public.trips(id), user_id uuid not null references public.profiles(id), role text not null, primary key(trip_id,user_id));
      create table public.suggestions(id uuid primary key, trip_id uuid not null, day_index integer not null default 0, day_id text, place jsonb, accepted_stop_id text, proposed_by uuid not null, title text not null default '', category text, location_name text, lat double precision, lng double precision, description text, visit_minutes integer not null default 60, estimated_entry_fee_inr integer not null default 0, estimated_transport_inr integer not null default 0, votes jsonb not null default '[]', comments jsonb not null default '[]', status text not null default 'open', created_at bigint not null default 1);
      create table public.decisions(id uuid primary key, trip_id uuid not null, question text not null default '', context text, options jsonb not null default '[]', votes_by_user_id jsonb not null default '{}', comments jsonb not null default '[]', status text not null default 'open', resolved_option_id text, resolved_stop_id text, raised_by uuid not null, created_at bigint not null default 1, resolved_at bigint);
      create table public.activity(id uuid primary key, trip_id uuid not null, actor_id uuid not null, verb text not null, target text, at bigint not null default 1);
      create table public.notifications(id uuid primary key, user_id uuid not null, trip_id uuid, text text not null, read boolean not null default false, at bigint not null default 1);
      create table public.collab_commands(command_id uuid primary key, trip_id uuid not null, actor_id uuid not null, command_hash text not null, receipt jsonb not null, created_at timestamptz not null default now());
      create function public.advance_trip_write_version() returns trigger language plpgsql as $$
        begin new.write_version:=old.write_version+1; return new; end
      $$;
      create trigger trips_advance_write_version before update on public.trips for each row execute function public.advance_trip_write_version();
      create function public.is_disabled() returns boolean language sql stable as $$ select false $$;
      create function public.is_admin() returns boolean language sql stable as $$ select false $$;
      create function public.is_editor(p_trip uuid) returns boolean language sql stable security definer set search_path=public as $$
        select exists(select 1 from public.trip_members where trip_id=p_trip and user_id=auth.uid() and role in ('owner','editor'))
      $$;
      create function public.guard_collab_contribution_columns() returns trigger language plpgsql set search_path='' as $$
      begin
        if current_user in ('postgres','service_role') then return new; end if;
        if tg_table_name='suggestions' and (to_jsonb(new)->'votes' is distinct from to_jsonb(old)->'votes' or to_jsonb(new)->'comments' is distinct from to_jsonb(old)->'comments') then raise exception 'use submit_collab_command' using errcode='42501'; end if;
        if tg_table_name='decisions' and (to_jsonb(new)->'votes_by_user_id' is distinct from to_jsonb(old)->'votes_by_user_id' or to_jsonb(new)->'comments' is distinct from to_jsonb(old)->'comments') then raise exception 'use submit_collab_command' using errcode='42501'; end if;
        return new;
      end $$;
      create trigger suggestions_guard_contributions before update on public.suggestions for each row execute function public.guard_collab_contribution_columns();
      create trigger decisions_guard_contributions before update on public.decisions for each row execute function public.guard_collab_contribution_columns();
      insert into public.profiles values ('${owner}'),('${editor}'),('${viewer}');
      grant usage on schema public, auth to authenticated;
      grant select,insert,update,delete on all tables in schema public to authenticated;
      grant execute on all functions in schema public to authenticated;
    `)
    await db.exec(readSql('supabase/migrations/20261025a_collab_transitions.sql'))
    await db.exec(readSql('supabase/migrations/20261025c_place_exposure.sql'))
    await db.exec(readSql('supabase/migrations/20261026a_resolved_vote_order.sql'))
    await actor(editor)
  }, 30_000)

  afterAll(async () => db?.close())

  it('inserts before the validated anchor in one transaction and preserves ballots and option ids', async () => {
    const { tripId, decisionId } = await fresh({ days: days([
      { id: 'st-start', orderInDay: 1, title: 'Start', status: 'confirmed' },
      { id: 'st-stay', orderInDay: 2, title: 'Night stay', status: 'confirmed' },
    ]), place: winner() })
    const before = await state(tripId)
    const receipt = await call(command(1), resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: 'st-stay' } }), tripId)
    expect(receipt).toMatchObject({ status: 'applied', placementStatus: 'applied', winnerId: 'slot:lunch:winner', stopId: expect.any(String) })
    const after = await state(tripId)
    expect(after.trip.days[0].stops.map(stop => stop.id)).toEqual(['st-start', receipt.stopId, 'st-stay'])
    expect(after.trip.days[0].stops.map(stop => stop.orderInDay)).toEqual([1, 2, 3])
    expect(after.trip.days[1].stops).toEqual([])
    expect(after.trip.write_version).toBe(before.trip.write_version + 1)
    expect(after.decision).toMatchObject({ status: 'resolved', resolved_option_id: 'slot:lunch:winner', resolved_stop_id: receipt.stopId })
    expect(after.decision.options).toEqual(before.decision.options)
    expect(after.decision.votes_by_user_id).toEqual(before.decision.votes_by_user_id)
    expect(after.ledger).toBe(before.ledger + 1)
    expect(after.activity).toBe(before.activity + 1)
  })

  it('appends when the explicit anchor is null', async () => {
    const { tripId, decisionId } = await fresh({ days: days([
      { id: 'st-start', orderInDay: 1, title: 'Start', status: 'confirmed' },
    ]), place: winner() })
    const receipt = await call(command(2), resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: null } }), tripId)
    expect(receipt).toMatchObject({ status: 'applied', placementStatus: 'applied' })
    expect((await state(tripId)).trip.days[0].stops.map(stop => stop.id)).toEqual(['st-start', receipt.stopId])
  })

  it('keeps legacy absent requests on the append path', async () => {
    const { tripId, decisionId } = await fresh({ days: days([
      { id: 'st-start', orderInDay: 1, title: 'Start', status: 'confirmed' },
    ]), place: winner() })
    const receipt = await call(command(3), resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0 }), tripId)
    expect(receipt).toMatchObject({ status: 'applied', placementStatus: 'applied' })
    expect((await state(tripId)).trip.days[0].stops.map(stop => stop.id)).toEqual(['st-start', receipt.stopId])
  })

  it('stamps a legacy resolved vote past the highest persisted orderInDay', async () => {
    const { tripId, decisionId } = await fresh({ days: days([
      { id: 'st-low', orderInDay: 1, title: 'Low', status: 'confirmed' },
      { id: 'st-gap', orderInDay: 7, title: 'Gappy tail', status: 'confirmed' },
    ]), place: winner() })
    const before = await state(tripId)
    const payload = resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0 })
    const receipt = await call(command(30), payload, tripId)
    expect(receipt).toMatchObject({
      status: 'applied', tripRevision: 8, placementStatus: 'applied',
      winnerId: 'slot:lunch:winner', stopId: expect.any(String),
    })
    const after = await state(tripId)
    const stops = after.trip.days[0].stops
    expect(stops.filter(stop => stop.id !== receipt.stopId).map(stop => stop.orderInDay)).toEqual([1, 7])
    expect(stops.find(stop => stop.id === receipt.stopId)?.orderInDay).toBe(8)
    expect([...stops].sort((a, b) => (a.orderInDay as number) - (b.orderInDay as number)).map(stop => stop.id))
      .toEqual(['st-low', 'st-gap', receipt.stopId])
    expect(after.trip.write_version).toBe(before.trip.write_version + 1)
    expect(after.trip.days[1].stops).toEqual([])
    expect(after.decision).toMatchObject({
      status: 'resolved', resolved_option_id: 'slot:lunch:winner', resolved_stop_id: receipt.stopId,
    })
    expect(after.decision.options).toEqual(before.decision.options)
    expect(after.decision.votes_by_user_id).toEqual(before.decision.votes_by_user_id)
    expect(after.ledger).toBe(before.ledger + 1)
    expect(after.activity).toBe(before.activity + 1)
    const retry = await call(command(30), payload, tripId)
    expect(retry).toMatchObject({ status: 'alreadyApplied', winnerId: 'slot:lunch:winner', stopId: receipt.stopId })
    expect(await state(tripId)).toEqual(after)
  })

  it('replays the same command id without a second stop or write', async () => {
    const { tripId, decisionId } = await fresh({ days: days([]), place: winner() })
    const payload = resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: null } })
    const first = await call(command(4), payload, tripId)
    const afterFirst = await state(tripId)
    const retry = await call(command(4), payload, tripId)
    expect(retry).toMatchObject({ status: 'alreadyApplied', winnerId: 'slot:lunch:winner', stopId: first.stopId })
    expect(await state(tripId)).toEqual(afterFirst)
  })

  it('refuses a stale expected revision without partial mutations', async () => {
    const { tripId, decisionId } = await fresh({ days: days([]), place: winner() })
    const before = await state(tripId)
    const receipt = await call(command(5), resolveCommand(decisionId, { expectedRevision: 6, dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: null } }), tripId)
    expect(receipt).toMatchObject({ status: 'conflict', tripRevision: 7 })
    expect(await state(tripId)).toEqual(before)
  })

  it('refuses a removed or wrong-day anchor without partial mutations', async () => {
    for (const [index, anchor] of ['st-removed', 'st-other-day'].entries()) {
      const { tripId, decisionId } = await fresh({ days: [
        { id: 'day-a', index: 0, title: 'First day', stops: [] },
        { id: 'day-b', index: 4, title: 'Second day', stops: [{ id: 'st-other-day', orderInDay: 1, title: 'Other day', status: 'confirmed' }] },
      ], place: winner() })
      const before = await state(tripId)
      const receipt = await call(command(6 + index), resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0,
        orderedPlacement: { dayId: 'day-a', beforeStopId: anchor } }), tripId)
      expect(receipt).toMatchObject({ status: 'invalid', tripRevision: 7 })
      expect(await state(tripId)).toEqual(before)
    }
  })

  it('refuses a removed or wrong day without partial mutations', async () => {
    for (const [index, dayId] of ['day-removed', 'day-b'].entries()) {
      const { tripId, decisionId } = await fresh({ days: days([]), place: winner() })
      const before = await state(tripId)
      const receipt = await call(command(8 + index), resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0,
        orderedPlacement: { dayId, beforeStopId: null } }), tripId)
      expect(receipt).toMatchObject({ status: 'invalid', tripRevision: 7 })
      expect(await state(tripId)).toEqual(before)
    }
  })

  it('refuses malformed ordered requests and conflicting day evidence', async () => {
    const cases: Array<Record<string, unknown>> = [
      { orderedPlacement: { dayId: 'day-a' } },
      { orderedPlacement: { dayId: 'day-a', beforeStopId: 1 } },
      { orderedPlacement: { dayId: 'day-a', beforeStopId: null, extra: true } },
      { orderedPlacement: { dayId: '', beforeStopId: null } },
      { dayId: 'day-b', dayIndex: 0, orderedPlacement: { dayId: 'day-a', beforeStopId: null } },
    ]
    for (const [index, extra] of cases.entries()) {
      const { tripId, decisionId } = await fresh({ days: days([]), place: winner() })
      const before = await state(tripId)
      const receipt = await call(command(10 + index), resolveCommand(decisionId, extra), tripId)
      expect(receipt).toMatchObject({ status: 'invalid' })
      expect(await state(tripId)).toEqual(before)
    }
  })

  it('refuses viewers and keeps anon from executing the RPC', async () => {
    const { tripId, decisionId } = await fresh({ days: days([]), place: winner() })
    const before = await state(tripId)
    await actor(viewer)
    expect(await call(command(20), resolveCommand(decisionId, { dayId: 'day-a', dayIndex: 0,
      orderedPlacement: { dayId: 'day-a', beforeStopId: null } }), tripId)).toMatchObject({ status: 'forbidden' })
    await actor(editor)
    await db.exec('reset role')
    const grants = await db.query<{ anon: boolean; authenticated: boolean }>(`
      select has_function_privilege('anon','public.submit_collab_command(text,text,jsonb)','EXECUTE') as anon,
        has_function_privilege('authenticated','public.submit_collab_command(text,text,jsonb)','EXECUTE') as authenticated`)
    expect(grants.rows[0]).toEqual({ anon: false, authenticated: true })
    await actor(editor)
    expect(await state(tripId)).toEqual(before)
  })
})
