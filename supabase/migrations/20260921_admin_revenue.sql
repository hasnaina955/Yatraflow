-- ============================================================
-- 20260921_admin_revenue.sql
-- Platform revenue for the masteradmin console's analytics tab.
--
-- WHY A FUNCTION: the console's Analytics tab derives everything from the
-- hydrated client cache, and entitlements are deliberately NOT in it — they are
-- owner-scoped by RLS, and a creator reads their own sales through
-- `get_creator_sales`. So "what has the platform taken so far" has no
-- client-side source at all, and the tab has said as much since v0.46.0. This
-- is the read that closes it.
--
-- WHAT IT RETURNS, AND WHAT IT DELIBERATELY DOES NOT: one row per sale — when
-- it was granted, what the buyer paid, which publication it was, and which
-- CREATOR is owed. No buyer, no order id, no email, no profile. Revenue
-- reporting needs amounts, dates and payees; it does not need a buyer, and a
-- god-view that hands out identities because it can is how a god-view becomes a
-- liability.
--
-- WHY IT RETURNS THE CREATOR: the ladder runs over EACH CREATOR's lifetime
-- gross, because that is what each of them is charged. Summing the platform's
-- sales and applying one ladder to the total would UNDERSTATE the platform's
-- cut — its total crosses ₹25,000 long before most creators' do, so more of it
-- would be charged the lower rate. The creator is therefore revenue accounting
-- data, not a leak.
--
-- WHY THE FEE IS NOT COMPUTED HERE: the ladder lives in exactly one place
-- (`PLATFORM_FEE_TIERS`, src/lib/earnings.ts) and its attribution is
-- order-dependent — a SQL copy would be a second source of truth for a money
-- number, and the two would drift the first time either moved. This function
-- returns FACTS; the client applies the ladder per creator through the same
-- `buildSalesLedger` a creator's own earnings ledger uses, so the platform's
-- cut IS the sum of the creators' individual charges and cannot disagree with
-- their ledgers.
--
-- WHAT "REVENUE" MEANS HERE: current entitlements, which is not the same as
-- lifetime sales — a refund runs `revoke_refunded_entitlement` and DELETES the
-- row, so refunded money leaves this figure. That is the honest reading (money
-- the platform holds), and the tab says so rather than implying a gross
-- turnover number.
--
-- GUARD: `is_admin()` inside the function, which IS the authorization. The
-- console's JWT app_metadata gate is a UX gate, not a security one.
--
-- APPLY: run in the Supabase SQL editor. Until then the analytics tab reports
-- the revenue section as unavailable rather than as zero.
-- ============================================================

create or replace function public.admin_revenue(p_limit integer default 1000, p_since timestamptz default null)
returns table (granted_at timestamptz, amount_paid_inr integer, pub_id text, creator_id uuid)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;
  return query
    select e.granted_at, e.amount_paid_inr, e.pub_id, p.creator_id
      from public.entitlements e
      -- The payee, from the publication the sale belongs to. A sale whose
      -- publication has been deleted cannot exist (the FK cascades), so this
      -- join never drops a row from the books.
      join public.published_itineraries p on p.id = e.pub_id
     where p_since is null or e.granted_at >= p_since
     order by e.granted_at desc
     -- A cap the client cannot raise into a full-table scan.
     limit greatest(1, least(coalesce(p_limit, 1000), 5000));
end;
$$;

-- Reachability: authenticated callers only. `is_admin()` above is what
-- authorizes; this just keeps the surface off the anonymous role entirely.
revoke all on function public.admin_revenue(integer, timestamptz) from public, anon;
grant execute on function public.admin_revenue(integer, timestamptz) to authenticated;
