-- Private, single-use creator handoffs.
begin;

-- A schema-only install must also be able to save the full imported trip.
alter table public.trips add column if not exists flights jsonb;

create table if not exists public.creator_profile_claims (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  shadow_profile_id uuid unique references public.profiles(id) on delete set null,
  trip_ids uuid[] not null check (cardinality(trip_ids) > 0),
  target_name text not null,
  target_avatar_url text,
  target_home_city text,
  target_bio text,
  target_social_links jsonb,
  outreach_note text,
  status text not null default 'unclaimed'
    check (status in ('unclaimed', 'claimed', 'revoked', 'expired')),
  created_by uuid references public.profiles(id) on delete set null,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_creator_profile_claims_status_expires
  on public.creator_profile_claims (status, expires_at);

alter table public.creator_profile_claims enable row level security;
drop policy if exists "creator claims admin read" on public.creator_profile_claims;
create policy "creator claims admin read" on public.creator_profile_claims
  for select to authenticated using (public.is_admin() and not public.is_disabled());
revoke all on public.creator_profile_claims from public, anon, authenticated, service_role;
grant select on public.creator_profile_claims to authenticated, service_role;

-- Only an Auth account with trusted internal metadata and the reserved email
-- format is a shadow. An ordinary account must never be used for a handoff.
create or replace function public.is_creator_claim_shadow(p_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and u.raw_app_meta_data -> 'is_unclaimed_shadow' = 'true'::jsonb
      and u.email ~ '^unclaimed\+[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}@internal\.yatraflow\.invalid$'
  )
$$;
revoke all on function public.is_creator_claim_shadow(uuid) from public, anon, authenticated, service_role;

-- The existing profile card projection includes non-creators. Stop shadow
-- cards before writes reach the projection, including its backfill.
create or replace function public.hide_creator_claim_shadow_card()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.is_creator_claim_shadow(new.id) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.hide_creator_claim_shadow_card() from public, anon, authenticated, service_role;
drop trigger if exists claim_shadow_card on public.profile_cards;
create trigger claim_shadow_card before insert or update on public.profile_cards
  for each row execute function public.hide_creator_claim_shadow_card();
delete from public.profile_cards c where public.is_creator_claim_shadow(c.id);

create or replace function public.admin_create_creator_claim(
  p_shadow_profile_id uuid,
  p_token_hash text,
  p_target_name text,
  p_target_avatar_url text default null,
  p_target_home_city text default null,
  p_target_bio text default null,
  p_target_social_links jsonb default null,
  p_outreach_note text default null,
  p_expires_days integer default 30,
  p_trips jsonb default '[]'::jsonb
)
returns table (claim_id uuid, trip_ids uuid[])
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_claim_id uuid;
  v_trip jsonb;
  v_row public.trips;
  v_trip_id uuid;
  v_trip_ids uuid[] := array[]::uuid[];
  v_joined_at bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if v_admin_id is null or not public.is_admin() or public.is_disabled() then
    raise exception 'masteradmin role needed' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$'
    or nullif(btrim(p_target_name), '') is null
    or p_trips is null or jsonb_typeof(p_trips) <> 'array' then
    raise exception 'invalid creator claim' using errcode = '22023';
  end if;
  if jsonb_array_length(p_trips) not between 1 and 50 then
    raise exception 'invalid creator claim trip count' using errcode = '22023';
  end if;

  perform 1 from auth.users u where id = p_shadow_profile_id
    and to_jsonb(u) ->> 'email_confirmed_at' is null for update;
  if not found or not public.is_creator_claim_shadow(p_shadow_profile_id) then
    raise exception 'claim_shadow_invalid';
  end if;
  -- The profile lock also guards dependent rows from new foreign keys while
  -- the bundle is created. A shadow account contains no other trips.
  perform 1 from public.profiles p where p.id = p_shadow_profile_id
    and not p.is_creator and not p.is_disabled for update;
  if not found
    or exists (select 1 from public.trips t where t.owner_id = p_shadow_profile_id)
    or exists (select 1 from public.creator_profile_claims c where c.shadow_profile_id = p_shadow_profile_id)
    or exists (select 1 from public.published_itineraries p where p.creator_id = p_shadow_profile_id) then
    raise exception 'claim_shadow_invalid';
  end if;
  delete from public.profile_cards where id = p_shadow_profile_id;

  -- Typed row conversion is paired with an explicit column list. No imported
  -- identity, ownership, invite code, visibility, or publication is copied.
  for v_trip in select value from jsonb_array_elements(p_trips)
  loop
    if jsonb_typeof(v_trip) <> 'object'
      or nullif(btrim(v_trip ->> 'name'), '') is null
      or coalesce(jsonb_typeof(v_trip -> 'days'), '') <> 'array'
      or coalesce(jsonb_typeof(v_trip -> 'destinations'), '') <> 'array' then
      raise exception 'invalid seed trip' using errcode = '22023';
    end if;
    v_row := jsonb_populate_record(null::public.trips, v_trip);
    v_trip_id := gen_random_uuid();
    insert into public.trips (
      id, owner_id, name, start_location, start_location_coords, destinations,
      destination_coords, start_date, end_date, travellers, transport_mode,
      budget_per_person_inr, travel_style, stay_style, driver_count, has_vulnerable,
      drive_after_dinner_min, vehicle_profile, fuel_economy_km_per_l, fuel_price_per_l,
      round_trip, tank_l, rent_per_day_inr, local_train, drives_part, flights,
      fixed_commitments, days, expenses, cover_emoji, cover_image_url, visibility, creation_kind
    ) values (
      v_trip_id, p_shadow_profile_id, v_row.name, coalesce(v_row.start_location, ''),
      nullif(v_row.start_location_coords, 'null'::jsonb), v_row.destinations,
      nullif(v_row.destination_coords, 'null'::jsonb), coalesce(v_row.start_date, ''),
      coalesce(v_row.end_date, ''), greatest(1, coalesce(v_row.travellers, 1)),
      coalesce(v_row.transport_mode, 'car'), coalesce(v_row.budget_per_person_inr, 0),
      coalesce(v_row.travel_style, 'balanced'), v_row.stay_style, v_row.driver_count,
      v_row.has_vulnerable, v_row.drive_after_dinner_min, nullif(v_row.vehicle_profile, 'null'::jsonb),
      v_row.fuel_economy_km_per_l, v_row.fuel_price_per_l, v_row.round_trip,
      v_row.tank_l, v_row.rent_per_day_inr, v_row.local_train, v_row.drives_part,
      nullif(v_row.flights, 'null'::jsonb),
      coalesce(nullif(v_row.fixed_commitments, 'null'::jsonb), '[]'::jsonb), v_row.days,
      coalesce(nullif(v_row.expenses, 'null'::jsonb), '[]'::jsonb),
      coalesce(v_row.cover_emoji, '🧭'), v_row.cover_image_url, 'private', 'imported'
    );
    insert into public.trip_member_access(trip_id, user_id, owner_id, state, role, joined_at)
      values (v_trip_id, p_shadow_profile_id, p_shadow_profile_id, 'active', 'owner', v_joined_at);
    insert into public.trip_members(trip_id, user_id, role, joined_at)
      values (v_trip_id, p_shadow_profile_id, 'owner', v_joined_at);
    v_trip_ids := array_append(v_trip_ids, v_trip_id);
  end loop;

  insert into public.creator_profile_claims (
    token_hash, shadow_profile_id, trip_ids, target_name, target_avatar_url,
    target_home_city, target_bio, target_social_links, outreach_note, created_by, expires_at
  ) values (
    p_token_hash, p_shadow_profile_id, v_trip_ids, btrim(p_target_name),
    nullif(btrim(p_target_avatar_url), ''), nullif(btrim(p_target_home_city), ''),
    nullif(btrim(p_target_bio), ''), public.safe_social_links(p_target_social_links),
    p_outreach_note, v_admin_id, now() + make_interval(days => greatest(1, least(coalesce(p_expires_days, 30), 180)))
  ) returning id into v_claim_id;
  insert into public.admin_audit(actor_id, action, target_type, target_id, detail)
    values (v_admin_id, 'creator_claim.create', 'creator_claim', v_claim_id::text,
      jsonb_build_object('trip_count', cardinality(v_trip_ids)));
  return query select v_claim_id, v_trip_ids;
end;
$$;
revoke all on function public.admin_create_creator_claim(uuid,text,text,text,text,text,jsonb,text,integer,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_create_creator_claim(uuid,text,text,text,text,text,jsonb,text,integer,jsonb) to authenticated;

create or replace function public.get_creator_claim_preview(p_token_hash text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_claim public.creator_profile_claims;
  v_trips jsonb;
begin
  select * into v_claim from public.creator_profile_claims where token_hash = p_token_hash;
  if not found then
    return jsonb_build_object('found', false, 'status', 'invalid');
  end if;
  if v_claim.status <> 'unclaimed' then
    return jsonb_build_object('found', true, 'status', v_claim.status);
  end if;
  if v_claim.expires_at <= now() then
    return jsonb_build_object('found', true, 'status', 'expired');
  end if;
  if not public.is_creator_claim_shadow(v_claim.shadow_profile_id) then
    return jsonb_build_object('found', false, 'status', 'invalid');
  end if;

  -- A private preview needs titles and itinerary order, not full stop data.
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'name', t.name, 'destinations', t.destinations,
    'start_date', t.start_date, 'end_date', t.end_date, 'travellers', t.travellers,
    'budget_per_person_inr', t.budget_per_person_inr,
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'index', d.day -> 'index', 'title', d.day -> 'title',
        'stops', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'title', s.stop -> 'title', 'arrivalTime', s.stop -> 'arrivalTime'
          ) order by s.ord), '[]'::jsonb)
          from jsonb_array_elements(case when jsonb_typeof(d.day -> 'stops') = 'array'
            then d.day -> 'stops' else '[]'::jsonb end) with ordinality s(stop, ord)
        )
      ) order by d.ord), '[]'::jsonb)
      from jsonb_array_elements(case when jsonb_typeof(t.days) = 'array'
        then t.days else '[]'::jsonb end) with ordinality d(day, ord)
    )
  ) order by array_position(v_claim.trip_ids, t.id)), '[]'::jsonb)
  into v_trips from public.trips t
  where t.id = any(v_claim.trip_ids) and t.owner_id = v_claim.shadow_profile_id
    and t.deleted_at is null and t.visibility = 'private';
  if jsonb_array_length(v_trips) <> cardinality(v_claim.trip_ids) then
    return jsonb_build_object('found', false, 'status', 'invalid');
  end if;
  return jsonb_build_object(
    'found', true, 'status', 'unclaimed', 'expires_at', v_claim.expires_at,
    'creator', jsonb_build_object('name', v_claim.target_name, 'avatar_url', v_claim.target_avatar_url,
      'home_city', v_claim.target_home_city, 'creator_bio', v_claim.target_bio, 'social_links', v_claim.target_social_links),
    'trips', v_trips
  );
end;
$$;
revoke all on function public.get_creator_claim_preview(text) from public, anon, authenticated, service_role;
grant execute on function public.get_creator_claim_preview(text) to service_role;

-- Both lifecycle writes lock the claim first. This helper then locks exactly
-- the seeded trips and verifies no other owned trips or publications would be
-- lost in the shadow-account cleanup.
create or replace function public.lock_creator_claim_bundle(p_claim public.creator_profile_claims)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_trip public.trips;
  v_count integer := 0;
begin
  perform 1 from auth.users u where id = p_claim.shadow_profile_id
    and to_jsonb(u) ->> 'email_confirmed_at' is null for update;
  if not found or not public.is_creator_claim_shadow(p_claim.shadow_profile_id) then
    raise exception 'claim_shadow_invalid';
  end if;
  perform 1 from public.profiles where id = p_claim.shadow_profile_id for update;
  if not found then raise exception 'claim_shadow_invalid'; end if;
  for v_trip in select * from public.trips where owner_id = p_claim.shadow_profile_id order by id for update
  loop
    if public.trip_has_publication_money(v_trip.id) then
      raise exception 'paid_publication_requires_manual_review:%', v_trip.id;
    end if;
    if not (v_trip.id = any(p_claim.trip_ids)) or v_trip.deleted_at is not null or v_trip.visibility <> 'private' then
      raise exception 'claim_shadow_invalid';
    end if;
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'claim_has_no_trips'; end if;
  if v_count <> cardinality(p_claim.trip_ids)
     or exists (select 1 from public.published_itineraries where creator_id = p_claim.shadow_profile_id) then
    raise exception 'claim_shadow_invalid';
  end if;
end;
$$;
revoke all on function public.lock_creator_claim_bundle(public.creator_profile_claims) from public, anon, authenticated, service_role;

create or replace function public.redeem_creator_claim(p_token_hash text, p_claimer_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.creator_profile_claims;
  v_claimer public.profiles;
begin
  select * into v_claim from public.creator_profile_claims where token_hash = p_token_hash for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_claim.status = 'claimed' then raise exception 'claim_already_redeemed'; end if;
  if v_claim.status = 'revoked' then raise exception 'claim_revoked'; end if;
  if v_claim.status = 'expired' or v_claim.expires_at <= now() then raise exception 'claim_expired'; end if;
  if p_claimer_id = v_claim.shadow_profile_id or public.is_creator_claim_shadow(p_claimer_id) then
    raise exception 'invalid_claimer';
  end if;
  select * into v_claimer from public.profiles where id = p_claimer_id for update;
  if not found or v_claimer.is_disabled then
    raise exception 'claimer_ineligible' using errcode = '42501';
  end if;
  perform public.lock_creator_claim_bundle(v_claim);

  -- The current owner-transfer trigger updates the access ledger, member
  -- projection, and invite version. The old shadow memberships then cascade.
  update public.trips set owner_id = p_claimer_id where id = any(v_claim.trip_ids);
  update public.suggestions set proposed_by = p_claimer_id
    where trip_id = any(v_claim.trip_ids) and proposed_by = v_claim.shadow_profile_id;
  update public.decisions set raised_by = p_claimer_id
    where trip_id = any(v_claim.trip_ids) and raised_by = v_claim.shadow_profile_id;
  update public.activity set actor_id = p_claimer_id
    where trip_id = any(v_claim.trip_ids) and actor_id = v_claim.shadow_profile_id;
  update public.profiles set
    is_creator = true,
    name = case when nullif(btrim(name), '') is null or btrim(name) = 'Traveller' then v_claim.target_name else name end,
    avatar_url = case when nullif(btrim(avatar_url), '') is null then v_claim.target_avatar_url else avatar_url end,
    home_city = case when nullif(btrim(home_city), '') is null then v_claim.target_home_city else home_city end,
    creator_bio = case when nullif(btrim(creator_bio), '') is null then v_claim.target_bio else creator_bio end,
    social_links = case when public.safe_social_links(social_links) = '{}'::jsonb
      then v_claim.target_social_links else social_links end
  where id = p_claimer_id;
  update public.creator_profile_claims set status = 'claimed', claimed_by = p_claimer_id, claimed_at = now()
    where id = v_claim.id;
  delete from auth.users where id = v_claim.shadow_profile_id;
  return jsonb_build_object('claim_id', v_claim.id, 'claimer_id', p_claimer_id,
    'shadow_profile_id', v_claim.shadow_profile_id, 'moved_trip_ids', v_claim.trip_ids);
end;
$$;
revoke all on function public.redeem_creator_claim(text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.redeem_creator_claim(text,uuid) to service_role;

create or replace function public.admin_revoke_creator_claim(p_claim_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_claim public.creator_profile_claims;
begin
  if auth.uid() is null or not public.is_admin() or public.is_disabled() then
    raise exception 'masteradmin role needed' using errcode = '42501';
  end if;
  select * into v_claim from public.creator_profile_claims where id = p_claim_id for update;
  if not found then raise exception 'claim_not_found' using errcode = 'P0002'; end if;
  if v_claim.status = 'claimed' then raise exception 'claim_already_redeemed'; end if;
  if v_claim.status <> 'revoked' then
    if v_claim.shadow_profile_id is not null then
      perform public.lock_creator_claim_bundle(v_claim);
      delete from auth.users where id = v_claim.shadow_profile_id;
    end if;
    update public.creator_profile_claims set status = 'revoked' where id = p_claim_id;
    insert into public.admin_audit(actor_id, action, target_type, target_id, detail)
      values (auth.uid(), 'creator_claim.revoke', 'creator_claim', p_claim_id::text,
        jsonb_build_object('trip_count', cardinality(v_claim.trip_ids)));
  end if;
  return jsonb_build_object('claim_id', p_claim_id, 'status', 'revoked');
end;
$$;
revoke all on function public.admin_revoke_creator_claim(uuid) from public, anon, authenticated, service_role;
grant execute on function public.admin_revoke_creator_claim(uuid) to authenticated;

commit;
