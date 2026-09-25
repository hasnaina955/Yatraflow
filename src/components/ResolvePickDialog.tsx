// ============ Resolve-or-prompt dialog (unknown-position picks) ============
//
// The UI half of the shared ingestion guard (see src/lib/resolvePick.ts for the
// policy and the pure pieces). When a pick the map cannot pin reaches a vote,
// add or place path, this dialog opens BEFORE the mutation: try the resolver
// again, enter the place's coordinates by hand, or skip it. Nothing is ever
// written as a placeholder and nothing is dropped silently — a skip is the
// user's explicit choice.
//
// Uses the shared Modal (focus trap, Escape, scroll lock) and Field (label /
// error binding); no new CSS. The dialog must sit ON a consumer's own state —
// mount the returned `dialog` node and call `resolvePick` from handlers.
import React, { useCallback, useRef, useState } from 'react'
import { Field, FormErrorSummary, Modal } from './ui'
import { requireHitCoords } from '../lib/geocode'
import type { PlaceHit } from '../lib/geocode'
import { resolveOrPrompt, validateManualCoords } from '../lib/resolvePick'

type Pending = {
  hit: PlaceHit
  retry: () => Promise<PlaceHit | null>
  done: (hit: PlaceHit | null) => void
}

/** One guard instance per consumer. Requests serialize through an internal
 *  queue, so concurrent callers (vote paths resolve several picks at once)
 *  still see one dialog at a time. Hook rules: call this at the TOP of the
 *  consumer — above any early return (AGENTS §6e). */
export function useResolvePick(): {
  resolvePick: (hit: PlaceHit) => Promise<PlaceHit | null>
  dialog: React.ReactNode
} {
  const [pending, setPending] = useState<Pending | null>(null)
  const chainRef = useRef<Promise<unknown>>(Promise.resolve())

  const resolvePick = useCallback((hit: PlaceHit): Promise<PlaceHit | null> => {
    const openPrompt = () => resolveOrPrompt(hit, requireHitCoords, (ctx) =>
      new Promise<PlaceHit | null>(done => setPending({ hit: ctx.hit, retry: ctx.retry, done })))
    const task = chainRef.current.then(openPrompt, openPrompt)
    chainRef.current = task.then(() => {}, () => {})
    return task
  }, [])

  const finish = useCallback((picked: PlaceHit | null) => {
    setPending(p => {
      p?.done(picked)
      return null
    })
  }, [])

  const dialog = pending
    ? (
      <ResolvePickDialog
        hit={pending.hit}
        retry={pending.retry}
        onResolved={picked => finish(picked)}
        onSkip={() => finish(null)}
      />
    )
    : null

  return { resolvePick, dialog }
}

export function ResolvePickDialog({ hit, retry, onResolved, onSkip }: {
  hit: PlaceHit
  retry: () => Promise<PlaceHit | null>
  onResolved: (hit: PlaceHit) => void
  onSkip: () => void
}) {
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [errs, setErrs] = useState<{ lat?: string; lng?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)

  // Modal's effect depends on onClose's identity — hold the latest callback
  // behind a stable one so a consumer re-render can't restart the focus trap
  // mid-typing (the AI-drawer lesson, applied from the start).
  const skipRef = useRef(onSkip)
  skipRef.current = onSkip
  const onClose = useCallback(() => skipRef.current(), [])

  async function onRetry() {
    setBusy(true) // §6a: the async window disables every input below
    setErrs({})
    try {
      const r = await retry()
      if (r) { onResolved(r); return }
      setErrs({ form: 'Still no position for that place — enter its coordinates below, or skip it.' })
    } finally { setBusy(false) }
  }

  function onUseCoords(e: React.FormEvent) {
    e.preventDefault()
    const v = validateManualCoords(lat, lng)
    if (!v.ok) { setErrs({ lat: v.latError, lng: v.lngError }); return }
    onResolved({ ...hit, latitude: v.latitude, longitude: v.longitude })
  }

  return (
    <Modal open onClose={onClose} title={`Pin "${hit.name}" on the map`}>
      <p className="muted" style={{ marginTop: 0 }}>
        We couldn't find this place's position — and the map refuses to guess,
        because a wrong pin measures the whole journey wrong. Try again, enter
        its coordinates, or skip it.
      </p>
      <div className="confirm-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void onRetry()}>
          {busy ? 'Trying…' : 'Try again'}
        </button>
      </div>
      <form onSubmit={onUseCoords} noValidate>
        <div className="form-row">
          <Field label="Latitude" error={errs.lat}>
            <input className="input" inputMode="decimal" autoComplete="off" value={lat} disabled={busy}
              onChange={e => setLat(e.target.value)} />
          </Field>
          <Field label="Longitude" error={errs.lng}>
            <input className="input" inputMode="decimal" autoComplete="off" value={lng} disabled={busy}
              onChange={e => setLng(e.target.value)} />
          </Field>
        </div>
        <FormErrorSummary
          errors={{ ...(errs.lat ? { lat: errs.lat } : {}), ...(errs.lng ? { lng: errs.lng } : {}) }}
          labels={{ lat: 'Latitude', lng: 'Longitude' }}
        />
        {errs.form && <p className="err-text" role="status" aria-live="polite">{errs.form}</p>}
        <div className="confirm-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>Use these coordinates</button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onSkip}>Skip this place</button>
        </div>
      </form>
    </Modal>
  )
}
