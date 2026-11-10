// Presentational gap deck. It draws lens data and calls callbacks.
// Phase texts match the stay deck, with the stay phrase swapped for "this day".
import type { GapPick, GapPicks } from '../../../pages/trip/map/gapLens'
import type { JourneyRow } from '../../../lib/journeyProjection'
import type { LensPhase } from '../../../lib/mapLensContracts'
import { addSlotLabel } from './DriveTabs'
import { STAY_PHASE_TEXT } from './StayDeck'
import { LensDeckHeader } from './LensDeckHeader'
import { LensPlaceCard, type LensCostCell } from './LensPlaceCard'

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

/** The kicker of the deck header, for example "Gap · 11:30–14:30". */
export function gapDeckKicker(title: string | null, windowText: string | null): string {
  const context = windowText ?? title
  return context == null || context.trim() === ''
    ? 'Gap'
    : `Gap · ${context.trim()}`
}

/** The deck title, for example "2 open windows on this day". */
export function gapDeckTitle(count: number): string {
  return `${count} open window${count === 1 ? '' : 's'} on this day`
}

/** The primary action label of one pick. */
export function gapAddLabel(dayNumber: number, title: string | null): string {
  return addSlotLabel(dayNumber, title == null ? '' : title.trim().toLowerCase())
}

/** The three strip cells of one candidate, in board order. */
export function gapCells(row: JourneyRow, clock: (min: number) => string): LensCostCell[] {
  const arrive = row.arriveLabel ?? (typeof row.arriveMin === 'number' ? clock(row.arriveMin) : null)
  const detour = row.detourMin == null ? null : `+${Math.round(row.detourMin)} min`
  const budget = row.budgetSharePct == null ? null : `${Math.round(row.budgetSharePct)}%`
  return [
    { key: 'arrive', label: 'Arrive', value: arrive },
    { key: 'detour', label: 'Detour', value: detour },
    { key: 'budget', label: 'Budget', value: budget },
  ]
}

export interface GapDeckProps {
  /** The day number for the Add label. One-based. */
  dayNumber: number
  phase: LensPhase
  gaps: Array<{ title: string; windowText: string | null; picks: GapPicks }>
  onOpenPick(pick: GapPick): void
  onAddPick(pick: GapPick): void
  clock(min: number): string
  /** The fold handler. Absent uses the Map tab fold button. */
  onClose?: () => void
}

export function GapDeck(props: GapDeckProps) {
  const { dayNumber, phase, gaps, onOpenPick, onAddPick, clock, onClose } = props
  const first = gaps[0]
  const kicker = first == null ? 'Gap' : gapDeckKicker(first.title, first.windowText)
  if (phase !== 'ready' && phase !== 'empty') {
    return <section className="mv2-lens-deck" aria-label="Gaps in this day">
      <LensDeckHeader kicker={kicker} onClose={onClose} />
      <p className="mv2-lens-phase">{GAP_PHASE_TEXT[phase]}</p>
    </section>
  }
  if (phase === 'empty' || gaps.length === 0) {
    return <section className="mv2-lens-deck" aria-label="Gaps in this day">
      <LensDeckHeader kicker="Gap" onClose={onClose} />
      <p className="mv2-lens-phase">{GAP_EMPTY_TEXT}</p>
    </section>
  }
  return <section className="mv2-lens-deck" aria-label="Gaps in this day">
    <LensDeckHeader kicker={kicker} title={gapDeckTitle(gaps.length)} onClose={onClose} />
    {gaps.map((gap, index) => {
      const picks = gap.picks.picks.slice(0, 3)
      return <div className="mv2-lens-section" key={`${gap.title}-${index}`}>
        <p className="mv2-section-label mv2-lens-gap-label">{gap.title}</p>
        {picks.length > 0 && <ul className="mv2-lens-cards">
          {picks.map((pick, at) => {
            const hit = pick.candidate.hit
            const reason = pick.candidate.reason
            const reasons = [
              ...(reason == null || reason.trim() === '' ? [] : [reason]),
              ...(pick.fitText == null ? [] : [pick.fitText]),
            ]
            return <li key={pick.letter} className="mv2-lens-card">
              <LensPlaceCard
                letter={pick.letter}
                hit={hit}
                category={hit.category}
                name={hit.name}
                reasons={reasons}
                cells={gapCells(pick.candidate, clock)}
                addLabel={gapAddLabel(dayNumber, gap.title)}
                onOpen={() => onOpenPick(pick)}
                onAdd={() => onAddPick(pick)}
                selected={at === 0}
              />
            </li>
          })}
        </ul>}
        {picks.length === 0 && gap.picks.noFitText != null &&
          <p className="mv2-lens-phase">{gap.picks.noFitText}</p>}
        {gap.picks.moreCount > 0 &&
          <p className="mv2-section-label mv2-lens-more">{gap.picks.moreCount} more</p>}
      </div>
    })}
  </section>
}
