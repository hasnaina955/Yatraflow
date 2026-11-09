// Fix lens deck. It draws one problem and the fixes another module built.
// It shows only the fixes it is given. It never builds or ranks a fix.
import type { FixSummary } from '../../../pages/trip/map/fixLens'
import type { FixChangeSet, LensPhase } from '../../../lib/mapLensContracts'

/** The phase text of each phase that has no deck. */
const PHASE_TEXT = {
  unscanned: 'Pick a day to see what is for this day.',
  scanning: 'Looking for this day…',
  failed: 'The search for this day failed. Try again.',
  quota: 'The place search is over its limit for now.',
  empty: 'Nothing for this day fits your scope.',
} as const

/** The most fixes the deck shows. The board shows three. */
const MAX_FIXES = 3

export function FixDeck({ phase, dayNumber, problem, fixes, onApply, onPreview }: {
  phase: LensPhase
  dayNumber: number
  problem: { title: string; evidence: string[]; foundBy: string } | null
  fixes: Array<{ set: FixChangeSet; summary: FixSummary }>
  onApply: (set: FixChangeSet) => void
  onPreview: (set: FixChangeSet) => void
}) {
  if (phase !== 'ready') {
    return <section className="mv2-lens mv2-lens-fix" aria-label="Fix this day">
      <p className="mv2-lens-phase" data-phase={phase}>{PHASE_TEXT[phase]}</p>
    </section>
  }
  const count = problem ? 1 : 0
  const shown = problem ? fixes.slice(0, MAX_FIXES) : []
  return <section className="mv2-lens mv2-lens-fix" aria-label="Fix this day">
    <p className="mv2-lens-kicker">
      {`FIX · ${count} ${count === 1 ? 'PROBLEM' : 'PROBLEMS'} ON DAY ${dayNumber}`}
    </p>
    {problem && <>
      <h2 className="mv2-lens-fix-title">{problem.title}</h2>
      <div className="mv2-lens-evidence">
        <ul className="mv2-lens-evidence-lines">
          {problem.evidence.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
        <p className="mv2-lens-found-by">
          {`Found by the ${problem.foundBy} · every fix below was run through the impact preview`}
        </p>
      </div>
    </>}
    {problem == null
      ? <p className="mv2-lens-none">No problems on this day.</p>
      : shown.length === 0
        ? <p className="mv2-lens-none">No safe fix was found. Every change we tried left the problem or made a new one.</p>
        : <ol className="mv2-lens-fixes">
          {shown.map((fix, index) => <li key={fix.set.id} className="mv2-lens-fix">
            <div className="mv2-lens-fix-head">
              <span className="mv2-lens-fix-num" aria-hidden="true">{index + 1}</span>
              <span className="mv2-lens-fix-copy">
                <span className="mv2-lens-fix-name">{fix.summary.title}</span>
                <span className="mv2-lens-fix-change">{fix.summary.change}</span>
              </span>
            </div>
            <p className="mv2-lens-fix-result">{fix.summary.result}</p>
            <div className="mv2-lens-fix-actions">
              <button type="button" className="btn btn-primary mv2-lens-apply"
                onClick={() => onApply(fix.set)}>Apply</button>
              <button type="button" className="mv2-lens-preview"
                onClick={() => onPreview(fix.set)}>Preview on map</button>
            </div>
          </li>)}
        </ol>}
  </section>
}
