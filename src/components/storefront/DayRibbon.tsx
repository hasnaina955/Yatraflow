// P11 trip kit: the day ribbon. One button per day, drawn over a route line
// that runs teal where a day is open and marigold where it is not.
// A locked day shows its own title and a count, never a place name.
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { staggerStep } from '../../lib/motion'

export interface RibbonDay {
  index: number
  title: string
  state: 'free' | 'yours' | 'locked'
  placeCount: number
  /** Ride along only: "read" after this visitor opened the day, "now" for the day on screen. */
  status?: 'read' | 'now'
}

const STATUS_WORD: Record<NonNullable<RibbonDay['status']>, string> = {
  read: 'read ✓',
  now: 'open now',
}

const DOT_LABEL: Record<RibbonDay['state'], string> = {
  free: 'Free to read',
  yours: 'Yours',
  locked: 'In the paid plan',
}

/** The route line: one equal band per day, in the day's own colour. */
function routeLine(days: readonly RibbonDay[]): string {
  const n = Math.max(1, days.length)
  const stops = days.map((d, i) => {
    const colour = d.state === 'locked' ? 'var(--pw-marigold-300)' : 'var(--pw-route)'
    return `${colour} ${(i / n) * 100}% ${((i + 1) / n) * 100}%`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

function revealDay(host: HTMLElement, day: Element): void {
  const inset = parseFloat(getComputedStyle(host).scrollPaddingInlineStart) || 0
  const edge = host.getBoundingClientRect()
  const button = day.getBoundingClientRect()
  if (button.left < edge.left + inset) host.scrollLeft -= edge.left + inset - button.left
  else if (button.right > edge.right - inset) host.scrollLeft += button.right - edge.right + inset
}

export function DayRibbon(p: {
  label: string
  /** `progress` is the share of free days read, 0 to 1. Ride along only. */
  head: { kicker: string; figure: string; sub: string; tag?: ReactNode; progress?: number }
  days: readonly RibbonDay[]
  /** The day on screen in the ride-along view. Absent in the overview. */
  current: number | null
  /** What a locked day's second line says. */
  lockedWord: string
  onPick: (index: number) => void
}): JSX.Element {
  const track = useRef<HTMLDivElement>(null)
  const selectedDay = p.current
  useEffect(() => {
    if (selectedDay === null) return
    const host = track.current
    const current = host?.querySelector('[aria-current="true"]')
    if (!host || !current) return
    revealDay(host, current)
  }, [selectedDay])
  return (
    <section className="pi-ribbon" aria-label={p.label}>
      <div className="pi-ribbon-head">
        <span className="pi-kicker">{p.head.kicker}</span>
        <b className="pi-ribbon-figure">{p.head.figure}</b>
        <span className="pi-ribbon-sub">{p.head.sub}</span>
        {p.head.progress !== undefined ? (
          <span className="pi-ribbon-progress" aria-hidden="true">
            <span style={{ '--pi-progress': String(Math.min(1, Math.max(0, p.head.progress))) } as CSSProperties} />
          </span>
        ) : null}
        {p.head.tag}
      </div>
      <div className="pi-ribbon-track" ref={track}>
        <span className="pi-ribbon-line" aria-hidden="true" style={{ '--pi-line': routeLine(p.days) } as CSSProperties} />
        <span className="pi-ribbon-end" aria-hidden="true" />
        <ol className="pi-ribbon-days">
          {p.days.map((d, n) => (
            <li key={d.index} style={{ '--i': staggerStep(n) } as CSSProperties}>
              <button
                type="button"
                className={'pi-rib pi-rib--' + d.state + (d.status ? ' pi-rib--' + d.status : '')}
                aria-current={p.current === d.index ? 'true' : undefined}
                onFocus={event => { if (track.current) revealDay(track.current, event.currentTarget) }}
                onClick={() => { p.onPick(d.index) }}
              >
                <span className="pi-rib-top">
                  <span className="pi-rib-day">Day {d.index + 1}</span>
                  {d.state === 'locked'
                    ? <span className="pi-rib-lock" role="img" aria-label={DOT_LABEL.locked}><Lock size={12} aria-hidden /></span>
                    : <span className="pi-rib-dot" role="img" aria-label={DOT_LABEL[d.state]} />}
                </span>
                <span className="pi-rib-title">{d.title}</span>
                <span className="pi-rib-sub">
                  {d.state === 'locked' ? p.lockedWord
                    : d.status ? STATUS_WORD[d.status]
                    : `${d.placeCount} ${d.placeCount === 1 ? 'place' : 'places'}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
