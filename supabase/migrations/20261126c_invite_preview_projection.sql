-- ============================================================================
-- Invite preview projection. Show the trip owner and the link's role.
--
-- The signed-out invite preview includes two fields beside the trip facts:
--
--   owner_first_name — the first name or handle of the trip owner.
--   invite_role      — 'editor' or 'viewer', the role the code admits
--                      (trip_invite_role, #1012; a missing row means editor,
--                      exactly as join_trip reads it).
--
-- DISCLOSURE. This function is callable by an anonymous visitor holding only a
-- code, so its return shape IS the allowlist. The two added fields cost nothing
-- new:
--   * `owner_id` is already in the projection, and `public.profile_cards` is
--     already a public read (#800), so the owner's display name was derivable
--     from the same code with one extra request. The projection saves a round
--     trip; it does not widen the boundary.
--   * `invite_role` is the capability the code itself confers, which join_trip
--     already applies.
-- Nothing else is projected: no email, no user id beyond the existing
-- `owner_id`, no member list, no full name.
--
-- TWO LAYERS OF NAME NORMALISATION. `invite_first_name` is the server half, so
-- no client can be the only thing standing between a display name and an
-- anonymous page: first token only, a leading '@' stripped, control and
-- whitespace characters removed, and 24 characters at most. A token that still
-- carries '@', '/' or ':' is an address or a URL rather than a name, a token
-- made only of digits and phone separators is a phone number in any shape
-- (`+91.98765.43210`, `(022).123.4567`, `-`), and a dotted alphanumeric token is
-- a web address (`www.example.com`): all return NULL.
-- The refusal is a list of shapes that cannot be a name, never a list of letters
-- a name must use: a name in any script passes (`प्रिया`, `Анна`, `田中`), and the
-- ARE engine has no script-independent letter class to test with.
-- The client uses a generic headline when the owner name is absent.
--
-- Re-runnable: the function is dropped before the type it returns, and the type
-- is dropped before it is created.
-- ============================================================================
begin;

-- ------------------------------------------------------- 1. the name normaliser
create or replace function public.invite_first_name(p_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when v.tok is null then null
    when v.tok ~ '[@/:]' then null
    when v.tok ~ '^[0-9 ()+.-]+$' then null
    when v.tok ~* '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then null
    when length(v.tok) > 24 then left(v.tok, 23) || '…'
    else v.tok
  end
  from (
    select nullif(rtrim(left(ltrim(substring(btrim(coalesce(p_name, '')) from '^[^[:space:]]+'), '@'), 120), '.'), '') as tok
  ) as v
$$;

revoke all on function public.invite_first_name(text) from public, anon, authenticated;

-- --------------------------------------------------- 2. the projection's shape
-- A named composite type, so the shape the function returns IS the allowlist
-- and no caller can ask for a column that is not in it. The first 33 members
-- are the trips columns #1020 approved, unchanged and in the same order; the
-- last two are the fields this migration adds.
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
drop type if exists public.trip_invite_preview;

create type public.trip_invite_preview as (
  id uuid,
  owner_id uuid,
  name text,
  start_location text,
  destinations jsonb,
  start_date text,
  end_date text,
  travellers integer,
  transport_mode text,
  budget_per_person_inr integer,
  travel_style text,
  fixed_commitments jsonb,
  days jsonb,
  expenses jsonb,
  cover_emoji text,
  visibility text,
  created_at bigint,
  updated_at bigint,
  start_location_coords jsonb,
  destination_coords jsonb,
  fuel_economy_km_per_l numeric,
  fuel_price_per_l numeric,
  round_trip boolean,
  invite_code text,
  deleted_at timestamptz,
  driver_count integer,
  has_vulnerable boolean,
  drive_after_dinner_min integer,
  vehicle_profile jsonb,
  cover_image_url text,
  stay_style text,
  drives_part boolean,
  write_version bigint,
  owner_first_name text,
  invite_role text
);

-- --------------------------------------------------------------- 3. the read
-- A priced trip needs an entitlement or existing access.
-- The link does not identify who shared it.
create or replace function public.get_trip_by_invite_code(p_code text)
returns setof public.trip_invite_preview
language sql
security definer
set search_path = public
stable
as $$
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
    and not public.is_disabled()
    and (
      t.owner_id = auth.uid()
      or public.is_member(t.id)
      or public.is_admin()

      or public.invite_trip_payment_allows(t.id)
    );
$$;

revoke execute on function public.get_trip_by_invite_code(text) from public, anon;
grant execute on function public.get_trip_by_invite_code(text) to anon, authenticated;

commit;
