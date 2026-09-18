// ============ POST /api/payments-verify — confirm a checkout callback (M7) ===
// Razorpay's checkout.js returns { razorpay_order_id, razorpay_payment_id,
// razorpay_signature } to the browser; the browser forwards them here. The
// HMAC signature is checked against RAZORPAY_KEY_SECRET, the order row is
// marked paid, and the entitlement is granted through the `claim_paid_order`
// RPC (the same grant the webhook performs — both are idempotent).
//
// The browser NEVER writes the entitlement itself: the RPC re-checks that
// the order is genuinely marked paid server-side, and only the two signature-
// checked server paths can mark it.
//
// Env vars: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// RAZORPAY_KEY_SECRET.

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

async function authUserId(supabaseUrl, anonKey, token, signal) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
    signal,
  })
  if (!response.ok) return null
  const user = await response.json()
  return typeof user?.id === 'string' && user.id ? user.id : null
}

async function hmacHex(payload, secret) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const len = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

async function markOrderPaid(supabaseUrl, serviceKey, razorpayOrderId, paymentId, signal) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/purchase_orders` +
    `?razorpay_order_id=eq.${encodeURIComponent(razorpayOrderId)}&status=eq.pending`
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({ status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString() }),
    signal,
  })
  if (!response.ok) throw new Error(`order mark-paid failed: ${response.status}`)
}

/** Grant through the SECURITY DEFINER RPC as the BUYER (the caller's own
 *  JWT), so the RPC's `user_id <> auth.uid()` guard holds. */
async function claimEntitlement(supabaseUrl, anonKey, token, razorpayOrderId, signal) {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/claim_paid_order`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_razorpay_order_id: razorpayOrderId }),
    signal,
  })
  // 404-style P0002/P0004 surface as a non-2xx; a duplicate grant is fine
  // (on conflict do nothing returns null) and reads as success.
  return response.ok
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return json(res, 405, { error: 'POST only' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!supabaseUrl || !anonKey || !serviceKey || !keySecret) {
    return json(res, 503, { error: 'payments are not configured yet' })
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body
  const orderId = body?.razorpay_order_id
  const paymentId = body?.razorpay_payment_id
  const signature = body?.razorpay_signature
  if (typeof orderId !== 'string' || !ID_RE.test(orderId) ||
      typeof paymentId !== 'string' || !paymentId || paymentId.length > 64 ||
      typeof signature !== 'string' || !signature || signature.length > 256) {
    return json(res, 400, { error: 'invalid callback payload' })
  }

  const token = bearerToken(req)

  // 1. The signature is the only thing that turns an order into a payment.
  //    Checked BEFORE the session: a forged callback must not even burn a
  //    session lookup, and the check needs no credentials.
  const expected = await hmacHex(`${orderId}|${paymentId}`, keySecret)
  if (!timingSafeEqualHex(expected, signature)) {
    return json(res, 400, { error: 'payment signature did not verify' })
  }

  if (!token) return json(res, 401, { error: 'log in to finish the purchase' })

  const signal = AbortSignal.timeout(8000)
  let userId
  try {
    userId = await authUserId(supabaseUrl, anonKey, token, signal)
  } catch {
    return json(res, 503, { error: 'could not reach the session store' })
  }
  if (!userId) return json(res, 401, { error: 'session expired — log in again' })

  try {
    // 2. Mark paid (service_role — the row is gateway state, not the user's).
    await markOrderPaid(supabaseUrl, serviceKey, orderId, paymentId, signal)
    // 3. Grant via the buyer-scoped RPC.
    const granted = await claimEntitlement(supabaseUrl, anonKey, token, orderId, signal)
    if (!granted) return json(res, 503, { error: 'payment confirmed but the unlock could not be saved — support can restore it from the order' })
    return json(res, 200, { ok: true })
  } catch {
    return json(res, 503, { error: 'payment confirmed but saving the unlock failed — the webhook will retry' })
  }
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return undefined }
}
