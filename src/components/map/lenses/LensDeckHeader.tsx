// One deck header for every lens deck. It draws a kicker, a title, one sub
// line and a close button. The deck supplies every string. This file reads no
// store, no map and no provider.
import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Click the deck's own fold button. The Map tab owns that handler, and its
 * button stays in the document when the old title row is hidden.
 */
export function foldMapDeck(): void {
  if (typeof document === 'undefined') return
  const button = document.querySelector<HTMLButtonElement>(
    '.poi-col--see .mv2-deck-header button[aria-label="Fold suggestions"]',
  )
  button?.click()
}

/** The parts of a deck header. A missing string hides that line. */
export interface LensDeckHeaderProps {
  /** The lens and its context, for example "Along the drive · lunch gap". */
  kicker: string
  /** The deck title, for example "3 places for lunch". Omit it when a count is unknown. */
  title?: string | null
  /** One muted fact line. Omit it when a fact is unknown. */
  sub?: string | null
  /** The fold handler. Absent means the header uses the Map tab fold button. */
  onClose?: () => void
  /** `risk` draws the kicker in the risk colour, as the Fix board does. */
  tone?: 'risk'
  /** A control that shares the title row, such as the Drive scope picker. */
  aside?: ReactNode
}

export function LensDeckHeader({ kicker, title, sub, onClose, tone, aside }: LensDeckHeaderProps) {
  return <header className="mv2-lens-deck-head">
    <div className="mv2-lens-deck-copy">
      <span className={`mv2-lens-deck-kicker${tone === 'risk' ? ' is-risk' : ''}`}>{kicker}</span>
      {title != null && title !== '' && <h2 className="mv2-lens-deck-title">{title}</h2>}
      {sub != null && sub !== '' && <p className="mv2-lens-deck-sub">{sub}</p>}
    </div>
    {aside}
    <button
      type="button"
      className="mv2-lens-deck-close"
      aria-label="Close panel"
      onClick={onClose ?? foldMapDeck}>
      <X size={15} aria-hidden />
    </button>
  </header>
}
