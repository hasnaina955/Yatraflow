-- ============================================================================
-- #432 — decisions.resolved_option_id: uuid was a type the app never sent
-- ============================================================================
-- The column is declared `uuid` (supabase/schema.sql), but option ids are
-- never uuids and never were:
--
--   * `addDecision` mints them with `uid('o')`      -> o_l2622hpp0sx
--   * the Map rail's slot votes mint them by hand   -> slot:<key>:<placeId>
--     (load-bearing: resolveDecision parses the part back with
--      /^slot:([a-z]+):/ so a resolved poll fills the part it was raised for,
--      which is why minting uuids everywhere is the wrong fix)
--
-- So EVERY resolve sent text into a uuid column and PostgREST answered 400 /
-- 22P02 `invalid input syntax for type uuid`. `fire()` only console.error'd
-- that, so the UI reported success from the in-memory cache while the row
-- stayed `open` — the resolution silently vanished on the next load, for every
-- user, on every trip. Reproduced live 2026-09-25 (evidence in issue #432).
--
-- Nothing reads the column as uuid: it has no FK, no CHECK and no index, and
-- `restoreRows.decisionToRow` / `rowToDecision` treat it as the option id
-- string it has always been. Widening it to `text` therefore only removes a
-- constraint the app could never satisfy.
--
-- The statement is one idempotent ALTER, safe to re-run (an already-`text`
-- column casts to text with nothing to convert).
--
-- **NOT YET APPLIED** — like every migration in this directory it is run by
-- hand in the Supabase SQL editor; until then `resolveDecision` keeps failing
-- exactly as before, which `npm run check:migrations` reports (this file is
-- declared in NO_PROBE_SURFACE — see the note there for why a presence probe
-- cannot answer for a type change) and tests/decision-resolve.test.ts pins the
-- schema, the migration and the store's payload to each other.
-- ============================================================================

alter table public.decisions
  alter column resolved_option_id type text
  using resolved_option_id::text;
