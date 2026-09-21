-- ============================================================================
-- I-16 — Trip DNA that survives a device change
-- ============================================================================
-- The DNA engine (src/lib/tripDna.ts) is finished: it learns category affinity,
-- detour tolerance and stop lengths across a user's trips and reranks corridor
-- hits with it. What it never had was somewhere durable to keep the log. It
-- lives in localStorage under `yatraflow_dna_log`, so the profile a person
-- builds on their laptop is invisible on their phone — the one gap left in the
-- M6 row's follow-up list (ROADMAP idea bank, I-16).
--
-- This adds `user_dna`: one row per user, holding the same DnaEvent[] shape the
-- local log already carries, capped client-side at 500 events exactly like the
-- local copy. The primary key IS the owner (user_id), so there is no id/owner
-- split for a policy to get wrong.
--
-- **NOT YET APPLIED.** Until it is run in the Supabase SQL editor:
--   * reads answer PGRST205 ("relation not found"), the store's
--     `attachDnaAccount` catches that, warns once and keeps the device-only
--     behaviour — a missing table is a capability, not a crash;
--   * writes are skipped for the same reason (the probe caches the miss).
-- So the pre-application behaviour is exactly today's, and applying it later is
-- what switches the sync on. README's "apply migrations" section has the
-- dashboard walkthrough.
--
-- RLS: owner-only on all four verbs, `auth.uid() = user_id`. Unlike trips there
-- is no member/editor branch to reason about — the log is behavioural (what
-- THIS person accepted and declined), never crew-visible. The RESTRICTIVE
-- "deny disabled" policy matches every other app table, so a disabled account
-- reads nothing here either (a denied read is not a leak, and the failure mode
-- without it would be a disabled user's DNA still driving their suggestions).
--
-- The vocabulary stays in `src/data/types.ts` (`DnaEvent`), NOT in a CHECK
-- constraint — matching the party-prefs and stay-budget migrations: a rejected
-- write is worse than an unrecognised value, and the client re-normalises every
-- row it reads (`normalizeDnaLog`), so a hand-edited log degrades instead of
-- poisoning the engine.
-- ============================================================================

create table if not exists public.user_dna (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  log        jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_dna enable row level security;

create policy "deny disabled" on public.user_dna
  as restrictive for all to authenticated using (not public.is_disabled());

create policy "user_dna read" on public.user_dna
  for select using (auth.uid() = user_id);

create policy "user_dna insert" on public.user_dna
  for insert with check (auth.uid() = user_id);

create policy "user_dna update" on public.user_dna
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_dna delete" on public.user_dna
  for delete using (auth.uid() = user_id);

-- The admin read bypass every other app table carries, so the masteradmin
-- console's god-view stays uniform (append-only admin_audit is the exception).
create policy "admin read" on public.user_dna
  for select to authenticated using (public.is_admin());
