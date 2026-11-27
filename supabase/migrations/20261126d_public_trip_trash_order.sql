-- A trashed trip stays hidden from viewers and commenters on its public link.
-- The owner, editors, admins and buyers still read it.
-- This file redefines get_public_trip only. Its body is copied from
-- 20261126b_paywall_visibility_authorship.sql. The early-return condition is the only change.
begin;

drop function if exists public.get_public_trip(text);
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
  v_buyer boolean := false;
  v_priced boolean;
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

  -- This condition mirrors the trips read hide trashed policy.
  if v_trip.owner_id = auth.uid() or public.is_admin() or public.is_editor(v_trip.id)
    or (v_trip.deleted_at is null and public.is_member(v_trip.id)) then
    return next v_trip;
    return;
  end if;

  if v_pub.creator_id is distinct from v_trip.owner_id then
    return;
  end if;

  v_priced := public.trip_has_priced_publication(v_trip.id);
  if v_priced then
    v_buyer := public.invite_trip_payment_allows(v_trip.id);
  elsif auth.uid() is not null and to_regclass('public.entitlements') is not null then
    v_buyer := exists (
      select 1 from public.entitlements e
      where e.pub_id = v_pub.id and e.user_id = auth.uid()
    );
  end if;

  if (v_pub.unpublished_at is not null or v_trip.deleted_at is not null) and not v_buyer then
    return;
  end if;

  if v_buyer or not v_priced then
    return next v_trip;
    return;
  end if;

  v_free := '{}';
  if v_pub.premium_price_inr is not null and jsonb_typeof(v_pub.free_day_indexes) = 'array' then
    select coalesce(array_agg(value::int), '{}') into v_free
      from jsonb_array_elements_text(v_pub.free_day_indexes) as value
      where value ~ '^[0-9]+$'
        and length(value) <= 4;
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
