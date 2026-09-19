-- ============================================================================
-- M6 · B2 — keep trips.updated_at on the database clock
-- ============================================================================
-- The stale-update guard (src/lib/realtimeCore.ts isStaleUpdate) compares an
-- incoming realtime row's updated_at against the cached row's. For those
-- timestamps to be comparable they must come from ONE clock — the database's.
-- The column existed with a default, but nothing refreshed it on UPDATE, so
-- every row kept its creation timestamp and the guard (and any future
-- last-write-wins logic) had no real signal.
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
