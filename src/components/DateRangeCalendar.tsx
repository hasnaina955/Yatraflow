// ============ DateRangeCalendar — the Create-Trip range calendar, shared ============
// Extracted from CreateTrip (where it replaced two raw date inputs) so every
// date surface wears the same popup: one-month grid, capsule range banding,
// hover preview, outside-click/Esc close. Batch: "the calendar look should be
// everywhere there is a calendar popup" (#107 follow-up, on main).
import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Field } from './ui'

const CAL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CAL_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/** yyyy-mm-dd in local time — toISOString would drift by a day on IST evenings. */
export function isoDay(d: Date): string {
  const p = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fmtDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${CAL_MONTHS[m - 1]}`
}

/** One-month grid; first click sets the start, second sets the end (a day
 *  before the current start restarts the selection). Hover previews the range. */
export function DateRangeCalendar({ start, end, error, hint, label = 'Trip dates', disabled, registerRef, onChange }: {
  start: string
  end: string
  error?: string
  hint?: string
  label?: string
  disabled?: boolean
  registerRef?: (el: HTMLButtonElement | null) => void
  onChange: (next: { startDate: string; endDate: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState(() => {
    const t = new Date()
    return { y: t.getFullYear(), m: t.getMonth() }
  })
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  function toggle() {
    if (disabled) return
    const anchor = start || end
    if (anchor) {
      const [y, m] = anchor.split('-').map(Number)
      setView({ y, m: m - 1 })
    }
    setOpen(o => !o)
  }

  function pick(day: string) {
    if (!start || end || day < start) onChange({ startDate: day, endDate: '' })
    else onChange({ startDate: start, endDate: day })
  }

  function shiftMonth(delta: number) {
    setView(v => {
      const d = new Date(v.y, v.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const lead = new Date(view.y, view.m, 1).getDay()
  const lastDate = new Date(view.y, view.m + 1, 0).getDate()
  const today = isoDay(new Date())
  // Second edge is the real end, or the hovered day while choosing one.
  const endPreview = end || (start && hover && hover > start ? hover : '')
  const cells: Array<number | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: lastDate }, (_, i) => i + 1),
  ]
  const triggerLabel = start && end ? `${fmtDay(start)} – ${fmtDay(end)}` : start ? `${fmtDay(start)} – pick end day` : 'Choose your dates'

  return (
    <Field label={label} hint={hint} error={error}>
      <div className="cal-wrap" ref={wrapRef}>
        <button type="button" className="input cal-trigger" aria-expanded={open} aria-haspopup="dialog"
          disabled={disabled}
          ref={registerRef} onClick={toggle}>
          <Calendar size={14} aria-hidden />
          <span className={start && end ? undefined : 'muted'}>{triggerLabel}</span>
          <ChevronDown size={14} className="cal-caret" aria-hidden />
        </button>
        {open && (
          <div className="cal-pop popover" role="dialog" aria-label="Pick trip dates">
            <div className="cal-head">
              <button type="button" className="cal-nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={14} aria-hidden /></button>
              <b>{CAL_MONTHS[view.m]} {view.y}</b>
              <button type="button" className="cal-nav" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={14} aria-hidden /></button>
            </div>
            <div className="cal-grid">
              {CAL_WEEKDAYS.map((w, i) => <span key={`wd${i}`} className="cal-wd" aria-hidden>{w}</span>)}
              {cells.map((d, i) => {
                if (d == null) return <span key={`pad${i}`} />
                const iso = `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
                const isStart = iso === start
                const isEnd = iso === endPreview
                const edge = isStart || isEnd
                // Range reads as one capsule: the start day rounds left and the
                // end day rounds right, the band between them stays square.
                const cls = `${edge ? ' edge' : ''}${isStart ? ' edge-start' : ''}${isEnd ? ' edge-end' : ''}${!edge && endPreview && iso > start && iso < endPreview ? ' in-range' : ''}${iso === today ? ' today' : ''}`
                return (
                  <button key={iso} type="button" className={`cal-day${cls}`} aria-label={iso}
                    onMouseEnter={() => setHover(iso)} onMouseLeave={() => setHover(null)}
                    onClick={() => pick(iso)}>{d}</button>
                )
              })}
            </div>
            <p className="cal-hint">{start && !end ? 'Now pick the last day of the trip.' : 'Tap a start day, then an end day.'}</p>
          </div>
        )}
      </div>
    </Field>
  )
}
