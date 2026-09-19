-- ============================================================================
-- M6 · B2 — keep trips.updated_at on the database clock
-- ============================================================================
-- The realtime stale-update guard (src/store/store.ts, via isStaleServerRow in
-- src/lib/realtimeCore.ts) orders incoming remote rows against the last
-- SERVER-applied updated_at per trip. For those timestamps to mean anything
-- they must come from ONE clock — the database's. The column existed with a
-- default, but nothing refreshed it on UPDATE, so every row kept its creation
-- timestamp; until this trigger is applied, equal timestamps are the NORMAL
-- case for every remote update, which is exactly why the guard treats
-- EQUAL as APPLY (only strictly-older rows are dropped as replays).
--
-- Idempotent: safe to re-run. CREATE OR REPLACE FUNCTION + drop/re-create
-- trigger.
-- ============================================================================

create or replace function public.trips_touch_updated_at()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.updated_at = (extract(epoch from now()) * 1000)::bigint;
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row execute function public.trips_touch_updated_at();
