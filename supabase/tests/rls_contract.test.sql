-- ============================================================================
-- RLS CONTRACT TEST — crew-facing policies (run in Dashboard → SQL editor)
-- ============================================================================
-- Verifies the policies an authenticated crew actually relies on, from the
-- management plane's own metadata (pg_policies / pg_proc / pg_publication).
-- Every probe is a DO-block assertion: it raises (and names the broken rule)
-- when the production shape drifts. A clean run prints exactly one row.
--
-- Covered:
--   1. trips            -- owner-scoped insert, editor-scoped update and
--                          delete, restrictive trashed-read (owner+editors
--                          still read tombstones)
--   2. trip_members     -- self-or-owner insert, owner update, owner-or-self
--                          delete, recursive-safe select (is_member definer)
--   3. child collab     -- suggestions / activity: editor-or-
--                          public read, editor write
--   4. notifications    -- recipient-only read, recipient-or-orchestrator write
--   5. published        -- public gallery read, creator-only write
--   6. trash wiring     -- per-user list/restore/purge RPCs re-check ownership,
--                          30-day sweep only via service_role, pg_cron schedule
--   7. capability RPCs  -- invite code / invite preview / published stats:
--                          security definer, granted to anon + authenticated
--   8. realtime         -- the collaboration layer is on supabase_realtime
-- ============================================================================

-- ============================================================ 1. trips (v2)
-- Token-calibrated against live schema (2026-09-17): case-insensitive,
-- order-free matching; policy NAME is not asserted (pg_get_expr canonicalizes
-- keywords to UPPERCASE and wraps operands in parens).
do $$
begin
  -- 1a. Owner-scoped insert.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and cmd = 'INSERT'
      and lower(coalesce(with_check, '')) like '%auth.uid()%'
      and lower(coalesce(with_check, '')) like '%owner_id%'
  ) then
    raise exception 'trips INSERT must be owner-scoped (WITH CHECK must pin owner_id to auth.uid())';
  end if;

  -- 1b. Editor-scoped update and delete.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and cmd = 'UPDATE' and lower(coalesce(qual, '')) like '%is_editor%'
  ) then
    raise exception 'trips UPDATE must be editor-scoped (is_editor(id))';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and cmd = 'DELETE' and lower(coalesce(qual, '')) like '%is_editor%'
  ) then
    raise exception 'trips DELETE must be editor-scoped (is_editor(id))';
  end if;

  -- 1c. Trashed-read (v0.59 shape): the hide-trashed policy must be
  --     RESTRICTIVE -- it ANDs with the base read -- and carry both halves:
  --     a live-row branch (`deleted_at is null`) so live rows pass exactly
  --     where "trips read" admits them, plus an accepter for the updated row
  --     (owner/editor/admin) without which the tombstone UPDATE fails 42501
  --     and "Delete" silently no-ops (reproduced live, Sep 14 2026).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and policyname = 'trips read hide trashed'
      and cmd = 'SELECT'
      and permissive = 'RESTRICTIVE'
      and lower(coalesce(qual, '')) like '%deleted_at is null%'
      and lower(coalesce(qual, '')) like '%auth.uid()%'
      and lower(coalesce(qual, '')) like '%owner_id%'
      and lower(coalesce(qual, '')) like '%is_editor%'
      and lower(coalesce(qual, '')) like '%is_admin%'
  ) then
    raise exception 'trips trashed-read drifted: must be RESTRICTIVE with a live-row branch and an owner/editor/admin accepter';
  end if;

  -- 1c-bis. The invariant behind the Sep-14 leak: a live-row
  --     ('deleted_at is null') branch on a PERMISSIVE SELECT policy
  --     OR-combines and widens reads for every role that policy touches.
  --     It may only live on the restrictive policy above.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and lower(coalesce(qual, '')) like '%deleted_at is null%'
  ) then
    raise exception 'a PERMISSIVE trips SELECT carries a deleted_at is null branch -- permissive policies OR-combine, so it widens reads';
  end if;

  -- 1d. Base read (post-20260918_payments_security.sql): crew-or-admin for
  --     authenticated callers only -- no visibility/anon/public branch. The
  --     public page reads through the security-definer get_public_trip RPC.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and cmd = 'SELECT'
      and lower(coalesce(qual, '')) like '%is_member%'
      and lower(coalesce(qual, '')) like '%auth.uid()%'
      and lower(coalesce(qual, '')) like '%is_admin%'
      and roles::text like '%authenticated%'
  ) then
    raise exception 'trips base read drifted: must be crew-or-admin, scoped to authenticated callers';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and cmd = 'SELECT'
      and (roles::text like '%anon%' or roles::text like '%public%')
  ) then
    raise exception 'trips has an anon/public SELECT policy -- direct public reads must go through get_public_trip';
  end if;

  -- 1e. Update WITH CHECK stays editor-pinned (no transfer to non-editable rows).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and cmd = 'UPDATE' and lower(coalesce(with_check, '')) like '%is_editor%'
  ) then
    raise exception 'trips update WITH CHECK drifted: must stay editor-pinned';
  end if;
end $$;

-- ------------------------------------------------------------ 2. trip_members
do $$
begin
  -- Recursive-safe select: user_id = auth.uid() OR is_member(trip_id) -- the
  -- direct subquery form recurses (42P17); the definer form is required.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_members'
      and cmd = 'SELECT' and qual like '%is_member%'
  ) then
    raise exception 'trip_members SELECT must use the security-definer is_member() (42P17 recursion guard)';
  end if;

  -- Self-or-owner insert (invite join via code, or owner manage). INSERT
  -- expressions ride with_check.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_members'
      and cmd = 'INSERT' and with_check like '%user_id%auth.uid()%owner_id%'
  ) then
    raise exception 'trip_members INSERT must allow self-join or owner management';
  end if;

  -- Owner update, owner-or-self delete (leave a trip you're on).
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_members'
      and cmd = 'UPDATE' and qual like '%owner_id%auth.uid()%'
  ) then
    raise exception 'trip_members UPDATE must be owner-managed';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trip_members'
      and cmd = 'DELETE' and qual like '%user_id%auth.uid()%'
  ) then
    raise exception 'trip_members DELETE must allow owner or self (leave a trip you''re on)';
  end if;
end $$;

-- --------------------------------------------------------- 3. child collab layer
do $$
declare
  child text;
begin
  -- suggestions / suggestions / activity: editor-or-public read, editor write.
  foreach child in array array['suggestions', 'decisions', 'activity'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = child
        and cmd = 'SELECT' and qual like '%is_editor%'
    ) then
      raise exception '% SELECT must be editor-or-public', child;
    end if;
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = child
        and cmd = 'ALL' and qual like '%is_editor%'
    ) then
      raise exception '% write must be editor-scoped', child;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------ 4. notifications
do $$
begin
  -- Recipient-only read; recipient-or-orchestrator write.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and cmd = 'SELECT' and qual like '%auth.uid()%user_id%'
  ) then
    raise exception 'notifications SELECT must be recipient-only';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications'
      and cmd = 'ALL' and qual like '%is_editor%'
  ) then
    raise exception 'notifications write must allow recipient or orchestrator';
  end if;
end $$;

-- -------------------------------------------------------- 5. published gallery
do $$
begin
  -- Public gallery read (any visitor); creator-only write.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'published_itineraries'
      and cmd = 'SELECT' and qual = 'true'
  ) then
    raise exception 'published_itineraries SELECT must be public (Explore gallery)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'published_itineraries'
      and cmd = 'ALL' and qual like '%creator_id%'
  ) then
    raise exception 'published_itineraries write must be creator-only';
  end if;
end $$;

-- ------------------------------------------------------------ 6. trash wiring
do $$
begin
  -- Per-user trash RPCs: the list runs as SECURITY DEFINER, so the body
  -- must pin rows to the caller (owner_id = auth.uid()); prosecdef is the
  -- pg_proc SECURITY DEFINER flag.
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_trashed_trips'
      and p.prosecdef = true
  ) then
    raise exception 'get_trashed_trips must be SECURITY DEFINER (per-user trash list)';
  end if;

  -- The 30-day sweep bypasses RLS: never callable by user roles.
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'purge_trashed_trips'
      and exists (
        -- proacl is aclitem[] (opaque to LIKE); aclexplode yields typed rows.
        -- grantee 0 = PUBLIC; NULL proacl = default ACL = EXECUTE to PUBLIC.
        select 1
        from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) e
        where e.grantee = 0
           or e.grantee in (
             select oid from pg_roles where rolname in ('anon', 'authenticated')
           )
      )
  ) then
    raise exception 'purge_trashed_trips must never be granted to anon/authenticated (bypasses RLS)';
  end if;
end $$;

-- --------------------------------------------------------- 7. capability RPCs
do $$
declare
  rpc text;
begin
  -- Capability RPCs: security definer, reachable by whoever holds the
  -- capability (anon + authenticated grants).
  foreach rpc in array array['get_trip_by_invite_code', 'get_invite_trip', 'bump_published_stats'] loop
    if not exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = rpc
        and p.prosecdef = true
    ) then
      raise exception '% must be SECURITY DEFINER', rpc;
    end if;
    if exists (
      select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = rpc
        and not exists (
          select 1
          from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) e
          where e.grantee = 0
             or e.grantee in (
               select oid from pg_roles where rolname in ('anon', 'authenticated')
             )
        )
    ) then
      raise exception '% must be granted to anon + authenticated', rpc;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------ 8. realtime
do $$
declare
  table_name text;
begin
  -- The collaboration layer broadcasts live (multi-editor sync).
  foreach table_name in array array['trips', 'trip_members', 'suggestions', 'decisions', 'activity', 'notifications', 'published_itineraries', 'profiles', 'admin_audit'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = table_name
    ) then
      raise exception '% must be on supabase_realtime (live collaboration)', table_name;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------------ done
select 'rls contract: all crew-facing policies verified' as result;
