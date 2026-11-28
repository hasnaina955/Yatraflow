import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { authNext } from '../src/lib/authNext'
import { creatorClaimToken, creatorClaimEmailRedirect, ROUTED_SEGMENTS } from '../src/lib/routes'
import { readClaimPreview, readClaimTransfer } from '../src/lib/creatorClaim'
import { browseClaimAvatar, claimAccountReady } from '../src/lib/creatorClaimView'

const token = 'a'.repeat(64)
const route = `/claim/${token}`
describe('the preview and signup route', () => {
  it('reads the token on a direct visit and an email return', () => {
    expect(creatorClaimToken(route)).toBe(token)
    expect(creatorClaimToken(`${route}?code=callback`)).toBe(token)
    expect(ROUTED_SEGMENTS).toContain('claim')
  })
  it('accepts only a single lowercase hex token', () => {
    for (const bad of ['/claim', '/claim/abc', `/claim/${token}/extra`, `/claim/${token.toUpperCase()}`, `//claim/${token}`]) {
      expect(creatorClaimToken(bad)).toBeNull()
      expect(creatorClaimEmailRedirect(bad, 'https://www.example.test')).toBeUndefined()
    }
  })
  it('uses the sanitized return path for email confirmation', () => {
    expect(creatorClaimEmailRedirect(authNext(encodeURIComponent(route)), 'https://www.example.test')).toBe(`https://www.example.test${route}`)
    expect(creatorClaimEmailRedirect(authNext('https://other.test'), 'https://www.example.test')).toBeUndefined()
    expect(creatorClaimEmailRedirect(authNext('/trips'), 'https://www.example.test')).toBeUndefined()
  })
  it('mounts claim before the account loading gate', () => {
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
    expect(app.indexOf("if (parts[0] === 'claim') {")).toBeLessThan(app.indexOf("if (!ready && parts[0] !== 'auth'"))
    expect(app).toContain('<ClaimProfilePage key={claimToken ?? \'invalid\'} token={claimToken} />')
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
