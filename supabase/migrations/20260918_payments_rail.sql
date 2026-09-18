-- ============ M7 · Payments rail — purchase orders + entitlements ============
-- Issue #238. The premium scaffolding (premiumPriceInr, freeDayIndexes, the
-- fork gate) shipped years of versions ago; this is the first piece of the
-- actual money path.
--
-- Shape:
--   purchase_orders  — one row per gateway order (created by /api/checkout).
--   entitlements     — one row per GRANTED unlock, keyed (user_id, pub_id).
--
-- Writes to purchase_orders/entitlements happen ONLY from the Vercel
-- functions, which run with the service_role key — so the anon/authenticated
-- roles get SELECT-only RLS (a user may see their own orders/entitlements,
-- read-only). There is deliberately no INSERT policy for authenticated:
-- a client can never mint an entitlement by writing a row directly.
-- The only authenticated write path is the SECURITY DEFINER RPC at the end
-- (`claim_paid_order`), which re-checks payment state server-side.
--
-- Apply order: standalone; depends on no other migration.

-- 1. Orders ----------------------------------------------------------------

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  pub_id text not null references public.published_itineraries (id) on delete cascade,
  -- Gateway truth:
  razorpay_order_id text not null unique,
  amount_inr integer not null check (amount_inr between 1 and 100000),
  currency text not null default 'INR',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  -- Filled by verify/webhook when Razorpay confirms the payment:
  razorpay_payment_id text,
  paid_at timestamptz,
  -- Snapshot of the publication's price at order time (I-12: the row IS the
  -- per-sale price record; the publication's price may change later).
  price_snapshot_inr integer not null
);

create index if not exists purchase_orders_user_idx on public.purchase_orders (user_id, created_at desc);
create index if not exists purchase_orders_pub_idx on public.purchase_orders (pub_id);

-- 2. Entitlements ----------------------------------------------------------

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  pub_id text not null references public.published_itineraries (id) on delete cascade,
  order_id uuid not null references public.purchase_orders (id) on delete cascade,
  amount_paid_inr integer not null check (amount_paid_inr >= 1),
  -- Exactly one unlock per (user, publication), forever. Re-grants (a retry,
  -- the webhook racing the browser verify) are no-ops against this index.
  constraint entitlements_user_pub_unique unique (user_id, pub_id)
);

create index if not exists entitlements_pub_idx on public.entitlements (pub_id);

-- 3. Row-level security ----------------------------------------------------
-- Users read their own rows; everything else is service_role only.

alter table public.purchase_orders enable row level security;
alter table public.entitlements enable row level security;

create policy "purchase orders read own"
  on public.purchase_orders for select to authenticated
  using (user_id = auth.uid());

create policy "entitlements read own"
  on public.entitlements for select to authenticated
  using (user_id = auth.uid());

-- Public read of entitlement COUNTS is not granted: the only thing another
-- user needs from this table is nothing — the unlock gate is the buyer's own
-- row plus the server-side check in the verify path.

-- 4. The claim RPC ---------------------------------------------------------
-- The one authenticated write path. The browser verify call does NOT insert
-- the entitlement row directly; it calls this, which re-checks that the
-- order is genuinely marked paid (the marking itself happened only after a
-- signature check in the verify function) before granting. Idempotent.

create or replace function public.claim_paid_order(p_razorpay_order_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.purchase_orders;
  v_ent entitlements.id%type;
begin
  select * into v_order from public.purchase_orders
    where razorpay_order_id = p_razorpay_order_id
    for update;

  if not found then
    raise exception 'P0002: order not found: %', p_razorpay_order_id;
  end if;

  -- Only the buyer can claim, and only a PAID order grants.
  if v_order.user_id <> auth.uid() then
    raise exception 'P0003: order belongs to another user';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'P0004: order is not paid (status %)', v_order.status;
  end if;

  insert into public.entitlements (user_id, pub_id, order_id, amount_paid_inr)
  values (v_order.user_id, v_order.pub_id, v_order.id, v_order.price_snapshot_inr)
  on conflict (user_id, pub_id) do nothing
  returning id into v_ent;

  return v_ent;
end;
$$;

revoke all on function public.claim_paid_order(text) from public, anon;
grant execute on function public.claim_paid_order(text) to authenticated;

-- 5. Creator earnings reads ------------------------------------------------
-- The Earnings tab's projection (`lib/earnings.ts`) reads the publication's
-- copies count; real sales attribution (I-11) will join entitlements by
-- pub_id. The creator needs to read entitlement rows for THEIR publications:

create policy "entitlements creator read own pubs"
  on public.entitlements for select to authenticated
  using (
    exists (
      select 1 from public.published_itineraries p
      where p.id = entitlements.pub_id and p.creator_id = auth.uid()
    )
  );

-- The order rows behind them stay buyer-private; the creator's ledger reads
-- entitlements only.
