// ============ Plan Bench — homepage what-if cost calculator (issue #37) ============
// Interactive bill on the Landing page. Every line renders its own formula —
// the transparency promise is the feature. Stateless hand-off: the CTA stashes
// the inputs into sessionStorage and CreateTrip reads them once on mount.
import { useMemo, useState } from 'react'
import { formatInr } from '../lib/engine'
import {
  BENCH_MODES, BENCH_DEFAULTS, BENCH_PRESETS, STAY_STYLES,
  computeBenchBill, isBenchFuelMode, stashBenchPrefill,
  type BenchMode, type BenchStayStyle, type BenchInputs,
} from '../lib/planBench'

export function PlanBench() {
  const [input, setInput] = useState<BenchInputs>(BENCH_DEFAULTS)
  const [dialKey, setDialKey] = useState(0)
  const [surpriseCooldown, setSurpriseCooldown] = useState(false)
  const bill = useMemo(() => computeBenchBill(input), [input])

  function patch(p: Partial<BenchInputs>) {
    setInput(prev => ({ ...prev, ...p }))
    setDialKey(k => k + 1)
  }

  function applyPreset(p: typeof BENCH_PRESETS[number]) {
    setInput(prev => ({
      ...prev, km: p.km, mode: p.mode, nights: p.nights, crew: p.crew,
    }))
    setDialKey(k => k + 1)
  }

  function surpriseMe() {
    if (surpriseCooldown) return
    const preset = BENCH_PRESETS[Math.floor(Math.random() * BENCH_PRESETS.length)]
    const stays: BenchStayStyle[] = ['budget', 'comfort', 'luxury']
    setInput(prev => ({
      ...prev, ...preset, stay: stays[Math.floor(Math.random() * 3)],
      roundTrip: Math.random() > 0.4,
      kmPerL: 10 + Math.floor(Math.random() * 25),
      inrPerL: 95 + Math.floor(Math.random() * 20),
    }))
    setDialKey(k => k + 1)
    setSurpriseCooldown(true)
    setTimeout(() => setSurpriseCooldown(false), 600)
  }

  function handleCta() {
    stashBenchPrefill(bill, input)
    window.location.hash = '#/create'
  }

  const fuelMode = isBenchFuelMode(input.mode)
  const pct = (v: number) => Math.round((v / bill.total) * 100) || 0

  return (
    <section className="container plan-bench" aria-label="Trip cost calculator">
      <p className="small" style={{ textAlign: 'center', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--yf-teal-600)', marginBottom: 6 }}>
        Plan Bench
      </p>
      <h2 className="section-title" style={{ marginBottom: 4 }}>
        See the honest bill before you plan
      </h2>
      <p className="small muted" style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 18px' }}>
        Pick a route or dial in your own numbers — every cost shows its maths, so you know exactly what you're signing up for.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
        {BENCH_PRESETS.map(p => {
          const active = input.km === p.km && input.mode === p.mode && input.nights === p.nights && input.crew === p.crew
          return (
            <button key={p.label} type="button" className={`chip ${active ? 'chip-teal' : 'chip-outline'}`} onClick={() => applyPreset(p)}>
              {p.label} · {p.km} km
            </button>
          )
        })}
        <button type="button" className="chip chip-saffron" onClick={surpriseMe} disabled={surpriseCooldown} aria-label="Surprise me with a random trip">
          🎲 Surprise me
        </button>
      </div>
      <div className="bench-grid">
        <div className="bench-controls">
          <div className="bench-control-block">
            <div className="bench-range-row">
              <div className="bench-range-head">
                <span className="bench-control-label">One-way distance</span>
                <span className="bench-range-value">{input.km} km</span>
              </div>
              <input type="range" className="yf-range" min={100} max={900} step={10} value={input.km}
                style={{ '--fill': `${((input.km - 100) / 800) * 100}%` } as React.CSSProperties}
                onChange={e => patch({ km: Number(e.target.value) })} aria-label="One-way distance in kilometres" />
            </div>
            <div className="bench-toggle-row">
              <button type="button" role="switch" aria-checked={input.roundTrip}
                className={`bench-switch ${input.roundTrip ? 'on' : ''}`}
                onClick={() => patch({ roundTrip: !input.roundTrip })}>
                <span className="bench-switch-knob" />
              </button>
              <span className="bench-toggle-hint">Return trip {input.roundTrip ? `· ${bill.roadKm} km total` : '· one way'}</span>
            </div>
          </div>
          <div className="bench-control-block">
            <span className="bench-control-label">How you travel</span>
            <div className="bench-pills">
              {BENCH_MODES.map(m => (
                <button key={m} type="button" className={`bench-pill ${input.mode === m ? 'on' : ''}`}
                  aria-pressed={input.mode === m} onClick={() => patch({ mode: m })}>
                  {m === 'motorcycle' ? '🏍️' : m === 'car' ? '🚗' : m === 'bus' ? '🚌' : '🚆'} {m}
                </button>
              ))}
            </div>
          </div>
          <div className="bench-control-block">
            <span className="bench-control-label">Stay style</span>
            <div className="bench-pills">
              {STAY_STYLES.map(s => (
                <button key={s} type="button" className={`bench-pill ${input.stay === s ? 'on' : ''}`}
                  aria-pressed={input.stay === s} onClick={() => patch({ stay: s })}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="bench-control-block">
            <span className="bench-control-label">Travellers ({input.crew})</span>
            <div className="bench-crew">
              {Array.from({ length: 8 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" className={`bench-crew-btn ${input.crew === n ? 'on' : ''}`}
                  aria-pressed={input.crew === n} onClick={() => patch({ crew: n })}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="bench-control-block">
            <div className="bench-range-head">
              <span className="bench-control-label">Nights</span>
              <span className="bench-range-value">{input.nights} ({bill.days} days)</span>
            </div>
            <input type="range" className="yf-range" min={1} max={7} step={1} value={input.nights}
              style={{ '--fill': `${((input.nights - 1) / 6) * 100}%` } as React.CSSProperties}
              onChange={e => patch({ nights: Number(e.target.value) })} aria-label="Number of nights" />
          </div>
          {isBenchFuelMode(input.mode) && (<>
            <div className="bench-control-block">
              <div className="bench-range-head">
                <span className="bench-control-label">Fuel economy</span>
                <span className="bench-range-value">{input.kmPerL} km/L</span>
              </div>
              <input type="range" className="yf-range" min={2} max={80} step={1} value={input.kmPerL}
                style={{ '--fill': `${((input.kmPerL - 2) / 78) * 100}%` } as React.CSSProperties}
                onChange={e => patch({ kmPerL: Number(e.target.value) })} aria-label="Fuel economy in kilometres per litre" />
            </div>
            <div className="bench-control-block">
              <div className="bench-range-head">
                <span className="bench-control-label">Fuel price</span>
                <span className="bench-range-value">₹{input.inrPerL}/L</span>
              </div>
              <input type="range" className="yf-range" min={50} max={250} step={1} value={input.inrPerL}
                style={{ '--fill': `${((input.inrPerL - 50) / 200) * 100}%` } as React.CSSProperties}
                onChange={e => patch({ inrPerL: Number(e.target.value) })} aria-label="Fuel price in rupees per litre" />
            </div>
          </>)}
        </div>

        <div className="bench-receipt card" aria-live="polite">
          <div className="bench-total">
            <div className="bench-total-label">Estimated total</div>
            <div className={`bench-total-main ${dialKey > 0 ? 'flash-num' : ''}`} key={dialKey}>
              {formatInr(bill.total)}
              <small>₹{formatInr(bill.perHead)} / person</small>
            </div>
            <span className="bench-total-sub">{bill.roadKm} km · {bill.days} days · {input.crew} travellers · {input.mode}</span>
          </div>
          <div className="bench-split" role="img" aria-label={`Cost split: ${pct(bill.transportCost)}% transport, ${pct(bill.stayCost)}% stay, ${pct(bill.mealCost)}% food`}>
            <div className="bench-split-bar bench-split-transport" style={{ width: `${pct(bill.transportCost)}%` }} />
            <div className="bench-split-bar bench-split-stay" style={{ width: `${pct(bill.stayCost)}%` }} />
            <div className="bench-split-bar bench-split-meal" style={{ width: `${pct(bill.mealCost)}%` }} />
          </div>
          <div className="bench-split-legend">
            <span><span className="dot dot-transport" /> Transport {pct(bill.transportCost)}%</span>
            <span><span className="dot dot-stay" /> Stay {pct(bill.stayCost)}%</span>
            <span><span className="dot dot-meal" /> Food {pct(bill.mealCost)}%</span>
          </div>
          <div className="bench-receipt-lines">
            <div className="bench-line">
              <div className="bench-line-head"><span>🚗 Transport</span><b>{formatInr(bill.transportCost)}</b></div>
              <span className="bench-line-formula">{bill.transportFormula}</span>
            </div>
            <div className="bench-line">
              <div className="bench-line-head"><span>🏨 Stay ({bill.rooms} room{bill.rooms === 1 ? '' : 's'})</span><b>{formatInr(bill.stayCost)}</b></div>
              <span className="bench-line-formula">{bill.stayFormula}</span>
            </div>
            <div className="bench-line">
              <div className="bench-line-head"><span>🍛 Food</span><b>{formatInr(bill.mealCost)}</b></div>
              <span className="bench-line-formula">{bill.mealFormula}</span>
            </div>
          </div>
          <div className="bench-receipt-rules" />
          <div className="bench-fatigue">
            <span className={`bench-fatigue-ico tone-${bill.fatigue.tone}`} aria-hidden="true">
              {bill.fatigue.tone === 'calm' ? '🌿' : bill.fatigue.tone === 'warn' ? '⏱️' : '🔥'}
            </span>
            <div>
              <span className="bench-fatigue-title">{bill.fatigue.verdict}</span>
              <span className="bench-line-formula">
                {bill.wheelHours < 1 ? 'Under 1h' : `~${Math.round(bill.wheelHours)}h`} driving over {bill.days} days
                {bill.hoursPerDay > 0 && ` · ~${bill.hoursPerDay.toFixed(1)}h/day`}
              </span>
            </div>
          </div>
          <button type="button" className="btn btn-primary btn-lg bench-cta" onClick={handleCta}>
            Create a real plan with these numbers →
          </button>
          <p className="small muted" style={{ marginTop: 8, textAlign: 'center' }}>
            We'll pre-fill your new trip with these numbers — change anything you like.
          </p>
        </div>
      </div>
    </section>
  )
}