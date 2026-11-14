// The deck's provenance line, pinned at the bottom of the panel. It keeps its
// own clock, so the data age stays true while the deck is open. No known source
// means no line, so a source is never guessed.
import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import type { DiscoveryCoverage } from '../../../lib/providers/hits'
import { deckSourceLine } from '../placeCardFacts'

/** How often the age text is recomputed. */
const TICK_MS = 30_000

export function LensDeckSource({ sources, fetchedAt, coverage, fixed = null }: {
  sources: ReadonlyArray<string | null | undefined>
  fetchedAt?: number | null
  coverage?: DiscoveryCoverage | null
  /** A fixed line, such as the Fix deck's. It replaces the place sources. */
  fixed?: string | null
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  const text = fixed ?? deckSourceLine({ sources, fetchedAt, coverage, now })
  if (text == null || text.trim() === '') return null
  return <p className="mv2-lens-source"><Info size={13} aria-hidden />{text}</p>
}
