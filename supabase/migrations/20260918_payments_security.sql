-- ============ M7 · Payments security hardening (audit PR #251) ============
-- Four fixes from the security audit of the payments rail:
--   P0: locked day content was readable by ANY role straight off the trips
--       table (the "trips read" policy allowed visibility='public' with no
--       TO clause, and the public page fetched select('*')). The paywall was
--       a CSS blur. This migration moves the paywall server-side:
--         * get_public_trip(p_pub_id) — security definer; decides from
--           auth.uid() who sees real days (creator, entitled buyer) and who
--           gets locked days stubbed exactly like buildTripCopy does
--           client-side. The only sanctioned public path.
--         * "trips read" loses its anonymous/public clause — direct row
--           reads now require owner/member/admin.
--         * get_invite_trip refuses trips backed by a LIVE PRICED publication
--           (its uuid + the public trip_id on published rows was a second
--           full-row leak path); private-trip invites keep working — the uuid
--           remains the capability there.
--   M2: a refund revokes the entitlement (revoke_refunded_entitlement RPC,
--       callable by service_role only; the webhook calls it).
--   L2: entitlements survive profile deletion — the books (creator's ledger)
--       keep the sale even when a buyer account is hard-deleted. The FK goes
--       ON DELETE CASCADE → ON DELETE SET NULL; the ledger renders "a deleted
--       account" for null user rows.

-- 1. get_public_trip --------------------------------------------------------
-- Returns the trip behind a live publication. WHO the caller is decides
-- WHAT they get — entirely server-side, from auth.uid():
--   * the publication's creator, or a buyer with a paid entitlement row:
--     the REAL trip (all days unstubbed);
--   * everyone else (including anonymous): every day NOT in the
--     publication's free_day_indexes stubbed — title kept (the teaser needs
--     it), description replaced with the locked notice, notes/times/costs
--     zeroed, provider ids and source URLs dropped. Mirrors store.ts
--     buildTripCopy's stub shape so the fork path re-stubbing is a no-op.
-- The client never chooses its own path: there is no "give me the real one"
-- parameter to forge. An unlock re-fetches through this same RPC and the
-- server's (now true) entitlement check returns real days.
--
-- Security definer so anon callers can read a public trip they cannot
-- select() directly anymore. p_pub_id is the publication slug (pub_xxx) —
-- the only client-known key; the trip id is never accepted from the wire.
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

  if v_free = '{}' or v_pub.premium_price_inr is null then
    return;  -- entirely free or unpriced: nothing to stub
  end if;

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
        v_stop := jsonb_set(v_stop, '{description}', to_jsonb('Locked — the full plan is on the original itinerary.'));
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

-- 2. Tighten the trips RLS public clause ------------------------------------
-- Previously: auth.uid() = owner_id or visibility = 'public' or is_member(...)
-- with NO to-role restriction — an anonymous curl could select(*) the whole
-- trip row, which is how premium day content leaked (the paywall was client-
-- side). Direct reads now require owner/member/admin; the public page reads
-- through get_public_trip instead. Public-visibility shares through the
-- workspace (#/trip/<uuid> links) keep working for logged-in members/owners;
-- the invite-code RPC path is unchanged (its security-definer capability
-- model predates this file).

drop policy if exists "trips read" on public.trips;
create policy "trips read"
  on public.trips for select
  to authenticated
  using (
    auth.uid() = owner_id
    or public.is_member(trips.id)
    or public.is_admin()
  );

-- get_invite_trip returns t.* with NO filter and is anon-executable — the
-- second leak path: published_itineraries.trip_id is public, so ANYONE could
-- read a premium publication's full row through its trip uuid and bypass the
-- tightening above. The gate keeps the invite capability intact (M9: the
-- uuid IS the capability for private trips — it is not discoverable from any
-- public surface) and refuses exactly the leak: a trip backed by a LIVE
-- PRICED publication cannot leave through this RPC unless the caller is its
-- owner/member/admin, its creator, or an entitled buyer. Free publications
-- and private trips are unaffected.
drop function if exists public.get_invite_trip(uuid);
create or replace function public.get_invite_trip(p_trip_id uuid)
returns setof public.trips
language sql
security definer
set search_path = public
stable
as $$
  select t.* from public.trips t
  where t.id = p_trip_id
    and t.deleted_at is null
    and (
      t.owner_id = auth.uid()
      or public.is_member(t.id)
      or public.is_admin()
      -- Private trip: the uuid is the capability (invite links work logged-out).
      or t.visibility = 'private'
      -- Public trip: fine unless a live premium publication backs it.
      or not exists (
        select 1 from public.published_itineraries p
        where p.trip_id = t.id and coalesce(p.premium_price_inr, 0) > 0
      )
      -- Premium-backed: the creator or an entitled buyer may still preview
      -- through the capability (they see real days on the pub page anyway).
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

revoke all on function public.get_invite_trip(uuid) from public;
grant execute on function public.get_invite_trip(uuid) to anon, authenticated;

-- Invite-code previews (get_trip_by_invite_code) stay untouched: the short
-- code is the capability (R3/M9), it works for private trips by design.

-- 3. Refunds revoke the entitlement (M2) ------------------------------------
-- The webhook's payment.refunded handler calls this with service_role.
-- Idempotent: revoking twice is a no-op; revoking a nonexistent order is
-- a no-op (returns false, the caller acks the event either way).
create or replace function public.revoke_refunded_entitlement(p_razorpay_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
begin
  select * into v_order from public.purchase_orders
    where razorpay_order_id = p_razorpay_order_id limit 1
    for update;
  if not found then
    return false;
  end if;

  update public.purchase_orders
    set status = 'failed'
    where id = v_order.id and status = 'paid';

  delete from public.entitlements
    where order_id = v_order.id;

  return true;
end;
$$;

revoke all on function public.revoke_refunded_entitlement(text) from public, anon, authenticated;
-- Service role only — the webhook is the only caller.
grant execute on function public.revoke_refunded_entitlement(text) to service_role;

-- 4. The books survive buyer deletion (L2) ----------------------------------
-- entitlements.user_id referenced profiles ON DELETE CASCADE: hard-deleting a
-- buyer erased the sale from the creator's ledger. The ledger keeps the row
-- (amount_paid_inr is the record); user_id becomes nullable. purchase_orders
-- keeps its cascade — an order without its buyer is worthless.
alter table public.entitlements
  alter column user_id drop not null;
alter table public.entitlements
  drop constraint if exists entitlements_user_id_fkey;
alter table public.entitlements
  add constraint entitlements_user_id_fkey
    foreign key (user_id) references public.profiles (id)
    on delete set null;

-- The (user_id, pub_id) uniqueness stays as the rail migration created it: a
-- full unique constraint treats NULLs as DISTINCT, so a deleted buyer's
-- historical row (user_id null) can never collide with a re-buy by a new
-- account, and the claim RPC's `on conflict (user_id, pub_id)` keeps working
-- unchanged. (Recreating it as a PARTIAL index would break that inference —
-- partial indexes require the predicate in conflict_target — for zero gain.)
-- The safety net for the deleted-buyer case is one historical row per pub
-- with no user: (The null user_id + pub_id pair is what the ledger renders
-- as "a deleted account".)
create unique index if not exists entitlements_anon_pub_unique
  on public.entitlements (pub_id)
  where user_id is null;
