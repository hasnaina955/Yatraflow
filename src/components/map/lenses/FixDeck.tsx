// Fix lens deck. It draws one problem and the fixes another module built.
// It shows only the fixes it is given. It never builds or ranks a fix.
import { Fragment } from 'react'
import { Check, Route } from 'lucide-react'
import type { FixSummary } from '../../../pages/trip/map/fixLens'
import type { FixChangeSet, LensPhase } from '../../../lib/mapLensContracts'
import { LensDeckHeader } from './LensDeckHeader'
import { LensPhaseNote } from './LensPhaseNote'

/** The phase text of each phase that has no deck. */
const PHASE_TEXT = {
  unscanned: 'Pick a day to see what is for this day.',
  scanning: 'Looking for this day…',
  failed: 'The search for this day failed. Try again.',
  quota: 'The place search is over its limit for now.',
  empty: 'Nothing for this day fits your scope.',
} as const

/** The kicker of the deck header, for example "Fix · 1 problem on Day 3". */
export function fixDeckKicker(count: number, dayNumber: number): string {
  const noun = count === 1 ? 'problem' : 'problems'
  const seat = Number.isFinite(dayNumber) ? ` on Day ${dayNumber}` : ''
  return `Fix · ${count} ${noun}${seat}`
}

/** A clock such as 15:30 or 3:30 PM, to set in bold inside a problem line. */
const CLOCK_IN_TEXT = /(\b\d{1,2}:\d{2}(?:\s?[AP]M)?\b)/gi

/** Splits a line into plain and clock parts. Every odd part is a clock. */
export function clockParts(text: string): string[] {
  return text.split(CLOCK_IN_TEXT)
}

/** One evidence line with its clocks in bold. */
function EvidenceLine({ text }: { text: string }) {
  return <>{clockParts(text).map((part, index) => index % 2 === 1
    ? <b key={index}>{part}</b>
    : <Fragment key={index}>{part}</Fragment>)}</>
}

export function FixDeck({ phase, dayNumber, problem, fixes, onApply, onPreview, onClose }: {
  phase: LensPhase
  dayNumber: number
  problem: { title: string; evidence: string[]; foundBy: string } | null
  fixes: Array<{ set: FixChangeSet; summary: FixSummary }>
  onApply: (set: FixChangeSet) => void
  onPreview: (set: FixChangeSet) => void
  /** The fold handler. Absent uses the Map tab fold button. */
  onClose?: () => void
}) {
  if (phase !== 'ready') {
    return <section className="mv2-lens mv2-lens-fix-deck" aria-label="Fix this day">
      <LensDeckHeader kicker={fixDeckKicker(0, dayNumber)} tone="risk" onClose={onClose} />
      <LensPhaseNote phase={phase}>{PHASE_TEXT[phase]}</LensPhaseNote>
    </section>
  }
  const count = problem ? 1 : 0
  const shown = problem ? fixes : []
  return <section className="mv2-lens mv2-lens-fix-deck" aria-label="Fix this day">
    <LensDeckHeader
      kicker={fixDeckKicker(count, dayNumber)}
      title={problem?.title ?? null}
      tone="risk"
      onClose={onClose}
    />
    {problem && <div className="mv2-lens-evidence">
      {/* One reason is a plain line. Two or more are a list, so each stays a unit. */}
      {problem.evidence.length === 1
        ? <p className="mv2-lens-evidence-line"><EvidenceLine text={problem.evidence[0]} /></p>
        : <ul className="mv2-lens-evidence-lines">
          {problem.evidence.map((line, index) => <li key={index}><EvidenceLine text={line} /></li>)}
        </ul>}
      <p className="mv2-lens-found-by">
        {`Found by the ${problem.foundBy} · every fix below was run through the impact preview`}
      </p>
    </div>}
    {problem == null
      ? <p className="mv2-lens-none">No problems on this day.</p>
      : shown.length === 0
        ? <p className="mv2-lens-none">No safe fix was found. Every change we tried left the problem or made a new one.</p>
        : <ol className="mv2-lens-fixes">
          {shown.map((fix, index) => <li key={fix.set.id}
            className={`mv2-lens-fix${index === 0 ? ' is-first' : ''}`}>
            <div className="mv2-lens-fix-head">
              <span className="mv2-lens-fix-num" aria-hidden="true">{index + 1}</span>
              <span className="mv2-lens-fix-copy">
                <span className="mv2-lens-fix-name">{fix.summary.title}</span>
                <span className="mv2-lens-fix-change">{fix.summary.change}</span>
              </span>
            </div>
            <p className="mv2-lens-fix-result">
              <Check size={14} aria-hidden />
              <span>{fix.summary.result}</span>
            </p>
            <div className="mv2-lens-fix-actions">
              <button type="button" className={`btn mv2-lens-apply ${index === 0 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => onApply(fix.set)}>Apply</button>
              <button type="button" className="mv2-lens-preview"
                onClick={() => onPreview(fix.set)}>
                <Route size={14} aria-hidden />
                Preview on map
              </button>
            </div>
          </li>)}
        </ol>}
  </section>
}
