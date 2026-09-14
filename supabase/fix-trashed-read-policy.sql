-- =====================================================================
-- TRIP-TRASH RLS REPAIR — run in Dashboard → SQL editor (Sep 14 2026)
-- =====================================================================
-- Symptom: "Delete" on a trip silently no-oped — the trip vanished from
-- My Trips, then reappeared after refresh. Reproduced with a live QA
-- account: the tombstone UPDATE fails with
--   42501 new row violates row-level security policy "trips read hide trashed"
-- because Postgres evaluates every SELECT policy against the UPDATE's
-- ADDED row (deleted_at now set) — and the production policy had no
-- owner/editor clause, so the tombstoned row was unreadable to everyone,
-- including its owner performing the delete.
--
-- The repair: tombstoned rows stay readable to their owner and editors
-- (the app's hydration filters them out of the live list; the Trash view
-- reads them via get_trashed_trips), while everyone else still never sees
-- them. Idempotent: drop + recreate.

-- 1) Replace the too-strict policy -------------------------------------------------
drop policy if exists "trips read hide trashed" on public.trips;
create policy "trips read hide trashed" on public.trips
  for select using (
    deleted_at is null
    or auth.uid() = owner_id
    or public.is_editor(trips.id)
  );

-- 2) Sanity probes (run each in the editor; expected results inline) ---------------
-- The tombstone write must now succeed for an owner (204/no-error, not 42501).
--   replay: PATCH /rest/v1/trips?id=eq.<owned-trip>  {"deleted_at": "<now>"}
-- The trash RPC still only serves the caller's own tombstoned rows:
--   select * from pg_policies where tablename = 'trips' and policyname = 'trips read hide trashed';
--   -> qual should read: (deleted_at IS NULL OR owner_id = auth.uid() OR is_editor(id))
