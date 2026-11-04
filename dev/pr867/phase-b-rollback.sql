-- ============================================================================
-- PR #867 — PHASE B ROLLBACK. Use only if the deploy is reverted after Phase B.
--
-- If Vercel rolls back to the pre-#867 build, that build needs the permissive
-- profile read and the `profiles` realtime stream back. This restores exactly
-- the pre-#867 access state. It does NOT drop `profile_cards` or the RPC — the
-- new objects are harmless to the old code.
--
-- Re-run safe: every statement is guarded.
-- ============================================================================
begin;

drop policy if exists "profiles read self" on public.profiles;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
  for select using (true);

grant select on public.profiles to anon;

do $$
begin
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
             when others then raise;
  end;
end;
$$;

commit;
