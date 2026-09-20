-- ============ Creator-uploaded cover images (supabase Storage) ============
-- The first Storage object in this project. A cover is what a shared link
-- previews with (api/i.js serves the stored URL as og:image), and until now a
-- creator could only point at a photo someone else hosts — the destination
-- picker's Wikimedia image or a pasted URL. This bucket lets them upload their
-- own, which moves the bytes onto OUR meter: that is the trade this schema
-- accepts, and why the client downscales to 1200px and re-encodes before
-- uploading (src/lib/coverUpload.ts) instead of shipping phone originals.
--
-- Shape of the access model:
--   * the bucket is PUBLIC-READ. A crawler fetching a preview card has no
--     session and never will; a private bucket would make every upload
--     preview as the brand card while looking fine in the app.
--   * writes are confined to `<auth.uid()>/…` — the first path segment is the
--     owner, so one creator cannot overwrite another's object even by guessing
--     its name. Deletes are confined the same way.
--   * nothing deletes today, deliberately. A cover URL does not stay inside the
--     trip that owns it: `duplicateTrip`/`importTrip` copy `coverImageUrl` onto
--     every fork, and publishing stamps it onto `published_itineraries`
--     (`api/i.js` serves that as og:image). A fork belongs to another user, so
--     replacing a cover must NOT delete the object it supersedes — the failure
--     is silent: the creator's own screen keeps working while every forked trip
--     and live share card 404s. The delete policy stays folder-scoped so a
--     future janitor can collect proven-unreferenced objects without a new
--     migration; until then orphans cost ~$0.0213/GB-month.
--   * `file_size_limit` and `allowed_mime_types` are enforced by the bucket
--     itself, not only by client-side checks — the client is not a boundary.
--   * a single object is capped at 5 MB, well under the Free plan's 50 MB
--     per-file ceiling, because the client uploads ~150-250 KB after
--     downscaling and anything larger is a client that failed, not a use case.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'covers',
  'covers',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public read: every visitor and every crawler. Narrowed to this bucket so no
-- future bucket inherits it.
drop policy if exists "covers read" on storage.objects;
create policy "covers read" on storage.objects
  for select using (bucket_id = 'covers');

-- A creator writes only inside their own folder. `foldername` splits the object
-- name on '/', so name = '<uid>/<random>.jpg' is required to pass. Cast: the
-- helper returns text[] and auth.uid() is uuid.
drop policy if exists "covers insert own" on storage.objects;
create policy "covers insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update and delete are scoped to the owner's folder like insert. Update is
-- unused today (a replacement writes a new object); the pair is here so the
-- access model is complete rather than added piecemeal later.
drop policy if exists "covers update own" on storage.objects;
create policy "covers update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "covers delete own" on storage.objects;
create policy "covers delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
