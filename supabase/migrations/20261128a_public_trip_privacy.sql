-- ============================================================================
-- #1015 — Public trip privacy: coarsen start_location, drop start_location_coords,
-- omit day-0 auto start anchors, build open days/stops from an allow-list, and
-- strip stop notes on free content (outsider views).
--
-- Redefines `public.get_public_trip(text)` only; mirrored verbatim in
-- supabase/schema.sql.
-- ============================================================================

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
  v_level text;
  v_priced boolean;
  v_keep_notes boolean;
  v_free int[];
  v_raw_start text;
  v_raw_start_coords jsonb;
  v_place_segs text[];
  v_seg text;
  v_seg_count int;
  v_days jsonb;
  v_day jsonb;
  v_stops jsonb;
  v_stop jsonb;
  v_open_stops jsonb;
  v_safe_stop jsonb;
  v_locked_days jsonb;
  v_categories jsonb;
  v_category text;
  v_day_idx int;
  v_day_open boolean;
  v_stop_count int;
  v_known_categories constant text[] := array[
    'sightseeing', 'food', 'nature', 'beach', 'temple', 'adventure',
    'shopping', 'museum', 'travel', 'hotel', 'rest', 'event', 'transport-hub'
  ];
begin
  select * into v_pub from public.published_itineraries
    where id = p_pub_id limit 1;
  if not found or v_pub.trip_id is null then
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
  where t.id = v_pub.trip_id;
  if not found then
    return;
  end if;

  v_level := public.trip_access_level(v_trip.id);
  if v_level = 'none' then
    return;
  end if;

  if v_level = 'crew' then
    return next v_trip;
    return;
  end if;

  -- A guide that is not listed serves no outsider. A buyer keeps reading (D1).
  if v_level = 'outsider' and not public.publication_is_listed(v_pub.id) then
    return;
  end if;

  v_priced := public.trip_has_priced_publication(v_trip.id);
  v_keep_notes := (v_level = 'buyer' and v_priced);

  -- #1015: coarsen the owner's start location to at most city/region and drop
  -- exact start coordinates for every non-crew reader (outsiders and buyers).
  v_raw_start := coalesce(v_trip.start_location, '');
  v_raw_start_coords := to_jsonb(v_trip.start_location_coords);
  v_place_segs := '{}';
  for v_seg in
    select btrim(regexp_replace(s, '\m\d{6}\M', '', 'g'))
    from unnest(string_to_array(v_raw_start, ',')) as s
  loop
    v_seg := btrim(regexp_replace(v_seg, '\s+', ' ', 'g'));
    continue when v_seg = '';
    continue when lower(v_seg) = 'india';
    continue when v_seg ~* '^(\#|no\.?\s*\d|[0-9])';
    continue when v_seg ~* '\m(flat|apt|apartment|house|plot|door|floor|building|bldg|tower|wing|suite|road|rd|street|st|lane|ln|avenue|ave|marg|cross|main|sector|block|phase|colony|enclave|layout|extn|pin|pincode|home)\M';
    v_place_segs := array_append(v_place_segs, v_seg);
  end loop;
  v_seg_count := coalesce(array_length(v_place_segs, 1), 0);
  if v_seg_count = 0 then
    v_trip.start_location := '';
  elsif v_seg_count = 1 then
    v_trip.start_location := v_place_segs[1];
  else
    v_trip.start_location := v_place_segs[v_seg_count - 1] || ', ' || v_place_segs[v_seg_count];
  end if;
  v_trip.start_location_coords := null;

  -- The crew ledger never leaves. Fixed commitments keep only the fields that
  -- a buyer needs to plan the day; notes and references are dropped.
  v_trip.expenses := '[]'::jsonb;
  if v_level = 'buyer' or not v_priced then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', e.elem -> 'id',
        'title', e.elem -> 'title',
        'type', e.elem -> 'type',
        'dayIndex', e.elem -> 'dayIndex',
        'time', e.elem -> 'time',
        'boardingTime', e.elem -> 'boardingTime',
        'stopId', e.elem -> 'stopId'
      ))), '[]'::jsonb)
    into v_trip.fixed_commitments
    from jsonb_array_elements(
      case when jsonb_typeof(v_trip.fixed_commitments) = 'array'
        then v_trip.fixed_commitments else '[]'::jsonb end
    ) as e(elem)
    where jsonb_typeof(e.elem) = 'object';
  else
    v_trip.fixed_commitments := '[]'::jsonb;
  end if;

  v_free := '{}';
  if v_pub.premium_price_inr is not null and jsonb_typeof(v_pub.free_day_indexes) = 'array' then
    select coalesce(array_agg(value::int), '{}') into v_free
      from jsonb_array_elements_text(v_pub.free_day_indexes) as value
      where value ~ '^[0-9]+$'
        and length(value) <= 4;
  end if;

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

    v_day_open := (v_level = 'buyer')
      or (not v_priced)
      or (v_day_idx is not null and v_day_idx = any (v_free));

    if v_day_open then
      v_open_stops := '[]'::jsonb;
      v_stops := v_day -> 'stops';
      if jsonb_typeof(v_stops) = 'array' then
        for v_stop_pos in 0 .. jsonb_array_length(v_stops) - 1 loop
          v_stop := v_stops -> v_stop_pos;
          continue when jsonb_typeof(v_stop) is distinct from 'object';
          -- Drop any day-0 auto start anchor that carries the owner's raw home
          -- address or home coordinates.
          if (v_stop -> 'auto') = 'true'::jsonb
             and coalesce(v_day_idx, v_pos) = 0
             and (
               (nullif(btrim(v_raw_start), '') is not null
                and (v_stop ->> 'locationName' = v_raw_start or v_stop ->> 'title' = v_raw_start))
               or (v_raw_start_coords is not null
                   and jsonb_typeof(v_raw_start_coords) = 'object'
                   and (v_stop ->> 'lat') = (v_raw_start_coords ->> 'lat')
                   and (v_stop ->> 'lng') = (v_raw_start_coords ->> 'lng'))
             ) then
            continue;
          end if;
          v_safe_stop := jsonb_strip_nulls(jsonb_build_object(
            'id', v_stop -> 'id',
            'title', v_stop -> 'title',
            'category', v_stop -> 'category',
            'locationName', v_stop -> 'locationName',
            'placeId', v_stop -> 'placeId',
            'eLoc', v_stop -> 'eLoc',
            'placeSource', v_stop -> 'placeSource',
            'exposure', v_stop -> 'exposure',
            'lat', v_stop -> 'lat',
            'lng', v_stop -> 'lng',
            'description', v_stop -> 'description',
            'visitMinutes', v_stop -> 'visitMinutes',
            'openTime', v_stop -> 'openTime',
            'closeTime', v_stop -> 'closeTime',
            'entryFeeInrPerPerson', v_stop -> 'entryFeeInrPerPerson',
            'transportCostInrTotal', v_stop -> 'transportCostInrTotal',
            'priority', v_stop -> 'priority',
            'notes', case when v_keep_notes then v_stop -> 'notes' else null end,
            'slotKey', v_stop -> 'slotKey',
            'sourceUrl', v_stop -> 'sourceUrl',
            'status', v_stop -> 'status',
            'orderInDay', v_stop -> 'orderInDay',
            'auto', v_stop -> 'auto',
            'weatherSensitive', v_stop -> 'weatherSensitive',
            'departTime', v_stop -> 'departTime',
            'arrivalTime', v_stop -> 'arrivalTime',
            'legDistanceKm', v_stop -> 'legDistanceKm',
            'legTravelMinutes', v_stop -> 'legTravelMinutes'
          ));
          v_open_stops := v_open_stops || jsonb_build_array(v_safe_stop);
        end loop;
      end if;

      v_locked_days := v_locked_days || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'id', v_day -> 'id',
        'index', v_day -> 'index',
        'title', v_day -> 'title',
        'startTime', v_day -> 'startTime',
        'coverImageUrl', v_day -> 'coverImageUrl',
        'stops', v_open_stops
      )));
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
