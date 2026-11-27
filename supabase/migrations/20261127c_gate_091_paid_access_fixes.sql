-- ============================================================
-- 20261127c_gate_091_paid_access_fixes.sql
--
-- Gate fixes for v0.91.0 paid-access boundary:
--   1. purchase_orders_pending_guard: lock trip then publication with
--      FOR NO KEY UPDATE on pending inserts. Recheck link, listing and price.
--      Set created_at with clock_timestamp() after both locks.
--   1a. create_pending_purchase_order: check inputs and insert a pending
--      row so both RPC and direct inserts share the trigger guard.
--   2. publication_unpublished_at_guard: stamp first withdrawal with
--      clock_timestamp() and ignore client values. Keep the first stamp on
--      retries. Allow null on republish.
--   3. published read: allow listed guides and authorized readers.
--      Anon crawlers no longer see private or trashed trips.
--   4. get_trip_by_invite_code: restore active members for the current owner.
--      Missing trip_members rows go to join_trip, not owner approval.
--
-- Re-runnable: uses drop function/policy/trigger if exists and create or replace.
-- ============================================================
begin;

-- ---------------------------------------------- 1. pending order insert guard
drop trigger if exists purchase_orders_pending_guard on public.purchase_orders;
drop function if exists public.guard_pending_purchase_order();
create or replace function public.guard_pending_purchase_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip_id uuid;
  v_trip public.trips;
  v_pub public.published_itineraries;
  v_disabled boolean;
begin
  if new.user_id is null
    or new.pub_id is null or btrim(new.pub_id) = ''
    or new.razorpay_order_id is null or btrim(new.razorpay_order_id) = ''
    or new.amount_inr is null or new.amount_inr < 1 or new.amount_inr > 100000
    or new.price_snapshot_inr is null or new.price_snapshot_inr is distinct from new.amount_inr then
    raise exception 'Invalid order parameters.' using errcode = '22023';
  end if;

  -- Read the candidate trip id first without locking.
  select p.trip_id into v_trip_id
  from public.published_itineraries p
  where p.id = new.pub_id;
  if not found or v_trip_id is null then
    raise exception 'This guide is no longer for sale.' using errcode = 'PT410';
  end if;

  -- Lock trip then publication to match admin delete order.
  select t.* into v_trip
  from public.trips t
  where t.id = v_trip_id
  for no key update;
  if not found then
    raise exception 'This guide is no longer for sale.' using errcode = 'PT410';
  end if;

  select p.* into v_pub
  from public.published_itineraries p
  where p.id = new.pub_id
  for no key update;
  if not found then
    raise exception 'This guide is no longer for sale.' using errcode = 'PT410';
  end if;

  select pr.is_disabled into v_disabled
  from public.profiles pr
  where pr.id = new.user_id;
  if not found or v_disabled then
    raise exception 'This account cannot buy right now.' using errcode = '42501';
  end if;

  if v_pub.creator_id = new.user_id then
    raise exception 'This is your own publication.' using errcode = '42501';
  end if;

  -- Recheck link, listing and price under both locks.
  if v_pub.trip_id is distinct from v_trip.id
    or v_pub.unpublished_at is not null
    or v_trip.visibility is distinct from 'public'
    or v_trip.deleted_at is not null
    or v_pub.creator_id is distinct from v_trip.owner_id
    or v_pub.premium_price_inr is null
    or v_pub.premium_price_inr < 1
    or v_pub.premium_price_inr is distinct from new.amount_inr
    or v_pub.premium_price_inr is distinct from new.price_snapshot_inr then
    raise exception 'This guide is no longer for sale.' using errcode = 'PT410';
  end if;

  new.created_at := clock_timestamp();
  return new;
end;
$$;

revoke all on function public.guard_pending_purchase_order() from public, anon, authenticated;

create trigger purchase_orders_pending_guard
  before insert on public.purchase_orders
  for each row
  when (new.status = 'pending')
  execute function public.guard_pending_purchase_order();

-- ---------------------------------------------- 1a. atomic pending order RPC
drop function if exists public.create_pending_purchase_order(uuid, text, text, integer);
create or replace function public.create_pending_purchase_order(
  p_user_id uuid,
  p_pub_id text,
  p_razorpay_order_id text,
  p_expected_price_inr integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null
    or p_pub_id is null or btrim(p_pub_id) = ''
    or p_razorpay_order_id is null or btrim(p_razorpay_order_id) = ''
    or p_expected_price_inr is null or p_expected_price_inr < 1 or p_expected_price_inr > 100000 then
    raise exception 'Invalid order parameters.' using errcode = '22023';
  end if;

  -- Rely on purchase_orders_pending_guard for row locks, checks, and clock.
  insert into public.purchase_orders (
    user_id, pub_id, razorpay_order_id, amount_inr, currency, status, price_snapshot_inr
  )
  values (
    p_user_id, p_pub_id, p_razorpay_order_id, p_expected_price_inr, 'INR', 'pending', p_expected_price_inr
  );

  return 'minted';
end;
$$;

revoke all on function public.create_pending_purchase_order(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.create_pending_purchase_order(uuid, text, text, integer) to service_role;

-- ---------------------------------------------- 1b. withdrawal clock guard
-- Stamp first withdrawal from clock_timestamp() and ignore client values.
-- Keep the first stamp on retries. Republish clears unpublished_at to null.
drop trigger if exists publication_unpublished_at_guard on public.published_itineraries;
drop function if exists public.guard_publication_unpublished_at();
create or replace function public.guard_publication_unpublished_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unpublished_at is not null then
    if old.unpublished_at is null then
      new.unpublished_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    else
      new.unpublished_at := old.unpublished_at;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_publication_unpublished_at() from public, anon, authenticated;

create trigger publication_unpublished_at_guard
  before update on public.published_itineraries
  for each row execute function public.guard_publication_unpublished_at();

-- ---------------------------------------------- 2. publication SELECT boundary
-- Keep trip_access_level(uuid) revoked from clients; expose only a boolean
-- helper scoped by pub_id for the published_itineraries SELECT policy.
alter table public.published_itineraries enable row level security;
drop policy if exists "published read" on public.published_itineraries;
drop function if exists public.can_read_publication(text);
create or replace function public.can_read_publication(p_pub_id text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pub public.published_itineraries;
begin
  if p_pub_id is null or btrim(p_pub_id) = '' then
    return false;
  end if;

  if public.is_disabled() then
    return false;
  end if;

  select p.* into v_pub
  from public.published_itineraries p
  where p.id = p_pub_id;
  if not found then
    return false;
  end if;

  if public.publication_is_listed(v_pub.id) then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  if v_pub.creator_id = auth.uid() or public.is_admin() then
    return true;
  end if;

  if v_pub.trip_id is null then
    return false;
  end if;

  return public.trip_access_level(v_pub.trip_id) in ('crew', 'buyer');
end;
$$;

revoke all on function public.can_read_publication(text) from public, anon, authenticated;
grant execute on function public.can_read_publication(text) to anon, authenticated;

create policy "published read" on public.published_itineraries
  for select using (public.can_read_publication(id));

-- ---------------------------------------------- 3. invite repair on priced trips
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
    -- An active member for the current owner with a missing trip_members row
    -- reaches join_trip to restore their role rather than owner approval.
    if v_level <> 'crew'
      and auth.uid() is not null
      and exists (
        select 1 from public.trip_member_access a
        where a.trip_id = v_row.id
          and a.user_id = auth.uid()
          and a.state = 'active'
          and a.owner_id = v_row.owner_id
      ) then
      v_level := 'crew';
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

commit;
