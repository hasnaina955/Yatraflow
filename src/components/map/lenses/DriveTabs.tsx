// Drive lens deck. It draws one DriveTabsResult and calls the caller back.
// It reads no store, no map and no provider. The caller supplies every value.
import { useId, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type {
  DriveCardStrip, DriveTab, DriveTabGroup, DriveTabsResult, ScopeBand,
} from '../../../pages/trip/map/driveLens'

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

/** The three strip cells, in board order. */
const STRIP_CELLS = [
  { key: 'arrive', label: 'ARRIVE' },
  { key: 'detour', label: 'DETOUR' },
  { key: 'budget', label: 'BUDGET' },
] as const

export function DriveTabs({ result, activeTab, onTab, intro, stripOf, bandOf, nameOf, onOpen, onAdd }: {
  result: DriveTabsResult
  activeTab: DriveTab | null
  onTab: (tab: DriveTab) => void
  intro: string | null
  stripOf: (row: DriveRow) => DriveCardStrip
  bandOf: (row: DriveRow) => ScopeBand
  nameOf: (row: DriveRow) => string
  onOpen: (row: DriveRow) => void
  onAdd: (row: DriveRow) => void
}) {
  const uid = useId()
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  if (result.phase !== 'ready') {
    return <section className="mv2-lens mv2-lens-drive" aria-label="Along the drive">
      <p className="mv2-lens-phase" data-phase={result.phase}>{PHASE_TEXT[result.phase]}</p>
    </section>
  }
  const groups = result.tabs
  if (groups.length === 0) {
    return <section className="mv2-lens mv2-lens-drive" aria-label="Along the drive">
      <p className="mv2-lens-phase" data-phase="empty">{PHASE_TEXT.empty}</p>
    </section>
  }
  const current = activeTab ?? groups[0].tab
  const active = groups.find(group => group.tab === current) ?? groups[0]

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
    <div className="mv2-lens-tabs" role="tablist" aria-label="Along the drive tabs">
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
    </div>
    <div className="mv2-lens-panel" id={`${uid}-panel`} role="tabpanel"
      aria-labelledby={`${uid}-tab-${active.tab}`}>
      {intro != null && <p className="mv2-lens-intro">{intro}</p>}
      <ul className="mv2-lens-cards">
        {active.shown.map((row, index) => {
          const band = bandOf(row)
          const strip = stripOf(row)
          const tag = BAND_TAG[band] ?? null
          const over = band === 'over-budget'
          return <li key={index}>
            <article className={`mv2-lens-card${tag ? ` is-${band}` : ''}`}>
              <button type="button" className="mv2-lens-card-open" onClick={() => onOpen(row)}>
                <span className="mv2-lens-card-head">
                  <span className="mv2-lens-card-name">{nameOf(row)}</span>
                  {tag && <span className="mv2-lens-tag">{tag}</span>}
                </span>
                <span className="mv2-lens-strip">
                  {STRIP_CELLS.map(cell => {
                    const value = strip[cell.key]
                    return <span className="mv2-lens-cell" key={cell.key}>
                      <span className="mv2-lens-cell-label">{cell.label}</span>
                      <span className="mv2-lens-cell-value">
                        {value == null
                          ? <span aria-label="unknown">—</span>
                          : value}
                      </span>
                    </span>
                  })}
                </span>
              </button>
              <div className="mv2-lens-card-foot">
                <button
                  type="button"
                  className="mv2-lens-add"
                  disabled={over}
                  title={over ? "Over today's budget" : undefined}
                  onClick={() => onAdd(row)}>
                  Add
                </button>
              </div>
            </article>
          </li>
        })}
      </ul>
      {active.moreCount > 0 && <p className="mv2-lens-more">{active.moreCount} more like this</p>}
    </div>
  </section>
}
