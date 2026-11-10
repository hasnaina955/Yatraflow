// One place card, shared by the Drive, Stay and Gap decks. The deck supplies
// every value. A missing fact shows a dash with an "unknown" label. This file
// reads no store, no map and no provider.
import { ArrowLeftRight, Heart, Plus, Star } from 'lucide-react'
import { CatIcon } from '../../icons'
import { cap } from '../../../lib/labels'
import { placeSubtype } from '../../../lib/mapStyles/placeMarks'

/** One cost strip cell. A null value is unknown, and it is never zero. */
export interface LensCostCell {
  key: string
  /** Sentence case in source. CSS sets the capitals. */
  label: string
  /** The known text. Null shows the unknown mark. */
  value: string | null
}

/** "{area} · {kind}" from the hit. Null hides the line. The lead word is
 *  sentence case, so a raw category reads "Nature" and never "nature". */
export function placeSubLine(hit: {
  admin1?: string | null
  category?: string | null
}): string | null {
  const parts = [hit.admin1, hit.category]
    .map(value => (typeof value === 'string' ? value.trim() : ''))
    .filter(value => value !== '')
  return parts.length === 0 ? null : cap(parts.join(' · '))
}

/** "4.5" and the review count, or null when the hit has no rating. */
export function ratingText(hit: {
  rating?: number | null
  ratingCount?: number | null
}): { rating: string; count: string | null } | null {
  const rating = hit.rating
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return null
  const raw = hit.ratingCount
  const count = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0
    ? String(Math.round(raw))
    : null
  return { rating: rating.toFixed(1), count }
}

export interface LensPlaceCardProps {
  /** A, B or C when the pick has a letter. Null hides the badge. */
  letter?: string | null
  /** The hit category for the icon tile. */
  category?: string | null
  name: string
  /** The hit. The card reads the rating and the sub line from it. */
  hit?: { admin1?: string | null; category?: string | null; rating?: number | null; ratingCount?: number | null }
  /** Reason chips. The lens model supplies them. Never build one here. */
  reasons?: readonly string[]
  /** The cost strip cells, in board order. */
  cells: readonly LensCostCell[]
  /** One scope tag, such as "just past your scope". */
  tag?: string | null
  /** A band name, such as "just-past" or "over-budget". */
  band?: string | null
  /** The primary action label. */
  addLabel: string
  addDisabled?: boolean
  addTitle?: string
  onAdd: () => void
  /** Opens the place. Absent means the name is not a control. */
  onOpen?: () => void
  /** True draws the lagoon outline of the selected card. */
  selected?: boolean
  /** Heart. Rendered only when a real handler exists. */
  onShortlist?: () => void
  shortlisted?: boolean
  /** Swap. Rendered only when a real handler exists. */
  onSwap?: () => void
}

export function LensPlaceCard(props: LensPlaceCardProps) {
  const {
    letter, category, name, hit, reasons = [], cells, tag, band, addLabel,
    addDisabled = false, addTitle, onAdd, onOpen, selected = false,
    onShortlist, shortlisted = false, onSwap,
  } = props
  const rating = hit ? ratingText(hit) : null
  // A rating shows only when the hit has both a rating and its count.
  const showRating = rating != null && rating.count != null
  const subLine = hit ? placeSubLine(hit) : null
  // The tile takes the category family colour, as the map marks do.
  const family = placeSubtype({ category: category ?? undefined, name }).family
  const openClass = 'mv2-lens-place-open'

  const headInner = <>
    <span className="mv2-lens-place-tile" data-family={family}>
      <CatIcon category={category ?? undefined} size={20} />
    </span>
    <span className="mv2-lens-place-copy">
      <span className="mv2-lens-place-name">{name}</span>
      {subLine != null && <span className="mv2-lens-place-sub">{subLine}</span>}
    </span>
  </>

  return <article
    className={`mv2-lens-place${selected ? ' is-selected' : ''}${band != null ? ` is-${band}` : ''}`}>
    {letter != null && <span className="mv2-lens-place-letter" aria-hidden="true">{letter}</span>}
    <div className="mv2-lens-place-head">
      {onOpen
        ? <button type="button" className={openClass} onClick={onOpen}>{headInner}</button>
        : <div className={openClass}>{headInner}</div>}
      {showRating && rating != null && <span className="mv2-lens-place-rating">
        <Star size={12} aria-hidden />
        <span>{rating.rating}</span>
        {rating.count != null && <span className="mv2-lens-place-count">· {rating.count}</span>}
      </span>}
    </div>
    {tag != null && <span className="mv2-lens-tag">{tag}</span>}
    {reasons.length > 0 && <div className="mv2-lens-reasons">
      {reasons.map(reason => <span className="mv2-lens-reason" key={reason}>{reason}</span>)}
    </div>}
    <div className="mv2-lens-strip">
      {cells.map(cell => <span className="mv2-lens-cell" key={cell.key}>
        <span className="mv2-lens-cell-label">{cell.label}</span>
        <span className="mv2-lens-cell-value">
          {cell.value == null
            ? <span aria-label="unknown">—</span>
            : cell.value}
        </span>
      </span>)}
    </div>
    <div className="mv2-lens-place-actions">
      <button
        type="button"
        className="mv2-lens-place-add"
        disabled={addDisabled}
        title={addTitle}
        onClick={onAdd}><Plus size={15} aria-hidden />{addLabel}</button>
      {onShortlist != null && <button
        type="button"
        className="mv2-lens-round"
        aria-label={shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
        aria-pressed={shortlisted}
        onClick={onShortlist}><Heart size={15} aria-hidden /></button>}
      {onSwap != null && <button
        type="button"
        className="mv2-lens-round"
        aria-label="Swap this stop"
        onClick={onSwap}><ArrowLeftRight size={15} aria-hidden /></button>}
    </div>
  </article>
}
