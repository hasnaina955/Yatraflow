import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'

// Contract tests for the three payments functions. They are plain JS (the
// api/ convention — no client imports), so these exercise them the same way
// tests/share-preview.test.ts exercises api/i.js: direct handler invocation
// with stubbed fetch and env.

const fetchMock = vi.fn<typeof fetch>()

function makeRes() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    ended: false,
    setHeader(key: string, value: string) { this.headers[key.toLowerCase()] = value },
    status(code: number) { this.statusCode = code; return this },
    send(body: string) { this.body = body; return this },
    end() { this.ended = true; return this },
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

const ENV = {
  SUPABASE_URL: 'https://database.example.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_secret',
  RAZORPAY_WEBHOOK_SECRET: 'whsec',
}

async function hmacHex(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
}

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v)
  fetchMock.mockReset()
  fetchMock.mockRejectedValue(new Error('Unexpected fetch'))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('POST /api/checkout', () => {
  async function run(body: unknown, authHeader: string | null = 'Bearer session-token', method = 'POST') {
    const res = makeRes()
    const { default: handler } = await import('../api/checkout.js')
    const req: Record<string, unknown> = { method, body, headers: {} as Record<string, string> }
    if (authHeader) (req.headers as Record<string, string>).authorization = authHeader
    await handler(req, res)
    return res
  }

  const pubRow = { id: 'kerala-trip_1', trip_id: 'trip-1', creator_id: 'creator-1', premium_price_inr: 500 }

  function stubHappyPath() {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse([])
      if (url === 'https://api.razorpay.com/v1/orders') {
        return jsonResponse({ id: 'order_ABC123', amount: 50000, currency: 'INR' })
      }
      if (url.includes('/rest/v1/purchase_orders')) return jsonResponse(null, 201)
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  it('creates an order from the row price (not the request) and records it pending', async () => {
    stubHappyPath()
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(200)
    const payload = JSON.parse(res.body)
    expect(payload.orderId).toBe('order_ABC123')
    expect(payload.amountPaise).toBe(50_000)
    expect(payload.currency).toBe('INR')
    // The order row insert carries the server-read price as its snapshot.
    const insertCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/rest/v1/purchase_orders') && (c[1] as RequestInit | undefined)?.method === 'POST')
    const insertBody = JSON.parse(String((insertCall![1] as RequestInit).body))
    expect(insertBody).toMatchObject({ user_id: 'buyer-1', pub_id: 'kerala-trip_1', amount_inr: 500, status: 'pending', price_snapshot_inr: 500 })
    // The gateway call sends paise and INR.
    const gwCall = fetchMock.mock.calls.find(c => String(c[0]) === 'https://api.razorpay.com/v1/orders')
    expect(JSON.parse(String((gwCall![1] as RequestInit).body))).toEqual({ amount: 50_000, currency: 'INR', receipt: expect.any(String), notes: {} })
  })

  it('verifies the caller JWT and never trusts a client-supplied user id', async () => {
    stubHappyPath()
    await run({ pubId: 'kerala-trip_1', userId: 'spoofed-user' })
    const authCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/auth/v1/user'))
    expect((authCall![1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer session-token' })
    const insertCall = fetchMock.mock.calls.find(c => String(c[0]).includes('/rest/v1/purchase_orders') && (c[1] as RequestInit | undefined)?.method === 'POST')
    expect(JSON.parse(String((insertCall![1] as RequestInit).body)).user_id).toBe('buyer-1')
  })

  it.each([
    ['GET', 405],
  ])('%s is refused', async (method, status) => {
    const res = await run({}, null, method)
    expect(res.statusCode).toBe(status)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['missing config', () => { delete (process.env as Record<string, string | undefined>).RAZORPAY_KEY_ID }],
    ['empty env value', () => { vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '') }],
  ])('returns 503 when %s', async (_name, breakEnv) => {
    breakEnv()
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(503)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['no body', undefined],
    ['bad pubId type', { pubId: 42 }],
    ['bad pubId shape', { pubId: 'two words' }],
  ])('returns 400 for %s', async (_name, body) => {
    const res = await run(body)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 401 without a bearer token and 401 for a dead session', async () => {
    expect((await run({ pubId: 'kerala-trip_1' }, null)).statusCode).toBe(401)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/v1/user')) return new Response('denied', { status: 401 })
      throw new Error('unexpected')
    })
    expect((await run({ pubId: 'kerala-trip_1' })).statusCode).toBe(401)
  })

  it('returns 404 for an unknown publication', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (String(input).includes('/rest/v1/published_itineraries')) return jsonResponse([])
      throw new Error('unexpected')
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(404)
  })

  it.each([
    ['an unpriced publication', { ...pubRow, premium_price_inr: null }, 403],
    ['the creator buying their own plan', { ...pubRow, creator_id: 'buyer-1' }, 403],
  ])('returns 403 for %s', async (_name, row, status) => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (String(input).includes('/rest/v1/published_itineraries')) return jsonResponse([row])
      throw new Error('unexpected')
    })
    expect((await run({ pubId: 'kerala-trip_1' })).statusCode).toBe(status)
  })

  it('returns 409 when an entitlement already exists', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (String(input).includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (String(input).includes('/rest/v1/entitlements')) return jsonResponse([{ id: 'e1' }])
      throw new Error('unexpected')
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(409)
    expect(fetchMock.mock.calls.filter(c => String(c[0]) === 'https://api.razorpay.com/v1/orders')).toHaveLength(0)
  })

  it('returns 503 when the gateway order fails', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (String(input).includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (String(input).includes('/rest/v1/entitlements')) return jsonResponse([])
      if (String(input) === 'https://api.razorpay.com/v1/orders') return new Response('denied', { status: 401 })
      throw new Error('unexpected')
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(503)
  })

  it('re-serves an existing pending order instead of minting another', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse([])
      // fetchLatestOrder: the newest row for buyer+pub, any status.
      if (url.includes('/rest/v1/purchase_orders') && url.includes('select=razorpay_order_id')) {
        return jsonResponse([{ razorpay_order_id: 'order_EXISTING', amount_inr: 500, status: 'pending' }])
      }
      // The gateway-status check for the pending order (still payable).
      if (url === 'https://api.razorpay.com/v1/orders/order_EXISTING') return jsonResponse({ id: 'order_EXISTING', status: 'created' })
      throw new Error(`unexpected fetch ${url}`)
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).orderId).toBe('order_EXISTING')
    // No NEW gateway order, no new row — the orphan-pending guard held.
    expect(fetchMock.mock.calls.filter(c => String(c[0]) === 'https://api.razorpay.com/v1/orders' || String(c[0]).startsWith('https://api.razorpay.com/v1/orders?'))).toHaveLength(0)
    expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/rest/v1/purchase_orders') && (c[1] as RequestInit | undefined)?.method === 'POST')).toHaveLength(0)
  })

  it('SELF-HEALS a captured-but-ungranted order: marks paid, grants, and tells the buyer to reload', async () => {
    // The live incident: verify failed after a capture, the local row stayed
    // pending, and re-opening checkout hit Razorpay's opaque "Uh! oh!" —
    // because the modal refuses an already-paid order.
    const grantCalls: Array<{ url: string; body: unknown }> = []
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse([])
      if (url.includes('/rest/v1/purchase_orders') && url.includes('select=razorpay_order_id')) {
        return jsonResponse([{ razorpay_order_id: 'order_PAID', amount_inr: 500, status: 'pending' }])
      }
      if (url === 'https://api.razorpay.com/v1/orders/order_PAID') return jsonResponse({ id: 'order_PAID', status: 'paid' })
      if (url.includes('/rest/v1/purchase_orders') && (init.method) === 'PATCH') return jsonResponse(null)
      if (url.includes('/rpc/claim_paid_order')) { grantCalls.push({ url, body: JSON.parse(String(init.body)) }); return jsonResponse('ent-uuid') }
      throw new Error(`unexpected fetch ${url}`)
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(409)
    const body = JSON.parse(res.body)
    expect(body.error).toContain('already unlocked')
    expect(body.error).toContain('reload')
    // The order was marked paid and the claim rode the BUYER's JWT.
    const patch = fetchMock.mock.calls.find(c => String(c[0]).includes('/rest/v1/purchase_orders') && (c[1] as RequestInit | undefined)?.method === 'PATCH')
    expect(JSON.parse(String((patch![1] as RequestInit).body)).status).toBe('paid')
    expect(grantCalls).toHaveLength(1)
    expect((grantCalls[0]!.body as Record<string, string>).p_razorpay_order_id).toBe('order_PAID')
  })

  it('SELF-HEAL claim failure is a 503 that promises no second charge — never a fresh order', async () => {
    // The double-charge hole: grant fails after the money moved → the next
    // click must NOT mint a new Razorpay order for an already-paid payment.
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse([])
      if (url.includes('/rest/v1/purchase_orders') && url.includes('select=razorpay_order_id')) {
        return jsonResponse([{ razorpay_order_id: 'order_PAID', amount_inr: 500, status: 'pending' }])
      }
      if (url === 'https://api.razorpay.com/v1/orders/order_PAID') return jsonResponse({ id: 'order_PAID', status: 'paid' })
      if (url.includes('/rest/v1/purchase_orders') && (init.method) === 'PATCH') return jsonResponse(null)
      if (url.includes('/rpc/claim_paid_order')) return new Response('RPC refused', { status: 403 })
      throw new Error(`unexpected fetch ${url}`)
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(503)
    const body = JSON.parse(res.body)
    expect(body.error).toContain('no second payment will be taken')
    expect(body.error).toContain('order_PAID')
    // NO new gateway order was minted — the double charge cannot happen.
    expect(fetchMock.mock.calls.filter(c => String(c[0]) === 'https://api.razorpay.com/v1/orders')).toHaveLength(0)
  })

  it('an already-paid local row re-grants directly (no gateway probe) and stays un-minted on failure', async () => {
    // The stranded-row state: markOrderPaid succeeded but the grant failed,
    // so the row is 'paid' with no entitlement. The next click must recover
    // WITHOUT probing the gateway again and WITHOUT minting a fresh order —
    // this is the exact shape of the live stranded order_TdRPJoZWZ1IMcP.
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse([])
      // fetchLatestOrder: NO status=eq.pending filter — any status.
      if (url.includes('/rest/v1/purchase_orders') && url.includes('select=razorpay_order_id')) {
        return jsonResponse([{ razorpay_order_id: 'order_STRANDED', amount_inr: 500, status: 'paid' }])
      }
      if (url.includes('/rpc/claim_paid_order')) return new Response('RPC refused', { status: 403 })
      throw new Error(`unexpected fetch ${url}`)
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(503)
    // No gateway probe for a row that already says paid, no PATCH, no mint.
    expect(fetchMock.mock.calls.filter(c => String(c[0]).startsWith('https://api.razorpay.com/v1/orders/order_'))).toHaveLength(0)
    expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/rest/v1/purchase_orders') && (c[1] as RequestInit | undefined)?.method === 'PATCH')).toHaveLength(0)
    expect(fetchMock.mock.calls.filter(c => String(c[0]) === 'https://api.razorpay.com/v1/orders')).toHaveLength(0)
  })

  it('mints a fresh order when the pending one is not payable at the gateway (attempted)', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse([])
      if (url.includes('/rest/v1/purchase_orders') && url.includes('status=eq.pending')) {
        return jsonResponse([{ razorpay_order_id: 'order_ATTEMPTED', amount_inr: 500 }])
      }
      if (url === 'https://api.razorpay.com/v1/orders/order_ATTEMPTED') return jsonResponse({ id: 'order_ATTEMPTED', status: 'attempted' })
      if (url === 'https://api.razorpay.com/v1/orders') return jsonResponse({ id: 'order_FRESH' })
      if (url.includes('/rest/v1/purchase_orders')) return jsonResponse(null, 201)
      throw new Error(`unexpected fetch ${url}`)
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).orderId).toBe('order_FRESH')
  })

  it('mints a fresh order when the pending one snapshots a different price', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/published_itineraries')) return jsonResponse([pubRow])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse([])
      if (url.includes('/rest/v1/purchase_orders') && url.includes('status=eq.pending')) {
        return jsonResponse([{ razorpay_order_id: 'order_OLDPRICE', amount_inr: 300 }])
      }
      if (url === 'https://api.razorpay.com/v1/orders') return jsonResponse({ id: 'order_NEW' })
      if (url.includes('/rest/v1/purchase_orders')) return jsonResponse(null, 201)
      throw new Error(`unexpected fetch ${url}`)
    })
    const res = await run({ pubId: 'kerala-trip_1' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).orderId).toBe('order_NEW')
  })
})

describe('POST /api/payments-verify', () => {
  async function run(body: unknown, authHeader: string | null = 'Bearer session-token') {
    const res = makeRes()
    const { default: handler } = await import('../api/payments-verify.js')
    const req: Record<string, unknown> = { method: 'POST', body, headers: {} as Record<string, string> }
    if (authHeader) (req.headers as Record<string, string>).authorization = authHeader
    await handler(req, res)
    return res
  }

  const goodCallback = {
    razorpay_order_id: 'order_ABC123',
    razorpay_payment_id: 'pay_XYZ789',
    razorpay_signature: '', // filled per-test
  }

  function stubGrantPath(ok = true) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/auth/v1/user')) return jsonResponse({ id: 'buyer-1' })
      if (url.includes('/rest/v1/purchase_orders')) return jsonResponse(null, ok ? 200 : 500)
      if (url.includes('/rest/v1/rpc/claim_paid_order')) return jsonResponse('ent-uuid')
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  it('marks the order paid and claims via the buyer-scoped RPC on a genuine signature', async () => {
    goodCallback.razorpay_signature = await hmacHex(`${goodCallback.razorpay_order_id}|${goodCallback.razorpay_payment_id}`, ENV.RAZORPAY_KEY_SECRET)
    stubGrantPath()
    const res = await run(goodCallback)
    // The session lookup runs too — it is part of the happy path.
    expect(fetchMock.mock.calls.filter(c => String(c[0]).includes('/auth/v1/user'))).toHaveLength(1)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
    const patch = fetchMock.mock.calls.find(c => String(c[0]).includes('/rest/v1/purchase_orders') && (c[1] as RequestInit | undefined)?.method === 'PATCH')
    expect(JSON.parse(String((patch![1] as RequestInit).body))).toMatchObject({ status: 'paid', razorpay_payment_id: 'pay_XYZ789' })
    const rpc = fetchMock.mock.calls.find(c => String(c[0]).includes('/rpc/claim_paid_order'))
    // The claim rides the BUYER's JWT (the RPC's auth.uid() guard depends on it).
    expect((rpc![1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer session-token' })
    expect(JSON.parse(String((rpc![1] as RequestInit).body))).toEqual({ p_razorpay_order_id: 'order_ABC123' })
  })

  it('refuses a forged signature before touching the order', async () => {
    goodCallback.razorpay_signature = 'f'.repeat(64)
    const res = await run(goodCallback)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a signature from the wrong secret', async () => {
    goodCallback.razorpay_signature = await hmacHex(`${goodCallback.razorpay_order_id}|${goodCallback.razorpay_payment_id}`, 'not-the-secret')
    const res = await run(goodCallback)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    ['missing signature', { razorpay_order_id: 'order_ABC123', razorpay_payment_id: 'pay_XYZ789' }],
    ['oversized payment id', { razorpay_order_id: 'order_ABC123', razorpay_payment_id: 'x'.repeat(65), razorpay_signature: 'a'.repeat(64) }],
  ])('returns 400 for %s without fetching', async (_name, body) => {
    const res = await run(body)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requires a session (after the signature check)', async () => {
    goodCallback.razorpay_signature = await hmacHex(`${goodCallback.razorpay_order_id}|${goodCallback.razorpay_payment_id}`, ENV.RAZORPAY_KEY_SECRET)
    const res = await run(goodCallback, null)
    expect(res.statusCode).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/payments-webhook', () => {
  function makeReq(raw: string, signature: string | null) {
    const headers: Record<string, string | string[]> = {}
    if (signature !== null) headers['x-razorpay-signature'] = signature
    const stream = new Readable()
    stream.push(raw)
    stream.push(null)
    return { method: 'POST', headers, on: stream.on.bind(stream) } as never
  }

  async function run(raw: string, signature: string | null) {
    const res = makeRes()
    const { default: handler } = await import('../api/payments-webhook.js')
    await handler(makeReq(raw, signature), res)
    return res
  }

  const event = {
    event: 'payment.captured',
    payload: { payment: { entity: { order_id: 'order_ABC123', id: 'pay_XYZ789' } } },
  }

  function stubGrantPath(order = { id: 'order-row-uuid', user_id: 'buyer-1', pub_id: 'kerala-trip_1', price_snapshot_inr: 500, status: 'paid' }) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/rest/v1/purchase_orders') && url.includes('status=eq.pending')) return jsonResponse(null, 200)
      if (url.includes('/rest/v1/purchase_orders') && url.includes('select=')) return jsonResponse([order])
      if (url.includes('/rest/v1/entitlements')) return jsonResponse(null, 201)
      throw new Error(`unexpected fetch ${url}`)
    })
  }

  it('grants the entitlement on a valid captured-payment event', async () => {
    const sig = await hmacHex(JSON.stringify(event), ENV.RAZORPAY_WEBHOOK_SECRET)
    stubGrantPath()
    const res = await run(JSON.stringify(event), sig)
    expect(res.statusCode).toBe(200)
    const grant = fetchMock.mock.calls.find(c => String(c[0]).includes('/rest/v1/entitlements'))
    const grantHeaders = (grant![1] as RequestInit).headers as Record<string, string>
    expect(grantHeaders.authorization).toBe('Bearer service-key') // service_role, no caller JWT
    // PostgREST upsert: the real idempotency mechanism is the Prefer
    // resolution + on_conflict param, not a 409 handler.
    expect(grantHeaders.prefer).toContain('resolution=ignore-duplicates')
    expect(String(grant![0])).toContain('on_conflict=user_id,pub_id')
    expect(JSON.parse(String((grant![1] as RequestInit).body))).toMatchObject({ user_id: 'buyer-1', pub_id: 'kerala-trip_1', amount_paid_inr: 500 })
  })

  it.each([
    ['a tampered body', () => { const e = JSON.parse(JSON.stringify(event)); e.payload.payment.entity.order_id = 'order_OTHER'; return [JSON.stringify(e), null] as const }],
    ['a missing signature', () => [JSON.stringify(event), null] as const],
    ['a signature from the wrong secret', () => [JSON.stringify(event), 'wrong'] as const],
  ])('refuses %s', async (_name, make) => {
    const [raw, sig] = make()
    const signature = sig === 'wrong' ? await hmacHex('not-the-body', ENV.RAZORPAY_WEBHOOK_SECRET) : sig
    const res = await run(raw as string, signature as string | null)
    expect(res.statusCode).toBe(400)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('acknowledges non-captured events without touching the database', async () => {
    const other = { event: 'refund.processed', payload: {} }
    const sig = await hmacHex(JSON.stringify(other), ENV.RAZORPAY_WEBHOOK_SECRET)
    const res = await run(JSON.stringify(other), sig)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true, ignored: 'refund.processed' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 200 with a note for a captured event with no local order', async () => {
    const sig = await hmacHex(JSON.stringify(event), ENV.RAZORPAY_WEBHOOK_SECRET)
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/rest/v1/purchase_orders') && url.includes('status=eq.pending')) return jsonResponse(null, 200)
      if (url.includes('/rest/v1/purchase_orders') && url.includes('select=')) return jsonResponse([])
      throw new Error('unexpected')
    })
    const res = await run(JSON.stringify(event), sig)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).note).toBeTruthy()
  })

  it('returns 500 so Razorpay retries when the grant fails', async () => {
    const sig = await hmacHex(JSON.stringify(event), ENV.RAZORPAY_WEBHOOK_SECRET)
    fetchMock.mockImplementation(async () => new Response('down', { status: 500 }))
    const res = await run(JSON.stringify(event), sig)
    expect(res.statusCode).toBe(500)
  })
})
