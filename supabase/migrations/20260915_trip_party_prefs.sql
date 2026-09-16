-- ============ Party + vehicle preference columns ============
-- #142 (party controls) and the vehicle profile (trip settings) shipped in
-- Day Planner finishing batch (#205/#207), but none of them got a column and
-- none got added to the row mapping. Result: a trip created with "2 drivers /
-- infants / drive after dinner / motorcycle profile" silently reverted to
-- 1 driver / adults / dinner-ends-day / no profile on every reload — the
-- user re-set them every session and they were never persisted.
--
-- This migration gives those fields the columns they should have had.
--
-- **Applied 2026-09-16 to the live Supabase project.** The four ALTER
-- TABLE statements below are idempotent (`add column if not exists`),
-- so this file is safe to re-run against an install that's already
-- up to date.
--
-- Pre-application behaviour: until the columns exist, the store's
-- optional-column probe reports `driverCount: false` /
-- `hasVulnerable: false` / `driveAfterDinner: false` /
-- `vehicleProfile: false` (see `probeOptionalColumns` in
-- `src/store/store.ts`), the columns stay unwritten, and the fields
-- remain session-only — i.e. the old behaviour, not a new break.
-- Once applied, the next session flip probes true and writes
-- persist.
--
-- Nothing else changes:
-- - `driver_count`: NULL means "1 driver" (the legacy default); 2/3 are
--   meaningful values.
-- - `has_vulnerable`: NULL means false (legacy default).
-- - `drive_after_dinner_min`: NULL means "dinner ends the driving day"; 120
--   means "two hours allowed after dinner" — the only value the settings form
--   emits, by a a "max two hours" trip-rule.
-- - `vehicle_profile`: JSONB { vehicleType, fuelType, capacity, economy } —
--   vocabulary-checked on read by `normalizeVehicleProfile` in
--   `src/lib/vehicleProfile.ts`, so a hand-edited or legacy row with junk
--   can't poison the engine's fuel cadence.
--
-- No CHECK constraints on purpose (matching the stay-budget migration): the
-- vocabulary lives in `src/data/types.ts`, and a rejected write is worse
-- than an unrecognised value (the client falls back to mode defaults for
-- anything it does not know).

alter table public.trips add column if not exists driver_count int;
alter table public.trips add column if not exists has_vulnerable boolean;
alter table public.trips add column if not exists drive_after_dinner_min int;
alter table public.trips add column if not exists vehicle_profile jsonb;