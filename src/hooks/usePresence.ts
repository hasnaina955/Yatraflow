import { useEffect, useState } from 'react'
import { motionExitTiming } from '../lib/motion'

/**
 * Keep a closing part mounted while its exit plays.
 *
 * `mounted` stays true from the close until the exit time ends, and `leaving`
 * is true in that window, so the part can wear an exit class. The time is the
 * shared `--motion-med` exit, which is zero under reduced motion.
 */
export function usePresence(open: boolean): { mounted: boolean; leaving: boolean } {
  const [previous, setPrevious] = useState(open)
  const [leaving, setLeaving] = useState(false)
  // React's pattern for state that follows a prop: compare with the last render.
  if (open !== previous) {
    setPrevious(open)
    setLeaving(!open)
  }
  useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => { setLeaving(false) }, motionExitTiming('--motion-med').duration)
    return () => { window.clearTimeout(timer) }
  }, [leaving])
  return { mounted: open || leaving, leaving: !open && leaving }
}
