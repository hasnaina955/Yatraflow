-- ============================================================================
-- PAYWALL CONTRACT TEST: a locked day never leaves the server (#774, #917)
-- ============================================================================
-- Proves the behaviour of 20261110_paywall_locked_day_boundary.sql by calling
-- the functions as each kind of viewer. Every probe is a DO-block assertion.
-- It raises, and names the broken rule, when a viewer reads too much or too
-- little. A clean run prints exactly one PASS row.
--
-- This file WRITES fixture rows. It runs on the isolated database that
-- tests/public-trip-paywall-db.test.ts builds on PGlite. It refuses a
-- database that holds any publication of its own.
--
-- Every locked field carries the token SECRET774. Every locked coordinate is
-- 34.774774 or 77.774774. A viewer without an entitlement must read neither.
--
-- Covered:
--   1. anon             -- no locked title, name, coordinate, note or link
--   2. non-buyer        -- the same, with a signed-in account
--   3. buyer            -- the full plan
--   4. creator, member  -- the full plan
--   5. unexpected shape -- every one resolves to the locked answer
--   6. unpriced plan    -- every day is readable
--   7. trip-id preview  -- a priced plan never leaves through get_invite_trip
--   8. function shape   -- security definer, pinned search_path, grants
-- ============================================================================

do $$
begin
  if exists (select 1 from public.published_itineraries where id not like 'pub_774_%') then
    raise exception 'this test needs an isolated database: it writes fixture rows';
  end if;
end $$;

delete from public.entitlements where pub_id like 'pub_774_%';
delete from public.published_itineraries where id like 'pub_774_%';
delete from public.trip_members where trip_id::text like '77410000-%';
delete from public.trips where id::text like '77410000-%';

-- The migration forbids a price of 0. Section 9 proves that. Until then the
-- constraint is lifted, so a zero-priced row can prove the defence in depth:
-- the paywall stays shut for it even with no constraint to stop it.
alter table public.published_itineraries
  drop constraint if exists published_itineraries_price_not_zero;

-- Accounts: ...01 creator, ...02 buyer, ...03 non-buyer, ...04 trip member.
insert into public.trips (id, owner_id, name, visibility, invite_code, expenses, fixed_commitments, days) values
  ('77410000-0000-4000-8000-000000000001', '77400000-0000-4000-8000-000000000001',
   'Priced public plan', 'public', 'SECRET774-CODE',
   '[{"id":"e1","label":"SECRET774 expense","amountInr":500,"dayIndex":1}]'::jsonb,
   '[{"id":"f1","label":"SECRET774 commitment","dayIndex":1}]'::jsonb,
   '[
      {"id":"day-a","index":0,"title":"Open day title","stops":[
        {"id":"s1","title":"FREE774 stop","locationName":"Open place","lat":11.111111,"lng":76.111111,
         "category":"food","status":"confirmed","orderInDay":0,"visitMinutes":60,
         "description":"open words","notes":"open note"}]},
      {"id":"day-SECRET774","index":1,"title":"SECRET774 day title","startTime":"06:15",
       "coverImageUrl":"https://example.com/SECRET774.jpg","stops":[
        {"id":"SECRET774-s2","title":"SECRET774 stop","locationName":"SECRET774 place",
         "lat":34.774774,"lng":77.774774,"category":"temple","status":"confirmed","orderInDay":0,
         "visitMinutes":90,"description":"SECRET774 words","notes":"SECRET774 note",
         "sourceUrl":"https://example.com/SECRET774","placeId":"SECRET774","eLoc":"SECRET774",
         "priority":"must-do","openTime":"09:00","closeTime":"17:00"},
        {"id":"s3","title":"SECRET774 hotel","locationName":"SECRET774 stay","lat":34.774774,"lng":77.774774,
         "category":"hotel","status":"confirmed","auto":true,"orderInDay":1,"visitMinutes":0},
        {"id":"s4","title":"SECRET774 rejected","locationName":"SECRET774","lat":34.774774,"lng":77.774774,
         "category":"food","status":"rejected","orderInDay":2,"visitMinutes":30},
        {"id":"s5","title":"SECRET774 odd","locationName":"SECRET774","lat":34.774774,"lng":77.774774,
         "category":"SECRET774 category","status":"maybe","orderInDay":3,"visitMinutes":30}]}
    ]'::jsonb),
  ('77410000-0000-4000-8000-000000000002', '77400000-0000-4000-8000-000000000001',
   'Priced private plan', 'private', 'SECRET774-CODE', '[]'::jsonb, '[]'::jsonb,
   '[{"id":"d0","index":0,"title":"SECRET774 day title","stops":[
      {"id":"p1","title":"SECRET774 stop","locationName":"SECRET774 place","lat":34.774774,"lng":77.774774,
       "category":"nature","status":"confirmed","orderInDay":0,"visitMinutes":45}]}]'::jsonb),
  ('77410000-0000-4000-8000-000000000003', '77400000-0000-4000-8000-000000000001',
   'Unpriced public plan', 'public', null, '[]'::jsonb, '[]'::jsonb,
   '[{"id":"d0","index":0,"title":"Open day title","stops":[
      {"id":"u1","title":"FREE774 stop","locationName":"Open place","lat":11.111111,"lng":76.111111,
       "category":"beach","status":"confirmed","orderInDay":0,"visitMinutes":45}]},
     {"id":"d1","index":1,"title":"Second open day","stops":[
      {"id":"u2","title":"FREE774 second stop","locationName":"Open place","lat":11.222222,"lng":76.222222,
       "category":"food","status":"confirmed","orderInDay":0,"visitMinutes":45}]}]'::jsonb),
  ('77410000-0000-4000-8000-000000000004', '77400000-0000-4000-8000-000000000001',
   'Priced plan with corrupt days', 'public', null, '[]'::jsonb, '[]'::jsonb,
   '{"title":"SECRET774 not an array"}'::jsonb),
  ('77410000-0000-4000-8000-000000000005', '77400000-0000-4000-8000-000000000001',
   'Priced plan with odd shapes', 'public', null, '[]'::jsonb, '[]'::jsonb,
   '[
      "SECRET774 a day that is a string",
      {"id":"o1","index":"0","title":"SECRET774 text index","stops":[
        {"id":"x1","title":"SECRET774 stop","lat":34.774774,"lng":77.774774,"category":"food","status":"confirmed"}]},
      {"id":"o2","index":1.5,"title":"SECRET774 fraction index","stops":{"title":"SECRET774 stops is an object"}},
      {"id":"o3","index":2,"title":"SECRET774 mixed stops","stops":[
        "SECRET774 a stop that is a string", 34.774774,
        {"id":"x2","title":"SECRET774 stop","lat":34.774774,"lng":77.774774,"category":77,"status":"confirmed"}]}
    ]'::jsonb),
  ('77410000-0000-4000-8000-000000000006', '77400000-0000-4000-8000-000000000001',
   'Private plan with no publication', 'private', 'SECRET774-CODE', '[]'::jsonb, '[]'::jsonb,
   '[{"id":"d0","index":0,"title":"Shared by link","stops":[]}]'::jsonb),
  ('77410000-0000-4000-8000-000000000007', '77400000-0000-4000-8000-000000000001',
   'Zero-priced public plan', 'public', null, '[]'::jsonb, '[]'::jsonb,
   '[{"id":"z0","index":0,"title":"SECRET774 zero day","stops":[
      {"id":"z1","title":"SECRET774 zero stop","locationName":"SECRET774 zero place",
       "lat":34.774774,"lng":77.774774,"category":"food","status":"confirmed","orderInDay":0,"visitMinutes":30}]}]'::jsonb);

insert into public.trip_members (trip_id, user_id, role) values
  ('77410000-0000-4000-8000-000000000001', '77400000-0000-4000-8000-000000000001', 'owner'),
  ('77410000-0000-4000-8000-000000000001', '77400000-0000-4000-8000-000000000004', 'viewer');

insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr, free_day_indexes) values
  ('pub_774_priced',  '77410000-0000-4000-8000-000000000001', '77400000-0000-4000-8000-000000000001', 499,  '[0]'::jsonb),
  ('pub_774_private', '77410000-0000-4000-8000-000000000002', '77400000-0000-4000-8000-000000000001', 499,  '[]'::jsonb),
  ('pub_774_free',    '77410000-0000-4000-8000-000000000003', '77400000-0000-4000-8000-000000000001', null, '[0]'::jsonb),
  ('pub_774_corrupt', '77410000-0000-4000-8000-000000000004', '77400000-0000-4000-8000-000000000001', 499,  '[0]'::jsonb),
  -- A scalar where the free-day list belongs. It must free nothing.
  ('pub_774_odd',     '77410000-0000-4000-8000-000000000005', '77400000-0000-4000-8000-000000000001', 499,  '"0"'::jsonb),
  -- A price of 0 is priced, not free (#774). NULL alone means free.
  ('pub_774_zero',    '77410000-0000-4000-8000-000000000007', '77400000-0000-4000-8000-000000000001', 0,    '[]'::jsonb);

insert into public.entitlements (pub_id, user_id) values
  ('pub_774_priced',  '77400000-0000-4000-8000-000000000002'),
  ('pub_774_private', '77400000-0000-4000-8000-000000000002');

-- ================================================================ 1. anon
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare
  v_count int;
  v_row jsonb;
begin
  select count(*) into v_count from public.get_public_trip('pub_774_priced');
  if v_count <> 1 then
    raise exception 'anon must get exactly one row for a live priced plan, got %', v_count;
  end if;
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_priced') t;

  if v_row::text like '%SECRET774%' then
    raise exception 'anon reads a locked title, name, note or link: %', v_row -> 'days';
  end if;
  if v_row::text like '%774774%' then
    raise exception 'anon reads a locked coordinate: %', v_row -> 'days';
  end if;
  if v_row::text like '%06:15%' or v_row::text like '%09:00%' then
    raise exception 'anon reads a locked time';
  end if;

  -- The free day leaves whole, with its real stop and its real coordinate.
  if (v_row -> 'days' -> 0 ->> 'title') is distinct from 'Open day title'
     or (v_row -> 'days' -> 0 -> 'stops' -> 0 ->> 'title') is distinct from 'FREE774 stop'
     or (v_row -> 'days' -> 0 -> 'stops' -> 0 ->> 'lat') is distinct from '11.111111' then
    raise exception 'anon must read the free day in full: %', v_row -> 'days' -> 0;
  end if;

  -- The locked day is exactly the safe shape. Three stops count (the rejected
  -- one does not). Two count by category (the auto anchor does not), and the
  -- unknown category reads as `other`.
  if (v_row -> 'days' -> 1) is distinct from
     '{"id":"locked-day-1","index":1,"locked":true,"stops":[],
       "lockedPreview":{"stopCount":3,"categories":{"temple":1,"other":1}}}'::jsonb then
    raise exception 'the locked day is not the safe shape: %', v_row -> 'days' -> 1;
  end if;
  if jsonb_array_length(v_row -> 'days') <> 2 then
    raise exception 'the day count must not change: %', jsonb_array_length(v_row -> 'days');
  end if;

  -- The money and the invite code follow the same decision.
  if (v_row -> 'expenses') is distinct from '[]'::jsonb
     or (v_row -> 'fixed_commitments') is distinct from '[]'::jsonb then
    raise exception 'anon reads the budget of a priced plan';
  end if;
  if (v_row ->> 'invite_code') is not null then
    raise exception 'anon reads the invite code';
  end if;
end $$;
reset role;

-- ================================================================ 2. non-buyer
set role authenticated;
select set_config('request.jwt.claim.sub', '77400000-0000-4000-8000-000000000003', false);
do $$
declare
  v_row jsonb;
begin
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_priced') t;
  if v_row is null then
    raise exception 'a non-buyer must still get the preview row';
  end if;
  if v_row::text like '%SECRET774%' or v_row::text like '%774774%' then
    raise exception 'a non-buyer reads locked place data: %', v_row -> 'days';
  end if;
  if (v_row -> 'days' -> 1 ->> 'locked') is distinct from 'true'
     or jsonb_array_length(v_row -> 'days' -> 1 -> 'stops') <> 0 then
    raise exception 'a non-buyer must get the locked shape: %', v_row -> 'days' -> 1;
  end if;
end $$;
reset role;

-- ================================================================ 3. buyer
set role authenticated;
select set_config('request.jwt.claim.sub', '77400000-0000-4000-8000-000000000002', false);
do $$
declare
  v_row jsonb;
begin
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_priced') t;
  if v_row is null then
    raise exception 'a buyer must get the plan';
  end if;
  if (v_row -> 'days' -> 1 ->> 'title') is distinct from 'SECRET774 day title'
     or (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'title') is distinct from 'SECRET774 stop'
     or (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'locationName') is distinct from 'SECRET774 place'
     or (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'lat') is distinct from '34.774774'
     or (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'notes') is distinct from 'SECRET774 note' then
    raise exception 'a buyer must read the locked day in full: %', v_row -> 'days' -> 1;
  end if;
  if (v_row -> 'days' -> 1) ? 'locked' then
    raise exception 'a buyer must not get the locked marker';
  end if;
  if jsonb_array_length(v_row -> 'days' -> 1 -> 'stops') <> 4 then
    raise exception 'a buyer must get every stored stop';
  end if;
  if jsonb_array_length(v_row -> 'expenses') <> 1 then
    raise exception 'a buyer must read the budget';
  end if;
  -- The invite code stays withheld from every viewer of the public path.
  if (v_row ->> 'invite_code') is not null then
    raise exception 'a buyer reads the invite code';
  end if;
end $$;
reset role;

-- ================================================================ 4. creator, member
set role authenticated;
select set_config('request.jwt.claim.sub', '77400000-0000-4000-8000-000000000001', false);
do $$
declare
  v_row jsonb;
begin
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_priced') t;
  if (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'title') is distinct from 'SECRET774 stop' then
    raise exception 'the creator must read the full plan';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '77400000-0000-4000-8000-000000000004', false);
do $$
declare
  v_row jsonb;
begin
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_priced') t;
  if (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'title') is distinct from 'SECRET774 stop'
     or (v_row -> 'days' -> 1) ? 'locked' then
    raise exception 'a trip member must read the full plan: a locked copy would replace the cached trip';
  end if;
end $$;
reset role;

-- ================================================================ 5. unexpected shapes
set role anon;
select set_config('request.jwt.claim.sub', '', false);
do $$
declare
  v_row jsonb;
  v_day jsonb;
begin
  -- Days that are not an array give an empty list, and the row still arrives.
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_corrupt') t;
  if v_row is null or (v_row -> 'days') is distinct from '[]'::jsonb then
    raise exception 'corrupt days must read as an empty list: %', v_row -> 'days';
  end if;

  -- A scalar free-day list frees nothing. Odd days and odd stops stay locked.
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_odd') t;
  if v_row is null then
    raise exception 'odd shapes must not take the row down';
  end if;
  if v_row::text like '%SECRET774%' or v_row::text like '%774774%' then
    raise exception 'an unexpected shape leaks place data: %', v_row -> 'days';
  end if;
  -- The string day is dropped. The three object days stay, all locked.
  if jsonb_array_length(v_row -> 'days') <> 3 then
    raise exception 'expected three locked days, got %', v_row -> 'days';
  end if;
  for v_day in select value from jsonb_array_elements(v_row -> 'days') loop
    if (v_day ->> 'locked') is distinct from 'true' or (v_day -> 'stops') is distinct from '[]'::jsonb then
      raise exception 'an odd day is not locked: %', v_day;
    end if;
  end loop;
  -- A text index and a fraction index are not an index: the position stands in.
  if (v_row -> 'days' -> 0 ->> 'index') is distinct from '1'
     or (v_row -> 'days' -> 1 ->> 'index') is distinct from '2' then
    raise exception 'an unreadable index must fall back to the position: %', v_row -> 'days';
  end if;
  -- A stop list that is an object counts as zero stops.
  if (v_row -> 'days' -> 1 -> 'lockedPreview') is distinct from '{"stopCount":0,"categories":{}}'::jsonb then
    raise exception 'a stop list that is not an array must count zero: %', v_row -> 'days' -> 1;
  end if;
  -- Only the object stop counts, and a category that is not text reads `other`.
  if (v_row -> 'days' -> 2 -> 'lockedPreview') is distinct from '{"stopCount":1,"categories":{"other":1}}'::jsonb then
    raise exception 'only object stops count: %', v_row -> 'days' -> 2;
  end if;

  -- An unknown publication, and a priced plan on a private trip, give nothing.
  if exists (select 1 from public.get_public_trip('pub_774_missing')) then
    raise exception 'an unknown publication must give no row';
  end if;
  if exists (select 1 from public.get_public_trip('pub_774_private')) then
    raise exception 'a private trip must give no row on the public path';
  end if;
end $$;

-- ================================================================ 6. unpriced plan
do $$
declare
  v_row jsonb;
begin
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_free') t;
  if (v_row -> 'days' -> 1 -> 'stops' -> 0 ->> 'title') is distinct from 'FREE774 second stop'
     or (v_row -> 'days' -> 1) ? 'locked' then
    raise exception 'an unpriced plan must be readable in full: %', v_row -> 'days';
  end if;
end $$;

-- ================================================================ 7. trip-id preview
do $$
declare
  v_row jsonb;
begin
  if exists (select 1 from public.get_invite_trip('77410000-0000-4000-8000-000000000001')) then
    raise exception 'anon reads a priced public plan through get_invite_trip';
  end if;
  if exists (select 1 from public.get_invite_trip('77410000-0000-4000-8000-000000000002')) then
    raise exception 'anon reads a priced PRIVATE plan through get_invite_trip';
  end if;
  -- A price of 0 is priced. The page locks it, so this path must not open it.
  if exists (select 1 from public.get_invite_trip('77410000-0000-4000-8000-000000000007')) then
    raise exception 'anon reads a zero-priced plan through get_invite_trip';
  end if;
  -- The same plan reads as locked through the public page, with no place data.
  select to_jsonb(t) into v_row from public.get_public_trip('pub_774_zero') t;
  if (v_row -> 'days' -> 0 ->> 'locked') is distinct from 'true'
     or (v_row -> 'days')::text like '%SECRET774%' then
    raise exception 'a zero-priced plan must show only locked days: %', v_row -> 'days';
  end if;
  -- A private trip with no priced publication keeps its preview by trip id.
  if not exists (select 1 from public.get_invite_trip('77410000-0000-4000-8000-000000000006')) then
    raise exception 'a plain private trip must keep its preview by trip id';
  end if;
  if exists (
    select 1 from public.get_invite_trip('77410000-0000-4000-8000-000000000006') t
    where t.invite_code is not null
  ) then
    raise exception 'the trip-id preview carries the invite code';
  end if;
end $$;
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '77400000-0000-4000-8000-000000000003', false);
do $$
begin
  if exists (select 1 from public.get_invite_trip('77410000-0000-4000-8000-000000000002')) then
    raise exception 'a non-buyer reads a priced private plan through get_invite_trip';
  end if;
end $$;
select set_config('request.jwt.claim.sub', '77400000-0000-4000-8000-000000000002', false);
do $$
begin
  if not exists (select 1 from public.get_invite_trip('77410000-0000-4000-8000-000000000002')) then
    raise exception 'a buyer must keep the trip-id preview of a plan they own';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);

-- ================================================================ 8. function shape
do $$
declare
  fn text;
begin
  foreach fn in array array['public.get_public_trip(text)', 'public.get_invite_trip(uuid)'] loop
    if not exists (
      select 1 from pg_proc p
      where p.oid = fn::regprocedure
        and p.prosecdef
        and exists (select 1 from unnest(p.proconfig) c where c = 'search_path=public')
    ) then
      raise exception '% must be security definer with a pinned search_path', fn;
    end if;
    if not has_function_privilege('anon', fn, 'execute')
       or not has_function_privilege('authenticated', fn, 'execute') then
      raise exception '% must stay callable by anon and authenticated', fn;
    end if;
    -- No grant to PUBLIC: every grantee is named. A null ACL is the default
    -- ACL, and the default grants EXECUTE to PUBLIC.
    if exists (select 1 from pg_proc p where p.oid = fn::regprocedure and p.proacl is null)
       or exists (
        select 1 from pg_proc p, aclexplode(p.proacl) a
        where p.oid = fn::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'
      ) then
      raise exception '% is granted to PUBLIC', fn;
    end if;
  end loop;
end $$;

-- ================================================================ 9. price of zero
-- Put the constraint back as the migration writes it. The zero row must go
-- first, because the constraint checks every row.
delete from public.published_itineraries where id = 'pub_774_zero';
alter table public.published_itineraries
  add constraint published_itineraries_price_not_zero
  check (premium_price_inr is null or premium_price_inr >= 1);
do $$
begin
  begin
    insert into public.published_itineraries (id, trip_id, creator_id, premium_price_inr, free_day_indexes)
    values ('pub_774_zero', '77410000-0000-4000-8000-000000000007', '77400000-0000-4000-8000-000000000001', 0, '[]'::jsonb);
  exception when check_violation then
    return;
  end;
  raise exception 'a publication was saved with price 0';
end $$;

-- The fixture rows stay. The harness reads them again for the client mapping,
-- and the first block of this file removes them before the next run.
select 'PASS: anon and non-buyer read no locked place data; buyer, creator and member read the full plan' as result;
