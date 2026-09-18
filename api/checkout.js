// ============ POST /api/checkout — create a Razorpay order (M7) ============
import { supabaseServiceHeaders, supabaseAnonHeaders } from './_supabase-headers.js'
// The browser sends ONLY the publication id; the price is read server-side
// from the published_itineraries row. A tampered request body cannot change
// what is charged. The buyer is the caller's own Supabase JWT `sub` — never
// a client-supplied user id.
//
// Env vars (Vercel):
//   SUPABASE_URL, SUPABASE_ANON_KEY   — read the publication row
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET — gateway credentials (test mode OK)
//
// Mirrors api/i.js conventions: plain JS, strict body validation, bounded
// upstream fetches with AbortSignal, explicit status codes, no app-shell
// fetches. 401 unauthenticated · 403 not allowed to buy · 404 unknown pub ·
// 409 already unlocked · 503 upstream/misconfigured.

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

function json(res, status, body) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.status(status)
  return res.send(JSON.stringify(body))
}

function bearerToken(req) {
  const header = req.headers?.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

/** Resolve the JWT's `sub` against Supabase auth — the token must actually
 *  belong to a live session, not merely decode. Returns the user id or null. */
async function authUserId(supabaseUrl, anonKey, token, signal) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    signal,
  })
  if (!response.ok) return null
  const user = await response.json()
  return typeof user?.id === 'string' && user.id ? user.id : null
}

async function fetchPublication(supabaseUrl, anonKey, pubId, signal) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/published_itineraries` +
    `?id=eq.${encodeURIComponent(pubId)}&select=id,trip_id,creator_id,premium_price_inr&limit=1`
  const response = await fetch(url, {
    headers: supabaseAnonHeaders(anonKey),
    signal,
  })
  if (!response.ok) throw new Error(`publications read failed: ${response.status}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function fetchEntitlements(supabaseUrl, serviceKey, userId, pubId, signal) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/entitlements` +
    `?user_id=eq.${encodeURIComponent(userId)}&pub_id=eq.${encodeURIComponent(pubId)}&select=id&limit=1`
  const response = await fetch(url, {
    headers: supabaseServiceHeaders(serviceKey),
    signal,
  })
  if (!response.ok) throw new Error(`entitlements read failed: ${response.status}`)
  const rows = await response.json()
  return Array.isArray(rows) && rows.length > 0
}

/** The newest order this buyer opened for this publication, whatever its
 *  state — the state decides the branch (paid ⇒ finish the grant; pending and
 *  gateway-live ⇒ re-serve; failed/attempted ⇒ mint fresh). Re-served instead
 *  of minting a twin Razorpay order per retry — the abandoned-modal path
 *  (dismiss, re-click) would otherwise pile up orphan rows and gateway
 *  orders. Filtering to pending-only was the live bug: a row stranded 'paid'
 *  by a failed grant vanished from this read, and the next click minted a
 *  FRESH order for money already taken — a double charge. */
async function fetchLatestOrder(supabaseUrl, serviceKey, userId, pubId, signal) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/purchase_orders` +
    `?user_id=eq.${encodeURIComponent(userId)}&pub_id=eq.${encodeURIComponent(pubId)}` +
    `&select=razorpay_order_id,amount_inr,status&order=created_at.desc&limit=1`
  const response = await fetch(url, {
    headers: supabaseServiceHeaders(serviceKey),
    signal,
  })
  if (!response.ok) throw new Error(`latest order read failed: ${response.status}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function createRazorpayOrder(keyId, keySecret, amountPaise, receipt, signal) {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt, notes: {} }),
    signal,
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || typeof body?.id !== 'string' || !body.id) {
    throw new Error(`razorpay order failed: ${response.status}`)
  }
  return body.id
}

/** The gateway's own view of the order — the truth our local row can only
 *  mirror. 'created' = still payable; 'paid'/'captured' = money moved;
 *  'attempted' = a payment started but did not complete. */
async function fetchGatewayOrderStatus(keyId, keySecret, razorpayOrderId, signal) {
  const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
    headers: { authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
    signal,
  })
  if (!response.ok) return 'unknown'
  const order = await response.json()
  return typeof order?.status === 'string' ? order.status : 'unknown'
}

/** Mark the local row paid and grant via the buyer-scoped RPC — the same
 *  tail the verify function runs. A failed claim (session gone, RPC refused)
 *  leaves the order marked paid; the webhook remains the second recovery. */
async function markOrderPaid(supabaseUrl, serviceKey, razorpayOrderId, paymentId, signal) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/purchase_orders` +
    `?razorpay_order_id=eq.${encodeURIComponent(razorpayOrderId)}&status=eq.pending`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: supabaseServiceHeaders(serviceKey, {
      'content-type': 'application/json',
      prefer: 'return=minimal',
    }),
    body: JSON.stringify({ status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString() }),
    signal,
  })
  if (!response.ok) throw new Error(`order mark-paid failed: ${response.status}`)
}

async function claimEntitlement(supabaseUrl, anonKey, token, razorpayOrderId, signal) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/claim_paid_order`, {
    method: 'POST',
    headers: { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_razorpay_order_id: razorpayOrderId }),
    signal,
  })
  return response.ok
}

async function insertOrderRow(supabaseUrl, serviceKey, row, signal) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/purchase_orders`, {
    method: 'POST',
    headers: supabaseServiceHeaders(serviceKey, {
      'content-type': 'application/json',
      prefer: 'return=minimal',
    }),
    body: JSON.stringify(row),
    signal,
  })
  if (!response.ok) throw new Error(`order row insert failed: ${response.status}`)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return json(res, 405, { error: 'POST only' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  // Name the missing variable — "not configured yet" alone sent an operator
  // in circles when a Vercel var silently didn't reach the deployment.
  const missing = [
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_ANON_KEY', anonKey],
    ['RAZORPAY_KEY_ID', keyId],
    ['RAZORPAY_KEY_SECRET', keySecret],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ].filter(([, v]) => !v).map(([name]) => name)
  if (missing.length > 0) {
    return json(res, 503, { error: `payments are not configured yet — missing env var(s): ${missing.join(', ')}` })
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body
  const pubId = body?.pubId
  if (typeof pubId !== 'string' || !ID_RE.test(pubId)) {
    return json(res, 400, { error: 'invalid publication id' })
  }

  const token = bearerToken(req)
  if (!token) return json(res, 401, { error: 'log in to buy' })

  const signal = AbortSignal.timeout(8000)
  let userId
  let pub
  try {
    userId = await authUserId(supabaseUrl, anonKey, token, signal)
    if (!userId) return json(res, 401, { error: 'session expired — log in again' })
    pub = await fetchPublication(supabaseUrl, anonKey, pubId, signal)
  } catch {
    return json(res, 503, { error: 'could not reach the trip store' })
  }
  if (!pub) return json(res, 404, { error: 'no such publication' })

  // The price comes from the row, never the request. Unpriced ⇒ nothing to buy.
  const price = pub.premium_price_inr
  if (!Number.isInteger(price) || price < 1) {
    return json(res, 403, { error: 'this itinerary is free — fork it instead' })
  }
  // The creator does not buy their own publication.
  if (pub.creator_id === userId) {
    return json(res, 403, { error: 'this is your own publication' })
  }

  let recovering = false
  try {
    if (await fetchEntitlements(supabaseUrl, serviceKey, userId, pubId, signal)) {
      return json(res, 409, { error: 'already unlocked' })
    }
    // The newest order for this buyer+publication decides the branch. A
    // price change after the order was opened invalidates it — the stored
    // snapshot must equal the row price or a new order is created at the
    // current price.
    //
    // The gateway is the truth on whether the order is still payable: a
    // local row can stay 'pending' when verify failed after a CAPTURED
    // payment, and Razorpay's modal refuses an already-paid order_id with
    // an opaque "Uh! oh!" screen. If the money already moved, FINISH THE
    // GRANT here — and MEAN it: reporting success without the entitlement
    // landing leaves the buyer stranded AND lets the next click mint a
    // fresh order (charging twice for one payment). A failed grant is a
    // 503 that says exactly what happened and what will NOT happen.
    const latest = await fetchLatestOrder(supabaseUrl, serviceKey, userId, pubId, signal)
    if (latest && latest.amount_inr === price && latest.status !== 'failed') {
      const gatewayStatus = latest.status === 'paid'
        ? 'paid' // the row already knows — no gateway probe needed
        : await fetchGatewayOrderStatus(keyId, keySecret, latest.razorpay_order_id, signal)
      if (gatewayStatus === 'paid') {
        recovering = true // from here, any throw means money moved and we failed to finish
        if (latest.status === 'pending') {
          // A captured payment this flow never confirmed: mark it first.
          await markOrderPaid(supabaseUrl, serviceKey, latest.razorpay_order_id, 'recovered-by-checkout', signal)
        }
        const granted = await claimEntitlement(supabaseUrl, anonKey, token, latest.razorpay_order_id, signal)
        if (!granted) {
          return json(res, 503, {
            error: `your earlier payment is confirmed, but the unlock could not be saved just now — no second payment will be taken; try again in a moment or contact support with order ${latest.razorpay_order_id}`,
          })
        }
        return json(res, 409, { error: 'already unlocked — your earlier payment was confirmed just now; reload to see the full plan' })
      }
      if (gatewayStatus === 'created') {
        return json(res, 200, { orderId: latest.razorpay_order_id, keyId, amountPaise: price * 100, currency: 'INR' })
      }
      // 'attempted'/unknown → fall through and mint a fresh order; the old
      // row stays behind but the buyer is never blocked.
    }
    const receipt = `r${stable(pubId, 8)}${stable(userId, 4)}`
    const razorpayOrderId = await createRazorpayOrder(keyId, keySecret, price * 100, receipt, signal)
    await insertOrderRow(supabaseUrl, serviceKey, {
      user_id: userId,
      pub_id: pubId,
      razorpay_order_id: razorpayOrderId,
      amount_inr: price,
      currency: 'INR',
      status: 'pending',
      price_snapshot_inr: price,
    }, signal)
    return json(res, 200, { orderId: razorpayOrderId, keyId, amountPaise: price * 100, currency: 'INR' })
  } catch {
    // A throw inside the recovery branch means money moved and we failed to
    // finish — say that, not "could not start the payment".
    return json(res, 503, recovering
      ? { error: 'your payment is confirmed but recovery failed just now — no second payment will be taken; try again in a moment' }
      : { error: 'could not start the payment' })
  }
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return undefined }
}

/** FNV-1a base-36 — mirrors lib/payments.ts receiptFor (kept inline because
 *  api functions must not import client code, which pulls in Capacitor). */
function stable(s, chars) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).padStart(chars, '0').slice(0, chars)
}
