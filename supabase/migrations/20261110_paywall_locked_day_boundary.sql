-- ============================================================
-- 20261110_paywall_locked_day_boundary.sql
-- #774 (P0) and #917 (P1): a locked day never leaves the server.
--
-- THE DEFECT. `get_public_trip` kept every stop row of a locked day. It cleared
-- the description, the notes, the times and the costs. It left the stop title,
-- the location name, the coordinates, the category, the way the stop is
-- ordered and the status in the response, and it left the day title too. The page blurred the
-- titles in the browser. Any visitor could read them with one anon RPC call.
--
-- THE RULE NOW. A locked day is built by this function. It is not the stored
-- day with fields removed. A new stop field is thus withheld by default.
-- The locked day carries only this shape:
--
--   { "id": "locked-day-<position>", "index": <n>, "locked": true,
--     "stops": [], "lockedPreview": { "stopCount": <n>, "categories": {..} } }
--
--   * `stopCount` counts the stops that are not rejected.
--   * `categories` counts those stops by category, without the auto anchors.
--     Only a known category keeps its name. Any other value counts as `other`.
--   * No title, name, coordinate, note, time, cost, link or image leaves.
--     The day id is made here, so no stored string reaches the response.
--
-- WHO READS THE FULL PLAN. The creator of the publication, a buyer with an
-- entitlement row, the owner of the trip and a member of the trip. An owner
-- and a member already read the full row through the `trips` read policy, so
-- this adds no new disclosure. It stops the public page from replacing their
-- cached trip with a locked copy.
--
-- FAIL CLOSED. Days that are not an array give an empty list. A day that is
-- not an object is dropped. A day with no readable index is locked. A stop
-- list that is not an array counts as zero stops. A free-day list that is not
-- an array of small whole numbers frees nothing.
--
-- SECOND PATH, same file. `get_invite_trip(uuid)` served the full row of a
-- PRIVATE trip to any caller that held the trip id. The publication row is
-- public and it carries the trip id. A priced plan whose trip was set to
-- private was thus readable in full. The private branch is gone: a trip
-- behind a priced publication now serves only its crew, its creator and its
-- buyers. A trip with no priced publication keeps its preview by trip id.
-- "Priced" means a non-null price. A price of 0 is priced too: the public
-- page locks it, so this path must not open it. The older clause read
-- `coalesce(premium_price_inr, 0) > 0`, which treated 0 as free and let the
-- whole plan out through an enumerable trip id.
--
-- NOT CHANGED, and why:
--   * Trip-level route fields (start, destinations and their coordinates).
--     They name the same towns as the public `route_summary`.
--   * `get_trip_by_invite_code`. The code is a join capability. Its holder
--     can become a member and then reads the row through RLS. Its own priced
--     clause still reads `coalesce(premium_price_inr, 0) > 0`, so a price of
--     0 opens it. That code is not enumerable, unlike the trip id. Close it
--     in its own migration.
--   * The read policies of `suggestions`, `decisions` and `activity`. Their
--     public branch reads `trips` under the caller's own RLS. A stranger sees
--     no `trips` row, so that branch is false for a stranger already.
--
-- Carried forward from the earlier definitions, and never to be dropped:
-- the soft-unpublish gate (#350), the named column list with `invite_code`
-- withheld (#351), the money strip (#352), the free-day type guard (#353)
-- and the trash gate (#566).
--
-- Safe to re-run. To apply: run this whole file in the Supabase SQL editor.
-- Then run supabase/tests/public_trip_paywall.test.sql on an isolated
-- database, or `node ./node_modules/vitest/vitest.mjs run
-- tests/public-trip-paywall-db.test.ts`, which does that on PGlite.
-- ============================================================

do $$
begin
  if to_regclass('public.entitlements') is null then
    raise exception 'apply 20260918_payments_rail.sql first: public.entitlements is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trips' and column_name = 'drives_part'
  ) then
    raise exception 'apply 20261019_trip_drives_part.sql first: public.trips.drives_part is missing';
  end if;
end $$;

begin;

-- ------------------------------------------------------------ get_public_trip
-- The signature does not change. The drop removes any older grant with the
-- function, so the grants below are the only ones.
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
  select * into v_pub from public.published_itineraries
    where id = p_pub_id limit 1;
  if not found then
    return;
  end if;

  if v_pub.unpublished_at is not null then
    if not (
      auth.uid() is not null and (
        v_pub.creator_id = auth.uid()
        or exists (
          select 1 from public.entitlements e
          where e.pub_id = v_pub.id and e.user_id = auth.uid()
        )
      )
    ) then
      return;
    end if;
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

  if v_trip.deleted_at is not null and not (
    auth.uid() is not null and (
      v_pub.creator_id = auth.uid()
      or exists (
        select 1 from public.entitlements e
        where e.pub_id = v_pub.id and e.user_id = auth.uid()
      )
    )
  ) then
    return;
  end if;

  v_free := '{}';
  if jsonb_typeof(v_pub.free_day_indexes) = 'array' then
    select coalesce(array_agg(value::int), '{}') into v_free
      from jsonb_array_elements_text(v_pub.free_day_indexes) as value
      where value ~ '^[0-9]+$'
        and length(value) <= 4;
  end if;

  -- Full readers. The entitlement is read here, on the server, for auth.uid().
  -- The owner and the members already read this row through the trips policy.
  if auth.uid() is not null and (
    v_pub.creator_id = auth.uid()
    or v_trip.owner_id = auth.uid()
    or public.is_member(v_trip.id)
    or exists (
      select 1 from public.entitlements e
      where e.pub_id = v_pub.id and e.user_id = auth.uid()
    )
  ) then
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

revoke all on function public.get_public_trip(text) from public, anon;
grant execute on function public.get_public_trip(text) to anon, authenticated;

-- ------------------------------------------------------------ get_invite_trip
-- The trip-id preview. A trip behind a priced publication serves only its
-- crew, its creator and its buyers, whatever its visibility. The invite code
-- stays withheld, as in 20261012b.
drop function if exists public.get_invite_trip(uuid);

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
      and (
        t.owner_id = auth.uid()
        or public.is_member(t.id)
        or public.is_admin()
        -- No priced publication: the trip id is the preview capability.
        -- A price of 0 still counts as priced (#774). NULL alone means free,
        -- as `get_public_trip` and api/_publicBody.js already read it.
        or not exists (
          select 1 from public.published_itineraries p
          where p.trip_id = t.id and p.premium_price_inr is not null
        )
        -- Priced: only the creator or an entitled buyer may preview.
        or (
          auth.uid() is not null and exists (
            select 1 from public.published_itineraries p
            where p.trip_id = t.id
              and (
                p.creator_id = auth.uid()
                or exists (
                  select 1 from public.entitlements e
                  where e.pub_id = p.id and e.user_id = auth.uid()
                )
              )
          )
        )
      )
  loop
    -- The code joins the trip. A caller with only the trip id never gets it.
    v_trip.invite_code := null;
    return next v_trip;
  end loop;
  return;
end;
$$;

revoke all on function public.get_invite_trip(uuid) from public, anon;
grant execute on function public.get_invite_trip(uuid) to anon, authenticated;

commit;
