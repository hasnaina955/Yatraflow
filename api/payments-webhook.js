// ============ POST /api/payments-webhook — Razorpay crash recovery (M7) ======
// Razorpay POSTs `payment.captured` here. This is the path that catches a
// user who closes the tab between the gateway capturing the payment and the
// browser's /api/payments-verify call landing: the webhook marks the order
// paid and grants the entitlement with service_role, idempotently.
//
// Signature: the raw request body is HMAC-SHA256'd by Razorpay with
// RAZORPAY_WEBHOOK_SECRET and sent as the x-razorpay-signature header. The
// RAW body must be read for the check to hold — never a re-serialized copy.
//
// Env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RAZORPAY_WEBHOOK_SECRET.

function json(res, status, body) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.status(status)
  return res.send(JSON.stringify(body))
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

/** Read the raw body as a string — webhook signatures cover exact bytes. */
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > 1_000_000) { reject(new Error('body too large')); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
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

async function fetchOrderRow(supabaseUrl, serviceKey, razorpayOrderId, signal) {
  const url = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/purchase_orders` +
    `?razorpay_order_id=eq.${encodeURIComponent(razorpayOrderId)}&select=id,user_id,pub_id,price_snapshot_inr,status&limit=1`
  const response = await fetch(url, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    signal,
  })
  if (!response.ok) throw new Error(`order read failed: ${response.status}`)
  const rows = await response.json()
  return Array.isArray(rows) ? rows[0] ?? null : null
}

async function grantEntitlement(supabaseUrl, serviceKey, order, signal) {
  // service_role bypasses RLS; the unique (user_id, pub_id) index makes any
  // repeat delivery a no-op. The webhook grant is deliberately unconditional
  // beyond the paid-status check — no caller JWT exists here, and the
  // signature on the request IS the authorization.
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/entitlements`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
      // PostgREST: turn the unique-violation on a repeat delivery into success.
      'on-conflict': 'user_id,pub_id',
    },
    body: JSON.stringify({
      user_id: order.user_id,
      pub_id: order.pub_id,
      order_id: order.id,
      amount_paid_inr: order.price_snapshot_inr,
    }),
    signal,
  })
  if (!response.ok && response.status !== 409) {
    throw new Error(`entitlement grant failed: ${response.status}`)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    return json(res, 405, { error: 'POST only' })
  }
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!supabaseUrl || !serviceKey || !webhookSecret) {
    return json(res, 503, { error: 'payments are not configured yet' })
  }

  let raw
  try {
    raw = await readRawBody(req)
  } catch {
    return json(res, 400, { error: 'unreadable body' })
  }
  const signature = req.headers?.['x-razorpay-signature']
  if (typeof signature !== 'string' || !signature) {
    return json(res, 400, { error: 'missing signature' })
  }
  const expected = await hmacHex(raw, webhookSecret)
  if (!timingSafeEqualHex(expected, signature)) {
    return json(res, 400, { error: 'signature did not verify' })
  }

  let event
  try {
    event = JSON.parse(raw)
  } catch {
    return json(res, 400, { error: 'invalid JSON' })
  }
  // Only captured payments grant anything; every other event is 200-acknowledged
  // so Razorpay stops retrying it.
  if (event?.event !== 'payment.captured') return json(res, 200, { ok: true, ignored: event?.event ?? null })

  const payment = event.payload?.payment?.entity
  const orderId = payment?.order_id
  const paymentId = payment?.id
  if (typeof orderId !== 'string' || !orderId || typeof paymentId !== 'string' || !paymentId) {
    return json(res, 400, { error: 'event payload missing order/payment id' })
  }

  const signal = AbortSignal.timeout(8000)
  try {
    await markOrderPaid(supabaseUrl, serviceKey, orderId, paymentId, signal)
    const order = await fetchOrderRow(supabaseUrl, serviceKey, orderId, signal)
    if (!order) return json(res, 200, { ok: true, note: 'no local order for this gateway order (foreign or test event)' })
    await grantEntitlement(supabaseUrl, serviceKey, order, signal)
    return json(res, 200, { ok: true })
  } catch {
    // 500 makes Razorpay retry with backoff — exactly what a transient
    // Supabase failure wants.
    return json(res, 500, { error: 'could not record the payment' })
  }
}
