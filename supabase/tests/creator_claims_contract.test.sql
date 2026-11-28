-- Run on a local or staging database with the creator-claims migration.
-- All fixture writes roll back. Never use an existing account or claim.
begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-4111-8111-111111111101', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin-claims@synthetic.invalid', 'x', now(), '{"role":"masteradmin"}', '{"name":"Admin"}', now(), now()),
  ('11111111-1111-4111-8111-111111111102', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unclaimed+11111111-1111-4111-8111-111111111102@internal.yatraflow.invalid', 'x', null, '{"is_unclaimed_shadow":true}', '{"name":"Unclaimed creator"}', now(), now()),
  ('11111111-1111-4111-8111-111111111103', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unclaimed+11111111-1111-4111-8111-111111111103@internal.yatraflow.invalid', 'x', null, '{"is_unclaimed_shadow":true}', '{"name":"Unclaimed creator"}', now(), now()),
  ('11111111-1111-4111-8111-111111111104', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unclaimed+11111111-1111-4111-8111-111111111104@internal.yatraflow.invalid', 'x', null, '{"is_unclaimed_shadow":true}', '{"name":"Unclaimed creator"}', now(), now()),
  ('11111111-1111-4111-8111-111111111105', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'creator-claims@synthetic.invalid', 'x', now(), '{}', '{"name":"Rohan Mehta"}', now(), now()),
  ('11111111-1111-4111-8111-111111111106', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reader-claims@synthetic.invalid', 'x', now(), '{}', '{"name":"Traveller"}', now(), now()),
  ('11111111-1111-4111-8111-111111111107', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'disabled-claims@synthetic.invalid', 'x', now(), '{}', '{"name":"Disabled"}', now(), now()),
  ('11111111-1111-4111-8111-111111111108', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unclaimed+11111111-1111-4111-8111-111111111108@internal.yatraflow.invalid', 'x', null, '{"is_unclaimed_shadow":true}', '{"name":"Unclaimed creator"}', now(), now());

update public.profiles set home_city = 'Mumbai', social_links = '{}'::jsonb
  where id = '11111111-1111-4111-8111-111111111105';
update public.profiles set is_disabled = true where id = '11111111-1111-4111-8111-111111111107';

do $$
begin
  if exists (select 1 from public.profile_cards where id in (
    '11111111-1111-4111-8111-111111111102','11111111-1111-4111-8111-111111111103',
    '11111111-1111-4111-8111-111111111104','11111111-1111-4111-8111-111111111108')) then
    raise exception 'Shadow cards must not enter the public projection';
  end if;
  if has_function_privilege('anon','public.get_creator_claim_preview(text)','execute')
    or has_function_privilege('authenticated','public.redeem_creator_claim(text,uuid)','execute')
    or has_table_privilege('anon','public.creator_profile_claims','select')
    or has_table_privilege('authenticated','public.creator_profile_claims','update') then
    raise exception 'Claim permissions mismatch';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111101', true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111101","role":"authenticated","app_metadata":{"role":"masteradmin"}}',true);
set local role authenticated;
do $$
begin
  begin
    perform public.admin_create_creator_claim(
      '11111111-1111-4111-8111-111111111102', repeat('e',64), 'Invalid Seed',
      p_trips => '[{"name":"Invalid trip","destinations":[],"days":[null]}]');
    raise exception 'Malformed days were accepted';
  exception when sqlstate '22023' then
    if sqlerrm <> 'invalid seed trip' then raise; end if;
  end;
end $$;
select * from public.admin_create_creator_claim(
  '11111111-1111-4111-8111-111111111102',repeat('a',64),'Creator Seed',
  'https://example.invalid/avatar.png','Delhi','Travel planner','{"instagram":"https://instagram.com/example"}',
  'Outreach note',30,'[{"name":"Spiti trip","destinations":["Kaza"],"days":[{"index":0,"title":"Valley","stops":[{"title":"Temple","arrivalTime":"09:00","notes":"Private notes"}]}],"start_location":"Delhi","start_location_coords":{"lat":28.6,"lng":77.2},"start_date":"2027-01-01","end_date":"2027-01-02","transport_mode":"flight","budget_per_person_inr":1550,"driver_count":2,"flights":[{"dayIndex":0}],"expenses":[{"memo":"Private expense"}],"fixed_commitments":[],"visibility":"public"}]');
select * from public.admin_create_creator_claim(
  '11111111-1111-4111-8111-111111111103',repeat('b',64),'Expired Seed',p_expires_days => 1,
  p_trips => '[{"name":"Goa trip","destinations":["Goa"],"days":[]}]');
select * from public.admin_create_creator_claim(
  '11111111-1111-4111-8111-111111111104',repeat('c',64),'Publication Seed',
  p_trips => '[{"name":"Guide trip","destinations":["Leh"],"days":[{"index":0,"stops":[]},{"index":1,"stops":[]}]}]');
select * from public.admin_create_creator_claim(
  '11111111-1111-4111-8111-111111111108',repeat('d',64),'Revoke Seed',
  p_trips => '[{"name":"Revoke trip","destinations":[],"days":[]}]');
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims','{}',true);

update public.creator_profile_claims set expires_at = now() - interval '1 minute' where token_hash = repeat('b',64);

do $$
declare
  v_trip uuid;
begin
  select trip_ids[1] into strict v_trip from public.creator_profile_claims where token_hash = repeat('a',64);
  if not exists(select 1 from public.trips t where t.id = v_trip
    and t.visibility = 'private' and t.creation_kind = 'imported'
    and t.owner_id = '11111111-1111-4111-8111-111111111102'
    and t.start_location = 'Delhi' and t.transport_mode = 'flight' and t.budget_per_person_inr = 1550
    and t.start_location_coords ->> 'lat' = '28.6' and t.flights is not null and t.driver_count = 2) then
    raise exception 'Seed did not keep full trip contents and private origin';
  end if;
  if not exists(select 1 from public.trip_member_access a join public.trip_members m using(trip_id,user_id)
    where a.trip_id = v_trip and a.user_id = '11111111-1111-4111-8111-111111111102'
    and a.state = 'active' and a.role = 'owner' and m.role = 'owner') then
    raise exception 'Seed did not create owner membership';
  end if;
  if (select count(*) from public.admin_audit where action = 'creator_claim.create'
    and actor_id = '11111111-1111-4111-8111-111111111101') <> 4 then
    raise exception 'Admin seed audit mismatch';
  end if;
end $$;

select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111106',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111106","role":"authenticated"}',true);
set local role authenticated;
do $$
begin
  if exists(select 1 from public.creator_profile_claims) then raise exception 'Claim records are private'; end if;
  if exists(select 1 from public.trips where owner_id = '11111111-1111-4111-8111-111111111102') then
    raise exception 'Private seed trip is visible';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $$
declare
  v_preview jsonb;
  v_fail text;
begin
  begin
    perform public.redeem_creator_claim(repeat('a',64),'11111111-1111-4111-8111-111111111101');
  exception when others then v_fail := sqlerrm; end;
  if v_fail is distinct from 'invalid_claimer' then raise exception 'Creating admin claim mismatch: %',v_fail; end if;
  v_fail := null;
  v_preview := public.get_creator_claim_preview(repeat('a',64));
  if v_preview ->> 'status' <> 'unclaimed'
    or v_preview #>> '{creator,name}' <> 'Creator Seed'
    or v_preview #>> '{trips,0,days,0,stops,0,title}' <> 'Temple'
    or v_preview::text like '%Private notes%' or v_preview::text like '%Private expense%'
    or v_preview::text like '%Outreach note%' then
    raise exception 'Claim preview projection mismatch';
  end if;
  if public.get_creator_claim_preview(repeat('b',64)) <> '{"found":true,"status":"expired"}'::jsonb
    or public.get_creator_claim_preview(repeat('f',64)) <> '{"found":false,"status":"invalid"}'::jsonb then
    raise exception 'Inactive preview mismatch';
  end if;
  begin
    perform public.redeem_creator_claim(repeat('b',64),'11111111-1111-4111-8111-111111111105');
  exception when others then v_fail := sqlerrm; end;
  if v_fail is distinct from 'claim_expired' then raise exception 'Expired claim mismatch: %',v_fail; end if;
  v_fail := null;
  begin
    perform public.redeem_creator_claim(repeat('a',64),'11111111-1111-4111-8111-111111111107');
  exception when others then v_fail := sqlerrm; end;
  if v_fail is distinct from 'claimer_ineligible' then raise exception 'Disabled claim mismatch: %',v_fail; end if;
end $$;
reset role;

-- A free unpublished guide still has a publication link. It must not move.
insert into public.published_itineraries(id,trip_id,creator_id,title,premium_price_inr,unpublished_at,duration_days,free_day_indexes)
select 'claim-contract-guide',trip_ids[1],shadow_profile_id,'Synthetic guide',null,1,2,'[0]'::jsonb
from public.creator_profile_claims where token_hash = repeat('c',64);

set local role service_role;
do $$
declare
  v_fail text;
begin
  begin
    perform public.redeem_creator_claim(repeat('c',64),'11111111-1111-4111-8111-111111111105');
  exception when others then v_fail := sqlerrm; end;
  if v_fail is null or v_fail not like 'paid_publication_requires_manual_review:%' then
    raise exception 'Publication guard mismatch: %',v_fail;
  end if;
end $$;
reset role;
update public.published_itineraries set premium_price_inr = 499 where id = 'claim-contract-guide';
set local role service_role;
do $$
declare
  v_fail text;
  v_result jsonb;
begin
  begin
    perform public.redeem_creator_claim(repeat('c',64),'11111111-1111-4111-8111-111111111105');
  exception when others then v_fail := sqlerrm; end;
  if v_fail is null or v_fail not like 'paid_publication_requires_manual_review:%' then
    raise exception 'Priced guide guard mismatch: %',v_fail;
  end if;
  v_result := public.redeem_creator_claim(repeat('a',64),'11111111-1111-4111-8111-111111111105');
  if v_result ->> 'claimer_id' <> '11111111-1111-4111-8111-111111111105'
    or jsonb_array_length(v_result -> 'moved_trip_ids') <> 1 then raise exception 'Redemption result mismatch'; end if;
  v_fail := null;
  begin
    perform public.redeem_creator_claim(repeat('a',64),'11111111-1111-4111-8111-111111111106');
  exception when others then v_fail := sqlerrm; end;
  if v_fail is distinct from 'claim_already_redeemed' then raise exception 'Repeated claim mismatch: %',v_fail; end if;
  if public.get_creator_claim_preview(repeat('a',64)) <> '{"found":true,"status":"claimed"}'::jsonb then
    raise exception 'Claimed preview mismatch';
  end if;
end $$;
reset role;

do $$
declare
  v_trip uuid;
begin
  select trip_ids[1] into strict v_trip from public.creator_profile_claims
    where token_hash = repeat('a',64) and status = 'claimed' and shadow_profile_id is null;
  if exists(select 1 from auth.users where id = '11111111-1111-4111-8111-111111111102')
    or not exists(select 1 from public.trips where id = v_trip and owner_id = '11111111-1111-4111-8111-111111111105') then
    raise exception 'Redemption cleanup or transfer mismatch';
  end if;
  if not exists(select 1 from public.trip_member_access a join public.trip_members m using(trip_id,user_id)
    where a.trip_id = v_trip and a.user_id = '11111111-1111-4111-8111-111111111105'
    and a.owner_id = a.user_id and a.state = 'active' and a.role = 'owner' and m.role = 'owner')
    or exists(select 1 from public.trip_member_access where user_id = '11111111-1111-4111-8111-111111111102') then
    raise exception 'Redemption access ledger mismatch';
  end if;
  if not exists(select 1 from public.profiles p where p.id = '11111111-1111-4111-8111-111111111105'
    and p.name = 'Rohan Mehta' and p.home_city = 'Mumbai' and p.is_creator
    and p.avatar_url = 'https://example.invalid/avatar.png' and p.creator_bio = 'Travel planner'
    and p.social_links ->> 'instagram' = 'https://instagram.com/example') then
    raise exception 'Profile merge mismatch';
  end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111101',true);
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111101","role":"authenticated","app_metadata":{"role":"masteradmin"}}',true);
set local role authenticated;
select public.admin_revoke_creator_claim(id) from public.creator_profile_claims where token_hash = repeat('d',64);
reset role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$
begin
  if exists(select 1 from auth.users where id = '11111111-1111-4111-8111-111111111108')
    or exists(select 1 from public.trips where owner_id = '11111111-1111-4111-8111-111111111108')
    or public.get_creator_claim_preview(repeat('d',64)) <> '{"found":true,"status":"revoked"}'::jsonb then
    raise exception 'Revocation cleanup or history mismatch';
  end if;
end $$;
rollback;
