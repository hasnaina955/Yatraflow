-- ============================================================================
-- PR #867 — PHASE A (expand). Safe to apply BEFORE the deploy.
--
-- This is the additive half of supabase/migrations/20261025_profile_public_boundary.sql.
-- It creates everything the new client needs and closes nothing the current
-- client still uses. Old code and new code both work while this is live.
--
-- NOT included here (that is Phase B, phase-b-contract.sql):
--   - dropping the permissive `profiles read` policy
--   - revoking anon SELECT on public.profiles
--   - removing public.profiles from the supabase_realtime publication
-- Those three break the currently deployed client and must land after the deploy.
--
-- Re-run safe: every statement is idempotent.
-- ============================================================================
begin;

-- ---------------------------------------------------------------- 1. the signal
create or replace function public.safe_social_links(p_links jsonb)
returns jsonb
language sql
immutable
security definer
set search_path = public
as $$
  select case
    when jsonb_typeof(p_links) <> 'object' then '{}'::jsonb
    else jsonb_strip_nulls(jsonb_build_object(
      'youtube', case when jsonb_typeof(p_links -> 'youtube') = 'string'
        then nullif(btrim(p_links ->> 'youtube'), '') end,
      'instagram', case when jsonb_typeof(p_links -> 'instagram') = 'string'
        then nullif(btrim(p_links ->> 'instagram'), '') end
    ))
  end
$$;

-- ------------------------------------------------------- 2. the safe projection
create table if not exists public.profile_cards (
  id                uuid primary key references public.profiles (id) on delete cascade,
  name              text not null default 'Traveller',
  avatar_url        text,
  is_creator        boolean not null default false,
  creator_bio       text,
  social_links      jsonb not null default '{}'::jsonb,
  creator_available boolean not null default true
);

-- ------------------------------------------------- 3. keep it in step, always
create or replace function public.sync_profile_card()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.profile_cards where id = old.id;
    return old;
  end if;
  insert into public.profile_cards
    (id, name, avatar_url, is_creator, creator_bio, social_links, creator_available)
  values
    (new.id, new.name, new.avatar_url, new.is_creator, new.creator_bio,
     public.safe_social_links(new.social_links), not new.is_disabled)
  on conflict (id) do update set
    name = excluded.name,
    avatar_url = excluded.avatar_url,
    is_creator = excluded.is_creator,
    creator_bio = excluded.creator_bio,
    social_links = excluded.social_links,
    creator_available = excluded.creator_available;
  return new;
end;
$$;

drop trigger if exists profiles_sync_card on public.profiles;
create trigger profiles_sync_card
  after insert or update or delete on public.profiles
  for each row execute function public.sync_profile_card();

-- Backfill every existing profile. A re-run touches nothing.
insert into public.profile_cards
  (id, name, avatar_url, is_creator, creator_bio, social_links, creator_available)
select
  p.id, p.name, p.avatar_url, p.is_creator, p.creator_bio,
  public.safe_social_links(p.social_links), not p.is_disabled
from public.profiles p
on conflict (id) do nothing;

-- --------------------------------------------------------- 4. the public read
create or replace function public.get_public_profile_cards(p_ids uuid[] default null)
returns setof public.profile_cards
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if coalesce(public.is_disabled(), false) then
    return;
  end if;
  if p_ids is null then
    return query
      select c.id, c.name, c.avatar_url, c.is_creator, c.creator_bio, c.social_links, c.creator_available
      from public.profile_cards c;
  end if;
  return query
    select c.id, c.name, c.avatar_url, c.is_creator, c.creator_bio, c.social_links, c.creator_available
    from public.profile_cards c
    where c.id = any(p_ids);
end;
$$;

revoke all on function public.get_public_profile_cards(uuid[]) from public;
grant execute on function public.get_public_profile_cards(uuid[]) to anon, authenticated;

revoke all on function public.safe_social_links(jsonb) from public, anon, authenticated;
revoke all on function public.sync_profile_card() from public, anon, authenticated;

-- ------------------------------------------------- 5b. the projection's own ACL
revoke all on public.profile_cards from public;
revoke all on public.profile_cards from anon, authenticated;
grant select on public.profile_cards to anon, authenticated;

alter table public.profile_cards enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profile_cards' and policyname = 'profile_cards read'
  ) then
    create policy "profile_cards read" on public.profile_cards
      for select using (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profile_cards' and policyname = 'deny disabled'
  ) then
    create policy "deny disabled" on public.profile_cards
      as restrictive for all to authenticated using (not public.is_disabled());
  end if;
end;
$$;

-- ------------------------------------- 6. Realtime: the ADDITIVE half only
-- New code subscribes to `profile_cards`. Adding it now is invisible to the
-- current client, which only listens on `profiles`. `profiles` stays published
-- until Phase B, so the old client keeps its live updates through the deploy.
do $$
begin
  begin
    alter publication supabase_realtime add table public.profile_cards;
  exception when duplicate_object then null;
             when others then raise;
  end;
end;
$$;

-- ------------------------------------------- 7. admin audit: the disabled bypass
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_audit' and policyname = 'deny disabled'
  ) then
    create policy "deny disabled" on public.admin_audit
      as restrictive for all to authenticated using (not public.is_disabled());
  end if;
end;
$$;

-- Make PostgREST re-read the schema now rather than on its next DDL event.
-- Without this a freshly created table or function can keep answering 404 until
-- the cache refreshes on its own.
notify pgrst, 'reload schema';

commit;
