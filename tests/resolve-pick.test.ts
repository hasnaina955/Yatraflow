// The shared ingestion guard (product decision 2026-09-25, #424): an
// unknown-position pick is resolved first and PROMPTED over when the resolver
// refuses — never written as a placeholder, never silently dropped. These
// fixtures pin the two pure pieces: the manual-coordinate validation (what the
// dialog accepts) and the resolve-then-prompt composition (what every vote,
// add and place path runs).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveOrPrompt, unnamedPick, validateManualCoords } from '../src/lib/resolvePick'
import { requireHitCoords } from '../src/lib/geocode'
import { hasCoords } from '../src/lib/providers/hits'
import type { PlaceHit } from '../src/lib/providers/hits'

const hit = (over: Partial<PlaceHit> = {}): PlaceHit => ({
  id: 'p1', name: 'Highway King', source: 'google', kind: 'poi',
  latitude: 0, longitude: 77.0595, // the mixed-zero placeholder
  ...over,
})

describe('validateManualCoords — what the dialog accepts', () => {
  it('accepts a finite, in-range, non-zero pair (trimmed input)', () => {
    const v = validateManualCoords('  12.97 ', '77.59')
    expect(v).toEqual({ ok: true, latitude: 12.97, longitude: 77.59 })
    expect(hasCoords(hit({ latitude: 12.97, longitude: 77.59 }))).toBe(true)
    // negatives (southern/western hemispheres) are real places too
    expect(validateManualCoords('-33.86', '-151.21').ok).toBe(true)
  })

  it('asks for missing coordinates', () => {
    const v = validateManualCoords('', '  ')
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.latError).toBe('Enter the latitude.')
      expect(v.lngError).toBe('Enter the longitude.')
    }
  })

  it('rejects non-numbers and out-of-range values with per-field messages', () => {
    const nan = validateManualCoords('twelve', '77.59')
    expect(nan.ok).toBe(false)
    if (!nan.ok) expect(nan.latError).toBe('Latitude must be a number.')
    const range = validateManualCoords('91', '-181')
    expect(range.ok).toBe(false)
    if (!range.ok) {
      expect(range.latError).toBe('Latitude must be between -90 and 90.')
      expect(range.lngError).toBe('Longitude must be between -180 and 180.')
    }
  })

  it('rejects zero coordinates — the map reads 0 as "position unknown"', () => {
    for (const zero of ['0', '0.0', '-0']) {
      const v = validateManualCoords(zero, '77.59')
      expect(v.ok).toBe(false)
      if (!v.ok) expect(v.latError).toContain('position unknown')
    }
    const lngZero = validateManualCoords('12.97', '0')
    expect(lngZero.ok).toBe(false)
    if (!lngZero.ok) expect(lngZero.lngError).toContain('position unknown')
  })
})

describe('resolveOrPrompt — resolve first, prompt only over the unknown', () => {
  it('returns the resolved hit without opening the prompt', async () => {
    const known = hit({ latitude: 12.97, longitude: 77.59 })
    let prompted = 0
    const out = await resolveOrPrompt(hit(), async () => known, async () => { prompted++; return null })
    expect(out).toBe(known)
    expect(prompted).toBe(0)
  })

  it('prompts when the resolver refuses, and the prompt has the final word', async () => {
    const manual = hit({ latitude: 15.31, longitude: 75.71 })
    const seen: PlaceHit[] = []
    const out = await resolveOrPrompt(
      hit(),
      async () => null,
      async (ctx) => { seen.push(ctx.hit); return manual },
    )
    expect(out).toBe(manual)
    expect(seen).toEqual([hit()])
    // a skipped pick resolves to null — the caller must not write anything
    const skipped = await resolveOrPrompt(hit(), async () => null, async () => null)
    expect(skipped).toBeNull()
  })

  it('a lying resolver that hands back an unplaceable hit still goes to the prompt', async () => {
    let prompted = 0
    await resolveOrPrompt(hit(), async () => hit(), async () => { prompted++; return null })
    expect(prompted).toBe(1)
  })

  it('retry re-runs the resolver (the provider may have recovered)', async () => {
    let calls = 0
    const out = await resolveOrPrompt(
      hit(),
      async () => (++calls === 1 ? null : hit({ latitude: 12.97, longitude: 77.59 })),
      async (ctx) => ctx.retry(),
    )
    expect(calls).toBe(2)
    expect(out && hasCoords(out)).toBe(true)
  })

  it('a name-only stand-in (the stop editor, an import row) always prompts', async () => {
    const p = unnamedPick('import-0-0', 'Fort')
    expect(hasCoords(p)).toBe(false)
    // Composed with the REAL resolver: there is nothing to resolve through,
    // so the guard can never hand the stand-in back unexamined.
    expect(await requireHitCoords(p)).toBeNull()
    let prompted = 0
    const out = await resolveOrPrompt(p, requireHitCoords, async () => { prompted++; return null })
    expect(prompted).toBe(1)
    expect(out).toBeNull()
  })

  it('the UI hook wires the REQUIRE-form resolver, never the permissive one', () => {
    // useResolvePick composes resolveOrPrompt(hit, requireHitCoords, …) — the
    // resolver that REFUSES a placeholder. The permissive `resolveHitCoords`
    // would hand a (0,0) straight through the prompt's back door.
    const src = readFileSync(new URL('../src/components/ResolvePickDialog.tsx', import.meta.url), 'utf8')
    expect(src).toMatch(/resolveOrPrompt\(hit, requireHitCoords/)
    expect(src).not.toMatch(/(?<!require)resolveHitCoords\(/)
  })
})
