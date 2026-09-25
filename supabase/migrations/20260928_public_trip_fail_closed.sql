-- ============ get_public_trip: fail closed on the money, and on a poisoned
-- free-day list ============
-- #353 and #352. One function, one redefinition, because two separate files
-- re-declaring the same body is how the previous three fixes nearly lost each
-- other (see 20260926's ordering note).
--
-- Both issues are the same shape of bug: an input this body iterates, or a
-- field it serves, without asking what shape it is. The paywall's whole
-- promise is that an unentitled viewer gets the teaser and nothing else, so
-- every unexpected shape has to resolve to LOCKED or to EMPTY — never to
-- "serve it and hope".
--
-- #353 (page-dead, not a leak). `free_day_indexes` was read straight into
-- `array_agg(value::int) from jsonb_array_elements_text(...)`. A null is fine
-- (zero rows -> null -> '{}'), but a scalar or object in that column raises
-- `cannot extract elements from a scalar`; the RPC 500s and the public page
-- shows "didn't load" for EVERY visitor, so one hand-edited cell is a
-- self-inflicted outage of that itinerary's page. A non-numeric ELEMENT inside
-- a well-formed array does the same thing one step later on the `::int` cast.
-- The day and stop loops below guard every sibling input this way; this one
-- was missed, and it was missed in the same body that had just been rewritten
-- twice — a reminder that a redefinition carries its inherited holes forward.
--
-- #352 (the money). Locked days had their stop content stripped while the
-- trip's `expenses` and `fixed_commitments` were served in full. Two things
-- were wrong with the NOTE the previous version carried, which claimed the
-- public page "renders neither":
--   * The page calls `computeTotals(trip)` (PublicItinerary.tsx:160), and that
--     reads `trip.expenses` — so the served money is live input to a
--     computation on the page, not an unused field. Precisely: the figures it
--     prints FROM those totals are distance, road time and stop count, and the
--     budget figure it shows comes from the publication row. So the visible
--     leak was the payload and the fork rather than a printed number. The
--     promise is the real defect — the page told non-buyers the budget
--     breakdown was withheld while the payload carried all of it.
--   * `fixed_commitments` rows carry `dayIndex`, so they ARE attributable. A
--     live ₹199 publication served two commitments on a LOCKED day complete
--     with their notes ("Boarding gate closes 12:30 sharp", "Vrinda Express")
--     while that same day's stops had their notes stripped — one payload
--     answering "is day 3 locked?" two different ways.
-- And the page's own locked copy promises the opposite: "Stay contacts,
-- timings and the budget breakdown are in the full plan."
--
-- The rule applied here, chosen deliberately: for a PRICED publication, an
-- unentitled viewer receives no money at all — `expenses` and
-- `fixed_commitments` are both emptied. Expenses carry no day field
-- (`id, label, category, optional, amountInr`), so "strip only the locked
-- days' expenses" is not expressible at the wire; and the budget breakdown is
-- part of what the locked copy claims to withhold. The publication row's own
-- `estimated_budget_per_person_inr` is untouched, so the page still shows the
-- headline figure it always showed. Unpriced publications and entitled buyers
-- return before this point and are unaffected.
--
-- Carried forward verbatim from 20260925/20260926, and NOT to be dropped in a
-- future redefinition: the soft-unpublish gate (#350) and the explicit column
-- list with `invite_code` withheld (#351). `public.trips` has 31 columns and
-- all 31 are enumerated below; a column added to the table and not to this list
-- is withheld from the public page, which is the failure direction to prefer —
-- keep the two in step.

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
  v_day_idx int;
  i int;
  j int;
begin
  select * into v_pub from public.published_itineraries
    where id = p_pub_id limit 1;
  if not found then
    return;  -- empty set: unknown publication
  end if;

  -- Soft-unpublish (#350): the row survives so buyers keep their entitlement, but
  -- a viewer with no claim on it must not reach the trip at all — not the real
  -- days, and not even a stubbed preview. Creator and entitled buyers fall
  -- through and are served exactly as when the publication was live.
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
      return;  -- no longer published: empty set for everyone else
    end if;
  end if;

  -- #351 — the trip row, one column at a time. `invite_code` is deliberately
  -- NOT read: it is a capability for get_trip_by_invite_code, and this function
  -- is readable by anyone on the internet. Keep this list in step with the
  -- table when a column is added (the public page reads these through
  -- rowToTrip); a column that is missed here is withheld, which is the failure
  -- direction to prefer.
  select
    t.id, t.owner_id, t.name, t.start_location, t.destinations,
    t.start_date, t.end_date, t.travellers, t.transport_mode,
    t.budget_per_person_inr, t.travel_style, t.fixed_commitments, t.days,
    t.expenses, t.cover_emoji, t.visibility, t.created_at, t.updated_at,
    t.start_location_coords, t.destination_coords, t.fuel_economy_km_per_l,
    t.fuel_price_per_l, t.round_trip,
    null::text as invite_code,
    t.deleted_at, t.driver_count, t.has_vulnerable, t.drive_after_dinner_min,
    t.vehicle_profile, t.cover_image_url, t.stay_style
  into v_trip
  from public.trips t
  where t.id = v_pub.trip_id
    and t.visibility = 'public'
    and t.deleted_at is null
  limit 1;
  if not found then
    return;  -- unpublished / deleted trip: empty set, like the old RLS miss
  end if;

  -- #353 — the free-day list is adversarial input like every other field in
  -- this body. Only a real JSON array is iterated, and only its numeric
  -- elements are read: anything else (null, a scalar, an object, a non-numeric
  -- element) leaves `v_free` as it stands, so the affected days are LOCKED.
  -- Never throws, never widens.
  v_free := '{}';
  if jsonb_typeof(v_pub.free_day_indexes) = 'array' then
    select coalesce(array_agg(value::int), '{}') into v_free
      from jsonb_array_elements_text(v_pub.free_day_indexes) as value
      where value ~ '^[0-9]+$';
  end if;

  -- Creator and entitled buyers read the REAL trip — decided here, from
  -- auth.uid(), never from a client flag. (auth.uid() is null for anon.)
  if auth.uid() is not null and (
    v_pub.creator_id = auth.uid()
    or exists (
      select 1 from public.entitlements e
      where e.pub_id = v_pub.id and e.user_id = auth.uid()
    )
  ) then
    return next v_trip;
    return;
  end if;

  if v_pub.premium_price_inr is null then
    return next v_trip;  -- unpriced: the whole trip is the preview
    return;
  end if;
  -- A priced publication with an EMPTY free-day list stubs every day in the
  -- loop below — a fully locked preview is valid (the page still renders the
  -- publication's own metadata), not an empty response.

  -- #352 — priced, and this viewer is not entitled: the money is withheld too.
  -- This runs BEFORE the days handling so the corrupt-days branch below cannot
  -- return early with the money still attached.
  v_trip.expenses := '[]'::jsonb;
  v_trip.fixed_commitments := '[]'::jsonb;

  -- Stub locked days in place. Field names here are the Trip JSONB's keys
  -- (camelCase — the client stores days as parsed TypeScript objects).
  v_days := to_jsonb(v_trip.days);
  -- Fail closed on a corrupt days column: it must not 500 the RPC (breaking
  -- the whole public page) and must not skip stubbing (leaking the row).
  if v_days is null or jsonb_typeof(v_days) <> 'array' then
    v_trip.days := '[]'::jsonb;
    return next v_trip;
    return;
  end if;
  i := 0;
  while i < jsonb_array_length(v_days) loop
    v_day := v_days -> i;
    v_day_idx := case jsonb_typeof(v_day -> 'index')
                   when 'number' then (v_day ->> 'index')::int
                   else null end;
    -- Fail closed: a day whose index is missing/corrupt is treated as
    -- LOCKED — a poisoned row must never widen what the wire exposes.
    if v_day_idx is null or not (v_day_idx = any (v_free)) then
      v_stops := v_day -> 'stops';
      if v_stops is null or jsonb_typeof(v_stops) <> 'array' then
        -- Absent or corrupt stops: drop whatever is there rather than
        -- iterate blindly (the loop below must never 500 on a poisoned row).
        v_day := jsonb_set(v_day, '{stops}', '[]'::jsonb);
      else
      j := 0;
      while j < jsonb_array_length(v_stops) loop
        v_stop := v_stops -> j;
        v_stop := jsonb_set(v_stop, '{description}',
          to_jsonb('Locked — the full plan is on the original itinerary.'::text));
        v_stop := jsonb_set(v_stop, '{notes}', '""'::jsonb);
        v_stop := v_stop #- '{openTime}' #- '{closeTime}' #- '{departTime}' #- '{arrivalTime}' #- '{sourceUrl}' #- '{placeId}';
        v_stop := jsonb_set(v_stop, '{entryFeeInrPerPerson}', '0'::jsonb);
        v_stop := jsonb_set(v_stop, '{transportCostInrTotal}', '0'::jsonb);
        v_stops := jsonb_set(v_stops, array[j::text], v_stop);
        j := j + 1;
      end loop;
      v_day := jsonb_set(v_day, '{stops}', v_stops);
      end if;
      -- The day title and stop titles stay — the locked overlay's teaser
      -- renders up to three of them blurred. Notes/contacts/costs do not.
      v_days := jsonb_set(v_days, array[i::text], v_day);
    end if;
    i := i + 1;
  end loop;

  v_trip.days := v_days;
  return next v_trip;
end;
$$;

-- Unchanged from 20260926: the public page reads this as anon, and a signed-in
-- non-buyer reads it as authenticated. Note that `revoke ... from public` does
-- not revoke from either role, which is why they are named.
revoke all on function public.get_public_trip(text) from public;
grant execute on function public.get_public_trip(text) to anon, authenticated;
