-- ============================================================
-- 20261127a_paid_access_boundary.sql
--
-- One decision for paid access: public.trip_access_level(trip).
-- Every paid reader asks it once and acts on the answer. The decision table is
-- the contract (spec section 3.2, tests/paid-access-matrix-db.test.ts).
--
--   'none'     the caller reads nothing (disabled account, or no such trip)
--   'crew'     owner, admin, editor, or a member of a trip that is not trashed
--   'buyer'    a paid, not fully refunded order for a guide of this trip
--   'outsider'  everyone else
--
-- Sort order: this file runs after 20261126b, 20261126c and 20261126d, and it
-- carries their guards forward:
--   * 20261126d: a trashed trip is readable by its owner, an admin and an
--     editor only. A viewer or commenter member gets no full row.
--   * 20261126c: the invite reader returns the trip_invite_preview type, and the
--     overload assertion runs before the function is replaced.
--   * 20261002: the claim refusal stays in one opaque class (raise log for the
--     reason, one raise exception for the caller).
--
-- Re-runnable: every object is created with `create or replace`, `if exists`
-- or `if not exists`.
-- ============================================================
begin;

-- ---------------------------------------------- 0. pre-check
-- A publication must belong to its trip's owner. Refuse to run on a database
-- that already breaks this, and name the rows, so nothing is changed silently.
do $migration$
declare
  v_bad text;
begin
  select string_agg(p.id, ', ' order by p.id) into v_bad
  from public.published_itineraries p
  join public.trips t on t.id = p.trip_id
  where p.creator_id is distinct from t.owner_id;
  if v_bad is not null then
    raise exception 'Publications whose creator is not the trip owner: %. Fix them before this migration runs.', v_bad;
  end if;
end;
$migration$;

-- ---------------------------------------------- 1. the one level function
create or replace function public.trip_access_level(p_trip_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_deleted timestamptz;
  v_buyer boolean := false;
begin
  if public.is_disabled() then
    return 'none';
  end if;

  select t.owner_id, t.deleted_at
    into v_owner, v_deleted
    from public.trips t
    where t.id = p_trip_id;
  if not found then
    return 'none';
  end if;

  if v_owner = auth.uid() or public.is_admin() then
    return 'crew';
  end if;
  -- 20261126d: a trashed trip is hidden from members who are not editors.
  if public.is_editor(p_trip_id) then
    return 'crew';
  end if;
  if v_deleted is null and public.is_member(p_trip_id) then
    return 'crew';
  end if;

  -- The payments tables come from a separate migration. A schema-only install
  -- has neither, so the buyer branch is skipped until they exist. The query
  -- sits inside the guard, so plpgsql never plans it against a missing table.
  if auth.uid() is not null
    and to_regclass('public.entitlements') is not null
    and to_regclass('public.purchase_orders') is not null then
    select exists (
      select 1
      from public.entitlements e
      join public.published_itineraries p on p.id = e.pub_id and p.trip_id = p_trip_id
      join public.purchase_orders o on o.id = e.order_id
      where e.user_id = auth.uid()
        and o.status = 'paid'
        and o.refunded_paise < o.amount_inr * 100
    ) into v_buyer;
    if v_buyer then
      return 'buyer';
    end if;
  end if;

  return 'outsider';
end;
$$;

revoke all on function public.trip_access_level(uuid) from public, anon, authenticated;

-- ---------------------------------------------- 2. the listing rule
-- A guide is listed (for a new sale and for the public preview) when it is not
-- unpublished, its trip is public and not trashed, and its creator is the owner.
-- Buyers never depend on this rule.
create or replace function public.publication_is_listed(p_pub_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.published_itineraries p
    join public.trips t on t.id = p.trip_id
    where p.id = p_pub_id
      and p.unpublished_at is null
      and t.visibility = 'public'
      and t.deleted_at is null
      and p.creator_id = t.owner_id
  )
$$;

revoke all on function public.publication_is_listed(text) from public, anon, authenticated;

-- ---------------------------------------------- 3. link guard (replaces the trip_id guard)
-- A publication links to a trip that its creator owns, for every role, admin and
-- service role included. Neither trip_id nor creator_id changes after the insert.
create or replace function public.guard_publication_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE' then
    if new.trip_id is distinct from old.trip_id then
      raise exception 'A publication cannot move to another trip.' using errcode = '23514';
    end if;
    if new.creator_id is distinct from old.creator_id then
      raise exception 'A publication cannot change its creator.' using errcode = '23514';
    end if;
  end if;
  if new.trip_id is not null then
    select t.owner_id into v_owner from public.trips t where t.id = new.trip_id;
    if new.creator_id is distinct from v_owner then
      raise exception 'Only the trip owner can publish this trip.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_publication_link() from public, anon, authenticated;

drop trigger if exists publication_trip_id_immutable on public.published_itineraries;
drop function if exists public.guard_publication_trip_id();

drop trigger if exists publication_link_guard on public.published_itineraries;
create trigger publication_link_guard
  before insert or update on public.published_itineraries
  for each row execute function public.guard_publication_link();

-- ---------------------------------------------- 4. the guide reader
-- Crew get the full trip with the code removed. Every other caller gets the
-- guide: an allowlist of columns, the crew ledger emptied, and the days locked
-- when the guide is priced. The projection is the allowlist, so a column that is
-- added to trips later is null in the guide.
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

  -- A buyer, or a free guide, reads every day as the creator wrote it.
  if v_level = 'buyer' or not v_priced then
    return next v_trip;
    return;
  end if;

  -- A priced guide, for an outsider: free days open, the other days are counted.
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

-- ---------------------------------------------- 5. the invite-code reader
-- The code is the invitation. The reader has no buyer branch: a non-crew caller
-- on a priced trip gets PT403 and no trip data.
drop function if exists public.get_trip_by_invite_code(text);
do $migration$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_trip_by_invite_code'
  ) then
    raise exception 'Unexpected get_trip_by_invite_code overload.';
  end if;
end;
$migration$;

create or replace function public.get_trip_by_invite_code(p_code text)
returns setof public.trip_invite_preview
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row public.trip_invite_preview;
  v_level text;
begin
  for v_row in
    select projected.*
    from public.trips t
    left join public.profile_cards pc on pc.id = t.owner_id
    left join public.trip_invite_role r on r.trip_id = t.id
    cross join lateral jsonb_populate_record(
      null::public.trip_invite_preview,
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
        'write_version', t.write_version,
        'owner_first_name', public.invite_first_name(pc.name),
        'invite_role', coalesce(r.role, 'editor')
      )
    ) as projected
    where upper(t.invite_code) = upper(trim(p_code))
      and t.deleted_at is null
  loop
    v_level := public.trip_access_level(v_row.id);
    if v_level = 'none' then
      continue;
    end if;
    if v_level <> 'crew' and public.trip_has_priced_publication(v_row.id) then
      raise exception 'Owner approval needed.' using errcode = 'PT403';
    end if;
    return next v_row;
  end loop;
  return;
end;
$$;

revoke execute on function public.get_trip_by_invite_code(text) from public, anon;
grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;

-- ---------------------------------------------- 6. the UUID reader
-- The UUID is not a capability for a published trip (D2). A published trip is
-- served through its guide page. An unpublished trip keeps today's behaviour
-- (M9), with the invite code removed.
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
  v_level text;
begin
  select t.* into v_trip
  from public.trips t
  where t.id = p_trip_id
    and t.deleted_at is null;
  if not found then
    return;
  end if;

  v_level := public.trip_access_level(v_trip.id);
  if v_level = 'none' then
    return;
  end if;
  if v_level <> 'crew' and public.trip_has_publication_money(v_trip.id) then
    return;
  end if;

  -- The code joins the trip. A caller with only the trip id never gets it.
  v_trip.invite_code := null;
  return next v_trip;
  return;
end;
$$;

revoke execute on function public.get_invite_trip(uuid) from public, anon;
grant execute on function public.get_invite_trip(uuid) to anon, authenticated;

-- The old invite helper has no caller now. Its three readers were replaced above.
drop function if exists public.invite_trip_payment_allows(uuid);

-- ---------------------------------------------- 7. checkout facts
-- Checkout asks for facts, not a verdict. It applies the buyer check before the
-- recovery scan, and the listing check after it, so money that was already taken
-- still settles (spec 3.6). Service role only: checkout passes the buyer id.
create or replace function public.checkout_offer(p_pub_id text, p_buyer uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'buyer_found', exists (select 1 from public.profiles pr where pr.id = p_buyer),
    'buyer_disabled', coalesce((select pr.is_disabled from public.profiles pr where pr.id = p_buyer), false),
    'publication_found', p.id is not null,
    'listed', public.publication_is_listed(p_pub_id),
    'price_inr', p.premium_price_inr,
    'creator_id', p.creator_id,
    'trip_id', p.trip_id,
    'buyer_is_creator', p.creator_id = p_buyer
  )
  from (select 1) k
  left join public.published_itineraries p on p.id = p_pub_id
$$;

revoke all on function public.checkout_offer(text, uuid) from public, anon, authenticated;
grant execute on function public.checkout_offer(text, uuid) to service_role;

-- ---------------------------------------------- 8. order state machine
-- failed is final. A paid order never returns to pending. A move into paid with a
-- full refund is refused. refunded_paise never decreases.
create or replace function public.guard_order_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'failed' and new.status <> 'failed' then
    raise exception 'A failed order is final.' using errcode = '23514';
  end if;
  if old.status = 'paid' and new.status = 'pending' then
    raise exception 'A paid order cannot return to pending.' using errcode = '23514';
  end if;
  -- The rule applies to a move INTO paid only. A paid order with a full refund
  -- is a transient state that apply_order_refund writes, and it is not refused.
  if old.status <> 'paid' and new.status = 'paid'
    and new.refunded_paise >= new.amount_inr * 100 then
    raise exception 'A fully refunded order cannot be marked paid.' using errcode = '23514';
  end if;
  if new.refunded_paise < old.refunded_paise then
    raise exception 'A refund total cannot decrease.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_order_transition() from public, anon, authenticated;

drop trigger if exists purchase_orders_transition on public.purchase_orders;
create trigger purchase_orders_transition
  before update on public.purchase_orders
  for each row execute function public.guard_order_transition();

-- ---------------------------------------------- 9. refunds
-- The full refund ends the order in one write. Recording the total and ending the
-- order are one UPDATE, so no row is ever paid with a full refund.
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
    where id = v_order.id and status in ('pending', 'paid');

  delete from public.entitlements
    where order_id = v_order.id;

  return true;
end;
$$;

revoke all on function public.revoke_refunded_entitlement(text) from public, anon, authenticated;
grant execute on function public.revoke_refunded_entitlement(text) to service_role;

create or replace function public.apply_order_refund(
  p_razorpay_order_id text,
  p_amount_refunded_paise bigint,
  p_amount_captured_paise bigint
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
begin
  -- Junk guard: a refund event without sane amounts is malformed.
  if p_amount_refunded_paise is null or p_amount_refunded_paise < 0
    or p_amount_captured_paise is null or p_amount_captured_paise < 0 then
    return 'invalid';
  end if;

  select * into v_order from public.purchase_orders
    where razorpay_order_id = p_razorpay_order_id limit 1
    for update;
  if not found then
    return 'unknown-order';
  end if;

  if p_amount_refunded_paise >= (v_order.amount_inr * 100) then
    -- One write: the cumulative total never falls, and the order ends as failed.
    update public.purchase_orders
      set refunded_paise = greatest(refunded_paise, p_amount_refunded_paise),
          status = case when status in ('pending', 'paid') then 'failed' else status end
      where id = v_order.id;
    perform public.revoke_refunded_entitlement(p_razorpay_order_id);
    return 'revoked';
  end if;

  update public.purchase_orders
    set refunded_paise = greatest(refunded_paise, p_amount_refunded_paise)
    where id = v_order.id;
  return 'recorded';
end;
$$;

revoke all on function public.apply_order_refund(text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.apply_order_refund(text, bigint, bigint) to service_role;

-- ---------------------------------------------- 10. the buyer's claim
-- The 20261002 body, with a fully refunded order refused in the same opaque class.
-- Every refusal raises one sentence. The reason goes only to the server log.
create or replace function public.claim_paid_order(p_razorpay_order_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
  v_ent entitlements.id%type;
  -- Unpublished marker (ms epoch) of the order's publication, if any.
  v_unpublished bigint;
  -- Why the claim was refused, for the LOG only. It is never returned.
  v_refused text;
begin
  select * into v_order from public.purchase_orders
    where razorpay_order_id = p_razorpay_order_id
    for update;

  if not found then
    v_refused := 'no such order';
  elsif v_order.user_id <> auth.uid() then
    v_refused := 'order belongs to another user';
  elsif v_order.status <> 'paid' then
    v_refused := 'order is not paid (status ' || v_order.status || ')';
  elsif v_order.refunded_paise >= v_order.amount_inr * 100 then
    v_refused := 'order is fully refunded';
  else
    -- The marker gate + the in-flight carve-out. A withdrawn publication
    -- refuses an order created AFTER the stamp; an order created before it
    -- (the buyer was already paying) claims exactly as before. `>`, not `>=`:
    -- the boundary instant belongs to the buyer.
    select p.unpublished_at into v_unpublished
      from public.published_itineraries p
      where p.id = v_order.pub_id;
    if v_unpublished is not null
      and (extract(epoch from v_order.created_at) * 1000)::bigint > v_unpublished then
      v_refused := 'publication withdrawn before this order was created';
    end if;
  end if;

  if v_refused is not null then
    -- `raise log` writes to the server log and returns NOTHING to the caller.
    raise log 'claim_paid_order refused (%, order %): %',
      v_refused, p_razorpay_order_id, coalesce(auth.uid()::text, 'anonymous');
    -- ONE code and ONE message for all refusals (#355).
    raise exception 'claim refused';
  end if;

  insert into public.entitlements (user_id, pub_id, order_id, amount_paid_inr)
  values (v_order.user_id, v_order.pub_id, v_order.id, v_order.price_snapshot_inr)
  on conflict (user_id, pub_id) do nothing
  returning id into v_ent;

  return v_ent;
end;
$$;

-- Restated so the role list is a fact about THIS file: authenticated may call
-- it, nobody else may even reach it.
revoke all on function public.claim_paid_order(text) from public, anon;
grant execute on function public.claim_paid_order(text) to authenticated;

-- ---------------------------------------------- 11. approve-request flow (D4)
-- A paid-invite holder asks to join. The owner approves or declines in the app.
-- Nobody writes trip_members from the client: both RPCs are definers.
create table if not exists public.trip_join_requests (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (trip_id, user_id)
);

alter table public.trip_join_requests enable row level security;

drop policy if exists "join requests read own" on public.trip_join_requests;
create policy "join requests read own" on public.trip_join_requests
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "join requests read owner" on public.trip_join_requests;
create policy "join requests read owner" on public.trip_join_requests
  for select to authenticated using (
    exists (
      select 1 from public.trips t
      where t.id = trip_join_requests.trip_id and t.owner_id = auth.uid()
    )
  );

drop policy if exists "deny disabled" on public.trip_join_requests;
create policy "deny disabled" on public.trip_join_requests
  as restrictive for select to authenticated using (not public.is_disabled());

revoke all on public.trip_join_requests from public, anon, authenticated;
grant select on public.trip_join_requests to authenticated;

create or replace function public.request_trip_join(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_trip public.trips;
  v_access public.trip_member_access;
  v_link text;
  v_id uuid;
begin
  if v_actor is null or public.is_disabled() then
    raise exception 'Sign in with an enabled account.' using errcode = '42501';
  end if;

  -- The same predicate as the invite reader. A trashed trip has no live code.
  select t.* into v_trip
  from public.trips t
  where upper(t.invite_code) = upper(trim(p_code))
    and t.deleted_at is null
  limit 1;
  if v_trip.id is null then
    raise exception 'Invite is unavailable.' using errcode = '42501';
  end if;
  if v_trip.owner_id = v_actor then
    raise exception 'You already own this trip.' using errcode = '42501';
  end if;
  if exists (select 1 from public.trip_members m where m.trip_id = v_trip.id and m.user_id = v_actor) then
    raise exception 'You are already a member of this trip.' using errcode = '42501';
  end if;

  select a.* into v_access
  from public.trip_member_access a
  where a.trip_id = v_trip.id and a.user_id = v_actor;
  if v_access.state = 'removed' or (v_access.owner_id is not null and v_access.owner_id <> v_trip.owner_id) then
    raise exception 'Ask the owner to restore your access.' using errcode = '42501';
  end if;

  -- The role the link gives now. A missing row means editor, as join_trip reads it.
  v_link := coalesce((select r.role from public.trip_invite_role r where r.trip_id = v_trip.id), 'editor');

  -- A pending request stays pending. A declined request, or one whose member has
  -- since left, opens again. The role is the link role at this moment.
  insert into public.trip_join_requests (trip_id, user_id, role, status, decided_at)
    values (v_trip.id, v_actor, v_link, 'pending', null)
  on conflict (trip_id, user_id) do update
    set role = excluded.role, status = 'pending', decided_at = null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.request_trip_join(text) from public, anon;
grant execute on function public.request_trip_join(text) to authenticated;

create or replace function public.decide_trip_join(p_request uuid, p_approve boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_req public.trip_join_requests;
  v_trip public.trips;
  v_access public.trip_member_access;
  v_link text;
  v_cap text;
  v_role text;
begin
  if v_actor is null or public.is_disabled() then
    raise exception 'Sign in with an enabled account.' using errcode = '42501';
  end if;

  select r.* into v_req
  from public.trip_join_requests r
  where r.id = p_request
  for update;
  if v_req.id is null then
    raise exception 'Request not found.' using errcode = '42501';
  end if;

  select t.* into v_trip
  from public.trips t
  where t.id = v_req.trip_id
  for update;

  -- Only the owner decides. Anyone else gets the answer for a missing row.
  if v_trip.owner_id is distinct from v_actor then
    raise exception 'Request not found.' using errcode = '42501';
  end if;

  -- A decided request does not change. The same decision again is a no-op.
  if v_req.status <> 'pending' then
    if (v_req.status = 'approved') = p_approve then
      return v_req.status;
    end if;
    raise exception 'This request was already decided.' using errcode = '42501';
  end if;

  if not p_approve then
    update public.trip_join_requests
      set status = 'declined', decided_at = now()
      where id = v_req.id;
    return 'declined';
  end if;

  if v_trip.deleted_at is not null then
    raise exception 'Restore the trip before you approve a request.' using errcode = '42501';
  end if;

  -- The member gets the lower of the stored role and the link role now (1124b).
  v_link := coalesce((select r.role from public.trip_invite_role r where r.trip_id = v_trip.id), 'editor');
  v_cap := case when v_req.role = 'viewer' or v_link = 'viewer' then 'viewer' else 'editor' end;

  select a.* into v_access
  from public.trip_member_access a
  where a.trip_id = v_trip.id and a.user_id = v_req.user_id
  for update;

  v_role := case
    when v_access.user_id is null then v_cap
    when v_access.state = 'active' then v_access.role
    when array_position(array['viewer', 'commenter', 'editor', 'owner'], v_access.role)
      <= array_position(array['viewer', 'commenter', 'editor', 'owner'], v_cap) then v_access.role
    else v_cap
  end;

  -- The same member writes join_trip makes.
  insert into public.trip_member_access (trip_id, user_id, owner_id, state, role, joined_at)
    values (v_trip.id, v_req.user_id, v_trip.owner_id, 'active', v_role,
      floor(extract(epoch from clock_timestamp()) * 1000))
    on conflict (trip_id, user_id) do update
      set state = 'active', role = excluded.role,
          revision = public.trip_member_access.revision + 1;

  insert into public.trip_members (trip_id, user_id, role, joined_at)
    select trip_id, user_id, role, joined_at
    from public.trip_member_access
    where trip_id = v_trip.id and user_id = v_req.user_id
    on conflict (trip_id, user_id) do nothing;

  update public.trips
    set access_version = access_version + 1
    where id = v_trip.id;

  update public.trip_join_requests
    set status = 'approved', decided_at = now()
    where id = v_req.id;

  return 'approved';
end;
$$;

revoke all on function public.decide_trip_join(uuid, boolean) from public, anon;
grant execute on function public.decide_trip_join(uuid, boolean) to authenticated;

commit;
