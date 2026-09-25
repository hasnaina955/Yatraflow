// ============ Resolve-or-prompt: unknown-position picks never land silently ============
//
// Product decision (2026-09-25, recorded on #424): a pick the map cannot pin
// surfaces a resolution step — retry or manual coordinates — BEFORE the
// mutation proceeds. Never written as a placeholder, never silently dropped.
// "Refuse with a toast" remains only where a prompt genuinely cannot fit, and
// even there the caller must report what it skipped.
//
// The two pure pieces live here (node-tested in tests/resolve-pick.test.ts):
// the manual-coordinate validation, and the resolve-then-prompt composition
// every ingestion path runs. The dialog + promise plumbing is
// src/components/ResolvePickDialog.tsx — UI only, no policy.
import type { PlaceHit } from './providers/hits'
import { hasCoords } from './providers/hits'

export type ManualCoordsResult =
  | { ok: true; latitude: number; longitude: number }
  | { ok: false; latError?: string; lngError?: string }

const ZERO_MSG = 'The map reads a 0 here as "position unknown" — enter the real value.'

type Parsed = { ok: true; value: number } | { ok: false; error: string }

function parseCoord(raw: string, kind: 'latitude' | 'longitude'): Parsed {
  const label = kind === 'latitude' ? 'Latitude' : 'Longitude'
  const limit = kind === 'latitude' ? 90 : 180
  const t = String(raw ?? '').trim()
  if (!t) return { ok: false, error: `Enter the ${kind}.` }
  const n = Number(t)
  if (!Number.isFinite(n)) return { ok: false, error: `${label} must be a number.` }
  if (n < -limit || n > limit) return { ok: false, error: `${label} must be between -${limit} and ${limit}.` }
  // Same rule as hasCoords(): a zero coordinate is indistinguishable from the
  // providers' (0,0) "resolve on pick" placeholder, so the guard rejects it —
  // honest constraint of the pipeline, stated to the user instead of hidden.
  if (n === 0) return { ok: false, error: ZERO_MSG }
  return { ok: true, value: n }
}

/** Validate a hand-typed coordinate pair the way the pipeline can trust it:
 *  finite, in range, and passing `hasCoords` (so no zero — the map reads a
 *  zero as "position unknown"). Returns per-field errors for the form. */
export function validateManualCoords(latRaw: string, lngRaw: string): ManualCoordsResult {
  const lat = parseCoord(latRaw, 'latitude')
  const lng = parseCoord(lngRaw, 'longitude')
  if (!lat.ok || !lng.ok) {
    return { ok: false, latError: lat.ok ? undefined : lat.error, lngError: lng.ok ? undefined : lng.error }
  }
  return { ok: true, latitude: lat.value, longitude: lng.value }
}

/** A prompt-ready stand-in for a place the app knows only by NAME — the stop
 *  editor's typed location, an import row whose coordinates the file lost.
 *  Deliberately carries no usable coordinates and no provider id, so the guard
 *  can never hand it back unexamined: it always opens the prompt. */
export function unnamedPick(id: number | string, name: string): PlaceHit {
  return { id, name, kind: 'poi', latitude: 0, longitude: 0 }
}

/** What the prompt gets: the pick it could not pin, and a retry that re-runs
 *  the resolver (for the "Try again" button — the provider may have recovered). */
export type PromptFn = (ctx: {
  hit: PlaceHit
  retry: () => Promise<PlaceHit | null>
}) => Promise<PlaceHit | null>

/** The shared ingestion guard: resolve first; only when the resolver refuses
 *  does the prompt open. The prompt's answer is the final word — a resolved
 *  hit (possibly carrying manual coordinates) proceeds, null means the user
 *  skipped and the caller must not write anything. */
export async function resolveOrPrompt(
  hit: PlaceHit,
  require: (h: PlaceHit) => Promise<PlaceHit | null>,
  prompt: PromptFn,
): Promise<PlaceHit | null> {
  const direct = await require(hit)
  if (direct && hasCoords(direct)) return direct
  return prompt({ hit, retry: () => require(hit) })
}
