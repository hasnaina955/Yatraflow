// #904: attributed Google Places photos on the place card. `cardPhotoRefs` is empty
// without a Google key, so this renders nothing and the card keeps its category tile.
// A photo URL is built only for the photo on screen, and the image loads lazily.
// An image that fails to load is dropped, and the tile stays.
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PlaceHit, PlacePhotoRef } from '../../lib/providers/hits'
import { cardPhotoRefs, placePhotoUrl } from '../../lib/providers/google'
import { attributionOf, photoStep } from './placeCardFacts'

const PHOTO_WIDTH_PX = 640

export function PlacePhotos({ hit, photos }: { hit: Pick<PlaceHit, 'name' | 'photos'>; photos?: readonly PlacePhotoRef[] }) {
  const refs = cardPhotoRefs(photos ? { photos: [...photos] } : hit)
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set())
  const region = useRef<HTMLElement | null>(null)
  const usable = refs.filter(ref => !failed.has(ref.name))
  if (usable.length === 0) return null
  const at = Math.min(index, usable.length - 1)
  const current = usable[at]
  const src = placePhotoUrl(current, PHOTO_WIDTH_PX)
  if (!src) return null
  const credit = attributionOf(current)
  const go = (to: number) => setIndex(to)
  const onKeyDown = (e: KeyboardEvent) => {
    const next = photoStep(at, usable.length, e.key)
    if (next == null) return
    e.preventDefault()
    go(next)
  }
  return (
    <figure
      ref={region}
      className="mv2-place-photo"
      role="group"
      aria-roledescription="carousel"
      aria-label={`Photos of ${hit.name}`}
      tabIndex={usable.length > 1 ? 0 : undefined}
      onKeyDown={onKeyDown}
    >
      <img
        key={current.name}
        src={src}
        alt={`${hit.name}, photo ${at + 1} of ${usable.length}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(prev => new Set(prev).add(current.name))}
      />
      <figcaption>
        <span className="mv2-place-credit">
          {'Photo: '}
          {credit.href ? <a href={credit.href} target="_blank" rel="noopener noreferrer">{credit.text}</a> : credit.text}
          {' · Google'}
        </span>
        {usable.length > 1 && (
          <span className="mv2-place-photo-nav">
            <button type="button" aria-label="Previous photo" onClick={() => go(photoStep(at, usable.length, 'ArrowLeft') ?? 0)}><ChevronLeft size={18} aria-hidden /></button>
            <span aria-live="polite">{`${at + 1} / ${usable.length}`}</span>
            <button type="button" aria-label="Next photo" onClick={() => go(photoStep(at, usable.length, 'ArrowRight') ?? 0)}><ChevronRight size={18} aria-hidden /></button>
          </span>
        )}
      </figcaption>
    </figure>
  )
}
