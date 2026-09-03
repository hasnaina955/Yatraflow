// ============ Plan Bench — homepage what-if cost calculator (issue #37) ============
// Interactive bill on the Landing page. Every line renders its own formula —
// the transparency promise is the feature. Stateless hand-off: the CTA stashes
// the inputs into sessionStorage and CreateTrip reads them once on mount.
// Inputs also persist to localStorage (view-prefs pattern) so returning
// visitors resume where they left off.
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatInr, MODE_SPEED, MODE_COST_PER_KM } from '../lib/engine'
import {
  BENCH_MODES, BENCH_DEFAULTS, BENCH_PRESETS, STAY_STYLES,
  STAY_RATE_PER_NIGHT, MEALS_PER_HEAD_DAY,
  computeBenchBill, isBenchFuelMode, stashBenchPrefill,
  loadBenchInputs, saveBenchInputs, benchInputsEqual, formatBenchShareText,
  type BenchMode, type BenchStayStyle, type BenchInputs,
} from '../lib/planBench'

/** rAF count-up for the money figures — instant under prefers-reduced-motion. */
function useCountUp(target: number, duration = 450): number {
  const [display, setDisplay] = useState(target)
  const displayRef = useRef(target)
  displayRef.current = display
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  useEffect(() => {
    if (reduced || !Number.isFinite(target)) { setDisplay(target); return }
    const from = displayRef.current
    if (from === target) return
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(from + (target - from) * eased))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced, duration])
  return display
}

/** ₹ in compact notation for the preset chips ("≈ ₹7.3k/head"). */
function shortInr(v: number): string {
  return v >= 1000 ? `₹${(Math.round(v / 100) / 10).toFixed(1).replace(/\.0$/, '')}k` : `₹${v}`
}

function modeHint(m: BenchMode): string {
  const speed = MODE_SPEED[m] ?? 40
  return isBenchFuelMode(m)
    ? `≈ ${speed} km/h average · you pay for fuel`
    : `≈ ${speed} km/h average · × ₹${MODE_COST_PER_KM[m]}/km fare`
}

export function PlanBench() {
  const [input, setInput] = useState<BenchInputs>(() => loadBenchInputs() ?? BENCH_DEFAULTS)
  const [copied, setCopied] = useState(false)
  const [surpriseCooldown, setSurpriseCooldown] = useState(false)
  const bill = useMemo(() => computeBenchBill(input), [input])
  const totalShown = useCountUp(bill.total)
  const perHeadShown = useCountUp(bill.perHead)
  const dirty = !benchInputsEqual(input, BENCH_DEFAULTS)

  // One exit-swept timer list: surprise cooldown + copy-flash never fire on a
  // dead component.
  const timersRef = useRef<number[]>([])
  useEffect(() => () => { timersRef.current.forEach(clearTimeout) }, [])
  function later(fn: () => void, ms: number) {
    timersRef.current.push(window.setTimeout(fn, ms))
  }

  // Persist the dials so a returning visitor picks up where they left off.
  useEffect(() => { saveBenchInputs(input) }, [input])

  const issued = useMemo(
    () => new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    []
  )
  const presetPerHead = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of BENCH_PRESETS) {
      m.set(p.label, computeBenchBill({ ...BENCH_DEFAULTS, km: p.km, mode: p.mode, nights: p.nights, crew: p.crew, roundTrip: p.roundTrip }).perHead)
    }
    return m
  }, [])

  function patch(p: Partial<BenchInputs>) {
    setInput(prev => ({ ...prev, ...p }))
  }

  function applyPreset(p: typeof BENCH_PRESETS[number]) {
    setInput(prev => ({
      ...prev, km: p.km, mode: p.mode, nights: p.nights, crew: p.crew, roundTrip: p.roundTrip,
    }))
  }

  function surpriseMe() {
    if (surpriseCooldown) return
    const preset = BENCH_PRESETS[Math.floor(Math.random() * BENCH_PRESETS.length)]
    const stays: BenchStayStyle[] = ['budget', 'comfort', 'luxury']
    setInput(prev => ({
      ...prev,
      km: preset.km, mode: preset.mode, nights: preset.nights, crew: preset.crew,
      roundTrip: Math.random() > 0.4,
      stay: stays[Math.floor(Math.random() * 3)],
      kmPerL: preset.mode === 'motorcycle' ? 25 + Math.floor(Math.random() * 20) : 10 + Math.floor(Math.random() * 15),
      inrPerL: 95 + Math.floor(Math.random() * 20),
    }))
    setSurpriseCooldown(true)
    later(() => setSurpriseCooldown(false), 600)
  }

  function resetAll() {
    setInput(BENCH_DEFAULTS)
  }

  async function copyBill() {
    try {
      await navigator.clipboard.writeText(formatBenchShareText(bill, input))
      setCopied(true)
      later(() => setCopied(false), 1600)
    } catch { /* clipboard unavailable — the receipt is on screen anyway */ }
  }

  function handleCta() {
    stashBenchPrefill(bill, input)
    window.location.hash = '#/create'
  }

  const fuelMode = isBenchFuelMode(input.mode)
  const rideWord = input.mode === 'bus' || input.mode === 'train' ? 'on the move' : 'driving'
  const pct = (v: number) => Math.round((v / bill.total) * 100) || 0

  return (
    <section className="container plan-bench" id="plan-bench" aria-label="Trip cost calculator">
      <p className="small" style={{ textAlign: 'center', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--yf-teal-600)', marginBottom: 6 }}>
        Plan Bench
      </p>
      <h2 className="section-title" style={{ marginBottom: 4 }}>
        What will your road trip <em>actually</em> cost?
      </h2>
      <p className="small muted" style={{ textAlign: 'center', maxWidth: 560, margin: '0 auto 18px' }}>
        Distance, mode, crew, stay — dial it in and watch every rupee explain itself. Then take the whole bill straight into a real plan.
      </p>
      <div className="bench-preset-row">
        {BENCH_PRESETS.map(p => {
          const active = input.km === p.km && input.mode === p.mode && input.nights === p.nights && input.crew === p.crew && input.roundTrip === p.roundTrip
          return (
            <button key={p.label} type="button" className={`chip ${active ? 'chip-teal' : 'chip-outline'}`} onClick={() => applyPreset(p)}>
              {p.label} · {p.km} km · ≈{shortInr(presetPerHead.get(p.label) ?? 0)}/head
            </button>
          )
        })}
        <button type="button" className="chip chip-saffron bench-surprise" onClick={surpriseMe} disabled={surpriseCooldown} aria-label="Surprise me with a random trip">
          🎲 Surprise me
        </button>
        {dirty && (
          <button type="button" className="chip chip-outline" onClick={resetAll} aria-label="Reset the calculator to defaults">
            ↺ Reset
          </button>
        )}
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
            <div className="bench-seg-row">
              <div className="bench-seg" role="group" aria-label="Trip direction">
                <button type="button" className={!input.roundTrip ? 'on' : ''} aria-pressed={!input.roundTrip}
                  onClick={() => patch({ roundTrip: false })}>One way</button>
                <button type="button" className={input.roundTrip ? 'on' : ''} aria-pressed={input.roundTrip}
                  onClick={() => patch({ roundTrip: true })}>Round trip</button>
              </div>
              <span className="bench-seg-badge">{bill.roadKm} km on the road</span>
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
            <p className="bench-hint">{modeHint(input.mode)}</p>
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
                  <span className="bench-crew-emoji" aria-hidden="true">{n <= 2 ? '👤' : n <= 4 ? '👥' : '👨‍👩‍👧'}</span>
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
          {fuelMode && (<>
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

        <div className="bench-receipt card">
          <span className="bench-stamp" aria-hidden="true">ESTIMATE</span>
          <div className="bench-receipt-head">
            <span className="bench-receipt-kicker">YATRAFLOW · TRIP ESTIMATE</span>
            <span className="bench-receipt-date">{issued}</span>
          </div>
          <div className="bench-total" aria-live="polite">
            <div className="bench-total-label">Estimated total</div>
            <div className="bench-total-main">
              {formatInr(totalShown)}
              <small>₹{formatInr(perHeadShown)} / person</small>
            </div>
            <span className="bench-total-sub">{bill.roadKm} km · {bill.days} days · {input.crew} travellers · {input.mode}</span>
          </div>
          <div className="bench-split" role="img" aria-label={`Cost split: ${pct(bill.transportCost)}% transport, ${pct(bill.stayCost)}% stay, ${pct(bill.mealCost)}% food`}>
            <div className="bench-split-bar bench-split-transport" style={{ width: `${pct(bill.transportCost)}%` }}>
              {pct(bill.transportCost) > 15 && <span>{pct(bill.transportCost)}%</span>}
            </div>
            <div className="bench-split-bar bench-split-stay" style={{ width: `${pct(bill.stayCost)}%` }}>
              {pct(bill.stayCost) > 15 && <span>{pct(bill.stayCost)}%</span>}
            </div>
            <div className="bench-split-bar bench-split-meal" style={{ width: `${pct(bill.mealCost)}%` }}>
              {pct(bill.mealCost) > 15 && <span>{pct(bill.mealCost)}%</span>}
            </div>
          </div>
          <div className="bench-split-legend">
            <span><span className="dot dot-transport" /> Transport</span>
            <span><span className="dot dot-stay" /> Stay</span>
            <span><span className="dot dot-meal" /> Food</span>
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
                {bill.wheelHours < 1 ? 'Under 1h' : `~${Math.round(bill.wheelHours)}h`} {rideWord} over {bill.days} days
                {bill.hoursPerDay > 0 && ` · ~${bill.hoursPerDay.toFixed(1)}h/day`}
              </span>
            </div>
          </div>
          <div className="bench-cta-row">
            <button type="button" className="btn btn-primary btn-lg bench-cta" onClick={handleCta}>
              Plan this trip for real →
            </button>
            <a className="bench-alt-link" href="#/explore">or browse ready itineraries →</a>
          </div>
          <div className="bench-receipt-actions">
            <button type="button" className="chip chip-outline" onClick={copyBill}>
              {copied ? '✓ Copied to clipboard' : '⧉ Copy bill as text'}
            </button>
          </div>
          <p className="bench-fineprint">
            We pre-fill your new trip with these numbers · excludes tolls, parking & entry fees · stay ₹{STAY_RATE_PER_NIGHT[input.stay]}/room-night, 2 per room · food ₹{MEALS_PER_HEAD_DAY}/head/day
          </p>
        </div>
      </div>
    </section>
  )
}
