// ============ Trip workspace — Budget tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
import { useState } from 'react'
import type { Trip, Expense } from '../../data/types'
import { addExpense, deleteExpense, restoreExpense } from '../../store/store'
import { computeTotals, getAssumptions, formatInr, minutesToHM, isRoundTrip } from '../../lib/engine'
import { Chip, Field, StatTile, toast, undoToast } from '../../components/ui'

// ================= Budget tab =================

const CAT_COLORS: Record<string, string> = {
  transport: '#149A90', accommodation: '#0B2545', food: '#F59E2D',
  activities: '#45566E', 'entry-fees': '#2E8B57', 'tolls-parking': '#8291A6',
  'local-travel': '#B47207', 'emergency-buffer': '#C93B3B',
}

export function BudgetTab({ trip, totals, editable }: { trip: Trip; totals: ReturnType<typeof computeTotals>; editable: boolean }) {
  const [form, setForm] = useState({ label: '', amount: 0, category: 'food', perPerson: false, optional: false, attachStop: '' })
  const budgetTotal = trip.budgetPerPersonInr * trip.travellers
  const pctUsed = Math.min(150, Math.round((totals.totalCostInr / Math.max(1, budgetTotal)) * 100))
  const cats = Object.entries(totals.byCategory).sort((a, b) => b[1] - a[1])
  const maxCatVal = cats.length ? cats[0][1] : 1
  const A = getAssumptions(trip)

  return (
    <div className="two-col">
      <div>
        <div className="card">
          <h2>Where the money goes</h2>
          <p className="hint-text" style={{ margin: '4px 0 14px' }}>
            {A.kmPerLiter
              ? <>All figures are estimates in INR. Transport is fuel-based: route distance{isRoundTrip(trip) ? ' (incl. return drive)' : ''} ≈{Math.round(totals.totalDistanceKm)} km ÷ {A.kmPerLiter} km/L ≈ <b>{Math.round(totals.totalDistanceKm / A.kmPerLiter)} L</b> of fuel × ₹{A.fuelPricePerL}/L ({A.fuelPriceIsUserSet ? 'your local pump price' : 'indicative petrol price — actual consumption varies'}).</>
              : <>All figures are estimates in INR. Transport is derived from route distance × ₹{A.inrPerKm}/km for {trip.transportMode}.</>}
          </p>
          <div className="budget-bars">
            {cats.map(([c, v]) => (
              <div key={c} className="budget-bar-row">
                <span>{labelCat(c)}</span>
                <div className="budget-bar-track">
                  <div className="budget-bar-fill" style={{ width: `${(v / maxCatVal) * 100}%`, background: CAT_COLORS[c] ?? '#45566E' }} />
                </div>
                <b>{formatInr(v)}</b>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Essential vs optional</h2>
          <hr className="divider" />
          <div className="budget-bars">
            <div className="budget-bar-row">
              <span>Essential</span>
              <div className="budget-bar-track"><div className="budget-bar-fill" style={{ width: `${(totals.essentialInr / Math.max(1, totals.totalCostInr)) * 100}%`, background: '#149A90' }} /></div>
              <b>{formatInr(totals.essentialInr)}</b>
            </div>
            <div className="budget-bar-row">
              <span>Optional</span>
              <div className="budget-bar-track"><div className="budget-bar-fill" style={{ width: `${(totals.optionalInr / Math.max(1, totals.totalCostInr)) * 100}%`, background: '#F59E2D' }} /></div>
              <b>{formatInr(totals.optionalInr)}</b>
            </div>
          </div>
          <p className="hint-text" style={{ marginTop: 10 }}>Optional includes buffers & shopping that you can trim to save.</p>
        </div>

        <div className="card">
          <h2>Expense lines</h2>
          <hr className="divider" />
          {trip.expenses.length === 0 ? <p className="muted small">No expense lines yet.</p> : (
            <table className="compare-table">
              <thead><tr><th>Item</th><th>Category</th><th className="num">Amount</th><th /></tr></thead>
              <tbody>
                {trip.expenses.map(e => (
                  <tr key={e.id}>
                    <td>{e.label}{e.perPerson && <span className="chip chip-info" style={{ marginLeft: 6 }}>per person</span>}{e.optional && <span className="chip chip-saffron" style={{ marginLeft: 6 }}>optional</span>}</td>
                    <td><Chip tone="info">{labelCat(e.category)}</Chip></td>
                    <td className="num">{formatInr(e.amountInr * (e.perPerson ? trip.travellers : 1))}</td>
                    <td>{editable && (
                      <button className="icon-btn" aria-label="Delete expense" onClick={() => {
                        const idx = trip.expenses.findIndex(x => x.id === e.id)
                        deleteExpense(trip.id, e.id)
                        undoToast(`Removed “${e.label}”`, () => {
                          restoreExpense(trip.id, e, idx)
                          toast(`Restored “${e.label}”`)
                        })
                      }}>🗑️</button>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {editable && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: 14 }}>+ Add expense line</summary>
              <div style={{ marginTop: 12 }}>
                <Field label="Label"><input className="input" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Kayaking session" /></Field>
                <div className="form-row">
                  <Field label="Amount (₹)"><input type="number" min={0} className="input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))} /></Field>
                  <Field label="Category">
                    <select className="select" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                      {['transport', 'accommodation', 'food', 'activities', 'entry-fees', 'tolls-parking', 'local-travel', 'emergency-buffer'].map(c => <option key={c} value={c}>{labelCat(c)}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="chip-row" style={{ margin: '4px 0 12px' }}>
                  <Chip onClick={() => setForm(f => ({ ...f, perPerson: !f.perPerson }))} active={form.perPerson}>Per person</Chip>
                  <Chip onClick={() => setForm(f => ({ ...f, optional: !f.optional }))} active={form.optional}>Optional</Chip>
                </div>
                <Field label="Attach to stop (optional)">
                  <select className="select" value={form.attachStop} onChange={e => setForm(f => ({ ...f, attachStop: e.target.value }))}>
                    <option value="">— none —</option>
                    {trip.days.flatMap(d => d.stops.map(s => <option key={s.id} value={s.id}>{`Day ${d.index + 1}: ${s.title}`}</option>))}
                  </select>
                </Field>
                <button className="btn btn-primary btn-sm" onClick={() => {
                  if (!form.label.trim() || !form.amount) { toast('Enter a label and an amount.', 'err'); return }
                  addExpense(trip.id, {
                    label: form.label.trim(),
                    category: form.category as Expense['category'],
                    amountInr: form.amount,
                    perPerson: form.perPerson,
                    optional: form.optional,
                    stopId: form.attachStop || undefined,
                  })
                  setForm({ label: '', amount: 0, category: 'food', perPerson: false, optional: false, attachStop: '' })
                  toast('Expense added')
                }}>Save expense</button>
              </div>
            </details>
          )}
        </div>
        <div className="budget-reassure">
          <b>✦ Keep estimates honest</b>
          <span>When you move a stop or pick a different stay, YatraFlow previews the new total before you save.</span>
        </div>
      </div>

      <div>
        <div className="budget-hero">
          <span className="budget-hero-label">Total trip estimate</span>
          <div className="budget-hero-num">{formatInr(totals.totalCostInr)}</div>
          <div className="budget-hero-sub">
            {formatInr(totals.costPerPersonInr)} per person · target {formatInr(trip.budgetPerPersonInr)}/head · {formatInr(totals.costPerDayInr)}/day
          </div>
          <div className="budget-bar-track" style={{ marginTop: 10 }}>
            <div className="budget-bar-fill" style={{ width: `${Math.min(100, pctUsed)}%`, background: pctUsed > 100 ? 'var(--danger)' : pctUsed > 85 ? 'var(--saffron)' : 'var(--teal)' }} />
          </div>
          <div className="budget-hero-pct">
            {pctUsed}% of group budget{pctUsed > 100 ? ' — over budget; trim optional lines' : pctUsed > 85 ? ' — getting close' : ''}
          </div>
        </div>
        <div className="stat-grid" style={{ gridTemplateColumns: '1fr' }}>
          <StatTile label="Per day" value={formatInr(totals.costPerDayInr)} />
          <StatTile label="Optional spending" value={formatInr(totals.optionalInr)} sub={`${formatInr(totals.essentialInr)} essential`} />
        </div>

        <div className="card" style={{ marginTop: 14 }}>
          <h2>Plan snapshot</h2>
          <p className="hint-text" style={{ margin: '6px 0 10px' }}>The numbers behind this estimate right now.</p>
          <table className="compare-table">
            <thead><tr><th>Metric</th><th className="num">Value</th></tr></thead>
            <tbody>
              <tr><td>Total cost</td><td className="num">{formatInr(totals.totalCostInr)}</td></tr>
              <tr><td>Essential cost</td><td className="num">{formatInr(totals.essentialInr)}</td></tr>
              <tr><td>Optional cost</td><td className="num">{formatInr(totals.optionalInr)}</td></tr>
              <tr><td>Total travel time</td><td className="num">{minutesToHM(totals.totalTravelMinutes)}</td></tr>
              <tr><td>Active stops</td><td className="num">{totals.stopCount}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function labelCat(c: string): string { return c.replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) }
