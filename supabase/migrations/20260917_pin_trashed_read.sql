-- ============================================================================
-- 2026-09-17 — pin "trips read hide trashed" to the owner team
-- ============================================================================
-- Found by the integration harness (PR #237, M6): the Sep-14 repair left a
-- bare `deleted_at is null` OR-clause in the trashed-read SELECT policy.
-- Permissive policies OR-combine, so that clause let EVERY authenticated
-- user read EVERY live trip, bypassing the base `trips read` restriction
-- (owner / public-visibility / member). The behavioral probe
-- "trips: non-member cannot see private trip" failed on the live project.
--
-- Fix: tombstoned rows are visible only to the owner team (owner + editors).
-- This still satisfies the Sep-14 tombstone-WRITE requirement (an owner or
-- editor tombstones a trip; the added row passes via these same clauses).
--
-- Apply in the dashboard SQL editor, then re-run:
--   VITE_RUN_INTEGRATION=1 npm run test:integration
-- Expect "trips: non-member cannot see private trip" to flip green.
-- ============================================================================

drop policy if exists "trips read hide trashed" on public.trips;

create policy "trips read hide trashed" on public.trips
  for select using (
    auth.uid() = owner_id
    or public.is_editor(trips.id)
  );
