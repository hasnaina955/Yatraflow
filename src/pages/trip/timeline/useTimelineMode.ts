// ============ Timeline Plan/Inspect mode (docs/TIMELINE-PLAN.md Phase 3) ============
// Plan = today's editing timeline. Inspect = the same data with every editing
// affordance off — safe to study on a phone during the trip itself. The mode
// persists per user like the theme: a localStorage flag, not trip data.
import { useCallback, useState } from 'react'
import { loadFlag, saveFlag } from '../../../lib/uiPrefs'

export type TimelineMode = 'plan' | 'inspect'

const FLAG = 'timeline_inspect'

export function useTimelineMode(): { mode: TimelineMode; setMode: (m: TimelineMode) => void } {
  const [inspect, setInspect] = useState(() => loadFlag(FLAG, false))
  const setMode = useCallback((m: TimelineMode) => {
    setInspect(m === 'inspect')
    saveFlag(FLAG, m === 'inspect')
  }, [])
  return { mode: inspect ? 'inspect' : 'plan', setMode }
}
