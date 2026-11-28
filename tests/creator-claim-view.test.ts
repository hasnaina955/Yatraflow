import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { readClaimToken, clearClaimToken } from '../src/lib/claimToken'
import { authNext } from '../src/lib/authNext'
import { claimTokenFromHash, creatorClaimEmailRedirect, ROUTED_SEGMENTS } from '../src/lib/routes'
import { readClaimPreview, readClaimTransfer } from '../src/lib/creatorClaim'
import { browseClaimAvatar, claimAccountReady } from '../src/lib/creatorClaimView'

const token = 'a'.repeat(64)
describe('the preview and signup route', () => {
  it('accepts only a lowercase hex fragment and a token-free return', () => {
    expect(claimTokenFromHash(`#${token}`)).toBe(token)
    for (const bad of ['', '#access_token=abc', `#${token.toUpperCase()}`, `#${token}/extra`]) expect(claimTokenFromHash(bad)).toBeNull()
    expect(creatorClaimEmailRedirect(authNext('/claim'), 'https://www.example.test')).toBe('https://www.example.test/claim')
    expect(creatorClaimEmailRedirect(`/claim/${token}`, 'https://www.example.test')).toBeUndefined()
    expect(ROUTED_SEGMENTS).toContain('claim')
    expect(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')).toContain('<ClaimProfilePage />')
  })
})

describe('the claim page reads reviewed response shapes', () => {
  it('accepts a preview with the real itinerary field names', () => {
    const preview = readClaimPreview({
      found: true, status: 'unclaimed', creator: { name: 'Creator' },
      trips: [{ id: 'test', name: 'Trip', destinations: ['Goa'], days: [{ index: 0, stops: [{ title: 'Fort', arrivalTime: '08:00' }] }] }],
    })
    expect(preview?.status).toBe('unclaimed')
    if (preview?.status === 'unclaimed') expect(preview.trips[0]?.days[0]?.stops[0]?.title).toBe('Fort')
  })
  it('does not interpret a failed read as an invalid invitation', () => {
    expect(readClaimPreview({ error: 'Unavailable' })).toBeNull()
    expect(readClaimPreview({ found: true, status: 'unclaimed', creator: null, trips: [] })).toBeNull()
    expect(readClaimPreview({ found: false, status: 'invalid' })).toEqual({ status: 'invalid' })
    expect(readClaimPreview({ found: true, status: 'claimed' })).toEqual({ status: 'claimed' })
  })
  it('requires a valid transfer receipt before reporting success', () => {
    expect(readClaimTransfer({ ok: true, claimerId: 'u', movedTripIds: [] })).toBeNull()
    expect(readClaimTransfer({ ok: true, claimerId: 'u', movedTripIds: ['t'] })).toEqual({ claimerId: 'u', movedTripIds: ['t'] })
  })
  it('omits insecure or malformed avatars', () => {
    expect(browseClaimAvatar('http://example.test/a')).toBeNull()
    expect(browseClaimAvatar('broken')).toBeNull()
    expect(browseClaimAvatar('https://example.test/a')).toBe('https://example.test/a')
  })
})

describe('account refresh after transfer', () => {
  const transfer = { claimerId: 'u', movedTripIds: ['t'] }
  const account = {
    sessionUserId: 'u',
    sliceReads: { 'self profile': 'ok', trips: 'ok' } as const,
    users: [{ id: 'u', kind: 'private', profile: { isCreator: true } }],
    trips: [{ id: 't', members: [{ userId: 'u', role: 'owner' }] }],
  }
  it('requires the changed creator flag, the new trips, and verified ownership', () => {
    expect(claimAccountReady(account, transfer)).toBe(true)
    expect(claimAccountReady({ ...account, trips: [] }, transfer)).toBe(false)
    expect(claimAccountReady({ ...account, trips: [{ id: 't', members: [{ userId: 'u', role: 'viewer' }] }] }, transfer)).toBe(false)
    expect(claimAccountReady({ ...account, users: [{ ...account.users[0], profile: { isCreator: false } }] }, transfer)).toBe(false)
  })
  it('does not accept a stale read or another account', () => {
    expect(claimAccountReady({ ...account, sliceReads: { 'self profile': 'failed', trips: 'ok' } }, transfer)).toBe(false)
    expect(claimAccountReady({ ...account, sliceReads: { 'self profile': 'ok', trips: 'failed' } }, transfer)).toBe(false)
    expect(claimAccountReady({ ...account, sessionUserId: 'v' }, transfer)).toBe(false)
  })
})

describe('claim token storage', () => {
  it('stores a valid fragment, removes it from the address and restores it', () => {
    let value: string | null = null
    const storage = { getItem: () => value, setItem: (_key: string, item: string) => { value = item }, removeItem: () => { value = null } }
    let cleared = false
    expect(readClaimToken(`#${token}`, () => storage, () => { cleared = true })).toBe(token)
    expect(cleared).toBe(true)
    expect(readClaimToken('#access_token=abc', () => storage, () => { throw new Error('unexpected') })).toBe(token)
    clearClaimToken(() => storage)
    expect(readClaimToken('', () => storage, () => {})).toBeNull()
  })
  it('keeps a valid fragment for this visit when storage throws', () => {
    const unavailable = () => { throw new Error('unavailable') }
    let cleared = false
    expect(readClaimToken(`#${token}`, unavailable, () => { cleared = true })).toBe(token)
    expect(cleared).toBe(true)
    expect(readClaimToken('', unavailable, () => {})).toBeNull()
    expect(() => clearClaimToken(unavailable)).not.toThrow()
  })
})
