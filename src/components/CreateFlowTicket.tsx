import { Calendar, Check, Clock, Route, TriangleAlert, Users, Wallet } from 'lucide-react'
import { modeIcon } from './icons'
import { CoverMedia } from './CoverMedia'
import type { ReactNode } from 'react'
import type { TransportMode } from '../data/types'
import type { CreateStep } from '../lib/createSteps'
import type { CoverPlan } from '../lib/regionArt'

export interface CreateFlowTicketProps {
  title: string
  route: string
  dates: string
  departure: string
  mode: TransportMode
  travel: string
  fuel: string
  party: string
  budget: string
  total: number | null
  perHead: number | null
  failed: boolean
  review: boolean
  /** The same cover the created trip, the long-form ticket and the dock show:
   *  coverPlanFor() resolved from the real current draft route, with the
   *  user-cover -> scene -> emoji fallback. */
  cover: CoverPlan
  onChange: (step: CreateStep) => void
}

export function CreateFlowTicket(p: CreateFlowTicketProps) {
  const rows: { step: CreateStep; icon: ReactNode; label: string; value: string }[] = [
    { step: 'where', icon: <Route size={16} />, label: 'Route', value: p.route },
    { step: 'when', icon: <Calendar size={16} />, label: 'Dates', value: p.dates },
    { step: 'when', icon: <Clock size={16} />, label: 'Departure time', value: p.departure || '08:30 by default' },
    { step: 'how', icon: modeIcon(p.mode, 16), label: p.travel, value: p.fuel || p.travel },
    { step: 'who', icon: <Users size={16} />, label: 'Party', value: p.party },
    { step: 'budget', icon: <Wallet size={16} />, label: 'Budget', value: p.budget },
  ]
  return <div className="gcf-ticket ctk">
    <div className="gcf-ticket-head"><b>Yatra<span>Flow</span></b><span>Trip ticket</span></div>
    <div className="ctk__cover">
      <CoverMedia
        plan={p.cover}
        ratio="340:112"
        sizes="(min-width: 1024px) 340px, (min-width: 700px) 280px, 92vw"
        className="ctk__scenery"
        emojiClassName="ctk__emoji"
        alt=""
      />
      <span className="ctk__perf" aria-hidden="true" />
    </div>
    <div className="gcf-ticket-body">
      <h3>{p.title}</h3>
      <svg className="gcf-route-line" viewBox="0 0 280 32" aria-hidden="true"><path d="M8 16H272" stroke="var(--pw-route)" strokeWidth="3" /><circle cx="8" cy="16" r="6" fill="var(--pw-sea-700)" /><circle cx="140" cy="16" r="5" fill="var(--pw-card)" stroke="var(--pw-marigold-500)" strokeWidth="2.5" /><circle cx="272" cy="16" r="5" fill="var(--pw-marigold-500)" /></svg>
      <dl className="gcf-ticket-rows">{rows.map((row, i) => <div className="gcf-ticket-row" key={i}>
        <span className="gcf-ticket-icon" aria-hidden>{row.icon}</span>
        <div><dt>{row.label}</dt><dd>{row.value}</dd></div>
        {p.review && <button type="button" onClick={() => { p.onChange(row.step) }}>Change<span className="sr-only"> {row.label}</span></button>}
      </div>)}</dl>
    </div>
    <div className="gcf-ticket-bill" role="status">
      {p.failed ? <><b>Trip not created yet</b><p>Your answers are still here. Try again.</p></> : p.perHead != null && p.total != null ? <>
        <div className="gcf-ticket-total"><span>Total for {p.party}</span><b>₹{Math.round(p.total).toLocaleString('en-IN')}</b></div>
        <p className="gcf-ticket-price">₹{Math.round(p.perHead).toLocaleString('en-IN')} <span>per person</span></p>
        <p>An estimate for planning. It is not a booking.</p>
      </> : <><b>Not priced yet</b><p>Add dates and a mapped stop to see the bill.</p></>}
    </div>
  </div>
}

export interface CreateFlowBillProps {
  days: number
  travellers: number
  /** The engine's per-head estimate, or null when the trip cannot be priced. */
  perHead: number | null
  /** The traveller's budget per person, compared with the estimate. */
  budgetPerHead: number
  transport: number | null
  stay: number | null
  meal: number | null
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

/** The Review step's rough bill. Every figure is the same `bill` value the
 *  ticket reads: three real categories, no invented fourth. A trip the engine
 *  cannot price says so instead of drawing an empty bar. */
export function CreateFlowBill(p: CreateFlowBillProps) {
  const priced = p.perHead != null && Number.isFinite(p.perHead) && p.perHead > 0
  const party = `${p.travellers} traveller${p.travellers === 1 ? '' : 's'}`
  const span = p.days > 0 ? `${p.days} day${p.days === 1 ? '' : 's'} · ${party}` : party
  if (!priced || p.perHead == null) {
    return <section className="cfb cfb--empty" aria-label="Rough bill">
      <div className="cfb__head"><span className="cfb__kicker">Rough bill</span><span>{span}</span></div>
      <p className="cfb__none"><b>Not priced yet</b> Add dates and a mapped stop to see the bill.</p>
    </section>
  }
  const parts = [
    { key: 'stay', label: 'Stays', value: p.stay },
    { key: 'transport', label: 'Transport', value: p.transport },
    { key: 'food', label: 'Food', value: p.meal },
  ]
  const drawn = parts.filter(x => x.value != null && x.value > 0)
  const sum = drawn.reduce((acc, x) => acc + (x.value ?? 0), 0)
  const label = drawn.map(x => `${x.label.toLowerCase()} ${Math.round(((x.value ?? 0) / sum) * 100)}%`).join(', ')
  const head = Math.round(p.perHead)
  const hasBudget = Number.isFinite(p.budgetPerHead) && p.budgetPerHead > 0
  const gap = head - Math.round(p.budgetPerHead)
  const over = hasBudget && gap > 0
  const verdict = !hasBudget ? `${inr(head)} a head. Set a budget to compare it.`
    : gap === 0 ? `${inr(head)} a head, right on your ${inr(p.budgetPerHead)} budget.`
    : `${inr(head)} a head, ${inr(Math.abs(gap))} ${over ? 'over' : 'under'} your ${inr(p.budgetPerHead)} budget.`
  return <section className="cfb" aria-label="Rough bill">
    <div className="cfb__head"><span className="cfb__kicker">Rough bill</span><span>{span}</span></div>
    {sum > 0 && <div className="cfb__bar" role="img" aria-label={label}>
      {drawn.map(x => <span key={x.key} className={`cfb__seg cfb__seg--${x.key}`} style={{ flexGrow: x.value ?? 0 }} />)}
    </div>}
    <ul className="cfb__legend">
      {parts.map(x => <li key={x.key}><i className={`cfb__dot cfb__seg--${x.key}`} aria-hidden="true" />{x.label} {x.value != null ? inr(x.value) : 'Not priced'}</li>)}
    </ul>
    <p className={`cfb__verdict${over ? ' cfb__verdict--over' : ''}`} role="status">{over ? <TriangleAlert size={18} aria-hidden /> : <Check size={18} aria-hidden />}<span>{verdict}</span></p>
    <p className="cfb__note">Excludes tolls, parking and entry fees.</p>
  </section>
}
