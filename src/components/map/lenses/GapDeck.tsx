// Presentational gap deck. It draws lens data and calls callbacks.
// Phase texts match the stay deck, with the stay phrase swapped for "this day".
import type { GapPick, GapPicks } from '../../../pages/trip/map/gapLens'
import type { LensPhase } from '../../../lib/mapLensContracts'
import { STAY_PHASE_TEXT } from './StayDeck'

const swap = (text: string): string => text.replace('around the stay', 'this day')

export const GAP_PHASE_TEXT: Record<LensPhase, string> = {
  unscanned: swap(STAY_PHASE_TEXT.unscanned),
  scanning: swap(STAY_PHASE_TEXT.scanning),
  failed: swap(STAY_PHASE_TEXT.failed),
  quota: swap(STAY_PHASE_TEXT.quota),
  empty: swap(STAY_PHASE_TEXT.empty),
  ready: '',
}

export const GAP_EMPTY_TEXT = 'No open part of this day needs a stop.'

export interface GapDeckProps {
  phase: LensPhase
  gaps: Array<{ title: string; windowText: string | null; picks: GapPicks }>
  onOpenPick(pick: GapPick): void
  onAddPick(pick: GapPick): void
}

function GapCard({ pick, onOpenPick, onAddPick }: {
  pick: GapPick
  onOpenPick(pick: GapPick): void
  onAddPick(pick: GapPick): void
}) {
  const hit = pick.candidate.hit
  return <article className="mv2-lens-card" role="button" tabIndex={0}
    onClick={() => onOpenPick(pick)}
    onKeyDown={event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        onOpenPick(pick)
      }
    }}>
    <div className="mv2-place-art mv2-lens-tile"><span className="mv2-lens-letter">{pick.letter}</span></div>
    <div className="mv2-place-body mv2-lens-body">
      <h2>{hit.name}</h2>
      {hit.rating != null && <p className="mv2-rating"><strong>{hit.rating.toFixed(1)}</strong></p>}
      {pick.fitText != null && <p className="mv2-lens-fit">{pick.fitText}</p>}
      {pick.candidate.detourMin != null &&
        <p className="mv2-lens-detour">+{pick.candidate.detourMin} min</p>}
    </div>
    <div className="mv2-place-actions mv2-lens-actions">
      <button type="button" className="btn btn-primary mv2-lens-add"
        onClick={event => { event.stopPropagation(); onAddPick(pick) }}>Add</button>
    </div>
  </article>
}

export function GapDeck(props: GapDeckProps) {
  const { phase, gaps, onOpenPick, onAddPick } = props
  if (phase !== 'ready' && phase !== 'empty') {
    return <section className="mv2-lens-deck" aria-label="Gaps in this day">
      <p className="mv2-lens-phase">{GAP_PHASE_TEXT[phase]}</p>
    </section>
  }
  if (phase === 'empty' || gaps.length === 0) {
    return <section className="mv2-lens-deck" aria-label="Gaps in this day">
      <p className="mv2-lens-phase">{GAP_EMPTY_TEXT}</p>
    </section>
  }
  return <section className="mv2-lens-deck" aria-label="Gaps in this day">
    {gaps.map((gap, index) => {
      const label = (gap.windowText != null
        ? `${gap.title} GAP · ${gap.windowText}`
        : `${gap.title} GAP`).toUpperCase()
      const picks = gap.picks.picks.slice(0, 3)
      return <div className="mv2-lens-section" key={`${gap.title}-${index}`}>
        <p className="mv2-section-label mv2-lens-gap-label">{label}</p>
        {picks.length > 0 && <div className="mv2-lens-cards">
          {picks.map(pick =>
            <GapCard key={pick.letter} pick={pick} onOpenPick={onOpenPick} onAddPick={onAddPick} />)}
        </div>}
        {picks.length === 0 && gap.picks.noFitText != null &&
          <p className="mv2-lens-phase">{gap.picks.noFitText}</p>}
        {gap.picks.moreCount > 0 &&
          <p className="mv2-section-label mv2-lens-more">{gap.picks.moreCount} more</p>}
      </div>
    })}
  </section>
}
