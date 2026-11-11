// Drive lens deck. It draws one DriveTabsResult and calls the caller back.
// It reads no store, no map and no provider. The caller supplies every value.
import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type {
  DriveCardStrip, DriveTab, DriveTabGroup, DriveTabsResult, ScopeBand,
} from '../../../pages/trip/map/driveLens'
import { LensDeckHeader } from './LensDeckHeader'
import { LensPlaceCard, type LensCostCell } from './LensPlaceCard'
import { driveLettersByRoad } from '../../../pages/trip/map/useMapLenses'
import type { PlaceHit } from '../../../lib/geocode'

/** One row of a Drive tab group. */
type DriveRow = DriveTabGroup['shown'][number]

/** The phase text of each phase that has no cards. */
const PHASE_TEXT = {
  unscanned: 'Pick a day to see what is along the drive.',
  scanning: 'Looking along the drive…',
  failed: 'The search along the drive failed. Try again.',
  quota: 'The place search is over its limit for now.',
  empty: 'Nothing along this drive fits your scope.',
} as const

/** The tag of each band that shows one. The other bands show no tag. */
const BAND_TAG: Partial<Record<ScopeBand, string>> = {
  'just-past': 'just past your scope',
  'over-budget': "over today's budget",
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
  const word = driveSlotWord(group.label)
  const noun = group.total === 1 ? 'place' : 'places'
  return word === '' ? `${group.total} ${noun}` : `${group.total} ${noun} for ${word}`
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

/** How a deck draws its categories. One category is a plain heading row, so a
 *  lone chip never looks like a broken track. Two or more draw the tab track. */
export function driveTabMode(count: number): 'heading' | 'tabs' {
  return count <= 1 ? 'heading' : 'tabs'
}

/** The three strip cells, in board order. */
export function driveCells(strip: DriveCardStrip): LensCostCell[] {
  return [
    { key: 'arrive', label: 'Arrive', value: strip.arrive },
    { key: 'detour', label: 'Detour', value: strip.detour },
    { key: 'budget', label: 'Budget', value: strip.budget },
  ]
}

export function DriveTabs({ result, activeTab, onTab, intro, stripOf, bandOf, nameOf, onOpen, onAdd, dayNumber, reasonOf, letters: lettersProp, onShortlist, shortlistedOf, onClose }: {
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
  /** The fold handler. Absent uses the Map tab fold button. */
  onClose?: () => void
}) {
  const uid = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  if (result.phase !== 'ready') {
    return <section className="mv2-lens mv2-lens-drive" aria-label="Along the drive">
      <LensDeckHeader kicker="Along the drive" onClose={onClose} />
      <p className="mv2-lens-phase" data-phase={result.phase}>{PHASE_TEXT[result.phase]}</p>
    </section>
  }
  const groups = result.tabs
  if (groups.length === 0) {
    return <section className="mv2-lens mv2-lens-drive" aria-label="Along the drive">
      <LensDeckHeader kicker="Along the drive" onClose={onClose} />
      <p className="mv2-lens-phase" data-phase="empty">{PHASE_TEXT.empty}</p>
    </section>
  }
  const current = activeTab ?? groups[0].tab
  const active = groups.find(group => group.tab === current) ?? groups[0]
  // The badge letter is the map letter. Both read the same road order.
  const letters = lettersProp ?? driveLettersByRoad(active.shown)

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
    {driveTabMode(groups.length) === 'heading'
      ? <p className="mv2-lens-single-tab" aria-label={`${active.label} ${active.total}`}>
        <span className="mv2-lens-single-tab-name">{active.label}</span>{' '}
        <span className="mv2-lens-tab-total">{active.total}</span>
      </p>
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
      {...(driveTabMode(groups.length) === 'heading'
        ? { 'aria-label': active.label }
        : { 'aria-labelledby': `${uid}-tab-${active.tab}` })}>
      <ul className="mv2-lens-cards">
        {active.shown.map((row, index) => {
          const band = bandOf(row)
          const tag = BAND_TAG[band] ?? null
          const over = band === 'over-budget'
          const hit = row.row.hit
          const reason = reasonOf?.(row) ?? null
          return <li key={index}>
            <LensPlaceCard
              hit={hit}
              category={hit.category}
              name={nameOf(row)}
              letter={letters[String(hit.id)] ?? null}
              reasons={reason == null || reason.trim() === '' ? [] : [reason]}
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
              selected={index === 0}
            />
          </li>
        })}
      </ul>
    </div>
  </section>
}
