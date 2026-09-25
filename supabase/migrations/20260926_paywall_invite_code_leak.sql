-- ============================================================================
-- #351 — the paywalled public RPC handed anon the private invite code, and the
--        invite-code RPC had no premium gate: a live paywall bypass
-- ============================================================================
-- Two halves of one hole, confirmed LIVE against the production project on
-- 2026-09-25 with three anonymous HTTP calls, no account and no payment:
--
--   1. `get_public_trip` (granted to anon) selected the WHOLE trip row into a
--      `public.trips` composite and returned it. The DAYS were correctly
--      stubbed for a non-buyer — 11 stops on a ₹199 fixture publication — but
--      every other column came along for the ride, `invite_code` included.
--      Three of the six publications on the project handed over a real
--      15-character code that way; two of them were priced.
--
--   2. `get_trip_by_invite_code` (also granted to anon) was a bare
--      `select t.* ... where upper(invite_code) = upper(p_code)` with NO
--      premium gate, so the code from step 1 bought the full plan: same anon
--      caller, 4 days, ZERO stubbed stops, real descriptions and entry fees.
--
-- 20260918_payments_security.sql gated the uuid path (`get_invite_trip`) and
-- deliberately left this one "untouched" (:231) — a reasonable note when the
-- short code was assumed to be private, except that `get_public_trip` was
-- publishing it. A capability is only as private as its least careful reader.
--
-- The fix closes the chain from both ends and keeps every legitimate caller
-- working: the public RPC never selects the code at all, and the invite-code
-- RPC now applies the SAME guard the uuid path has applied since v0.63.0.
--
-- NOTE ON ORDER — this file replaces `get_public_trip` too, and so does
-- 20260925_publication_soft_unpublish.sql (#350). This one sorts AFTER it, so
-- it carries #350's soft-unpublish gate forward verbatim: a fresh database
-- built by applying the migrations in name order must not lose that gate, and
-- running them the other way round would silently reopen this leak. Never
-- re-date this file earlier than 20260925.
-- ============================================================================

-- 1. get_public_trip: stop selecting the row, select the columns ---------------
-- Body is 20260925_publication_soft_unpublish.sql's function with exactly one
-- change: `select *` becomes an explicit column list in which `invite_code` is
-- replaced by a typed NULL. Everything else — the #350 unpublished gate, the
-- entitlement branch, the stubbing loop, the grants — is that file's verbatim.
--
-- The return type stays `setof public.trips`, so the composite still HAS an
-- `invite_code` field; the point is that it can no longer carry a value. An
-- anon-facing function must enumerate its columns: `select *` makes every
-- column added by a future migration public by default, and the default has to
-- be the other way round.
create or replace function public.get_public_trip(p_pub_id text)
returns setof public.trips
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_trip_id uuid;
  v_pub public.published_itineraries;
  v_free int[];
  v_trip public.trips;
  v_day jsonb;
  v_days jsonb;
  v_stop jsonb;
  v_stops jsonb;
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

  v_free := coalesce(
    (select array_agg(value::int) from jsonb_array_elements_text(v_pub.free_day_indexes) as value),
    '{}'
  );

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

  -- NOTE: expenses and fixed commitments on locked days are NOT stubbed here —
  -- the public page renders neither (budget tiles read the publication row's
  -- precomputed estimate, not trip.expenses), and the fork stubs them
  -- client-side in buildTripCopy as before. Only the DAY CONTENT (stops) —
  -- the thing the paywall sells — is stripped at the wire.
  v_trip.days := v_days;
  return next v_trip;
end;
$$;

revoke all on function public.get_public_trip(text) from public;
grant execute on function public.get_public_trip(text) to anon, authenticated;

-- 2. get_trip_by_invite_code: give the code path the guard the uuid path has ---
-- Body is 20260909_invite_codes.sql's function plus the SAME clause
-- `get_invite_trip` has carried since 20260918_payments_security.sql:201-225,
-- so the two capabilities finally agree on who may read a premium-backed trip.
-- A code is still a capability for private trips (R3/M9) and for anything not
-- backed by a priced publication — that is the whole invite flow, untouched.
--
-- Two further divergences from its sibling, fixed here because leaving them
-- would mean re-declaring a function that is knowingly half-guarded:
--   * `deleted_at is null` — the uuid path has always filtered trashed trips;
--     this one resolved them. A trashed trip's plan is meant to be gone.
--   * explicit columns instead of `select t.*`, for the reason in §1: this
--     function is granted to anon too. `invite_code` IS returned here, and
--     that is not a leak — the caller just presented it as the capability, so
--     echoing it discloses nothing they did not already hold.
--
-- The premium clause keys on `premium_price_inr > 0` and NOT on the
-- publication being live: after #350 a soft-unpublished plan keeps its row and
-- its buyers keep their access, so excluding unpublished rows here would let a
-- taken-down paid plan out through the code — to exactly the people who never
-- paid for it.
create or replace function public.get_trip_by_invite_code(p_code text)
returns setof public.trips
language sql
security definer
set search_path = public
stable
as $$
  select
    t.id, t.owner_id, t.name, t.start_location, t.destinations,
    t.start_date, t.end_date, t.travellers, t.transport_mode,
    t.budget_per_person_inr, t.travel_style, t.fixed_commitments, t.days,
    t.expenses, t.cover_emoji, t.visibility, t.created_at, t.updated_at,
    t.start_location_coords, t.destination_coords, t.fuel_economy_km_per_l,
    t.fuel_price_per_l, t.round_trip, t.invite_code,
    t.deleted_at, t.driver_count, t.has_vulnerable, t.drive_after_dinner_min,
    t.vehicle_profile, t.cover_image_url, t.stay_style
  from public.trips t
  where upper(t.invite_code) = upper(trim(p_code))
    and t.deleted_at is null
    and (
      t.owner_id = auth.uid()
      or public.is_member(t.id)
      or public.is_admin()
      -- Private trip: the code is the capability, exactly like the uuid.
      or t.visibility = 'private'
      -- Public trip: fine unless a priced publication backs it.
      or not exists (
        select 1 from public.published_itineraries p
        where p.trip_id = t.id and coalesce(p.premium_price_inr, 0) > 0
      )
      -- Premium-backed: the creator and entitled buyers may still resolve it
      -- (they read the real days on the pub page anyway).
      or exists (
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
    );
$$;

-- `revoke ... from public` does NOT revoke from `anon` on Supabase — name both
-- roles. anon keeps EXECUTE on purpose: the join gate previews a trip before
-- login, and the guard above is what makes that safe.
revoke all on function public.get_trip_by_invite_code(text) from public;
grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;
