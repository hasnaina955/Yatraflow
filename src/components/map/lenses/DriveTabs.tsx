// Drive lens deck. It draws one DriveTabsResult and calls the caller back.
// It reads no store, no map and no provider. The caller supplies every value.
import { useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type {
  DriveCardStrip, DriveTab, DriveTabGroup, DriveTabsResult, ScopeBand,
} from '../../../pages/trip/map/driveLens'
import { LensDeckHeader } from './LensDeckHeader'
import { LensPhaseNote } from './LensPhaseNote'
import { LensPlaceCard, selectedCardIndex, type LensCostCell } from './LensPlaceCard'
import { driveLettersByRoad } from '../../../pages/trip/map/useMapLenses'
import { useTimeFormat } from '../../../lib/timefmt'
import { pickFactChips } from '../placeCardFacts'
import type { PlaceHit } from '../../../lib/geocode'

/** One row of a Drive tab group. */
type DriveRow = DriveTabGroup['shown'][number]

/** The phase text of each phase that has no cards. */
const PHASE_TEXT = {
  unscanned: 'Drive · Choose a day',
  scanning: 'Drive · Searching…',
  failed: 'Drive search · Failed',
  quota: 'Place search · Limit reached',
  empty: 'Drive · No picks in scope',
} as const

/** A deck with no cards still shows its title, so every phase keeps one header. */
export const DRIVE_NOTE_TITLE = 'Along the drive'

/** The kicker of a deck with no cards, for example "Drive · Day 3". */
export function driveNoteKicker(dayNumber: number): string {
  return Number.isFinite(dayNumber) ? `Drive · Day ${dayNumber}` : 'Drive'
}

/** The tag of each band that shows one. The other bands show no tag. */
const BAND_TAG: Partial<Record<ScopeBand, string>> = {
  unknown: 'Detour · Not measured',
  'just-past': 'Just past scope',
  'over-budget': "Over budget",
}

/**
 * The tab index a key moves to. Null means the key does not move the tab.
 * Arrow keys wrap at each end. Home and End jump to the first and last tab.
 */
export function tabKeyStep(key: string, index: number, count: number): number | null {
  if (count <= 0) return null
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return index === count - 1 ? 0 : index + 1
    case 'ArrowLeft':
    case 'ArrowUp':
      return index === 0 ? count - 1 : index - 1
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return null
  }
}

/** The slot word of a tab label. "Lunch gap" gives "lunch". */
export function driveSlotWord(label: string): string {
  return label.replace(/\s*gap$/i, '').trim().toLowerCase()
}

/** The kicker of the deck header, for example "Along the drive · lunch gap". */
export function driveDeckKicker(label: string | null): string {
  return label == null || label.trim() === ''
    ? 'Along the drive'
    : `Along the drive · ${label.trim().toLowerCase()}`
}

/** The deck title, for example "3 places for lunch". */
export function driveDeckTitle(group: Pick<DriveTabGroup, 'label' | 'total'>): string {
  return group.label
}

/** Meal slot words. Other tabs name only the day. */
export const MEAL_SLOT_WORDS: ReadonlySet<string> = new Set(['breakfast', 'lunch', 'dinner'])

/** The Add label. A meal names its slot. Other tabs name only the day. */
export function addSlotLabel(dayNumber: number, word: string): string {
  if (!Number.isFinite(dayNumber)) return 'Add'
  const day = `Day ${dayNumber}`
  return MEAL_SLOT_WORDS.has(word) ? `Add as ${day} ${word}` : `Add to ${day}`
}

/** Picks whose hit id is not in the shown set. */
export function hiddenDrivePicks<T extends { hit?: { id?: unknown } | null }>(
  all: readonly T[],
  shownIds: ReadonlySet<string>,
): T[] {
  return all.filter(item => {
    const hit = item.hit
    return hit == null || hit.id == null || !shownIds.has(String(hit.id))
  })
}

/** The primary action label, for example "Add as Day 3 lunch". */
export function driveAddLabel(dayNumber: number, label: string): string {
  return addSlotLabel(dayNumber, driveSlotWord(label))
}

/** How a deck draws its categories. One category draws nothing: the deck title
 *  already names it, so a lone chip or a repeated heading adds no fact. Two or
 *  more draw the tab track. */
export function driveTabMode(count: number): 'none' | 'tabs' {
  return count <= 1 ? 'none' : 'tabs'
}

/** The three strip cells, in board order. */
export function driveCells(strip: DriveCardStrip): LensCostCell[] {
  return [
    { key: 'arrive', label: 'Arrive', value: strip.arrive },
    { key: 'detour', label: 'Detour', value: strip.detour },
    { key: 'budget', label: 'Budget', value: strip.budget },
  ]
}

export function DriveTabs({ result, activeTab, onTab, intro, stripOf, bandOf, nameOf, onOpen, onAdd, dayNumber, reasonOf, letters: lettersProp, onShortlist, shortlistedOf, swapOf, onClose, onRetry }: {
  result: DriveTabsResult
  activeTab: DriveTab | null
  onTab: (tab: DriveTab) => void
  intro: string | null
  stripOf: (row: DriveRow) => DriveCardStrip
  bandOf: (row: DriveRow) => ScopeBand
  nameOf: (row: DriveRow) => string
  onOpen: (row: DriveRow) => void
  onAdd: (row: DriveRow) => void
  /** The day number for the Add label. One-based. */
  dayNumber: number
  /** The reason the model gives for a row. Null shows no chip. */
  reasonOf?: (row: DriveRow) => string | null
  /** The one letter map the page and the cards share. Absent derives it here. */
  letters?: Record<string, 'A' | 'B' | 'C'>
  /** The Keep action. Absent hides the heart. */
  onShortlist?: (hit: PlaceHit) => void
  /** True draws the kept heart. */
  shortlistedOf?: (hit: PlaceHit) => boolean
  /** The swap action of a pick. Null means the pick has no planned stop to replace. */
  swapOf?: (hit: PlaceHit) => (() => void) | null
  /** The fold handler. Absent uses the Map tab fold button. */
  onClose?: () => void
  /** The search retry. Absent draws a failed note with no Retry button. */
  onRetry?: () => void
}) {
  const uid = useId()
  const timeFormat = useTimeFormat()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [chosen, setChosen] = useState<string | null>(null)
  if (result.phase !== 'ready') {
    return <section className="mv2-lens mv2-lens-drive" aria-label="Along the drive">
      <LensDeckHeader kicker={driveNoteKicker(dayNumber)} title={DRIVE_NOTE_TITLE} onClose={onClose} />
      <LensPhaseNote phase={result.phase} {...(onRetry == null ? {} : { onRetry })}>{PHASE_TEXT[result.phase]}</LensPhaseNote>
    </section>
  }
  const groups = result.tabs
  if (groups.length === 0) {
    return <section className="mv2-lens mv2-lens-drive" aria-label="Along the drive">
      <LensDeckHeader kicker={driveNoteKicker(dayNumber)} title={DRIVE_NOTE_TITLE} onClose={onClose} />
      <LensPhaseNote phase="empty">{PHASE_TEXT.empty}</LensPhaseNote>
    </section>
  }
  const current = activeTab ?? groups[0].tab
  const active = groups.find(group => group.tab === current) ?? groups[0]
  // The badge letter is the map letter. Both read the same road order.
  const letters = lettersProp ?? driveLettersByRoad(active.shown)
  // One card carries the actions. A click or a focus on another card moves them.
  const selectedAt = selectedCardIndex(active.shown.map(row => String(row.row.hit.id)), chosen)

  function moveTo(index: number) {
    const group = groups[index]
    if (!group) return
    onTab(group.tab)
    tabRefs.current[index]?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = tabKeyStep(event.key, index, groups.length)
    if (next == null) return
    event.preventDefault()
    moveTo(next)
  }

  return <section className="mv2-lens mv2-lens-drive" aria-label="Along the drive">
    <LensDeckHeader
      kicker={driveDeckKicker(active.label)}
      title={driveDeckTitle(active)}
      sub={intro}
      onClose={onClose}
    />
    {driveTabMode(groups.length) === 'none'
      ? null
      : <div className="mv2-lens-tabs" role="tablist" aria-label="Along the drive tabs">
        {groups.map((group, index) => {
          const selected = group.tab === active.tab
          return <button
            key={group.tab}
            ref={element => { tabRefs.current[index] = element }}
            id={`${uid}-tab-${group.tab}`}
            type="button"
            role="tab"
            className={`mv2-lens-tab${selected ? ' is-active' : ''}`}
            aria-selected={selected}
            aria-controls={`${uid}-panel`}
            aria-label={`${group.label} ${group.total}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onTab(group.tab)}
            onKeyDown={event => onKeyDown(event, index)}>
            <span className="mv2-lens-tab-name">{group.label}</span>{' '}
            <span className="mv2-lens-tab-total">{group.total}</span>
          </button>
        })}
      </div>}
    <div className="mv2-lens-panel" id={`${uid}-panel`} role="tabpanel"
      {...(driveTabMode(groups.length) === 'none'
        ? { 'aria-label': active.label }
        : { 'aria-labelledby': `${uid}-tab-${active.tab}` })}>
      <ul className="mv2-lens-cards">
        {active.shown.map((row, index) => {
          const band = bandOf(row)
          const tag = BAND_TAG[band] ?? null
          const over = band === 'over-budget'
          const hit = row.row.hit
          const reason = reasonOf?.(row) ?? null
          return <li key={index} data-scope-band={band} data-place-id={String(hit.id)}>
            <LensPlaceCard
              hit={hit}
              category={hit.category}
              name={nameOf(row)}
              letter={letters[String(hit.id)] ?? null}
              reasons={pickFactChips({ reason, hit, format: timeFormat })}
              cells={driveCells(stripOf(row))}
              tag={tag}
              band={band === 'inside' || band === 'outside' || band === 'unknown' ? null : band}
              addLabel={driveAddLabel(dayNumber, active.label)}
              addDisabled={over}
              addTitle={over ? "Over today's budget" : undefined}
              onOpen={() => onOpen(row)}
              onAdd={() => onAdd(row)}
              {...(onShortlist == null ? {} : {
                onShortlist: () => onShortlist(hit),
                shortlisted: shortlistedOf?.(hit) ?? false,
              })}
              {...(swapOf?.(hit) == null ? {} : { onSwap: swapOf(hit) as () => void })}
              selected={index === selectedAt}
              onSelect={() => setChosen(String(hit.id))}
            />
          </li>
        })}
      </ul>
    </div>
  </section>
}
