import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { Trip } from '../data/types'
import { currentUser, updateTrip } from '../store/store'
import { fetchFirstAvailableThumb, pickTripQueryCandidates, sizedCoverUrl } from '../lib/tripThumb'
import { useDestinationCover } from '../hooks/useDestinationCover'
import { COVER_TYPES, coverFileError, uploadCover } from '../lib/coverUpload'

/**
 * Owner-facing control to set / change / clear a trip's cover image.
 *   • "Use destination photo" fetches a popular Wikipedia image of the trip's
 *     headline destination and stores it as coverImageUrl (the default the
 *     product prefers — see types.ts), sized through `Special:Redirect` so no
 *     row ever holds a multi-megabyte original.
 *   • A custom URL lets the owner override with any image.
 *   • "Use emoji only" clears the image so the card falls back to the emoji.   *   • "Upload image" shrinks a picked photo to 1200px, re-encodes it as JPEG
 *     and stores it in our own public bucket (lib/coverUpload.ts), so the
 *     creator is not limited to photos someone else hosts. Replacing one adds
 *     a new object and leaves the old in place — see uploadCover for why.
 * The choice is carried over on fork / publish via store.ts.
 */
export function CoverImagePicker({ trip, editable }: { trip: Trip; editable: boolean }) {
  // Which of the two long operations is running, not merely that one is. They
  // share both buttons' `disabled`, but a single boolean would make the
  // destination button claim "Finding photo…" while an upload is what is
  // actually in flight.
  const [busy, setBusy] = useState<'auto' | 'upload' | null>(null)
  const [custom, setCustom] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Try the headline destination first, then earlier stops / start city, so
  // a single "no photo on Wikipedia" page doesn't make the cover picker look
  // empty when a perfectly good image exists for the next stop.
  const candidates = pickTripQueryCandidates(trip)
  const auto = useDestinationCover(candidates)
  const current = trip.coverImageUrl ? sizedCoverUrl(trip.coverImageUrl) : (auto ?? null)

  function setCover(url: string | undefined) {
    // Size on the way IN: a row written before sizing existed is fixed at
    // render time, but nothing should write a new oversized URL either.
    updateTrip(trip.id, { coverImageUrl: url ? sizedCoverUrl(url) : undefined })
    // A new cover is the answer to whatever the last refusal was about, so a
    // stale "that image is 12 MB" must not outlive it.
    setError(null)
  }
  async function onAuto() {
    setBusy('auto')
    try {
      const u = await fetchFirstAvailableThumb(candidates)
      setCover(u ?? undefined)
    } finally { setBusy(null) }
  }
  function onCustom() {
    const v = custom.trim()
    if (!v) return
    setCover(v)
    setCustom('')
  }
  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset first: picking the same file twice must still fire a change event.
    e.target.value = ''
    if (!file) return
    const refusal = coverFileError(file)
    if (refusal) { setError(refusal); return }
    const me = currentUser()
    if (!me) { setError('Sign in again to upload an image.'); return }
    setError(null)
    setBusy('upload')
    try {
      // The *uploader* owns the object, not the trip owner: an editor setting a
      // cover uploads under their own id, which is what the bucket's policies
      // require.
      const { url, error: uploadError } = await uploadCover(me.id, file)
      if (uploadError || !url) { setError(uploadError ?? 'Upload failed.'); return }
      setCover(url)
    } finally { setBusy(null) }
  }

  return (
    <div className="cover-picker">
      <div
        className="cover-picker-preview"
        style={current ? { backgroundImage: `url("${current}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        {!current && <span className="cover-picker-emoji">{trip.coverEmoji}</span>}
      </div>
      {editable && (
        <div className="cover-picker-controls">
          <button type="button" className="btn btn-outline btn-sm" disabled={busy !== null} onClick={onAuto}>
            {busy === 'auto' ? 'Finding photo…' : trip.coverImageUrl ? 'Refresh destination photo' : 'Use destination photo'}
          </button>
          <button type="button" className="btn btn-outline btn-sm" disabled={busy !== null} onClick={() => fileRef.current?.click()}>
            {busy === 'upload' ? 'Uploading…' : 'Upload image'}
          </button>
          <input
            ref={fileRef} type="file" accept={COVER_TYPES.join(',')} className="sr-only"
            onChange={onPick} tabIndex={-1} aria-hidden="true"
          />
          <div className="cover-picker-custom">
            <input
              className="input" placeholder="Paste an image URL…" value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCustom() } }}
            />
            <button type="button" className="btn btn-outline btn-sm" onClick={onCustom}>Set</button>
          </div>
          {error && <p className="err-text" role="alert">{error}</p>}
          {trip.coverImageUrl && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCover(undefined)}>Use emoji only</button>
          )}
        </div>
      )}
    </div>
  )
}
