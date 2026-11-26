-- A priced publication protects every invite path, regardless of visibility.
-- An owner or admin must approve publication writes through the trips policy.
begin;

-- These checks AND with the existing creator and admin policies.
drop policy if exists "published insert owns trip" on public.published_itineraries;
create policy "published insert owns trip" on public.published_itineraries
  as restrictive for insert to authenticated with check (
    trip_id is null or public.is_admin() or exists (
      select 1 from public.trips t
      where t.id = published_itineraries.trip_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "published update owns trip" on public.published_itineraries;
create policy "published update owns trip" on public.published_itineraries
  as restrictive for update to authenticated
  using (
    trip_id is null or public.is_admin() or exists (
      select 1 from public.trips t
      where t.id = published_itineraries.trip_id and t.owner_id = auth.uid()
    )
  )
  with check (
    trip_id is null or public.is_admin() or exists (
      select 1 from public.trips t
      where t.id = published_itineraries.trip_id and t.owner_id = auth.uid()
    )
  );

-- Only the invite definers call this check. A schema-only install has no buyers.
create or replace function public.invite_trip_payment_allows(p_trip_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.published_itineraries p
    where p.trip_id = p_trip_id and p.premium_price_inr is not null
  ) then
    return true;
  end if;

  if auth.uid() is null or to_regclass('public.entitlements') is null then
    return false;
  end if;

  return exists (
    select 1 from public.published_itineraries p
    join public.entitlements e on e.pub_id = p.id
    where p.trip_id = p_trip_id and p.premium_price_inr is not null
      and e.user_id = auth.uid()
  );
end;
$$;
revoke all on function public.invite_trip_payment_allows(uuid) from public, anon, authenticated;

-- This filename sorts after the projection on a fresh install.
-- Keep the newer return type if that migration has already run.
do $migration$
begin
  if exists (
    select 1 from pg_proc
    where oid = to_regprocedure('public.get_trip_by_invite_code(text)')
      and prorettype = 'public.trips'::regtype
  ) then
    create or replace function public.get_trip_by_invite_code(p_code text)
    returns setof public.trips
    language sql
    security definer
    set search_path = public
    stable
    as $$
      select projected.*
      from public.trips t
      cross join lateral jsonb_populate_record(
        null::public.trips,
        jsonb_build_object(
          'id', t.id,
          'owner_id', t.owner_id,
          'name', t.name,
          'start_location', t.start_location,
          'destinations', t.destinations,
          'start_date', t.start_date,
          'end_date', t.end_date,
          'travellers', t.travellers,
          'transport_mode', t.transport_mode,
          'budget_per_person_inr', t.budget_per_person_inr,
          'travel_style', t.travel_style,
          'fixed_commitments', t.fixed_commitments,
          'days', t.days,
          'expenses', t.expenses,
          'cover_emoji', t.cover_emoji,
          'visibility', t.visibility,
          'created_at', t.created_at,
          'updated_at', t.updated_at,
          'start_location_coords', t.start_location_coords,
          'destination_coords', t.destination_coords,
          'fuel_economy_km_per_l', t.fuel_economy_km_per_l,
          'fuel_price_per_l', t.fuel_price_per_l,
          'round_trip', t.round_trip,
          'invite_code', t.invite_code,
          'deleted_at', t.deleted_at,
          'driver_count', t.driver_count,
          'has_vulnerable', t.has_vulnerable,
          'drive_after_dinner_min', t.drive_after_dinner_min,
          'vehicle_profile', t.vehicle_profile,
          'cover_image_url', t.cover_image_url,
          'stay_style', t.stay_style,
          'drives_part', t.drives_part,
          'write_version', t.write_version
        )
      ) as projected
      where upper(t.invite_code) = upper(trim(p_code))
        and t.deleted_at is null
        and not public.is_disabled()
        and (
          t.owner_id = auth.uid()
          or public.is_member(t.id)
          or public.is_admin()
          or public.invite_trip_payment_allows(t.id)
        );
    $$;
  end if;
end;
$migration$;

revoke execute on function public.get_trip_by_invite_code(text) from public, anon;
grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;

create or replace function public.get_invite_trip(p_trip_id uuid)
returns setof public.trips
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_trip public.trips;
begin
  for v_trip in
    select t.* from public.trips t
    where t.id = p_trip_id
      and t.deleted_at is null
      and not public.is_disabled()
      and (
        t.owner_id = auth.uid()
        or public.is_member(t.id)
        or public.is_admin()
        or public.invite_trip_payment_allows(t.id)
      )
  loop
    -- The code joins the trip. A caller with only the trip id never gets it.
    v_trip.invite_code := null;
    return next v_trip;
  end loop;
  return;
end;
$$;
revoke execute on function public.get_invite_trip(uuid) from public, anon;
grant execute on function public.get_invite_trip(uuid) to anon, authenticated;

create or replace function public.join_trip(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_trip public.trips;
  v_access public.trip_member_access;
  v_actor uuid := auth.uid();
  v_code text := upper(trim(p_code));
  v_link text;
  v_role text;
begin
  if v_actor is null or public.is_disabled() then
    raise exception 'Sign in with an enabled account.' using errcode='42501';
  end if;
  select id into v_id from public.trips where invite_code=v_code;
  select t.* into v_trip from public.trips t where id=v_id for update;
  if v_trip.id is null or v_trip.deleted_at is not null or v_trip.invite_code is distinct from v_code then
    raise exception 'Invite is unavailable.' using errcode='42501';
  end if;
  -- Read after the row lock, so a join never pairs an old role with a new code.
  v_link := coalesce((select r.role from public.trip_invite_role r where r.trip_id=v_id),'editor');
  select * into v_access from public.trip_member_access where trip_id=v_id and user_id=v_actor for update;
  if v_access.state='removed' or (v_access.owner_id is not null and v_access.owner_id<>v_trip.owner_id) then
    raise exception 'Ask the owner to restore your access.' using errcode='42501';
  end if;
  if exists(select 1 from public.trip_members where trip_id=v_id and user_id=v_actor) then return v_id; end if;
  -- A new member could read the full row through the trips policy.
  if v_actor <> v_trip.owner_id and not public.is_admin()
    and not public.invite_trip_payment_allows(v_id) then
    raise exception 'Invite is unavailable.' using errcode='42501';
  end if;
  -- The owner stays owner. A new member gets the link role. A repaired active
  -- row keeps its last role. A returning member gets the lower of the last
  -- role and the link role.
  v_role := case
    when v_actor=v_trip.owner_id then 'owner'
    when v_access.user_id is null then v_link
    when v_access.state='active' then v_access.role
    when array_position(array['viewer','commenter','editor','owner'],v_access.role)
      <= array_position(array['viewer','commenter','editor','owner'],v_link) then v_access.role
    else v_link
  end;
  insert into public.trip_member_access(trip_id,user_id,owner_id,state,role,joined_at)
    values(v_id,v_actor,v_trip.owner_id,'active',v_role,
      floor(extract(epoch from clock_timestamp())*1000))
    on conflict(trip_id,user_id) do update set state='active', role=excluded.role,
      revision=public.trip_member_access.revision+1;
  insert into public.trip_members(trip_id,user_id,role,joined_at)
    select trip_id,user_id,role,joined_at from public.trip_member_access where trip_id=v_id and user_id=v_actor
    on conflict(trip_id,user_id) do nothing;
  update public.trips set access_version=access_version+1 where id=v_id;
  return v_id;
end;
$$;
revoke all on function public.join_trip(text) from public, anon, authenticated, service_role;
grant execute on function public.join_trip(text) to authenticated;

create or replace function public.get_public_trip(p_pub_id text)
returns setof public.trips
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_pub public.published_itineraries;
  v_trip public.trips;
  v_buyer boolean;
  v_free int[];
  v_days jsonb;
  v_day jsonb;
  v_stops jsonb;
  v_stop jsonb;
  v_locked_days jsonb;
  v_categories jsonb;
  v_category text;
  v_day_idx int;
  v_stop_count int;
  v_known_categories constant text[] := array[
    'sightseeing', 'food', 'nature', 'beach', 'temple', 'adventure',
    'shopping', 'museum', 'travel', 'hotel', 'rest', 'event', 'transport-hub'
  ];
begin
  if public.is_disabled() then
    return;
  end if;

  select * into v_pub from public.published_itineraries
    where id = p_pub_id limit 1;
  if not found then
    return;
  end if;

  select projected.*
  into v_trip
  from public.trips t
  cross join lateral jsonb_populate_record(
    null::public.trips,
    jsonb_build_object(
      'id', t.id,
      'owner_id', t.owner_id,
      'name', t.name,
      'start_location', t.start_location,
      'destinations', t.destinations,
      'start_date', t.start_date,
      'end_date', t.end_date,
      'travellers', t.travellers,
      'transport_mode', t.transport_mode,
      'budget_per_person_inr', t.budget_per_person_inr,
      'travel_style', t.travel_style,
      'fixed_commitments', t.fixed_commitments,
      'days', t.days,
      'expenses', t.expenses,
      'cover_emoji', t.cover_emoji,
      'visibility', t.visibility,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'start_location_coords', t.start_location_coords,
      'destination_coords', t.destination_coords,
      'fuel_economy_km_per_l', t.fuel_economy_km_per_l,
      'fuel_price_per_l', t.fuel_price_per_l,
      'round_trip', t.round_trip,
      'invite_code', null::text,
      'deleted_at', t.deleted_at,
      'driver_count', t.driver_count,
      'has_vulnerable', t.has_vulnerable,
      'drive_after_dinner_min', t.drive_after_dinner_min,
      'vehicle_profile', t.vehicle_profile,
      'cover_image_url', t.cover_image_url,
      'stay_style', t.stay_style,
      'drives_part', t.drives_part
    )
  ) as projected
  where t.id = v_pub.trip_id
    and t.visibility = 'public'
  limit 1;
  if not found then
    return;
  end if;

  v_buyer := exists (
    select 1 from public.entitlements e
    where e.pub_id = v_pub.id and e.user_id = auth.uid()
  );

  -- A legacy publication can name a creator who does not own the trip.
  -- Keep existing purchases valid if the trip changed owners.
  if v_pub.creator_id is distinct from v_trip.owner_id
    and not v_buyer
    and v_trip.owner_id is distinct from auth.uid() then
    return;
  end if;

  if v_pub.unpublished_at is not null then
    if not v_buyer and v_trip.owner_id is distinct from auth.uid() then
      return;
    end if;
  end if;

  if v_trip.deleted_at is not null
    and not v_buyer and v_trip.owner_id is distinct from auth.uid() then
    return;
  end if;

  v_free := '{}';
  if jsonb_typeof(v_pub.free_day_indexes) = 'array' then
    select coalesce(array_agg(value::int), '{}') into v_free
      from jsonb_array_elements_text(v_pub.free_day_indexes) as value
      where value ~ '^[0-9]+$'
        and length(value) <= 4;
  end if;

  if v_buyer or v_trip.owner_id = auth.uid() or public.is_member(v_trip.id) then
    return next v_trip;
    return;
  end if;

  if v_pub.premium_price_inr is null then
    return next v_trip;
    return;
  end if;

  v_trip.expenses := '[]'::jsonb;
  v_trip.fixed_commitments := '[]'::jsonb;

  v_days := to_jsonb(v_trip.days);

  if v_days is null or jsonb_typeof(v_days) <> 'array' then
    v_trip.days := '[]'::jsonb;
    return next v_trip;
    return;
  end if;

  v_locked_days := '[]'::jsonb;
  for v_pos in 0 .. jsonb_array_length(v_days) - 1 loop
    v_day := v_days -> v_pos;

    -- A day that is not an object cannot be read. It is dropped whole.
    continue when jsonb_typeof(v_day) is distinct from 'object';

    v_day_idx := case
      when jsonb_typeof(v_day -> 'index') = 'number'
        and (v_day ->> 'index') ~ '^[0-9]{1,4}$'
        then (v_day ->> 'index')::int
      else null end;

    -- A free day leaves as the creator wrote it.
    if v_day_idx is not null and v_day_idx = any (v_free) then
      v_locked_days := v_locked_days || jsonb_build_array(v_day);
      continue;
    end if;

    -- A locked day. Count, and copy nothing.
    v_stop_count := 0;
    v_categories := '{}'::jsonb;
    v_stops := v_day -> 'stops';
    if jsonb_typeof(v_stops) = 'array' then
      for v_stop_pos in 0 .. jsonb_array_length(v_stops) - 1 loop
        v_stop := v_stops -> v_stop_pos;
        continue when jsonb_typeof(v_stop) is distinct from 'object';
        continue when (v_stop ->> 'status') = 'rejected';
        v_stop_count := v_stop_count + 1;
        continue when (v_stop -> 'auto') = 'true'::jsonb;
        v_category := v_stop ->> 'category';
        if v_category is null or not (v_category = any (v_known_categories)) then
          v_category := 'other';
        end if;
        v_categories := jsonb_set(
          v_categories,
          array[v_category],
          to_jsonb(coalesce((v_categories ->> v_category)::int, 0) + 1),
          true
        );
      end loop;
    end if;

    v_locked_days := v_locked_days || jsonb_build_array(jsonb_build_object(
      'id', 'locked-day-' || v_pos::text,
      'index', coalesce(v_day_idx, v_pos),
      'locked', true,
      'stops', '[]'::jsonb,
      'lockedPreview', jsonb_build_object(
        'stopCount', v_stop_count,
        'categories', v_categories
      )
    ));
  end loop;

  v_trip.days := v_locked_days;
  return next v_trip;
end;
$$;
revoke execute on function public.get_public_trip(text) from public, anon;
grant execute on function public.get_public_trip(text) to anon, authenticated;

commit;
