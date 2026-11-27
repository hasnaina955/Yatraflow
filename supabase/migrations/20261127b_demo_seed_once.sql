-- #1054: the automatic demo seed runs at most once per account.
-- One conditional update claims profiles.demo_seeded_at; a second page
-- context that races it matches 0 rows and does not seed.
-- Re-running this file is safe.
begin;

alter table public.profiles add column if not exists demo_seeded_at timestamptz;

-- Accounts that already own any trip row (live or in trash) have used the
-- app, so they count as seeded. This also covers demo trips made before
-- trips.creation_kind existed (20261015a).
update public.profiles p
   set demo_seeded_at = now()
 where p.demo_seeded_at is null
   and exists (select 1 from public.trips t where t.owner_id = p.id);

commit;
