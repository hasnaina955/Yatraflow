// Presentational stay deck. It draws lens data and calls callbacks.
// It reuses the place card classes for labels, tile, body and rating.
import { STAY_RINGS, type StayPick, type StayPicksResult, type StayWindow } from '../../../pages/trip/map/stayLens'
import type { LensPhase } from '../../../lib/mapLensContracts'

export const STAY_PHASE_TEXT: Record<LensPhase, string> = {
  unscanned: 'Pick a window to look around the stay.',
  scanning: 'Looking around the stay…',
  failed: 'The search around the stay failed. Try again.',
  quota: 'The place search is over its limit for now.',
  empty: 'Nothing open around the stay in this window.',
  ready: '',
}

const NEEDS_BASE_TEXT = "Set tonight's stay to see what is around it."

export type RingId = (typeof STAY_RINGS)[number]['id']

export interface StayDeckProps {
  dayLabel: string
  baseName: string | null
  windows: StayWindow[]
  activeWindowId: string | null
  onWindow(id: string): void
  result: StayPicksResult
  ringId: RingId
  onRing(id: RingId): void
  onOpenPick(pick: StayPick): void
  onAddPick(pick: StayPick): void
  onSetStay(): void
  clock(min: number): string
}

function StayCard({ pick, onOpenPick, onAddPick }: {
  pick: StayPick
  onOpenPick(pick: StayPick): void
  onAddPick(pick: StayPick): void
}) {
  const hit = pick.row.row.hit
  const travel = pick.reach.walkMin <= 15
    ? `${pick.reach.walkMin} min walk`
    : `${pick.reach.driveMin} min drive`
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
      <p className="mv2-lens-travel">{travel}</p>
      {pick.fitText != null && <p className="mv2-lens-fit">{pick.fitText}</p>}
    </div>
    <div className="mv2-place-actions mv2-lens-actions">
      <button type="button" className="btn btn-primary mv2-lens-add"
        onClick={event => { event.stopPropagation(); onAddPick(pick) }}>Add</button>
    </div>
  </article>
}

export function StayDeck(props: StayDeckProps) {
  const {
    dayLabel, baseName, windows, activeWindowId, onWindow, result, ringId, onRing,
    onOpenPick, onAddPick, onSetStay, clock,
  } = props
  const count = result.kind === 'ready' ? result.picks.length : 0
  const title = baseName === null ? 'Around the stay' : `${count} picks near ${baseName}`
  return <section className="mv2-lens-deck" aria-label="Around the stay">
    <header className="mv2-lens-header">
      <span className="mv2-section-label">AROUND THE STAY</span>
      <h2 className="mv2-lens-title">{title}</h2>
      <span className="mv2-lens-day">{dayLabel}</span>
    </header>
    {windows.length > 0 && <div className="mv2-lens-chips">
      {windows.map(window => {
        const label = `${window.label} ${clock(window.startMin)}–${clock(window.endMin)}`
        return <button type="button" key={window.id} className="mv2-lens-chip"
          aria-pressed={window.id === activeWindowId} onClick={() => onWindow(window.id)}>{label}</button>
      })}
    </div>}
    <div className="mv2-lens-ring" role="radiogroup" aria-label="Reach from the stay">
      {STAY_RINGS.map(ring => {
        const label = `${ring.minutes} min ${ring.mode}`
        return <button type="button" key={ring.id} role="radio"
          aria-checked={ring.id === ringId} className="mv2-lens-ring-btn"
          onClick={() => onRing(ring.id)}>{label}</button>
      })}
    </div>
    {result.kind === 'needs-base' && <div className="mv2-lens-body-state">
      <p className="mv2-lens-phase">{NEEDS_BASE_TEXT}</p>
      <button type="button" className="btn btn-primary mv2-lens-set" onClick={onSetStay}>Set tonight's stay</button>
    </div>}
    {result.kind === 'phase' && <p className="mv2-lens-phase">{STAY_PHASE_TEXT[result.phase]}</p>}
    {result.kind === 'ready' && <>
      <div className="mv2-lens-cards">
        {result.picks.slice(0, 3).map(pick =>
          <StayCard key={pick.letter} pick={pick} onOpenPick={onOpenPick} onAddPick={onAddPick} />)}
      </div>
      {result.alsoCount > 0 &&
        <p className="mv2-section-label mv2-lens-also">Also in this window: {result.alsoCount} more</p>}
    </>}
  </section>
}
