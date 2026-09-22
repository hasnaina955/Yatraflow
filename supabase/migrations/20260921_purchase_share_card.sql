-- ============================================================
-- 20260921_purchase_share_card.sql
-- The public card a buyer can post (ROADMAP I-21).
--
-- WHY: `/i/<id>` already previews a publication as a card, but it is the
-- CREATOR's card. A buyer circulating their purchase needs the preview to say
-- so — "I bought <plan>" — and an unverified version of that sentence is a
-- claim nobody checked, which is exactly the class of thing v0.60.0 went
-- around correcting. So the buyer's variation of the card is gated at the
-- wire: `/i/<id>?buyer=<entitlement-id>` renders the purchase framing only
-- when this function confirms that entitlement really is for that publication.
--
-- WHY A FUNCTION AND NOT RLS: `api/i.js` is an unauthenticated Vercel function
-- reached by a link-preview crawler, so it carries the anon key and cannot read
-- `entitlements` (owner-only RLS, deliberately). Same shape as
-- `get_public_trip` and `get_invite_trip`: the single fact a public surface
-- needs is exposed through a security-definer function, and nothing else.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN: the buyer. It answers true/false for
-- one (entitlement, publication) pair — no user_id, no amount, no timestamp —
-- so a leaked or guessed link reveals only what the poster's own message
-- already says out loud. The entitlement id IS the capability: RLS keeps it
-- readable to its owner alone, so only a buyer can mint their own card. It
-- also does not prove the caller is that buyer, and does not need to: the card
-- is a public artifact about a publication, not about a person.
--
-- APPLY: run in the Supabase SQL editor. Until it is applied the RPC answers
-- PGRST202 and `api/i.js` falls back to the publication's own card, so nothing
-- breaks — a buyer's link simply previews as the creator's card. (AGENTS §3:
-- a release's DB half is a separate, user-run step.)
-- ============================================================

-- 1. Does this entitlement belong to this publication? ---------------------
-- `stable` because it only reads. `security definer` so the anonymous caller
-- needs no grant on `entitlements` itself. A null or malformed id matches
-- nothing and answers false rather than erroring.

create or replace function public.owns_publication(p_entitlement uuid, p_pub_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.entitlements e
     where e.id = p_entitlement
       and e.pub_id = p_pub_id
  );
$$;

-- 2. Reachability -----------------------------------------------------------
-- Revoked from PUBLIC first (Postgres grants EXECUTE to PUBLIC by default),
-- then handed to exactly the two roles the public surfaces hold — the same
-- pair `get_public_trip` gets, and no more.

revoke all on function public.owns_publication(uuid, text) from public;
grant execute on function public.owns_publication(uuid, text) to anon, authenticated;
