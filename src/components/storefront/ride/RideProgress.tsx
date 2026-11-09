import { useEffect } from 'react'
import { freeDaysRead, markRideDayRead, useRideProgress } from '../../../lib/rideProgress'

export function RideProgress({ publicationId, freeIndexes, current, dayCount, heading = false }: {
  publicationId: string
  freeIndexes: readonly number[]
  current: number
  dayCount: number
  heading?: boolean
}) {
  const read = useRideProgress(publicationId)
  const count = freeDaysRead(read, freeIndexes)
  useEffect(() => {
    if (heading) markRideDayRead(publicationId, current, freeIndexes)
  }, [publicationId, current, freeIndexes, heading])
  return (
    <div className={heading ? 'pi-read-head' : 'pi-read-summary'}>
      {heading && <b>Day {current + 1} of {dayCount}</b>}
      <span>{count} of {freeIndexes.length} free days read</span>
      {heading && <progress aria-label="Free days read" value={count} max={Math.max(1, freeIndexes.length)} />}
    </div>
  )
}
