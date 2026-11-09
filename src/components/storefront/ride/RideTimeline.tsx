import { Fragment, type ReactNode } from 'react'
import { Car, Flag, Moon } from 'lucide-react'
import type { Journey, ScheduledLeg } from '../../../lib/engine'
import { minutesToHM } from '../../../lib/engine'
import { formatHM, formatHMRange } from '../../../lib/timefmt'
import { CatIcon } from '../../icons'
import { Avatar } from '../../ui'
import type { CachedUser } from '../../../data/types'

/** A saved leg is optional. The engine's distance fallback is not a saved leg. */
export function savedRideLeg(stop: { legDistanceKm?: number; legTravelMinutes?: number }, leg: ScheduledLeg | null) {
  const km = stop.legDistanceKm
  const minutes = stop.legTravelMinutes
  if (leg?.kind === 'air' || km == null || minutes == null || !Number.isFinite(km) || !Number.isFinite(minutes)
    || km < 0 || minutes < 0 || (km === 0 && minutes === 0)) return null
  return { km, minutes }
}

export function RideTimeline({ journey, timeFormat, creator, children }: {
  journey: Journey
  timeFormat: '12h' | '24h'
  creator?: CachedUser
  children: ReactNode
}) {
  if (journey.points.length === 0) return <>{children}</>
  const end = journey.points[journey.points.length - 1]
  const endIsNight = end.stop.category === 'hotel' || end.stop.slotKey === 'stay' || end.stop.auto === true
  return (
    <ol className="pi-tl pi-ride-timeline">
      <li className="pi-tl-row pi-ride-node">
        <span className="pi-tl-time">{formatHM(journey.startTime, timeFormat)}</span>
        <span className="pi-tl-rail"><i className="pi-tl-dot pi-ride-node-dot"><Flag size={12} aria-hidden /></i></span>
        <div className="pi-tl-body"><b>Leave {journey.startTitle}</b></div>
      </li>
      {journey.points.slice(1).map((point, position) => {
        const leg = savedRideLeg(point.stop, point.legIn)
        const anchor = point.stop.auto === true
        const number = journey.points.slice(1, position + 1).filter(previous => !previous.stop.auto).length + 1
        return (
          <Fragment key={point.stop.id}>
            {leg && <li className="pi-tl-row pi-ride-leg">
              <span /><span className="pi-tl-rail" />
              <div><Car size={15} aria-hidden /><span>{Math.round(leg.km)} km · {minutesToHM(leg.minutes)}</span></div>
            </li>}
            {!anchor && <li className="pi-tl-row pi-tl-row--stop">
              <span className="pi-tl-time"><b>{formatHM(point.arrive, timeFormat)}</b><small>to {formatHM(point.depart, timeFormat)}</small></span>
              <span className="pi-tl-rail"><i className="pi-tl-dot">{number}</i></span>
              <div className="pi-tl-body pi-ride-stop">
                <span className={'pi-ride-stop-icon cat-' + point.stop.category}><CatIcon category={point.stop.category} /></span>
                <div className="pi-ride-stop-copy">
                  <div className="pi-tl-toprow"><b className="pi-tl-title">{point.stop.title}</b><span className="pi-pill pi-pill--ok">Timed</span></div>
                  <div className="pi-tl-meta">{[point.stop.locationName, `${minutesToHM(point.dwellMinutes)} here`, point.stop.entryFeeInrPerPerson > 0 ? `₹${point.stop.entryFeeInrPerPerson}/person` : 'free entry'].filter(Boolean).join(' · ')}</div>
                  {point.stop.openTime && <div className="pi-tl-meta">Open {formatHMRange(point.stop.openTime, point.stop.closeTime, timeFormat)}</div>}
                  {point.stop.description && <p className="pi-tl-desc">{point.stop.description}</p>}
                </div>
                {point.stop.notes?.trim() && <div className="pi-ride-note"><Avatar user={creator} /><p><b>{creator?.profile.name ?? 'Creator'}&apos;s note.</b> {point.stop.notes}</p></div>}
              </div>
            </li>}
          </Fragment>
        )
      })}
      {end && <li className="pi-tl-row pi-ride-node pi-ride-node--end">
        <span className="pi-tl-time">{formatHM(end.depart, timeFormat)}</span>
        <span className="pi-tl-rail"><i className="pi-tl-dot pi-ride-node-dot"><Moon size={12} aria-hidden /></i></span>
        <div className="pi-tl-body"><b>{endIsNight ? 'Night in' : 'Finish at'} {journey.endTitle}</b></div>
      </li>}
    </ol>
  )
}
