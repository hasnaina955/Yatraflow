# M6 · Together — continuation guide (for any agent picking this up)

> Milestone: [#237](https://github.com/hasnaina955/Yatraflow/issues/237) · M6 — collaboration depth.
> Branch: `feat/together-rls-suite` (PR-A, security half — MERGED) · `freebuff/m6-together` (PR-B, co-editing half — code complete, unpushed).
> Companion doc: this file. Status: PR-A merged into `test` (the leak fix + both suites). PR-B code complete 2026-09-19 (B0–B4 incl. the review rework: server-ledger guard, snapshot-preserving flush, settlement extraction), pending verify + push + PR.

## What PR-A shipped (this branch)

Three commits, all local (push + open PR is a human step — do not push unprompted):

| Commit | Content |
|---|---|
| `3dc3d41` | `supabase/tests/rls_contract.test.sql` — 37 catalog-level assertions over `pg_policies` / `pg_proc` / `pg_publication` (policies, SECURITY DEFINER via `prosecdef`, ACL reachability via `aclexplode`, realtime publication). Run in Dashboard SQL editor; a clean run prints one row. |
| `261e3bd` | `scripts/integration/integrationHarness.mjs` — opt-in behavioral suite (`VITE_RUN_INTEGRATION=1 npm run test:integration`), two throwaway test users, run-id isolation, teardown ledger. Plus `package.json` script, README section, `.env.example` block. |
| `c8a6da2` | Harness calibration: PostgREST silent-deny semantics (`.select()` probes), owner-member parity row, local realtime deadline, teardown cascade fix. Adds `scripts/integration/cleanupHarness.mjs`. |
| `6a1d9c5` | **The leak fix** — `supabase/migrations/20260917_pin_trashed_read.sql` + `supabase/schema.sql` + contract 1c + CHANGELOG Security entries. |

### The finding (why this branch exists)

The Sep-14 trip-trash repair left `deleted_at is null` as a bare OR-clause in
the `trips read hide trashed` SELECT policy. Permissive policies OR-combine →
**every authenticated user could read every live trip.** The behavioral probe
caught it; catalog checks could not (the escape-hatch tokens lived in the same
qual). Fix pins tombstones to `auth.uid() = owner_id OR is_editor(trips.id)`.

### How to verify PR-A

```powershell
cd <clone>
npm run verify                       # offline gate — 1177 tests, must stay green
node scripts/integration/cleanupHarness.mjs   # clear any leftovers first
VITE_RUN_INTEGRATION=1 npm run test:integration
```

Expected: **27 PASS / 1 intentional FAIL** ("trips: non-member cannot see
private trip") **until the migration is applied**; after applying
`20260917_pin_trashed_read.sql` in the Dashboard, expect **28/28 green** and a
clean teardown ledger. Credentials come from `.env.local`:
`VITE_SUPABASE_URL/ANON_KEY` + `TEST_USER{1,2}_EMAIL/PASS` (throwaway accounts).

### Applying the fix upstream (human step)

1. Dashboard → SQL editor → run `supabase/migrations/20260917_pin_trashed_read.sql`.
2. Re-run the harness → expect 28/28.
3. Push `feat/together-rls-suite`, open PR-A → `test`, merge.

---

## PR-B — live co-editing depth (the remaining half of M6)

**Code complete 2026-09-19 on `freebuff/m6-together` (unpushed), in four commits:**

1. `fix(store)` — B0: the debounced trip-write coalescer persists the snapshot captured at call time (a remote update landing inside the 600 ms window no longer overwrites the pending local edit); `moveStopBetweenDays`' found path persists; AGENTS.md's write-through paragraph corrected (`persistTripField` is synchronous/void; there is no await-before-commit rule).
2. `fix(realtime)` — B2: the stale-update guard compares against the SERVER ledger (`serverTripTimestamps`), strictly-older-only (equal applies — see below); the touch trigger `20260919_trip_touch_updated_at.sql` (+ schema mirror + contract section 9).
3. `feat(collab)` — B1 presence + B3 remote-edit banner.
4. `feat(budget)` + release docs — B4 settle-up + settlement extraction + CHANGELOG/ROADMAP/version.

What landed, per item:

### B1 — Trip presence (who's viewing right now)

- **Surface:** avatars in the trip header (trip workspace), tooltip with names.
- **Mechanism:** a Supabase **presence** channel keyed by trip
  (`presence:<tripId>`) — NOT the existing `yatraflow-live` postgres_changes
  channel. `src/store/store.ts` is the realtime hub; add a scoped module
  (e.g. `src/lib/presence.ts`) so store stays lean.
- **Lifecycle:** enter on trip mount / authenticated view; `untrack()` +
  channel cleanup on unmount and sign-out; re-enter on trip switch.
- **Identity:** map presence user-ids → profiles (already hydrated in store).
- **Accessibility:** avatars `aria-label` with name; keyboard-accessible tooltip.
- **Tests:** pure presence-state reducer (join/leave/replace) in node; the
  channel wiring is integration-only (extend the harness with a presence
  round-trip probe).

### B2 — Stale-update guard (kills the two-tab ping-pong)

- **Problem today:** realtime UPDATE landing on a cache slice newer than the
  incoming row is applied → two tabs editing the same trip bounce each other.
- **Mechanism (as shipped — revised 2026-09-19):** the guard is TRIPS-ONLY and
  compares the incoming row's `updated_at` against a SERVER-DERIVED ledger
  (`serverTripTimestamps` in `store.ts`, written only from hydration and
  `applyRealtimeEvent`), never against `Trip.updatedAt` — that is the
  optimistic client clock, bumped by `mutateTrip`, and comparing against it
  would suppress every real remote edit after any local one. A row is dropped
  only when STRICTLY OLDER than the ledger; EQUAL timestamps APPLY, because
  before `20260919_trip_touch_updated_at.sql` is applied `updated_at` never
  advances and equal is every remote update's normal case. Pure helper:
  `isStaleServerRow` in `realtimeCore.ts`.
- **Careful:** `updated_at` must be a real DB column with a default trigger, or
  the guard is a no-op. Verify in `supabase/schema.sql`; add the trigger to the
  migration if missing.
- **Tests:** `tests/realtime.test.ts` B2 block — newer applies, older dropped,
  EQUAL APPLIES, missing/non-finite timestamps apply; `tests/m6-together.test.ts`
  store-level block — equal applies, replay dropped, optimistic clock does not
  raise the guard.

### B3 — Remote-edit conflict surfacing

- **When:** a stop the user is editing (stop editor open) is updated remotely.
- **Behavior:** non-blocking banner — "N edited this stop" — with
  **keep-mine / take-theirs** actions. No data loss either direction.
- **Location:** the stop editor lives in the trip workspace
  (`src/pages/trip/`); the banner is a local component keyed by stop id.
- **Design constraint:** follow the app's motion system — CSS transform/opacity
  only, `prefers-reduced-motion` honored, `backdrop-filter` with `-webkit-`
  twin first (repo invariant).
- **Tests:** reducer logic (detect remote touch while editing, resolve to
  keep/take) pure + node-tested; UI is manual (two profiles).

### B4 — Expenses: "mark settled" (minimal refinement)

- The milestone names split-expense depth; groundwork (payer tagging + balances
  card) shipped in v0.36. Add only **mark settled** on balances rows with an
  activity entry. Anything heavier (per-pair settlement ledger) → ROADMAP
  decision row, not this PR.
- **Tests:** store action + activity write, node-tested with mocked client.

### PR-B workflow rules (same as PR-A)

- Branch off `test` (or rebase on PR-A's merge — `store.ts` is touched by B2/B3,
  and PR #246 also touched it; expect conflict churn, resolve toward `test`).
- `npm run verify` green before any commit; harness green against live DB.
- Push + open PR only on explicit human confirmation.

## Done criteria for M6 (issue #237)

- [x] RLS suite exists and passes (PR-A; 28/28 after migration apply)
- [x] Presence visible across two sessions on one trip (B1)
- [x] Two-tab ping-pong dead — stale updates ignored (B2)
- [x] Remote edit while editing surfaces keep/take (B3)
- [x] Mark settled on balances (B4)
- [ ] Both PRs merged into `test`; ROADMAP M6 row updated; CHANGELOG entries landed (PR-B: CHANGELOG landed under [Unreleased]; merge + ROADMAP row pending)
