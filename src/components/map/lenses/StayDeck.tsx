// Presentational stay deck. It draws lens data and calls callbacks.
// It reads no store, no map and no provider. The caller supplies every value.
import { STAY_RINGS, type StayPick, type StayPicksResult, type StayWindow } from '../../../pages/trip/map/stayLens'
import type { LensPhase } from '../../../lib/mapLensContracts'
import type { PlaceHit } from '../../../lib/geocode'
import { CatIcon } from '../../icons'
import { LensDeckHeader } from './LensDeckHeader'
import { LensPlaceCard, type LensCostCell } from './LensPlaceCard'

export const STAY_PHASE_TEXT: Record<LensPhase, string> = {
  unscanned: 'Pick a window to look around the stay.',
  scanning: 'Looking around the stay…',
  failed: 'The search around the stay failed. Try again.',
  quota: 'The place search is over its limit for now.',
  empty: 'Nothing open around the stay in this window.',
  ready: '',
}

const NEEDS_BASE_TEXT = "Set tonight's stay to see what is around it."

/** The most cards the deck shows. The other picks go in the list below. */
const MAX_CARDS = 3

export type RingId = (typeof STAY_RINGS)[number]['id']

/** The deck kicker, for example "Around the stay · A". */
export function stayDeckKicker(letter: string | null): string {
  return letter == null || letter === '' ? 'Around the stay' : `Around the stay · ${letter}`
}

/** The deck title, for example "3 picks near Hotel Ashoka". */
export function stayDeckTitle(count: number, baseName: string | null): string {
  if (baseName == null || baseName.trim() === '') return 'Around the stay'
  return `${count} pick${count === 1 ? '' : 's'} near ${baseName.trim()}`
}

/** The primary action label. The time shows only when the window is known. */
export function stayAddLabel(
  dayNumber: number,
  startMin: number | null,
  clock: (min: number) => string,
): string {
  if (!Number.isFinite(dayNumber)) return 'Add'
  const day = `Add to Day ${dayNumber}`
  return startMin == null ? day : `${day} · ${clock(startMin)}`
}

/** The three strip cells of one pick, in board order. */
export function stayCells(pick: StayPick, clock: (min: number) => string): LensCostCell[] {
  const fit = pick.fit
  return [
    { key: 'walk', label: 'Walk', value: `${pick.reach.walkMin} min` },
    { key: 'show', label: 'Show', value: fit == null ? null : clock(fit.arriveMin) },
    { key: 'back', label: 'Back by', value: fit == null ? null : clock(fit.backMin) },
  ]
}

export interface StayDeckProps {
  /** The day number for the Add label. One-based. */
  dayNumber: number
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
  /** The Keep action. Absent hides the heart. */
  onShortlist?: (hit: PlaceHit) => void
  /** True draws the kept heart. */
  shortlistedOf?: (hit: PlaceHit) => boolean
  onSetStay(): void
  clock(min: number): string
  /** The fold handler. Absent uses the Map tab fold button. */
  onClose?: () => void
}

/** One row of the list under the cards. */
function AlsoRow({ pick }: { pick: StayPick }) {
  const hit = pick.row.row.hit
  const line = pick.fitText ?? `${pick.reach.walkMin} min walk`
  return <div className="mv2-lens-also-row">
    <span className="mv2-lens-also-letter">{pick.letter}</span>
    <span className="mv2-lens-also-icon"><CatIcon category={hit.category} size={13} /></span>
    <span className="mv2-lens-also-copy">
      <span className="mv2-lens-also-name">{hit.name}</span>
      <span className="mv2-lens-also-line">{line}</span>
    </span>
  </div>
}

export function StayDeck(props: StayDeckProps) {
  const {
    dayNumber, dayLabel, baseName, windows, activeWindowId, onWindow, result, ringId,
    onRing, onOpenPick, onAddPick, onShortlist, shortlistedOf, onSetStay, clock, onClose,
  } = props
  const count = result.kind === 'ready' ? result.picks.length : 0
  const first = result.kind === 'ready' ? result.picks[0] : undefined
  const activeWindow = windows.find(window => window.id === activeWindowId) ?? null
  const addLabel = stayAddLabel(dayNumber, activeWindow?.startMin ?? null, clock)
  const rest = result.kind === 'ready' ? result.picks.slice(MAX_CARDS) : []
  return <section className="mv2-lens-deck" aria-label="Around the stay">
    <LensDeckHeader
      kicker={stayDeckKicker(first?.letter ?? null)}
      title={result.kind === 'ready' ? stayDeckTitle(count, baseName) : null}
      sub={dayLabel}
      onClose={onClose}
    />
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
      <ul className="mv2-lens-cards">
        {result.picks.slice(0, MAX_CARDS).map((pick, index) => {
          const hit = pick.row.row.hit
          const reason = pick.row.row.reason
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
              cells={stayCells(pick, clock)}
              addLabel={addLabel}
              onOpen={() => onOpenPick(pick)}
              onAdd={() => onAddPick(pick)}
              {...(onShortlist == null ? {} : {
                onShortlist: () => onShortlist(hit),
                shortlisted: shortlistedOf?.(hit) ?? false,
              })}
              selected={index === 0}
            />
          </li>
        })}
      </ul>
      {(rest.length > 0 || result.alsoCount > 0) && <div className="mv2-lens-also-block">
        <p className="mv2-section-label mv2-lens-also">Also in this window</p>
        {rest.map(pick => <AlsoRow key={pick.letter} pick={pick} />)}
        {rest.length === 0 && <p className="mv2-lens-more">{result.alsoCount} more</p>}
      </div>}
    </>}
  </section>
}
