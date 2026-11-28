import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analyticsBeforeSend } from '../src/lib/analyticsPrivacy'
import { redactClaimUrl } from '../src/lib/claimPrivacy'

const read = (file: string) => readFileSync(new URL('../' + file, import.meta.url), 'utf8')
const token = 'ab'.repeat(32)

describe('private creator claim URL handling', () => {
  it.each([
    `https://www.yatraflow.in/claim#${token}`,
    `/auth?mode=signup&next=${encodeURIComponent('/claim')}`,
    `/auth?next=${encodeURIComponent(encodeURIComponent('/claim'))}`,
    `/#/claim#${token}`,
  ])('does not send a claim address to analytics or feedback', url => {
    expect(redactClaimUrl(url)).toBe('/claim')
    expect(analyticsBeforeSend({ type: 'pageview', url })).toBeNull()
  })

  it('keeps unrelated navigation', () => {
    const url = 'https://www.yatraflow.in/auth?mode=signup&next=%2Ftrips'
    expect(redactClaimUrl(url)).toBe(url)
    expect(analyticsBeforeSend({ type: 'pageview', url })?.url).toBe(url)
  })

  it('keeps the claim route out of the service worker shell cache', () => {
    const worker = read('public/sw.js')
    expect(worker).toContain("prefix === '/claim' ? url.pathname === prefix")
  })
})

describe('claim card routing', () => {
  const config = JSON.parse(read('vercel.json'))
  const claim = config.rewrites.find((r: { destination: string }) => r.destination === '/api/creator-claim?og=1')
  it('routes crawlers to the card and keeps ordinary browsers on the SPA', () => {
    expect(claim.source).toBe('/claim')
    const agents = new RegExp(claim.has[0].value)
    expect(agents.test('facebookexternalhit/1.1')).toBe(true)
    expect(agents.test('WhatsApp/2.24.1 N')).toBe(true)
    expect(agents.test('Mozilla/5.0 Mobile/21A329 Instagram 310.0.0.15.110')).toBe(false)
    expect(agents.test('Mozilla/5.0 Chrome/144.0')).toBe(false)
    expect(config.rewrites.indexOf(claim)).toBeLessThan(config.rewrites.findIndex((r: { destination: string }) => r.destination === '/app.html'))
  })

  it('keeps the claim page out of search and caches', () => {
    const rule = config.headers.find((r: { source: string }) => r.source === '/claim')
    expect(rule.headers).toContainEqual({ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' })
    expect(rule.headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' })
    expect(rule.headers).toContainEqual({ key: 'Cache-Control', value: 'private, no-store, max-age=0' })
  })
})
