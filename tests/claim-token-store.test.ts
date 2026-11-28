import { describe, expect, it } from 'vitest'
import {
  CLAIM_TOKEN_KEY,
  CLAIM_TOKEN_MAX_AGE_MS,
  clearClaimToken,
  readClaimToken,
} from '../src/lib/claimToken'

const TOKEN = 'a'.repeat(64)
const DAY_MS = 24 * 60 * 60 * 1000
const T0 = 1_700_000_000_000

function makeFakeStorage(initial?: Record<string, string>) {
  const map = new Map<string, string>(Object.entries(initial ?? {}))
  const ops: string[] = []
  const storage = {
    getItem: (key: string) => {
      ops.push(`get:${key}`)
      return map.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      ops.push(`set:${key}`)
      map.set(key, value)
    },
    removeItem: (key: string) => {
      ops.push(`remove:${key}`)
      map.delete(key)
    },
  }
  return { map, ops, storage }
}

describe('claim token storage lifecycle', () => {
  it('stores JSON with savedAt and clears the hash once for a valid fragment', () => {
    const { map, storage } = makeFakeStorage()
    let cleared = 0
    const result = readClaimToken(`#${TOKEN}`, () => storage, () => { cleared += 1 }, () => T0)
    expect(result).toBe(TOKEN)
    expect(cleared).toBe(1)
    expect(JSON.parse(map.get(CLAIM_TOKEN_KEY) ?? '')).toEqual({ token: TOKEN, savedAt: T0 })
  })

  it('returns null and leaves empty storage and hash untouched for a non-claim hash', () => {
    const { map, ops, storage } = makeFakeStorage()
    let cleared = 0
    const result = readClaimToken('#access_token=abc&type=signup', () => storage, () => { cleared += 1 }, () => T0)
    expect(result).toBeNull()
    expect(cleared).toBe(0)
    expect(map.size).toBe(0)
    expect(ops).toEqual([`get:${CLAIM_TOKEN_KEY}`])
  })

  it('returns a stored token when read 6 days later', () => {
    const { map, storage } = makeFakeStorage({
      [CLAIM_TOKEN_KEY]: JSON.stringify({ token: TOKEN, savedAt: T0 }),
    })
    const result = readClaimToken('', () => storage, () => {}, () => T0 + 6 * DAY_MS)
    expect(result).toBe(TOKEN)
    expect(map.has(CLAIM_TOKEN_KEY)).toBe(true)
  })

  it('expires and removes a stored token 7 days plus 1 ms later', () => {
    const { map, storage } = makeFakeStorage({
      [CLAIM_TOKEN_KEY]: JSON.stringify({ token: TOKEN, savedAt: T0 }),
    })
    const result = readClaimToken('', () => storage, () => {}, () => T0 + CLAIM_TOKEN_MAX_AGE_MS + 1)
    expect(result).toBeNull()
    expect(map.has(CLAIM_TOKEN_KEY)).toBe(false)
  })

  it('rejects and removes a stored token whose savedAt is in the future', () => {
    const { map, storage } = makeFakeStorage({
      [CLAIM_TOKEN_KEY]: JSON.stringify({ token: TOKEN, savedAt: T0 + 1000 }),
    })
    const result = readClaimToken('', () => storage, () => {}, () => T0)
    expect(result).toBeNull()
    expect(map.has(CLAIM_TOKEN_KEY)).toBe(false)
  })

  it('rejects and removes a legacy bare-string value', () => {
    const { map, storage } = makeFakeStorage({
      [CLAIM_TOKEN_KEY]: TOKEN,
    })
    const result = readClaimToken('', () => storage, () => {}, () => T0)
    expect(result).toBeNull()
    expect(map.has(CLAIM_TOKEN_KEY)).toBe(false)
  })

  it('rejects and removes malformed JSON', () => {
    const { map, storage } = makeFakeStorage({
      [CLAIM_TOKEN_KEY]: '{not-json',
    })
    const result = readClaimToken('', () => storage, () => {}, () => T0)
    expect(result).toBeNull()
    expect(map.has(CLAIM_TOKEN_KEY)).toBe(false)
  })

  it('still returns the hash token when setItem throws', () => {
    const { storage } = makeFakeStorage()
    const throwingStorage = {
      ...storage,
      setItem: () => { throw new Error('quota exceeded') },
    }
    let cleared = 0
    const result = readClaimToken(`#${TOKEN}`, () => throwingStorage, () => { cleared += 1 }, () => T0)
    expect(result).toBe(TOKEN)
    expect(cleared).toBe(1)
  })

  it('removes the stored key on clearClaimToken', () => {
    const { map, storage } = makeFakeStorage({
      [CLAIM_TOKEN_KEY]: JSON.stringify({ token: TOKEN, savedAt: T0 }),
    })
    clearClaimToken(() => storage)
    expect(map.has(CLAIM_TOKEN_KEY)).toBe(false)
  })
})
