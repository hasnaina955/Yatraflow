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
-- The function/trigger block below is BYTE-EQUIVALENT to the canonical
-- definition in supabase/schema.sql (B2: touch trigger) — same function name,
-- same body, same search_path — so a fresh instance built from schema.sql and
-- a live instance migrated here call the SAME function. The earlier revision
-- of this migration named its function trips_touch_updated_at, which diverged
-- from the canonical touch_trip_updated_at while defining a trigger of the
-- SAME name: whichever block ran last won, silently.
--
-- Re-run after applying: this revision replaces the diverged function and
-- drops it, leaving only the canonical one. Idempotent: CREATE OR REPLACE
-- FUNCTION + drop/re-create trigger.
-- ============================================================================

create or replace function public.touch_trip_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := (extract(epoch from now()) * 1000)::bigint;
  return new;
end;
$$;

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
  before update on public.trips
  for each row
  execute function public.touch_trip_updated_at();

-- The earlier revision of this migration defined the trigger's job under a
-- different function name (trips_touch_updated_at). The trigger now points at
-- the canonical function; drop the orphan so the database keeps one owner.
drop function if exists public.trips_touch_updated_at();
