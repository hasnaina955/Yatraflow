-- ============ pub_events retention: the log prunes itself ===================
-- pub_events grows one row per recorded visit/fork, forever, on every public
-- page a visitor opens. Nothing reads a step older than the reader's own
-- horizon: `get_creator_funnel` (20260921_pub_funnel_events.sql) clamps its
-- window at 730 days, and the hub's widest offered control is 90. So a row
-- past 730 days is pure storage cost — it can never appear in any window the
-- UI offers or can offer.
--
-- WHY 730 AND NOT SMALLER: the retention window must be >= the widest window
-- any reader can ask for, or pruning would manufacture a "recording began"
-- date the log never had. 730 is the reader's own clamp, so the two are
-- pinned together rather than merely both being true today.
--
-- WHY NOT DELETE WHERE AT < NOW() - INTERVAL: hardcoding the interval in two
-- places (reader and pruner) is how they drift apart — a shorter pruner would
-- silently shrink the funnel's memory while every test still passed.

-- 1. The pruner -------------------------------------------------------------
-- SECURITY DEFINER so it can run from cron as the owner with no role dance;
-- it deletes nothing a reader could have read (rows the SELECT policy "pub_events
-- read own publications" returns to ANY creator are not pruned either — the
-- predicate is purely `at`, not ownership).
create or replace function public.prune_pub_events(p_keep_days integer default 730)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_horizon timestamptz;
  v_deleted integer;
begin
  -- Same clamp the reader uses: a caller cannot prune beyond the reader's
  -- own horizon, and a smaller call prunes less, never more.
  v_keep_days := greatest(1, least(coalesce(p_keep_days, 730), 730));
  v_horizon := now() - make_interval(days => v_keep_days);

  delete from public.pub_events
  where at < v_horizon;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_pub_events(integer) from public, anon;
grant execute on function public.prune_pub_events(integer) to authenticated;

-- 2. The schedule (OPTIONAL — same stance as 20260910_schedule_purge.sql) ----
-- PREREQUISITE: the pg_cron extension must be enabled first —
--   Dashboard → Database → Extensions → search "pg_cron" → enable.
-- On plans without pg_cron, prune manually (or on any schedule you like):
--   select public.prune_pub_events();
--
-- Undo the schedule: select cron.unschedule('yatraflow-prune-pub-events');
-- (Comment out this block to apply the function without scheduling it.)
--
-- select cron.schedule('yatraflow-prune-pub-events', '30 4 * * *', 'select public.prune_pub_events();');
