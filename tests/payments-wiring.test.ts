import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Wiring guards for the M7 unlock flow. The page's purchase path is a
// browser-only journey (gateway modal + session JWT), so these pin the
// seams the verify gate cannot otherwise see: the placeholder toast is
// really gone, the buying state actually disables the button, and the
// api functions stay client-import-free (they must never pull Capacitor
// into a serverless bundle).

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('the public page wires the real unlock flow', () => {
  const page = read('../src/pages/PublicItinerary.tsx')

  it('has no placeholder premium toast left', () => {
    expect(page).not.toContain('no payments in this MVP')
    expect(page).not.toContain('Premium unlock is a placeholder')
  })

  it('purchases through lib/unlock and gates rendering with hasUnlock', () => {
    expect(page).toMatch(/import\s*\{[^}]*purchaseUnlock[^}]*\}\s*from\s*'\.\.\/lib\/unlock'/)
    expect(page).toMatch(/import\s*\{[^}]*hasUnlock[^}]*\}\s*from\s*'\.\.\/lib\/payments'/)
    expect(page).toContain('const unlocked = hasUnlock(')
  })

  it('disables the unlock buttons while a purchase is in flight (the #36-6 rule)', () => {
    const buttons = page.match(/<button[^>]*disabled=\{buying\}[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('re-reads entitlements after a successful purchase', () => {
    expect(page).toMatch(/onUnlocked:\s*\(\)\s*=>\s*\{/)
    expect(page).toContain('fetchMyEntitlements(meId)')
  })

  it('passes the unlock state into the fork, so a buyer forks real days', () => {
    expect(page).toMatch(/forkPublication\(pub!, me\?\.id \?\? null, onNavigate, unlocked\)/)
  })

  it('fetches the trip through the PAYWALL RPC, never the raw table (the P0)', () => {
    // The public page must read via get_public_trip (wire-stubbed locked
    // days, entitlement decided server-side) — a direct select('*') or the
    // old fetchSharedTrip path re-opens the anonymous full-row read.
    expect(page).toMatch(/import\s*\{[^}]*fetchPublicTrip[^}]*\}\s*from\s*'\.\.\/store\/store'/)
    expect(page).not.toMatch(/import\s*\{[^}]*fetchSharedTrip[^}]*\}\s*from\s*'\.\.\/store\/store'/)
    expect(page).toContain('fetchPublicTrip(pub.id)')
  })

  it('renders free and unlocked days through ONE shared stop renderer', () => {
    // The first cut duplicated the renderer and the unlocked copy silently
    // dropped the travelling strips — pin the single shared component.
    expect(page).toContain('function DayStops(')
    expect(page).toContain('<DayStops stops={stops}')
    // The two full renderer copies are gone: only the shared one remains.
    expect((page.match(/travel-anchor-title/g) ?? []).length).toBe(2) // the component's two variants
  })

  it('the creator hub reads real sales through the creator RLS path (I-11)', () => {
    const hub = read('../src/pages/CreatorHubPage.tsx')
    // The Earnings tab's Actual view must derive from entitlements, not from
    // the projection arithmetic — that's the whole point of I-11.
    expect(hub).toMatch(/import\s*\{[^}]*deriveActualSales[^}]*\}\s*from\s*'\.\.\/lib\/earnings'/)
    expect(hub).toMatch(/import\s*\{[^}]*fetchCreatorSales[^}]*\}\s*from\s*'\.\.\/lib\/unlock'/)
    expect(hub).toContain('deriveActualSales(rows, myPubs)')
    // And lib/unlock's creator read must NOT filter by user_id — the RPC's
    // auth.uid() scoping does it.
    const unlock = read('../src/lib/unlock.ts')
    const creatorFn = unlock.slice(unlock.indexOf('fetchCreatorSales'))
    expect(creatorFn.slice(0, 400)).not.toContain(".eq('user_id'")
  })

  it('the sales ledger reads through the definer RPC, not client-facing RLS', () => {
    // A client-facing RLS policy that failed to apply live answers 200 with
    // zero rows — "No sales yet" rendered over real sales, indistinguishable
    // from honest emptiness. Through the security-definer RPC the same
    // accident surfaces as an error (function not found) the tab can render.
    const unlock = read('../src/lib/unlock.ts')
    const creatorFn = unlock.slice(unlock.indexOf('export async function fetchCreatorSales'))
    expect(creatorFn.slice(0, 500)).toContain(".rpc('get_creator_sales')")
    expect(creatorFn.slice(0, 500)).not.toContain("from('entitlements')")
    // And the migration must ship the RPC scoped by the caller's auth.uid().
    const sql = read('../supabase/migrations/20260918_payments_security.sql')
    expect(sql).toContain('create or replace function public.get_creator_sales()')
    expect(sql).toMatch(/get_creator_sales\(\)[\s\S]*?p\.creator_id = auth\.uid\(\)/)
    expect(sql).toMatch(/grant execute on function public\.get_creator_sales\(\) to authenticated/)
  })

  it('a failed creator-sales read is an ERROR STATE, never a silent empty ledger', () => {
    // The conflation that hid the stranded-grant bug: fetchCreatorSales
    // degraded a failed read to [] and the tab rendered "No sales yet" over
    // it — indistinguishable from genuinely zero sales. Pin both halves of
    // the fix: the fetch throws, and the tab renders a distinct retry state.
    const unlock = read('../src/lib/unlock.ts')
    const creatorFn = unlock.slice(unlock.indexOf('export async function fetchCreatorSales'))
    expect(creatorFn).toContain('throw error')
    expect(creatorFn).not.toMatch(/catch[^}]*return \[\]/)
    const hub = read('../src/pages/CreatorHubPage.tsx')
    expect(hub).toContain("Couldn't load your sales")
    expect(hub).toContain('salesError')
    expect(hub).toContain('onRetry')
  })

  it('the fork re-stubs locked days before persisting (defense-in-depth on the P0)', () => {
    const fork = read('../src/lib/forkPub.ts')
    // The fork reads through the paywall RPC (or the owner's own cache) and
    // re-applies the stub, so a stale cache can never fork paid content.
    expect(fork).toMatch(/import\s*\{[^}]*fetchPublicTrip[^}]*\}\s*from\s*'\.\.\/store\/store'/)
    expect(fork).not.toMatch(/import\s*\{[^}]*fetchSharedTrip[^}]*\}\s*from\s*'\.\.\/store\/store'/)
    expect(fork).toContain('restubLockedDays(src, pub.freeDayIndexes)')
    // The stub shape mirrors the migration's wire stub.
    expect(fork).toContain("description: LOCKED_STOP_DESCRIPTION")
    expect(fork).toContain('entryFeeInrPerPerson: 0')
  })

  it('the security migration ships the four audit fixes', () => {
    const sql = read('../supabase/migrations/20260918_payments_security.sql')
    // P0: the stubbing RPC exists, decides per auth.uid(), and grants anon execute.
    expect(sql).toContain('create or replace function public.get_public_trip(p_pub_id text)')
    expect(sql).toContain('v_pub.creator_id = auth.uid()')
    expect(sql).toMatch(/grant execute on function public\.get_public_trip\(text\) to anon, authenticated/)
    // P0: the anonymous public clause is gone from direct reads.
    expect(sql).toContain('create policy "trips read"')
    expect(sql).toMatch(/create policy "trips read"[\s\S]*?to authenticated/)
    // M2: refund revoke RPC, service-role only.
    expect(sql).toContain('create or replace function public.revoke_refunded_entitlement(p_razorpay_order_id text)')
    expect(sql).toMatch(/grant execute on function public\.revoke_refunded_entitlement\(text\) to service_role/)
    // L2: entitlements survive buyer deletion.
    expect(sql).toContain('on delete set null')
    // Invite RPC refuses premium-backed trips for strangers.
    expect(sql).toMatch(/get_invite_trip[\s\S]*?premium_price_inr/)
  })

  it('the paywall RPC answers every publication shape, with its stub text typed', () => {
    // The RPC's first live call 400'd on every PRICED publication: a bare
    // string literal went into polymorphic to_jsonb ("could not determine
    // polymorphic type"). Buyers and the creator returned earlier, so only
    // visitors broke — and no offline gate executes SQL, so pin the shapes
    // textually: the migration is unapplied code until someone runs it.
    const sql = read('../supabase/migrations/20260918_payments_security.sql')
    const rpc = sql.slice(
      sql.indexOf('create or replace function public.get_public_trip'),
      sql.indexOf('-- 2. Tighten the trips RLS public clause'),
    )
    // Every literal fed to polymorphic to_jsonb carries its cast.
    expect([...rpc.matchAll(/to_jsonb\('([^']*)'\)/g)].map((m) => m[1])).toEqual([])
    // Unpriced: the whole trip is the preview — a bare `return;` answered an
    // empty set, so the page rendered nothing at all.
    expect(rpc).toMatch(/premium_price_inr is null then[\s\S]{0,90}?return next v_trip;/)
    // An empty free-day list means every day locks, not "entirely free".
    expect(rpc).not.toContain("v_free = '{}'")
  })
})

describe('the api functions stay client-import-free', () => {
  it.each(['../api/checkout.js', '../api/payments-verify.js', '../api/payments-webhook.js'])('%s imports no client code', path => {
    const source = read(path)
    expect(source).not.toMatch(/from\s+'\.\.\/src\//)
    expect(source).not.toMatch(/require\(['"]\.\.\/src/)
  })
})

describe('the unlock library degrades honestly', () => {
  it('loads checkout.js only once per session', () => {
    // The module-level memo is load-bearing: every Unlock click appending its
    // own script tag would race the modal open. Pinned so a refactor keeps it.
    const source = read('../src/lib/unlock.ts')
    expect(source).toMatch(/let scriptPromise: Promise<boolean> \| null = null/)
    expect(source).toContain('scriptPromise = null // allow a retry on the next click')
  })

  it('never treats a missing entitlements table as an error surface', () => {
    expect(read('../src/lib/unlock.ts')).toMatch(/catch \(e\) \{\s*console\.error\('\[yatraflow\] entitlements read failed', e\)\s*return \[\]\s*\}/)
  })
})
