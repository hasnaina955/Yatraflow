-- ============================================================================
-- #350 — soft-unpublish: the publication row survives, so buyers keep access
-- ============================================================================
-- Unpublishing used to DELETE the published_itineraries row, and `on delete
-- cascade` took entitlements, purchase_orders and pub_events down with it. A
-- buyer who had paid lost the itinerary they bought — with no refund in that
-- statement — and the creator's own sales ledger and funnel history vanished
-- too. One destructive click on a surface where destruction was never the
-- intent.
--
-- The policy is now: unpublishing KEEPS the row and stamps `unpublished_at`.
-- It hides the publication from Explore, from the creator hub and from the
-- /pub/:id page, and it stops sales. It NEVER touches entitlements or
-- purchase_orders, so every existing buyer keeps the access they paid for —
-- get_public_trip still serves them the REAL days, because the gate added
-- below turns away only viewers with no claim on the publication. Everyone
-- else gets "no longer published": not the real days, and not a locked
-- preview either, since a preview of something that can no longer be bought
-- is only a dead end.
--
-- The hard DELETE and its cascade are still correct — for a genuine permanent
-- delete, which must be refund-aware. That is a SEPARATE future flow; it is
-- not this change, and nothing here weakens or replaces it.
--
-- admin_unpublish follows the SAME policy: the console button and the
-- creator's own unpublish must not diverge on the one action where divergence
-- silently destroys a customer's purchase.
--
-- No RLS change is needed for any of it: `published read` is
-- `for select using (true)` (so a viewer can still resolve a pub id and be
-- told it is no longer published) and `published write` is
-- `for all using (auth.uid() = creator_id)`, which already lets a creator
-- stamp their own row.
-- ============================================================================

-- 1. The marker -------------------------------------------------------------
-- NULL = published/live; a ms-epoch timestamp = soft-unpublished. A timestamp
-- rather than a boolean because the surfaces have to order and label rows by
-- WHEN it happened (an "Unpublished" hub row, a frozen ledger/funnel window),
-- and because a re-publish can clear the marker without losing the record of
-- when the publication was last pulled. It is bigint milliseconds since epoch,
-- deliberately the same unit as its siblings on this table (`published_at`,
-- `refreshed_at`): the row mapper then needs no date parsing and the client's
-- `Date.now()` writes exactly the value the database would.
alter table public.published_itineraries
  add column if not exists unpublished_at bigint;

-- 2. get_public_trip: the gate that makes soft-unpublish invisible -------------
-- Body is 20260918_payments_security.sql's function verbatim — same comments,
-- same stubbing branch, same `visibility = 'public'` check on the trip — with
-- exactly one added block: a viewer with no claim on an unpublished
-- publication gets the empty set instead of a trip. Re-declared whole because
-- `create or replace function` takes no patch, and the grants are restated
-- below for the same reason the original file restated them: replacing a
-- function does not change its ACL, but the ACL is part of the contract this
-- file is asserting.
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

  select * into v_trip from public.trips
    where id = v_pub.trip_id
      and visibility = 'public'
      and deleted_at is null
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

-- 3. admin_unpublish: the console button obeys the same policy ----------------
-- Body is 20260909_masteradmin.sql's 5e verbatim — the admin check, the pub-id
-- lookup, the 'trip has no publication' exception, the audit row — with two
-- changes: the DELETE becomes the marker stamp, and the trips.visibility flip
-- is gone (the comment in its place says why).
-- The stamp carries `and unpublished_at is null` so it is idempotent:
-- unpublishing twice keeps the FIRST timestamp, which is what the ledger and
-- funnel windows pin to. (20260909's own header for 5e still says "the trip
-- flips back to private like the owner path" — that sentence is now stale, and
-- is superseded here rather than edited there.)
create or replace function public.admin_unpublish(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pub_id text;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  select id into v_pub_id from public.published_itineraries where trip_id = p_trip_id;
  if v_pub_id is null then
    raise exception 'trip has no publication';
  end if;
  insert into public.admin_audit (actor_id, action, target_type, target_id, detail)
    values (auth.uid(), 'publication.unpublish', 'trip', p_trip_id::text,
      jsonb_build_object('pub_id', v_pub_id));
  update public.published_itineraries
    set unpublished_at = (extract(epoch from now()) * 1000)::bigint
    where trip_id = p_trip_id
      and unpublished_at is null;
  -- Deliberately NOT flipping trips.visibility to 'private' any more: the invite
  -- RPC keys its paywall guard on a priced publication row existing for the trip
  -- (so it stays closed while this row survives), and get_public_trip serves the
  -- real days to entitled buyers behind a `visibility = 'public'` check. Setting
  -- the trip private would silently revoke every buyer's access — the exact
  -- failure this change exists to prevent. Direct reads of the trip row are
  -- already restricted to owner/member/admin by the "trips read" policy.
end;
$$;
grant execute on function public.admin_unpublish(uuid) to authenticated;
