import { describe, expect, it } from 'vitest'
import { redactClaimUrl } from '../src/lib/claimPrivacy'

const hash = 'cd'.repeat(32)

describe('claim redaction only matches claim paths', () => {
  it('keeps a non-claim URL that contains a 64-character hex value', () => {
    const url = `https://www.yatraflow.in/trip/abc?ref=${hash}`
    expect(redactClaimUrl(url)).toBe(url)
  })

  it('still redacts a claim path and an encoded claim return', () => {
    expect(redactClaimUrl(`/claim#${hash}`)).toBe('/claim')
    expect(redactClaimUrl(`/auth?next=${encodeURIComponent('/claim')}`)).toBe('/claim')
  })
})
