-- ============ Idea bank I-22 / I-15 · the funnel gets events to read ========
-- The bank asks for a per-publication views → forks → sales funnel (I-22) and
-- for view → premium-unlock conversion (I-15). Both rows carry the same
-- blocker, in as many words: "the events do not exist to read yet". This is
-- that half, and only that half.
--
-- WHAT ALREADY EXISTED, AND WHY IT IS NOT ENOUGH
-- ----------------------------------------------
--   * sales — READABLE ALREADY. `entitlements` rows are dated, per-buyer and
--     per-publication, and a creator reads their own through
--     `get_creator_sales` (20260918_payments_security.sql). The sale stage of
--     this funnel needs NO new recording, and adding a second copy here would
--     be a second source of truth for the same sale.
--   * views and forks — NOT USABLE, for three reasons worth naming, because
--     each one changes what the funnel is allowed to claim:
--       1. NO TIME DIMENSION. `published_itineraries.views` / `.copies` are
--          lifetime totals. "412 views" says nothing about whether that is
--          this month or two years, so no rate over a window can be computed
--          from it at all.
--       2. DIFFERENT UNITS, so a ratio between them is a ratio of unlike
--          things: `registerPubView` counts at most ONE view per browser
--          session (sessionStorage) and skips the creator's own visits, while
--          `registerPubCopy` is a raw event count with no dedup and no creator
--          exclusion. Dividing one by the other was never a conversion rate.
--       3. NO HISTORY AFTER DELETION — the counters live on the publication
--          row, which unpublishing deletes.
--
-- WHAT THIS ADDS: one dated event row per funnel step (view / fork), written
-- by the SAME function that bumps the counter, so the counter and the log
-- cannot drift — one write path, not two. An event is written only when the
-- counter actually moved, so an event can never describe a step nobody took.
--
-- PRIVACY: `pub_id` + `kind` + `at`. No user id, no IP, no user agent — the log
-- says a step happened, never who took it. Same stance `admin_revenue` takes
-- about buyers: an analytics row is not a reason to hold an identity.
--
-- WHAT THE EVENT LOG DOES NOT FIX: unpublishing DELETEs the publication row
-- (store.ts `unpublishItinerary`), and `entitlements.pub_id` cascades with it —
-- so a creator's own sales history for an unpublished plan is already gone
-- before this log is involved. That is a pre-existing product decision about
-- unpublish, not a funnel gap, and it is deliberately left alone here rather
-- than half-fixed: the funnel and the sales ledger scope to exactly the same
-- live publications, so the two agree instead of disagreeing.

-- 1. The log ---------------------------------------------------------------

create table if not exists public.pub_events (
  id bigint generated always as identity primary key,
  -- Cascades like every other publication-linked row (entitlements.pub_id), so
  -- an unpublished plan leaves no orphan events behind.
  pub_id text not null references public.published_itineraries (id) on delete cascade,
  kind text not null,
  at timestamptz not null default now(),
  constraint pub_events_kind_check check (kind in ('view', 'fork'))
);

-- The reader aggregates one publication over a date window; this is that path.
create index if not exists pub_events_pub_at_idx on public.pub_events (pub_id, at desc);

-- 2. Row-level security ----------------------------------------------------
-- Rows are written ONLY by the security-definer function below — there is no
-- insert/update/delete policy for anon or authenticated, exactly like the
-- counters it maintains. A creator may read their own publications' events,
-- which is what the funnel RPC reads past.

alter table public.pub_events enable row level security;

-- Postgres has no CREATE POLICY IF NOT EXISTS, so a re-run (a partial first
-- application, a re-paste) would die with 42710 here. Drop-then-create keeps
-- this file re-runnable, the 20260918_payments_rail.sql precedent.
drop policy if exists "pub_events read own publications" on public.pub_events;
create policy "pub_events read own publications" on public.pub_events
  for select to authenticated
  using (exists (
    select 1
    from public.published_itineraries p
    where p.id = pub_id and p.creator_id = auth.uid()
  ));

-- 3. ONE write path: the counter bump also records the dated event ----------
-- Kept as the SAME function (name, parameters, grants, and the anon callers
-- already shipped in client bundles) rather than a new one, because two
-- functions that both write these counts is how a counter and its log start
-- disagreeing. `p_kind` stays 'views'/'copies' for its callers; the log
-- normalizes to 'view'/'fork'.
--
-- The `not found` guard matters twice over. It means an event can only exist
-- for a publication that exists (so the anon-callable RPC cannot be used to
-- stuff the log with arbitrary ids), and it keeps the log from describing a
-- step when the counter did not move.

create or replace function public.bump_published_stats(p_id text, p_kind text)
returns void as $$
declare
  v_kind text;
begin
  if p_kind = 'views' then
    update public.published_itineraries set views = views + 1 where id = p_id;
    v_kind := 'view';
  elsif p_kind = 'copies' then
    update public.published_itineraries set copies = copies + 1 where id = p_id;
    v_kind := 'fork';
  else
    return;  -- unknown kind: no counter, no event
  end if;

  -- FOUND is the UPDATE's own result: publication row missing (unpublished or
  -- never issued) means nothing to count and nothing to record.
  if not found then
    return;
  end if;

  insert into public.pub_events (pub_id, kind) values (p_id, v_kind);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.bump_published_stats(text, text) to anon, authenticated;

-- 4. The creator-scoped reader ---------------------------------------------
-- Daily buckets rather than a fixed window: the client owns the window control
-- (7 / 30 / 90 days), so switching it costs no round trip, and a single
-- aggregate shape serves totals, trends and the "recording began" date.
--
-- Scoped by the caller's own auth.uid() inside a security-definer function —
-- the `get_creator_sales` precedent — so a caller cannot read another
-- creator's funnel by passing an id, and a half-applied migration surfaces as
-- an error instead of a silent zero.
--
-- p_days is clamped: a caller asking for 100000 days gets a year and a half of
-- buckets, not an unbounded aggregate.

create or replace function public.get_creator_funnel(p_days integer default 180)
returns table (pub_id text, day date, views bigint, forks bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    e.pub_id,
    (e.at at time zone 'utc')::date as day,
    count(*) filter (where e.kind = 'view') as views,
    count(*) filter (where e.kind = 'fork') as forks
  from public.pub_events e
  where e.pub_id in (
      select p.id from public.published_itineraries p
      where p.creator_id = auth.uid()
    )
    and e.at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 180), 730)))
  group by e.pub_id, day
  order by day desc;
$$;

-- Authenticated only. `revoke ... from public` does NOT revoke from anon on
-- Supabase — the default privileges grant EXECUTE to anon/authenticated
-- directly, so the roles are named (AGENTS §3).
revoke all on function public.get_creator_funnel(integer) from public, anon;
grant execute on function public.get_creator_funnel(integer) to authenticated;
