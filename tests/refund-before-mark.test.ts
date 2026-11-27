// refund-before-mark, JS side (spec 3.4). A refund that lands while the order is
// still pending fails the order. The late capture webhook, the browser verify and
// a fresh checkout then run against that failed row. None of the three grants
// access, and checkout mints a new order, because `failed` is terminal.
//
// The fake keeps one order row and applies the two guards the database enforces:
// the mark-paid PATCH matches only `pending` rows, and a full refund on a pending
// order is one write to `failed`. The SQL side of the same sequence is covered by
// tests/paid-access-matrix-db.test.ts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'

const SECRET = 'whsec_refund_before_mark'
const KEY_SECRET = 'rzp_secret_rbm'
const SUPABASE_URL = 'https://sup-rbm.test'
const PUB = 'kerala-trip_1'
const BUYER = 'buyer-rbm'
const OFFER = {
  buyer_found: true, buyer_disabled: false, publication_found: true, listed: true,
  price_inr: 500, creator_id: 'creator-rbm', trip_id: 'trip-rbm', buyer_is_creator: false,
}

type Row = {
  razorpay_order_id: string
  user_id: string
  pub_id: string
  amount_inr: number
  status: 'pending' | 'paid' | 'failed'
  razorpay_payment_id: string | null
}

const db = { orders: [] as Row[], grants: 0, claims: 0 }

function findOrder(id: string | null | undefined): Row | undefined {
  return db.orders.find(o => o.razorpay_order_id === id)
}

/** PostgREST `eq.` filter value, with the operator stripped. */
function eqValue(v: string | null): string {
  return (v ?? '').replace(/^eq\./, '')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

const fetchMock = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
  const url = new URL(String(input))
  const method = init.method ?? 'GET'
  const body = init.body ? JSON.parse(String(init.body)) : undefined
  if (url.host === 'api.razorpay.com') {
    if (method === 'POST' && url.pathname === '/v1/orders') {
      return json({ id: 'order_FRESH', amount: body.amount, currency: 'INR', status: 'created' })
    }
    throw new Error(`unexpected gateway ${method} ${url}`)
  }
  if (url.pathname === '/auth/v1/user') return json({ id: BUYER })
  if (url.pathname === '/rest/v1/rpc/apply_order_refund') {
    const order = findOrder(body.p_razorpay_order_id)
    // A full refund on a pending order: one write, the order is `failed`, and no
    // entitlement exists to revoke.
    if (order?.status === 'pending' && body.p_amount_refunded_paise >= body.p_amount_captured_paise) {
      order.status = 'failed'
      return json('revoked')
    }
    return json('unknown')
  }
  if (url.pathname === '/rest/v1/rpc/claim_paid_order') {
    db.claims += 1
    return json(true)
  }
  if (url.pathname === '/rest/v1/rpc/grant_paid_order') {
    db.grants += 1
    return json('granted')
  }
  if (url.pathname === '/rest/v1/rpc/checkout_offer') return json(OFFER)
  if (url.pathname === '/rest/v1/rpc/create_pending_purchase_order') {
    db.orders.push({
      razorpay_order_id: body.p_razorpay_order_id, user_id: body.p_user_id, pub_id: body.p_pub_id,
      amount_inr: body.p_expected_price_inr, status: 'pending', razorpay_payment_id: null,
    })
    return json('minted')
  }
  if (url.pathname === '/rest/v1/entitlements') return json([])
  if (url.pathname === '/rest/v1/purchase_orders') {
    if (method === 'PATCH') {
      // The mark-paid write: it matches a pending row or nothing.
      const order = findOrder(eqValue(url.searchParams.get('razorpay_order_id')))
      if (!order || order.status !== 'pending' || url.searchParams.get('status') !== 'eq.pending') {
        return json([])
      }
      order.status = 'paid'
      order.razorpay_payment_id = body.razorpay_payment_id
      return json([order])
    }
    if (method === 'POST') {
      db.orders.push({
        razorpay_order_id: body.razorpay_order_id, user_id: body.user_id, pub_id: body.pub_id,
        amount_inr: body.amount_inr, status: 'pending', razorpay_payment_id: null,
      })
      return json(null, 201)
    }
    if (url.searchParams.get('select') === 'status') {
      const order = findOrder(eqValue(url.searchParams.get('razorpay_order_id')))
      return json(order ? [{ status: order.status }] : [])
    }
    // Live orders for this buyer and publication: pending and paid. A failed order
    // is terminal and is not live.
    return json(db.orders
      .filter(o => o.user_id === BUYER && o.pub_id === PUB && o.status !== 'failed')
      .map(o => ({ razorpay_order_id: o.razorpay_order_id, amount_inr: o.amount_inr, status: o.status })))
  }
  throw new Error(`unexpected fetch ${method} ${url}`)
})

const webhook = (await import('../api/payments-webhook.js')).default as
  (req: unknown, res: unknown) => Promise<unknown>
const verify = (await import('../api/payments-verify.js')).default as
  (req: unknown, res: unknown) => Promise<unknown>
const checkout = (await import('../api/checkout.js')).default as
  (req: unknown, res: unknown) => Promise<unknown>

function makeRes() {
  return {
    statusCode: 0,
    body: '',
    setHeader() {},
    status(code: number) { this.statusCode = code; return this },
    send(body: string) { this.body = body; return this },
  }
}

async function postWebhook(event: unknown): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const raw = JSON.stringify(event)
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex')
  const req = new EventEmitter() as EventEmitter & { method: string; headers: Record<string, string>; destroy: () => void }
  req.method = 'POST'
  req.headers = { 'x-razorpay-signature': signature }
  req.destroy = () => {}
  process.nextTick(() => {
    req.emit('data', Buffer.from(raw))
    req.emit('end')
  })
  const res = makeRes()
  await webhook(req, res)
  return { statusCode: res.statusCode, body: JSON.parse(res.body) }
}

async function postVerify(orderId: string, paymentId: string) {
  const signature = crypto.createHmac('sha256', KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex')
  const res = makeRes()
  await verify(
    { method: 'POST', headers: { authorization: 'Bearer buyer-token' }, body: {
      razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature,
    } },
    res,
  )
  return res
}

async function postCheckout() {
  const res = makeRes()
  await checkout(
    { method: 'POST', headers: { authorization: 'Bearer buyer-token' }, body: { pubId: PUB } },
    res,
  )
  return res
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', SUPABASE_URL)
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-rbm')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-rbm')
  vi.stubEnv('RAZORPAY_KEY_ID', 'rzp_key_rbm')
  vi.stubEnv('RAZORPAY_KEY_SECRET', KEY_SECRET)
  vi.stubEnv('RAZORPAY_WEBHOOK_SECRET', SECRET)
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockClear()
  db.orders.length = 0
  db.grants = 0
  db.claims = 0
  // The order a buyer opened before the refund arrived. Still pending.
  db.orders.push({
    razorpay_order_id: 'order_RBM', user_id: BUYER, pub_id: PUB, amount_inr: 500,
    status: 'pending', razorpay_payment_id: null,
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('refund before mark (spec 3.4, JS side)', () => {
  it('a refund that lands first fails the order, and no later path grants or re-serves it', async () => {
    // 1. The refund is processed while the order is still pending.
    const refund = await postWebhook({
      event: 'refund.processed',
      payload: {
        refund: { entity: { id: 'rfnd_rbm', amount: 500, currency: 'INR', status: 'processed' } },
        payment: { entity: { id: 'pay_rbm', order_id: 'order_RBM', amount: 500, amount_refunded: 500 } },
      },
    })
    expect(refund.statusCode).toBe(200)
    expect(findOrder('order_RBM')!.status).toBe('failed')

    // 2. The capture arrives late. The mark matches no pending row, the row reads
    //    back as refunded, and nothing is granted.
    const captured = await postWebhook({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_rbm', order_id: 'order_RBM', amount: 500 } } },
    })
    expect(captured.statusCode).toBe(200)
    expect(String(captured.body.note)).toContain('nothing to grant')

    // 3. The browser verify runs the same mark and gets the same refusal.
    const verified = await postVerify('order_RBM', 'pay_rbm')
    expect(verified.statusCode).toBe(409)
    expect(db.claims).toBe(0)

    // 4. A fresh checkout. The failed order is terminal, so nothing is live and
    //    checkout mints a new order.
    const again = await postCheckout()
    expect(again.statusCode).toBe(200)
    expect(JSON.parse(again.body).orderId).toBe('order_FRESH')

    // The refunded row stays failed and unpaid. Nothing was granted or claimed.
    // The only new row is the fresh order.
    expect(db.grants).toBe(0)
    expect(db.claims).toBe(0)
    expect(findOrder('order_RBM')).toMatchObject({ status: 'failed', razorpay_payment_id: null })
    expect(findOrder('order_FRESH')).toMatchObject({ status: 'pending', amount_inr: 500 })
    expect(db.orders).toHaveLength(2)
  })
})
