// ============ Unlock flow (M7 · Premium) — browser side of the rail ==========
// The purchase journey, from the public page's Unlock button to a granted
// entitlement:
//
//   1. `POST /api/checkout` { pubId } with the session JWT →
//      { orderId, keyId, amountPaise }  (price verified server-side)
//   2. Razorpay's checkout.js modal collects the payment.
//   3. `POST /api/payments-verify` with the callback + session JWT →
//      signature-checked mark-paid + `claim_paid_order` grant.
//   4. Entitlements re-read from Supabase (RLS: own rows only).
//
// The webhook is the crash-recovery path for a tab closed between 2 and 3;
// nothing here needs to know about it.
//
// Entitlements are deliberately NOT in the store's hydrate cache: they matter
// on one surface (the public itinerary), they are cheap to re-read on demand,
// and keeping them out avoids touching the hydration paths every store test
// pins. The table may not exist yet (migration unapplied) — every read
// degrades to "no entitlements", which is exactly the pre-M7 behavior.

import { supabase } from './supabase'
import { ENTITLEMENT_COLUMNS, type Entitlement } from './payments'
import { toast } from '../components/ui'

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void
      on?: (event: string, handler: (response: unknown) => void) => void
    }
  }
}

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js'

let scriptPromise: Promise<boolean> | null = null

/** Load Razorpay's checkout.js once. Resolves false when it cannot load
 *  (offline, blocked) — the caller toasts instead of opening a dead modal. */
export function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false)
  if (window.Razorpay) return Promise.resolve(true)
  if (!scriptPromise) {
    scriptPromise = new Promise(resolve => {
      const script = document.createElement('script')
      script.src = CHECKOUT_SRC
      script.async = true
      script.onload = () => resolve(!!window.Razorpay)
      script.onerror = () => {
        scriptPromise = null // allow a retry on the next click
        resolve(false)
      }
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

/** The buyer's entitlement rows, via the anon client (RLS limits to own
 *  rows). A missing table, a failed read or a logged-out visitor all read
 *  as "no entitlements" — the honest pre-purchase state. */
export async function fetchMyEntitlements(userId: string | null): Promise<Entitlement[]> {
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('entitlements')
      .select(ENTITLEMENT_COLUMNS)
      .eq('user_id', userId)
    if (error) throw error
    // The epoch-ms fields arrive as ISO strings; shape them for the type.
    return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      userId: row.user_id as string,
      pubId: row.pub_id as string,
      orderId: row.order_id as string,
      amountPaidInr: row.amount_paid_inr as number,
      grantedAt: new Date(row.granted_at as string).getTime(),
    }))
  } catch (e) {
    console.error('[yatraflow] entitlements read failed', e)
    return []
  }
}

/** The SALES of the logged-in creator's publications (I-11). Reads the same
 *  entitlements table through the "entitlements creator read own pubs" RLS
 *  policy — no `user_id` filter, the policy itself scopes the rows to
 *  publications whose creator_id is the caller.
 *
 *  REJECTS on a failed read (after logging it) instead of degrading to []:
 *  an empty ledger and a broken read are different truths, and rendering
 *  "No sales yet" over a failed fetch hid a live grant bug for a whole
 *  debugging session. The caller owns the error state. A missing table
 *  (migration unapplied) is a PostgREST 404 error — the Earnings tab shows
 *  it as a read failure with retry, not as "no sales". */
export async function fetchCreatorSales(): Promise<Entitlement[]> {
  const { data, error } = await supabase
    .from('entitlements')
    .select(ENTITLEMENT_COLUMNS)
  if (error) {
    console.error('[yatraflow] creator sales read failed', error)
    throw error
  }
  return (Array.isArray(data) ? data : []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    pubId: row.pub_id as string,
    orderId: row.order_id as string,
    amountPaidInr: row.amount_paid_inr as number,
    grantedAt: new Date(row.granted_at as string).getTime(),
  }))
}

async function sessionToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function postJson(url: string, token: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await response.json().catch(() => ({}))
  return { status: response.status, json }
}

export type UnlockOutcome = 'unlocked' | 'cancelled' | 'failed' | 'already' | 'logged-out'

/**
 * Run the whole purchase for one publication. Returns the outcome so the
 * page can refresh entitlements and re-render the (now un-locked) days.
 * Every failure toasts here — the caller just switches on the result.
 */
export async function purchaseUnlock(input: {
  pubId: string
  title: string
  onUnlocked: () => void
}): Promise<UnlockOutcome> {
  const token = await sessionToken()
  if (!token) {
    toast('Log in to buy the full plan.', 'err')
    return 'logged-out'
  }

  // 1. Server creates the order (price verified from the row, not from us).
  let session: { orderId: string; keyId: string; amountPaise: number }
  try {
    const { status, json } = await postJson('/api/checkout', token, { pubId: input.pubId })
    if (status === 409) {
      // Both the plain already-unlocked case and the self-heal land here;
      // refresh either way — the self-heal may have JUST granted it, and the
      // page should show the unlocked days without demanding a reload.
      input.onUnlocked()
      const message = typeof json.error === 'string' && json.error ? json.error : 'This plan is already unlocked.'
      toast(message)
      return 'already'
    }
    if (status !== 200 || typeof json.orderId !== 'string' || typeof json.keyId !== 'string' || typeof json.amountPaise !== 'number') {
      const message = typeof json.error === 'string' ? json.error : 'Could not start the payment.'
      toast(message, 'err')
      return 'failed'
    }
    session = { orderId: json.orderId, keyId: json.keyId, amountPaise: json.amountPaise }
  } catch {
    toast('Could not reach the payment service — check your connection.', 'err')
    return 'failed'
  }

  // 2. The gateway modal. Without checkout.js there is nothing to open.
  const loaded = await loadRazorpay()
  if (!loaded || !window.Razorpay) {
    toast('The payment window could not load — check your connection or an ad blocker.', 'err')
    return 'failed'
  }
  const callback = await new Promise<Record<string, string> | null>(resolve => {
    const checkout = new window.Razorpay!({
      key: session.keyId,
      amount: session.amountPaise,
      currency: 'INR',
      name: 'YatraFlow',
      description: input.title,
      order_id: session.orderId,
      theme: { color: '#e07a3f' },
      handler: (response: Record<string, string>) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    })
    // payment.failed: a declined card or a gateway rejection closes the modal
    // WITHOUT calling handler or ondismiss — without this the promise never
    // resolves and the Unlock button stays stuck on "Opening payments…".
    checkout.on?.('payment.failed', (response: unknown) => {
      const description = (response as { error?: { description?: string } } | null)?.error?.description
      toast(description || 'The payment failed — no money was taken. Try again.', 'err')
      resolve(null)
    })
    checkout.open()
  })
  if (!callback) return 'cancelled'

  // 3. Signature-verified confirm + grant.
  try {
    const { status, json } = await postJson('/api/payments-verify', token, {
      razorpay_order_id: callback.razorpay_order_id,
      razorpay_payment_id: callback.razorpay_payment_id,
      razorpay_signature: callback.razorpay_signature,
    })
    if (status === 200) {
      input.onUnlocked()
      toast('Unlocked — every day of this plan is yours to fork. 🎉')
      return 'unlocked'
    }
    // 503 with the confirm-but-not-saved wording means the money moved and
    // the webhook may still land — say so instead of "failed".
    const message = typeof json.error === 'string' ? json.error : 'The payment could not be confirmed.'
    toast(message, 'err')
    return 'failed'
  } catch {
    toast('The payment went through but confirming it failed — refresh in a minute; the webhook will finish it.', 'err')
    return 'failed'
  }
}
