-- ============================================================================
-- 2026-09-17 — restore the RESTRICTIVE trashed-read policy (live RLS leak)
-- ============================================================================
-- Found by the integration harness (M6): the Sep-14 repair of "trips read
-- hide trashed" dropped the policy's RESTRICTIVE flag AND left a bare
-- `deleted_at is null` OR-clause. Both halves matter: permissive policies
-- OR-combine, so on a PERMISSIVE policy that clause passes every live row
-- for every role the policy touches — EVERY authenticated user could read
-- EVERY live trip (private ones included), bypassing the base `trips read`
-- restriction. The behavioral probe "trips: non-member cannot see private
-- trip" failed on the live project; catalog-only checks stayed green because
-- the escape-hatch tokens (owner_id / auth.uid() / is_editor) all existed in
-- the same qual — token presence is not semantics.
--
-- Restored shape — `as restrictive`, so the policy ANDs with the permissive
-- base read instead of widening it:
--   live rows  pass exactly where "trips read" already admits them;
--   tombstones reach only the owner team (owner + editors) and the admin
--              console — plain members lose them, as v0.47's trash design
--              intends ("hide soft-deleted trips from every normal read").
--
-- The owner/editor/admin clauses are also what the Sep-14 tombstone-WRITE
-- fix exists for: a restrictive policy is evaluated against the UPDATE's
-- added row, and without an accepter for the tombstoned row the update fails
-- 42501 and "Delete" silently no-ops. This expression accepts the writer,
-- so the write path stays green.
--
-- Apply in the dashboard SQL editor (idempotent), then re-run:
--   VITE_RUN_INTEGRATION=1 npm run test:integration
-- Expect "trips: non-member cannot see private trip" green, plus the new
-- tombstone probe (owner reads a tombstone, a plain member cannot).
-- ============================================================================

drop policy if exists "trips read hide trashed" on public.trips;

create policy "trips read hide trashed" on public.trips
  as restrictive for select to authenticated
  using (
    deleted_at is null
    or auth.uid() = owner_id
    or public.is_editor(trips.id)
    or public.is_admin()
  );
