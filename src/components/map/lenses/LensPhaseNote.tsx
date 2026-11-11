// One note for a lens deck that has no cards. Each phase draws its own mark and
// tint, so a wait, a failure, a paused search and a real empty never look alike.
// The text stays in the inner `mv2-lens-phase` paragraph.
import { CirclePause, LoaderCircle, MapPin, SearchX, TriangleAlert } from 'lucide-react'
import type { LensPhase } from '../../../lib/mapLensContracts'

const PHASE_ICON = {
  unscanned: MapPin,
  scanning: LoaderCircle,
  failed: TriangleAlert,
  quota: CirclePause,
  empty: SearchX,
} as const

/** The note of a phase that has no cards. A failure is an alert. The rest are status. */
export function LensPhaseNote({ phase, children }: { phase: Exclude<LensPhase, 'ready'>; children: string }) {
  const Icon = PHASE_ICON[phase]
  return <div className="mv2-lens-phase-note" data-phase={phase} role={phase === 'failed' ? 'alert' : 'status'}>
    <Icon size={16} aria-hidden="true" />
    <p className="mv2-lens-phase" data-phase={phase}>{children}</p>
  </div>
}
