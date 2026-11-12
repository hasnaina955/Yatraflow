// Presentational stay deck. It draws lens data and calls callbacks.
// It reads no store, no map and no provider. The caller supplies every value.
import { useState } from 'react'
import { STAY_RINGS, stayPickStartMin, type StayPick, type StayPicksResult, type StayWindow } from '../../../pages/trip/map/stayLens'
import type { LensPhase } from '../../../lib/mapLensContracts'
import type { PlaceHit } from '../../../lib/geocode'
import { clockHM } from '../../../lib/clockOverlay'
import { formatHM, useTimeFormat, type TimeFormat } from '../../../lib/timefmt'
import { Car, Footprints } from 'lucide-react'
import { CatIcon } from '../../icons'
import { LensDeckHeader } from './LensDeckHeader'
import { LensPhaseNote } from './LensPhaseNote'
import { LensPlaceCard, selectedCardIndex, type LensCostCell } from './LensPlaceCard'

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

/** The picks inside the active reach ring. Walk keeps a walkable pick. */
export function stayPicksInRing(picks: readonly StayPick[], ringId: RingId): StayPick[] {
  return picks.filter(pick => ringId === 'walk-15'
    ? pick.reach.walkMin <= 15
    : pick.reach.driveMin <= 30)
}

/** True when the walk ring is empty and the wider drive ring holds a pick. */
export function stayWidenOffer(picks: readonly StayPick[], ringId: RingId): boolean {
  if (ringId !== 'walk-15') return false
  return stayPicksInRing(picks, 'drive-30').length > 0
}

export interface StayRingOption {
  id: RingId
  mode: 'walk' | 'drive'
  label: string
  ariaLabel: string
}

/** The two reach choices. The visible words are short; the name is spoken. */
export function stayRingOptions(): StayRingOption[] {
  return STAY_RINGS.map(ring => ({
    id: ring.id,
    mode: ring.mode,
    label: `≤${ring.minutes} min`,
    ariaLabel: `Within ${ring.minutes} minutes ${ring.mode}`,
  }))
}

/** The deck kicker. The free window appears only when both ends are known. */
export function stayDeckKicker(
  window: { startMin: number; endMin: number } | null | undefined,
  clock: (min: number) => string,
): string {
  if (window == null || !Number.isFinite(window.startMin) || !Number.isFinite(window.endMin)) {
    return 'Around the stay'
  }
  if (window.endMin <= window.startMin) return 'Around the stay'
  return `Around the stay · free ${clock(window.startMin)}–${clock(window.endMin)}`
}

/** The deck title. A known count names the picks; every other state names the base. */
export function stayDeckTitle(count: number | null, baseName: string | null): string {
  const base = (baseName?.trim() ?? '').replace(/^(check[- ]?in)\s*[·:]\s*/i, '')
  if (base === '') return 'Around the stay'
  if (count == null || !Number.isFinite(count) || count <= 0) return `Around ${base}`
  return `${count} pick${count === 1 ? '' : 's'} near ${base}`
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
  /** The search retry. Absent draws a failed note with no Retry button. */
  onRetry?: () => void
}

/** The minute a place closes, from its own reported hours. Null is unknown. */
export function closeMinute(hit: { closeTime?: string | null }): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hit.closeTime?.trim() ?? '')
  if (match == null) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  return hour * 60 + minute
}

/** "open till 9:00 PM" in the reader's clock. An unknown close keeps it out. */
export function stayHoursText(
  hit: { closeTime?: string | null },
  format: TimeFormat,
): string | null {
  const close = closeMinute(hit)
  return close == null ? null : `open till ${formatHM(clockHM(close), format)}`
}

/** One row of the list under the cards. */
function AlsoRow({ pick, timeFormat }: { pick: StayPick; timeFormat: TimeFormat }) {
  const hit = pick.row.row.hit
  const hours = stayHoursText(hit, timeFormat)
  const line = [pick.fitText ?? `${pick.reach.walkMin} min walk`, hours].filter(part => part != null && part !== '').join(' · ')
  return <div className="mv2-lens-also-row">
    {pick.letter != null && <span className="mv2-lens-also-letter">{pick.letter}</span>}
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
  const [chosen, setChosen] = useState<string | null>(null)
  const timeFormat = useTimeFormat()
  const readyPicks = result.kind === 'ready' ? stayPicksInRing(result.picks, ringId) : []
  const count = readyPicks.length
  const activeWindow = windows.find(window => window.id === activeWindowId) ?? null
  // Each card offers its own start: the window opens after the fixed booking,
  // and the walk to the place sets the clock. No start outside the window.
  const startOf = (pick: StayPick): number | null =>
    activeWindow == null ? null : stayPickStartMin(activeWindow, pick.reach.walkMin)
  const rest = readyPicks.slice(MAX_CARDS)
  const selectedAt = selectedCardIndex(readyPicks.slice(0, MAX_CARDS).map(pick => String(pick.row.row.hit.id)), chosen)
  const alsoCount = result.kind === 'ready' ? result.alsoCount : 0
  const hiddenByRing = result.kind === 'ready' ? result.picks.length - readyPicks.length : 0
  const widen = result.kind === 'ready' && readyPicks.length === 0 && stayWidenOffer(result.picks, ringId)
  return <section className="mv2-lens-deck" aria-label="Around the stay">
    <LensDeckHeader
      kicker={stayDeckKicker(activeWindow, clock)}
      title={stayDeckTitle(result.kind === 'ready' ? count : null, baseName)}
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
      {stayRingOptions().map(ring => {
        const Icon = ring.mode === 'walk' ? Footprints : Car
        return <button type="button" key={ring.id} role="radio"
          aria-checked={ring.id === ringId} aria-label={ring.ariaLabel} className="mv2-lens-ring-btn"
          onClick={() => onRing(ring.id)}><Icon size={14} aria-hidden />{ring.label}</button>
      })}
    </div>
    {result.kind === 'needs-base' && <div className="mv2-lens-body-state">
      <LensPhaseNote phase="unscanned">{NEEDS_BASE_TEXT}</LensPhaseNote>
      <button type="button" className="btn btn-primary mv2-lens-set" onClick={onSetStay}>Set tonight's stay</button>
    </div>}
    {result.kind === 'phase' && result.phase !== 'ready' && <LensPhaseNote phase={result.phase} {...(props.onRetry == null ? {} : { onRetry: props.onRetry })}>{STAY_PHASE_TEXT[result.phase]}</LensPhaseNote>}
    {result.kind === 'ready' && readyPicks.length === 0 && <div className="mv2-lens-body-state">
      <LensPhaseNote phase="empty">{STAY_PHASE_TEXT.empty}</LensPhaseNote>
      {widen && <button type="button" className="btn btn-ghost mv2-lens-widen" onClick={() => onRing('drive-30')}>Try ≤30 min drive</button>}
    </div>}
    {result.kind === 'ready' && readyPicks.length > 0 && <>
      <ul className="mv2-lens-cards">
        {readyPicks.slice(0, MAX_CARDS).map((pick, index) => {
          const hit = pick.row.row.hit
          const reason = pick.row.row.reason
          const hours = stayHoursText(hit, timeFormat)
          const reasons = [
            ...(reason == null || reason.trim() === '' ? [] : [reason]),
            ...(pick.fitText == null ? [] : [pick.fitText]),
            ...(hours == null ? [] : [hours]),
          ]
          return <li key={pick.letter} className="mv2-lens-card">
            <LensPlaceCard
              letter={pick.letter}
              hit={hit}
              category={hit.category}
              name={hit.name}
              reasons={reasons}
              cells={stayCells(pick, clock)}
              addLabel={stayAddLabel(dayNumber, startOf(pick), clock)}
              onOpen={() => onOpenPick(pick)}
              onAdd={() => onAddPick(pick)}
              {...(onShortlist == null ? {} : {
                onShortlist: () => onShortlist(hit),
                shortlisted: shortlistedOf?.(hit) ?? false,
              })}
              selected={index === selectedAt}
              onSelect={() => setChosen(String(hit.id))}
            />
          </li>
        })}
      </ul>
      {(rest.length > 0 || (alsoCount > 0 && hiddenByRing === 0)) && <div className="mv2-lens-also-block">
        <p className="mv2-section-label mv2-lens-also">Also in this window</p>
        {rest.map(pick => <AlsoRow key={pick.row.row.hit.id} pick={pick} timeFormat={timeFormat} />)}
        {rest.length === 0 && <p className="mv2-lens-more">{alsoCount} more</p>}
      </div>}
    </>}
  </section>
}
