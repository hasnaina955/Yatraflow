-- ============================================================
-- 20260916_admin_delete_user.sql
-- True user deletion for the masteradmin console (companion to Disable).
--
-- WHY: admin_set_disabled is reversible soft-ban; the only way to actually
-- erase an account was the raw Supabase Auth dashboard. This RPC gives the
-- console a real "delete user" that is audited, guarded, and forced through
-- one explicit confirmation path.
--
-- WHAT ONE STATEMENT TAKES WITH IT (schema.sql FK chains):
--   auth.users (DELETE here)
--    └─ profiles                (id → auth.users, on delete cascade)
--        ├─ trips               (owner_id → profiles, cascade) — every owned
--        │                       trip with its JSONB days/expenses AND every
--        │                       collab child (trip_members, suggestions,
--        │                       decisions, activity, notifications,
--        │                       published_itineraries all cascade off trips)
--        ├─ trip_members        (user_id → profiles, cascade) — their
--        │                       memberships in OTHER people's trips vanish;
--        │                       those trips survive for the remaining crew
--        ├─ suggestions         (proposed_by, cascade)
--        ├─ decisions           (raised_by, cascade)
--        ├─ activity            (actor_id, cascade)
--        ├─ notifications       (user_id, cascade)
--        └─ published_itineraries (creator_id, cascade) — GUARDED below
--
-- GUARDS (in order):
--   1. is_admin() inside the function (the grant is only reachability).
--   2. Never delete yourself.
--   3. Never delete the last masteradmin (same check as admin_set_disabled).
--   4. PUBLISHED-ITINERARY PROTECTION: a user with listings on Explore is only
--      deletable when p_force = true — the caller must have SEEN and accepted
--      that the public listings go too. The audit row records the count.
--   5. Audit row is written BEFORE the delete, same transaction (house rule:
--      a failed effect leaves an "attempted" row; a success is never unlogged).
--
-- CAVEATS (deliberate, documented):
--   - A live JWT stays valid until expiry; RLS simply matches nothing (every
--     permissive policy is owner-scoped and the rows are gone), so the account
--     is inert even mid-session. Realtime/notify channels die with the rows.
--   - Historical admin_audit rows where the DELETED USER was the actor
--     cascade away (actor_id → profiles). The deletion's own audit row
--     survives — its actor is the admin performing the delete.
--   - There is no undo. The confirmation UI types the email; the RPC refuses
--     self-deletion and last-admin deletion outright.
--
-- Run in the Supabase SQL editor (management plane). Idempotent.
-- ============================================================

create or replace function public.admin_delete_user(p_user_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_trips int;
  v_pubs int;
  v_admin_count int;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  -- Never delete yourself (mirrors admin_set_disabled's self-harm guard).
  if p_user_id = auth.uid() then
    raise exception 'cannot delete your own admin account';
  end if;
  -- Never strand the app with zero admins.
  if exists (
    select 1 from auth.users
    where id = p_user_id and raw_app_meta_data ->> 'role' = 'masteradmin'
  ) then
    select count(*) into v_admin_count from auth.users
      where raw_app_meta_data ->> 'role' = 'masteradmin'
        and id <> p_user_id;
    if v_admin_count = 0 then
      raise exception 'cannot delete the last admin account';
    end if;
  end if;
  -- Target must exist (and its email rides the audit row — the profile is
  -- about to vanish, so this row is the only remaining record of it).
  select email into v_email from public.profiles where id = p_user_id;
  if not found then
    raise exception 'user not found';
  end if;
  select count(*) into v_trips from public.trips where owner_id = p_user_id;
  select count(*) into v_pubs from public.published_itineraries where creator_id = p_user_id;
  -- PUBLISHED-ITINERARY PROTECTION: Explore listings are public surface; the
  -- console must opt in explicitly (p_force) to destroy them.
  if v_pubs > 0 and not p_force then
    raise exception 'user has % published itinerary(ies) — confirm force to delete them too', v_pubs;
  end if;
  insert into public.admin_audit (actor_id, action, target_type, target_id, detail)
    values (auth.uid(), 'user.delete', 'user', p_user_id::text,
      jsonb_build_object(
        'email', v_email,
        'trips_owned', v_trips,
        'published', v_pubs,
        'force', p_force));
  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'user not found';
  end if;
end;
$$;

grant execute on function public.admin_delete_user(uuid, boolean) to authenticated;
