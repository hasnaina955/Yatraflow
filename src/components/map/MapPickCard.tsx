// The place detail: the desktop panel and the phone sheet share this card.
// It draws the art band, the title block, the cost cells, the "If you add it"
// preview, the actions and the source line. The page supplies every value. The
// preview lines come from the existing add preview, never from a new formula.
import { useState } from 'react'
import { ArrowLeftRight, Check, Clock, Diamond, ExternalLink, Heart, Info, Plus, Route, Sparkle, Star, X } from 'lucide-react'
import type { Trip } from '../../data/types'
import type { PlaceHit } from '../../lib/geocode'
import type { JourneyActions, JourneyFreshness } from '../../lib/journeyProjection'
import type { DiscoveryCoverage } from '../../lib/providers/hits'
import { hoursCardText, hoursDisplayFor, intendedVisitMinutes, visitDateForDay } from '../../lib/hoursContext'
import { titleCase } from '../../lib/labels'
import { placeSubtype } from '../../lib/mapStyles/placeMarks'
import { formatHMRange, useTimeFormat } from '../../lib/timefmt'
import { detourDisplay, detourDisplayText } from '../../pages/trip/map/driveSuggestionView'
import type { DetailPreviewView, PreviewLine } from '../../pages/trip/map/detailPreview'
import { CatIcon } from '../icons'
import { PlacePhotos } from './PlacePhotos'
import { ageText, compactCount, coverageText, kindWordOf, sourceNameOf } from './placeCardFacts'

/** One panel line: its icon, then its parts. A moved clock shows the old one struck. */
function PreviewLineView({ line }: { line: PreviewLine }) {
  const icon = line.tone === 'risk'
    ? <span className="mv2-detail-risk-mark"><Diamond size={14} aria-hidden /></span>
    : line.tone === 'clock' ? <Clock size={14} aria-hidden /> : <Check size={14} aria-hidden />
  return <>
    <span className={`mv2-detail-preview-icon is-${line.tone}`}>{icon}</span>
    <span className="mv2-detail-preview-text">{line.parts.map((part, index) => part.struck
      ? <s key={index}>{part.text}</s>
      : part.bold ? <b key={index}>{part.text}</b> : part.text)}</span>
  </>
}

export function MapPickCard({ fetchedAt, coverage, hit, trip, dayIndex, detourMin, reason, added, editable, busy, shortlisted, visitMin, budgetSharePct, budgetText, source, freshness, actions, arriveMin, arriveText, kicker, preview, fixOffer, onSwap, onAdd, onAddAndFix, onShortlist, onClose, onDirections }: {
  hit: PlaceHit; trip: Trip; dayIndex: number | null; detourMin: number | null; reason: string | null; added: boolean; editable: boolean; busy: boolean; shortlisted: boolean
  /** Projected visit length. Undefined = unprojected (existing fallback); null = unknown. */
  visitMin?: number | null
  /** Projected share of the day's detour budget; null or absent adds nothing. */
  budgetSharePct?: number | null
  /** The projected used-of-total budget, such as "28 of 45". Null hides it. */
  budgetText?: string | null
  /** Projected source. Undefined = unprojected; null = unknown source. */
  source?: PlaceHit['source'] | null
  /** Projected evidence freshness. Undefined = unprojected. */
  freshness?: JourneyFreshness
  /** Projected permissions. They can only restrict the existing controls. */
  actions?: JourneyActions
  /** Projected arrival clock for the existing hours note. */
  arriveMin?: number | null
  /** The arrival as a clock text for the Arrive cell. Null or absent hides the cell. */
  arriveText?: string | null
  /** The kicker over the title, for example "Along the drive · Sight". Absent builds it from the category. */
  kicker?: string
  /** The "If you add it" panel. Null hides it: there is nothing to preview. */
  preview?: DetailPreviewView | null
  /** The secondary action, offered only when the engine has a fix for the risk the add brings. */
  fixOffer?: { label: string } | null
  /** Swap the planned stop this pick replaces. Absent hides the pill. */
  onSwap?: () => void
  /** When this row's data was fetched. Null or absent shows no age. */
  fetchedAt?: number | null
  /** What the search covered. Null or absent shows nothing. */
  coverage?: DiscoveryCoverage | null
  onAdd: () => void; onAddAndFix?: () => void; onShortlist: () => void; onClose: () => void; onDirections: () => void
}) {
  const format = useTimeFormat()
  const visit = visitMin !== undefined ? visitMin : intendedVisitMinutes(hit)
  const hours = hit.hours && visit != null ? hoursCardText(hoursDisplayFor(hit, { date: dayIndex == null ? null : visitDateForDay(trip.startDate, dayIndex), arrivalMin: arriveMin !== undefined ? arriveMin : null, visitMin: visit }), (open, close) => formatHMRange(open, close, format)) : null
  const sourceValue = source !== undefined ? source : hit.source
  const sourceLabel = sourceNameOf(sourceValue) ?? 'Source not supplied'
  const freshnessLabel = freshness === undefined ? null : freshness === 'live' ? 'Live result' : freshness === 'retained' ? 'Retained result' : freshness === 'stale' ? 'Stale result' : 'Freshness unknown'
  // One display rule for the detour. An on-route detour hides its budget share.
  const detour = detourDisplay(detourMin)
  const [shownAt] = useState(() => Date.now())
  // Age and coverage are shown only when the row carries them.
  const dataFacts = [ageText(fetchedAt, shownAt), coverageText(coverage)].filter((fact): fact is string => fact != null)
  const canAdd = actions?.add ?? true
  const canShortlist = actions?.shortlist ?? true
  const canNavigate = actions?.navigate ?? true
  const hasReportedHours = (hit.hours != null && hit.hours.basis !== 'none') || !!hit.openTime || !!hit.closeTime
  const hoursNote = hours ? 'Reported opening hours' : hasReportedHours ? 'Visit hours need checking' : 'Hours unavailable'
  // The art band takes the category family, as the place card tile does.
  const artFamily = placeSubtype({ category: hit.category ?? undefined, name: hit.name }).family
  // The same cell style as the deck card. Desktop reads Detour / Visit / Budget;
  // the phone sheet swaps Visit for the pick's Arrive, as its board does.
  const budgetPct = detour.kind === 'extra' && budgetSharePct != null ? `${Math.round(budgetSharePct)}%` : null
  const budgetUsed = detour.kind === 'extra' && budgetText != null && budgetText.trim() !== '' ? budgetText : null
  const costCells = [
    { key: 'arrive', label: 'Arrive', value: arriveText ?? null },
    { key: 'detour', label: 'Detour', value: detourMin == null ? null : detourDisplayText(detourMin) },
    { key: 'visit', label: 'Visit', value: visit == null ? null : `${visit} min` },
    { key: 'budget', label: 'Budget', value: budgetPct ?? budgetUsed },
  ].filter(cell => cell.value != null && cell.value.trim() !== '')
  const sub = hit.description ?? [hit.admin1, hit.category].filter(Boolean).join(' · ')
  const count = compactCount(hit.ratingCount)
  const kickerText = kicker ?? `Along the drive · ${kindWordOf(hit.category)}`
  const addLabel = added ? 'In your plan' : preview?.order != null ? `Add as stop ${preview.order}` : dayIndex == null ? 'Add to a day' : `Add to Day ${dayIndex + 1}`
  return <article id="rail-detail" className="mv2-pick-card" tabIndex={-1} aria-label={`Place details: ${hit.name}`}>
    <div className="mv2-place-art" data-family={artFamily}><CatIcon category={hit.category} size={38} /><span>{titleCase(hit.category ?? 'place')}</span><button className="mv2-icon-btn" type="button" aria-label="Close place details" onClick={onClose}><X size={14} /></button></div>
    <PlacePhotos hit={hit} />
    <div className="mv2-place-body">
      <div className="mv2-detail-head">
        <span className="mv2-detail-kicker">{kickerText}</span>
        <h2>{hit.name}</h2>
        {(hit.rating != null || sub !== '') && <p className="mv2-detail-meta">
          {hit.rating != null && <span className="mv2-rating"><Star size={12} aria-hidden /><b>{hit.rating.toFixed(1)}</b>{count != null && <b>· {count}</b>}</span>}
          {sub !== '' && <span className="mv2-place-description">{sub}</span>}
        </p>}
      </div>
      {(hours || reason) && <div className="mv2-reason-chips">{reason && <span className="is-reason">{reason}</span>}{hours && <span>{hours}</span>}</div>}
      {costCells.length > 0 && <div className="mv2-lens-strip mv2-detail-cells">{costCells.map(cell => <span className="mv2-lens-cell" data-cell={cell.key} key={cell.key}>
        <span className="mv2-lens-cell-label">{cell.label}</span>
        <span className="mv2-lens-cell-value">{cell.key === 'budget' && budgetUsed != null && budgetPct != null
          ? <><span className="mv2-detail-budget-used">{budgetUsed}</span><span className="mv2-detail-budget-pct">{budgetPct}</span></>
          : cell.value}</span>
      </span>)}</div>}
      {editable && !added && preview != null && <>
        <section className="mv2-detail-preview" aria-label="If you add it, preview">
          <span className="mv2-detail-preview-kicker">If you add it · preview</span>
          {preview.lines.map(line => <div className="mv2-detail-preview-line" key={line.key}><PreviewLineView line={line} /></div>)}
        </section>
        {preview.summary != null && <p className="mv2-detail-fit"><PreviewLineView line={preview.summary} /></p>}
      </>}
      {editable
        ? <div className="mv2-place-actions">
          <span className="mv2-place-cta"><button type="button" className="btn btn-primary" disabled={added || busy || !canAdd} onClick={onAdd}>{added ? <Check size={15} /> : <Plus size={15} />}{addLabel}</button></span>
          <button className="mv2-icon-btn mv2-place-heart" type="button" disabled={added || busy || !canShortlist} aria-label={shortlisted ? 'Remove from shortlist' : 'Add to shortlist'} aria-pressed={shortlisted} onClick={onShortlist}><Heart size={15} fill={shortlisted ? 'currentColor' : 'none'} /></button>
        </div>
        : <p className="mv2-viewer-note">You can explore this trip. Editing is available to its planners.</p>}
      {editable && !added && fixOffer != null && onAddAndFix != null && <button type="button" className="mv2-place-secondary" disabled={busy || !canAdd} onClick={onAddAndFix}><Sparkle size={15} aria-hidden />{fixOffer.label}</button>}
      {editable && <div className="mv2-place-pills">
        <button type="button" className="mv2-place-pill" disabled={added || busy || !canShortlist} aria-pressed={shortlisted} onClick={onShortlist}><Heart size={14} fill={shortlisted ? 'currentColor' : 'none'} aria-hidden />{shortlisted ? 'Shortlisted' : 'Shortlist'}</button>
        {onSwap != null && <button type="button" className="mv2-place-pill" disabled={busy} onClick={onSwap}><ArrowLeftRight size={14} aria-hidden />Swap</button>}
        <button type="button" className="mv2-place-pill" disabled={!canNavigate} onClick={onDirections}><Route size={14} aria-hidden />Go</button>
      </div>}
      <button type="button" className="mv2-directions" disabled={!canNavigate} onClick={onDirections}><ExternalLink size={14} aria-hidden />View place in Google Maps</button>
    </div>
    <p className="mv2-source"><Info size={13} aria-hidden />{sourceLabel} · {hit.measuredRoadFact ? 'Road evidence supplied' : 'Driving estimate'} · {hoursNote}{freshnessLabel ? ` · ${freshnessLabel}` : ''}{dataFacts.map(fact => ` · ${fact}`).join('')}</p>
  </article>
}
