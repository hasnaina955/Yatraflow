import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Wiring guards for the M7 unlock flow. The page's purchase path is a
// browser-only journey (gateway modal + session JWT), so these pin the
// seams the verify gate cannot otherwise see: the placeholder toast is
// really gone, the buying state actually disables the button, and the
// api functions stay client-import-free (they must never pull Capacitor
// into a serverless bundle).

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('the public page wires the real unlock flow', () => {
  const page = read('../src/pages/PublicItinerary.tsx')

  it('has no placeholder premium toast left', () => {
    expect(page).not.toContain('no payments in this MVP')
    expect(page).not.toContain('Premium unlock is a placeholder')
  })

  it('purchases through lib/unlock and gates rendering with hasUnlock', () => {
    expect(page).toMatch(/import\s*\{[^}]*purchaseUnlock[^}]*\}\s*from\s*'\.\.\/lib\/unlock'/)
    expect(page).toMatch(/import\s*\{[^}]*hasUnlock[^}]*\}\s*from\s*'\.\.\/lib\/payments'/)
    expect(page).toContain('const unlocked = hasUnlock(')
  })

  it('disables the unlock buttons while a purchase is in flight (the #36-6 rule)', () => {
    const buttons = page.match(/<button[^>]*disabled=\{buying\}[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('re-reads entitlements after a successful purchase', () => {
    expect(page).toMatch(/onUnlocked:\s*\(\)\s*=>\s*\{/)
    expect(page).toContain('fetchMyEntitlements(meId)')
  })
})

describe('the api functions stay client-import-free', () => {
  it.each(['../api/checkout.js', '../api/payments-verify.js', '../api/payments-webhook.js'])('%s imports no client code', path => {
    const source = read(path)
    expect(source).not.toMatch(/from\s+'\.\.\/src\//)
    expect(source).not.toMatch(/require\(['"]\.\.\/src/)
  })
})

describe('the unlock library degrades honestly', () => {
  it('loads checkout.js only once per session', () => {
    // The module-level memo is load-bearing: every Unlock click appending its
    // own script tag would race the modal open. Pinned so a refactor keeps it.
    const source = read('../src/lib/unlock.ts')
    expect(source).toMatch(/let scriptPromise: Promise<boolean> \| null = null/)
    expect(source).toContain('scriptPromise = null // allow a retry on the next click')
  })

  it('never treats a missing entitlements table as an error surface', () => {
    expect(read('../src/lib/unlock.ts')).toMatch(/catch \(e\) \{\s*console\.error\('\[yatraflow\] entitlements read failed', e\)\s*return \[\]\s*\}/)
  })
})
