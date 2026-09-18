import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  draftOrder, receiptFor, verifyCallbackSignature, verifyWebhookSignature,
  timingSafeEqualHex, orderGrantsEntitlement, hasUnlock,
  type PaymentCallback, type Entitlement,
} from '../src/lib/payments'

beforeEach(() => {
  vi.stubGlobal('crypto', globalThis.crypto)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('draftOrder', () => {
  const base = { pubId: 'kerala-trip_1', tripId: 'trip-1', buyerId: 'user-1', razorpayOrderId: 'order_X1', keyId: 'rzp_test_X' }

  it('drafts from a server-verified price with a paise amount and a bounded receipt', () => {
    const draft = draftOrder({ ...base, priceInr: 500 })
    expect(draft.amountInr).toBe(500)
    expect(draft.receipt).toMatch(/^r[a-z0-9]{8}[a-z0-9]{4}$/)
    expect(draft.receipt.length).toBeLessThanOrEqual(14)
  })

  it('rejects an unpriceable publication (null, zero, negative, non-integer)', () => {
    for (const priceInr of [null, undefined, 0, -1, 199.5]) {
      expect(() => draftOrder({ ...base, priceInr: priceInr as number })).toThrow(RangeError)
    }
  })

  it('rejects a price above the gateway cap', () => {
    expect(() => draftOrder({ ...base, priceInr: 100_001 })).toThrow(RangeError)
    expect(() => draftOrder({ ...base, priceInr: 100_000 })).not.toThrow()
  })

  it('derives the receipt from ids, not from the price', () => {
    expect(receiptFor('pub-a', 'user-a')).toBe(receiptFor('pub-a', 'user-a'))
    expect(receiptFor('pub-a', 'user-a')).not.toBe(receiptFor('pub-b', 'user-a'))
    expect(receiptFor('pub-a', 'user-a')).not.toBe(receiptFor('pub-a', 'user-b'))
  })
})

describe('signature verification (WebCrypto HMAC)', () => {
  const secret = 'test-secret'
  const callback: PaymentCallback = {
    razorpay_order_id: 'order_X1',
    razorpay_payment_id: 'pay_X1',
    razorpay_signature: '',
  }

  async function signed(payload: string, key = secret) {
    const enc = new TextEncoder()
    const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(payload))
    return Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  it('accepts a genuine callback signature', async () => {
    callback.razorpay_signature = await signed(`${callback.razorpay_order_id}|${callback.razorpay_payment_id}`)
    await expect(verifyCallbackSignature(callback, secret)).resolves.toBe(true)
  })

  it('rejects a forged signature', async () => {
    callback.razorpay_signature = 'deadbeef'.repeat(8)
    await expect(verifyCallbackSignature(callback, secret)).resolves.toBe(false)
  })

  it('rejects a signature from a different secret', async () => {
    callback.razorpay_signature = await signed(`${callback.razorpay_order_id}|${callback.razorpay_payment_id}`, 'other-secret')
    await expect(verifyCallbackSignature(callback, secret)).resolves.toBe(false)
  })

  it('rejects a signature computed over a different payload (separator swap)', async () => {
    callback.razorpay_signature = await signed(`${callback.razorpay_order_id}-${callback.razorpay_payment_id}`)
    await expect(verifyCallbackSignature(callback, secret)).resolves.toBe(false)
  })

  it('rejects a signature computed over tampered amounts (the body is the payload)', async () => {
    const raw = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'order_X1' } } } })
    const sig = await signed(raw, 'whsec')
    const tampered = raw.replace('order_X1', 'order_X2')
    await expect(verifyWebhookSignature(tampered, sig, 'whsec')).resolves.toBe(false)
    await expect(verifyWebhookSignature(raw, sig, 'whsec')).resolves.toBe(true)
  })
})

describe('timingSafeEqualHex', () => {
  it('compares equal strings as equal', () => {
    expect(timingSafeEqualHex('abcd', 'abcd')).toBe(true)
  })
  it('walks both strings fully and never throws on length mismatch', () => {
    expect(timingSafeEqualHex('abcd', 'abc')).toBe(false)
    expect(timingSafeEqualHex('', 'abcd')).toBe(false)
    expect(timingSafeEqualHex('abcd', '')).toBe(false)
    expect(timingSafeEqualHex('', '')).toBe(true)
  })
})

describe('orderGrantsEntitlement', () => {
  it('grants only from a paid order with real ids', () => {
    expect(orderGrantsEntitlement('paid', 'u1', 'p1')).toBe(true)
    expect(orderGrantsEntitlement('pending', 'u1', 'p1')).toBe(false)
    expect(orderGrantsEntitlement('failed', 'u1', 'p1')).toBe(false)
    expect(orderGrantsEntitlement('paid', '', 'p1')).toBe(false)
    expect(orderGrantsEntitlement('paid', 'u1', '')).toBe(false)
  })
})

describe('hasUnlock', () => {
  const entitlement = (over: Partial<Entitlement> = {}): Entitlement => ({
    id: 'e1', userId: 'user-1', pubId: 'pub-1', orderId: 'o1', amountPaidInr: 500, grantedAt: 0, ...over,
  })

  it('grants the creator their own publication without a purchase', () => {
    expect(hasUnlock([], 'creator-1', 'pub-1', 'creator-1')).toBe(true)
  })

  it('grants a buyer with a matching entitlement', () => {
    expect(hasUnlock([entitlement()], 'user-1', 'pub-1', 'creator-1')).toBe(true)
  })

  it.each([
    ['a logged-out visitor', null],
    ['a user without an entitlement', 'user-2'],
    ['an entitlement for a different publication', 'user-1'],
  ])('denies %s', (_name, userId) => {
    const ents = _name === 'an entitlement for a different publication'
      ? [entitlement({ pubId: 'pub-OTHER' })]
      : []
    expect(hasUnlock(ents, userId, 'pub-1', 'creator-1')).toBe(false)
  })
})
