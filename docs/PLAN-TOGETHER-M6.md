# M6 · Together — continuation guide (for any agent picking this up)

> Milestone: [#237](https://github.com/hasnaina955/Yatraflow/issues/237) · M6 — collaboration depth.
> Branches: `feat/together-rls-suite` (PR-A, security half) · `freebuff/m6-together` (PR-B, co-editing half) — both merged into `test` and pruned.
> Companion doc: this file. **Status (2026-09-21): both halves are shipped.** PR-A merged into `test` (the leak fix + both suites); PR-B merged as **PR #265** on 2026-09-20 and released as **v0.62.0** (B0–B4 incl. the review rework: server-ledger guard, snapshot-preserving flush, settlement extraction), with its Board/socket-gap follow-up `e5bba2a` landing the same day. With both halves merged this doc is a record of how the milestone was built rather than a queue item — the two items M6 still has open are listed under the done criteria below.

## What PR-A shipped

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
- [x] Both PRs merged into `test` (PR-B as **PR #265**, 2026-09-20 — released as v0.62.0); ROADMAP M6 row updated; CHANGELOG entries landed

**Nothing is open on M6 any more — the three items this note used to list shipped on
2026-09-21, in `[Unreleased]`:** **I-19** — a settled expense line genuinely leaves the
balances, because the card's fair share is the open *tagged* lines over the travellers
rather than the trip estimate (a product call: the estimate keeps its place in the metric
strip, where a planning figure belongs); **I-16** — cross-device Trip DNA persistence via
`public.user_dna` (**apply `supabase/migrations/20260921_user_dna.sql`** — until it is
run, a missing table is treated as a capability and the log stays device-local); and the
"just you" presence affordance from follow-up 1 below. What is left is a check rather
than code: the two-account presence pass, after which issue #237 closes.

## Manual-pass follow-ups (2026-09-19) — VERDICTS RECORDED 2026-09-21

Two unconfirmed observations from the owner's first two-browser pass, recorded the same
day (PR #265). **Both shared one confound: the two sessions must be on two
different accounts** — the same account in two tabs explains both misses by design
(presence excludes self; a same-user cross-tab write lands inside the store's echo
window and is suppressed as our own echo, so no realtime event reaches the banner).

**Verdicts: one was by design, the other was a real gap that has since been fixed —
neither was the bug it first looked like.** What remains on both is the two-account
confirmation pass, which cannot be run from this clone (no outbound HTTP from the shell
— AGENTS §3), so it stays a human step rather than a closed question.

1. **"No green dot / where do I look?" — WAS by design, and the design was the
   problem — FIXED 2026-09-21.** Avatars render in the workspace header beside the member
   list (`src/pages/TripWorkspace.tsx` `.presence-stack`), and they rendered ONLY when
   `presence.peers.length > 0` — so a solo viewer got no presence UI at all and could not
   tell an empty room from a feature that was not working. The header now renders from a
   three-state helper (`presenceView` in `src/lib/presence.ts`: `hidden` when presence is
   not running at all — anonymous view, no backend — `solo` when it is running and the
   room is empty, `peers` when the crew is there), and `solo` is a quiet "Just you
   viewing" chip that inherits the member count's own colour recipe instead of adding a
   token. The product follow-up this entry used to park — a quiet "just you" affordance
   so an empty room is visible rather than absent — is therefore shipped, and the three
   states are node-tested (`tests/presence.test.ts`), including a source-invariant that
   the header can no longer go back to a bare peer count. **Still unconfirmed live**, and
   that is the last thing M6 owes: retest with two *distinct* accounts (the harness
   throwaways in `.env.local` work), both open the same trip; expect the other's avatar +
   green dot in each header, gone a few seconds after the peer's tab closes. If it is
   absent on distinct accounts, inspect the `useTripPresence` join state (`SUBSCRIBED`?)
   before touching code.

2. **"Simultaneous same-stop edit showed no amber banner." — REAL GAP, fixed in
   `e5bba2a` (2026-09-20).** The banner only ever surfaced on the Timeline: `BoardView`
   opened the *same* `StopEditor` modal without the banner prop, so a crew member
   editing from the Board edited stale data with no conflict surface at all — a miss the
   original protocol could not have produced, which is why the observation was worth
   keeping. The conflict logic now lives in one shared hook
   (`src/components/useStopConflict.ts`) that both surfaces ride (`TimelineTab.tsx:65`,
   `BoardView.tsx:120`), with a source-invariant test (`tests/remote-edit-banner.test.ts`)
   pinning that neither call site can silently drop it again. The same commit closed the
   second half of the class: the realtime channel subscribed bare, so a socket gap
   (laptop sleep, network switch) dropped every row changed while away — re-subscribes
   now refetch the cached trip rows and dispatch them through the same
   `applyRealtimeEvent` path a live UPDATE takes. The retest protocol still stands for
   the banner itself: open the stop editor in session A FIRST, then edit + save the same
   stop in session B, then watch A.
