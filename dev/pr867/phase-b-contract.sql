-- ============================================================================
-- PR #867 — PHASE B (contract). Apply ONLY AFTER the new code is live.
--
-- This is the breaking half of supabase/migrations/20261025_profile_public_boundary.sql.
-- Every statement here removes something the CURRENT (pre-#867) client still
-- uses, so running it before the deploy breaks the live app:
--   - the current client hydrates the public catalogue with
--     `from('profiles').select('*')` (store.ts:357, 674, 780 on main)
--   - the current client subscribes to `profiles` in RESYNC_TABLES
--
-- Precondition: Phase A applied, #867 merged, Vercel deploy green.
-- Re-run safe: every statement is guarded.
-- ============================================================================
begin;

-- ------------------------------------------------- 5. the private table closes
drop policy if exists "profiles read" on public.profiles;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles read self'
  ) then
    create policy "profiles read self" on public.profiles
      for select to authenticated using (auth.uid() = id);
  end if;
end;
$$;

revoke select on public.profiles from anon;

-- ------------------------------------- 6. Realtime: retire the private table
-- New code already subscribes to `profile_cards` (added in Phase A). This drops
-- the old row stream that carried every column, including email.
do $$
begin
  begin
    alter publication supabase_realtime drop table public.profiles;
  exception when others then null;
  end;
end;
$$;

commit;
