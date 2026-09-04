// ============ Plan Bench — homepage what-if cost calculator (issue #37) ============
// Interactive bill on the Landing page. Every line renders its own formula —
// the transparency promise is the feature. Stateless hand-off: the CTA stashes
// the inputs into sessionStorage and CreateTrip reads them once on mount.
// Inputs also persist to localStorage (view-prefs pattern) so returning
// visitors resume where they left off.
//
// Motion system: odometer digit rolls, scroll-in choreography, stamp thud,
// reprint flicker, reset tear-off, surprise slot-machine, copy confetti,
// receipt tilt, and mobile haptics (lib/haptics). Every animated path is
// gated behind prefers-reduced-motion; the reduced path is instant swaps.
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BedDouble, Bike, Bus, Car, Check, Copy, Dices, ReceiptText, RotateCcw,
  TrainFront, UtensilsCrossed, User, Users,
} from 'lucide-react'
import { formatInr, MODE_SPEED, MODE_COST_PER_KM } from '../lib/engine'
import {
  BENCH_MODES, BENCH_DEFAULTS, BENCH_PRESETS, STAY_STYLES,
  STAY_RATE_PER_NIGHT, MEALS_PER_HEAD_DAY,
  computeBenchBill, isBenchFuelMode, stashBenchPrefill,
  loadBenchInputs, saveBenchInputs, benchInputsEqual, formatBenchShareText,
  type BenchMode, type BenchStayStyle, type BenchInputs,
} from '../lib/planBench'
import { haptic, HAPTIC } from '../lib/haptics'

const ODO_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]

/** Reactive matchMedia — used for reduced-motion and pointer-fine gates. */
function useMedia(query: string, initial = false): boolean {
  const [matches, setMatches] = useState(initial)
  useEffect(() => {
    const mq = window.matchMedia(query)
    setMatches(mq.matches)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [query])
  return matches
}

/** Odometer-style money figure: each digit is a vertical 0–9 strip that rolls
 *  into place (masked edges, springy overshoot). Non-digits (₹, commas) sit
 *  static. Reduced-motion users get the plain number. */
function Odometer({ value, animate }: { value: string; animate: boolean }) {
  if (!animate) return <span className="odo">{value}</span>
  return (
    <span className="odo" aria-hidden="true">
      {value.split('').map((ch, i) => /^\d/.test(ch) ? (
        <span key={i} className="odo-digit">
          <span className="odo-strip" style={{ transform: `translateY(${Number(ch) * -1}em)` }}>
            {ODO_DIGITS.map(n => <span key={n} className="odo-num">{n}</span>)}
          </span>
        </span>
      ) : (
        <span key={i} className="odo-char">{ch}</span>
      ))}
    </span>
  )
}

/** Fatigue needle gauge: semicircular arc, needle sweeps to hours/day. */
function FatigueGauge({ hoursPerDay, tone }: { hoursPerDay: number; tone: 'calm' | 'warn' | 'hot' }) {
  const clamped = Math.max(0, Math.min(10, hoursPerDay))
  const angle = -90 + (clamped / 10) * 180
  return (
    <svg className={`bench-gauge tone-${tone}`} viewBox="0 0 120 64" aria-hidden="true">
      <defs>
        <linearGradient id="benchGaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2f9e8f" />
          <stop offset="55%" stopColor="#F3AA3D" />
          <stop offset="100%" stopColor="#e05656" />
        </linearGradient>
      </defs>
      <path d="M 12 58 A 48 48 0 0 1 108 58" fill="none" stroke="url(#benchGaugeGrad)" strokeWidth="7" strokeLinecap="round" opacity=".22" />
      <path d="M 12 58 A 48 48 0 0 1 108 58" fill="none" stroke="url(#benchGaugeGrad)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray="151" strokeDashoffset={151 - (clamped / 10) * 151}
        style={{ transition: reducedSafe() ? 'none' : 'stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)' }} />
      <g className="bench-gauge-needle" style={{ transform: `rotate(${angle}deg)` }}>
        <line x1="60" y1="58" x2="60" y2="20" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="60" cy="58" r="4.5" fill="currentColor" />
      </g>
    </svg>
  )
}

/** Reduced-motion probe for non-hook contexts (SVG inline styles). */
function reducedSafe(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** ₹ in compact notation for the preset chips ("≈ ₹10.5k"). */
function shortInr(v: number): string {
  const s = v >= 1000 ? `${(Math.round(v / 100) / 10).toFixed(1).replace(/\.0$/, '')}k` : String(v)
  return `≈₹${s}`
}

/** Reusable dial: labelled range with a drag bubble and a haptic step tick. */
function BenchSlider(props: {
  label: string; value: number; min: number; max: number; step: number
  fmt: (v: number) => string; ariaLabel: string; onChange: (v: number) => void
}) {
  const [dragging, setDragging] = useState(false)
  const fill = ((props.value - props.min) / (props.max - props.min)) * 100
  const bubbleLeft = Math.min(90, Math.max(10, fill))
  return (
    <div className="bench-control-block">
      <div className="bench-range-head">
        <span className="bench-control-label">{props.label}</span>
        <span className="bench-range-value">{props.fmt(props.value)}</span>
      </div>
      <div className="bench-slider">
        {dragging && <span className="bench-bubble" style={{ left: `${bubbleLeft}%` }}>{props.fmt(props.value)}</span>}
        <input type="range" className="yf-range" min={props.min} max={props.max} step={props.step} value={props.value}
          style={{ '--fill': `${fill}%` } as React.CSSProperties}
          aria-label={props.ariaLabel}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onBlur={() => setDragging(false)}
          onChange={e => {
            const v = Number(e.target.value)
            if (v !== props.value) { haptic(HAPTIC.tick); props.onChange(v) }
          }} />
      </div>
    </div>
  )
}

const CONFETTI_COLORS = ['#2f9e8f', '#F3AA3D', '#e05656', '#7c5cff', '#2f9e8f']

/** Clipboard with a legacy fallback — async Clipboard API first, then the
 *  near-universal execCommand path for restricted/embedded contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch { /* permission denied / unavailable — try the legacy path */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch { return false }
}

export function PlanBench() {
  const [input, setInput] = useState<BenchInputs>(() => loadBenchInputs() ?? BENCH_DEFAULTS)
  const [copied, setCopied] = useState(false)
  const [surpriseCooldown, setSurpriseCooldown] = useState(false)
  const [rolling, setRolling] = useState(false)
  const [scramble, setScramble] = useState<BenchInputs | null>(null)
  const [live, setLive] = useState(false)
  const [lineKey, setLineKey] = useState(0)
  const [stampKey, setStampKey] = useState(0)
  const [tearing, setTearing] = useState(false)

  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const pointerFine = useMedia('(pointer: fine)')
  const animate = !reduced

  const sectionRef = useRef<HTMLElement>(null)
  const receiptRef = useRef<HTMLDivElement>(null)
  const timersRef = useRef<number[]>([])
  const scrambleRef = useRef<number | null>(null)

  // Receipt plays its entrance once, when it first scrolls into view.
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setLive(true); return }
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { setLive(true); io.disconnect() }
    }, { threshold: 0.12 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // The mobile bill dock tracks visibility continuously — it slides away when
  // the bench (with its full receipt) is off-screen and follows while tuning.
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = sectionRef.current
    if (!el || typeof IntersectionObserver === 'undefined') { setInView(true); return }
    const io = new IntersectionObserver(es => setInView(es.some(e => e.isIntersecting)), { threshold: 0.08 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  // One exit-swept list: surprise cooldown, copy flash, tear timing.
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout)
    if (scrambleRef.current != null) window.clearInterval(scrambleRef.current)
  }, [])
  function later(fn: () => void, ms: number) {
    timersRef.current.push(window.setTimeout(fn, ms))
  }

  // Persist the dials so a returning visitor picks up where they left off.
  useEffect(() => { saveBenchInputs(input) }, [input])

  const bill = useMemo(() => computeBenchBill(input), [input])
  // While the slot-machine runs, the receipt displays randomised bills.
  const scrambleBill = useMemo(() => (scramble ? computeBenchBill(scramble) : null), [scramble])
  const shown = scrambleBill ?? bill
  const shownInput = scramble ?? input

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
    haptic(HAPTIC.select)
    setInput(prev => ({
      ...prev, km: p.km, mode: p.mode, nights: p.nights, crew: p.crew, roundTrip: p.roundTrip,
    }))
    setLineKey(k => k + 1)
    setStampKey(k => k + 1)
  }

  function randomBenchInputs(from: BenchInputs): BenchInputs {
    const preset = BENCH_PRESETS[Math.floor(Math.random() * BENCH_PRESETS.length)]
    const stays: BenchStayStyle[] = ['budget', 'comfort', 'luxury']
    return {
      ...from,
      km: preset.km, mode: preset.mode, nights: preset.nights, crew: preset.crew,
      roundTrip: Math.random() > 0.4,
      stay: stays[Math.floor(Math.random() * 3)],
      kmPerL: preset.mode === 'motorcycle' ? 25 + Math.floor(Math.random() * 20) : 10 + Math.floor(Math.random() * 15),
      inrPerL: 95 + Math.floor(Math.random() * 20),
    }
  }

  function surpriseMe() {
    if (surpriseCooldown || scramble) return
    haptic(HAPTIC.surprise)
    setRolling(true)
    later(() => setRolling(false), 650)
    const final = randomBenchInputs(input)
    let ticks = 0
    scrambleRef.current = window.setInterval(() => {
      ticks++
      if (ticks >= 6) {
        if (scrambleRef.current != null) { window.clearInterval(scrambleRef.current); scrambleRef.current = null }
        setScramble(null)
        setInput(final)
        setLineKey(k => k + 1)
        setStampKey(k => k + 1)
      } else {
        setScramble(randomBenchInputs(input))
      }
    }, 85)
    setSurpriseCooldown(true)
    later(() => setSurpriseCooldown(false), 700)
  }

  function resetAll() {
    if (tearing) return
    haptic(HAPTIC.toggle)
    setTearing(true)
    later(() => {
      setTearing(false)
      setInput(BENCH_DEFAULTS)
      setLineKey(k => k + 1)
    }, 380)
  }

  async function copyBill() {
    const ok = await copyText(formatBenchShareText(bill, input))
    if (ok) {
      haptic(HAPTIC.success)
      setCopied(true)
      later(() => setCopied(false), 1600)
    }
    // clipboard fully unavailable: the receipt is on screen — stay quiet
  }

  function handleCta() {
    haptic(HAPTIC.select)
    stashBenchPrefill(bill, input)
    window.location.hash = '#/create'
  }

  // Pointer-follow tilt — desktop pointers only, never reduced-motion.
  function onTiltMove(e: React.MouseEvent) {
    if (reduced || !pointerFine || !receiptRef.current) return
    const r = receiptRef.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    receiptRef.current.style.setProperty('--rx', `${(-y * 4).toFixed(2)}deg`)
    receiptRef.current.style.setProperty('--ry', `${(x * 4).toFixed(2)}deg`)
  }
  function onTiltEnd() {
    receiptRef.current?.style.setProperty('--rx', '0deg')
    receiptRef.current?.style.setProperty('--ry', '0deg')
  }

  const fuelMode = isBenchFuelMode(input.mode)
  const rideWord = input.mode === 'bus' || input.mode === 'train' ? 'on the move' : 'driving'
  const pct = (v: number) => Math.round((v / shown.total) * 100) || 0
  const stampTone = shown.fatigue.tone

  return (
    <section className={`container plan-bench${live ? ' bench-live' : ''}${inView ? ' bench-inview' : ''}`} id="plan-bench" aria-label="Trip cost calculator" ref={sectionRef}>
      <div className="bench-blob bench-blob-a" aria-hidden="true" />
      <div className="bench-blob bench-blob-b" aria-hidden="true" />
      <div className="bench-badge"><span className="bench-badge-dot" aria-hidden="true" /><ReceiptText size={14} aria-hidden style={{ verticalAlign: '-2px' }} /> The Plan Bench</div>
      <h2 className="section-title bench-title" style={{ marginBottom: 4 }}>
        What will your road trip{' '}
        <em className="bench-underline">
          actually
          <svg viewBox="0 0 220 14" preserveAspectRatio="none" aria-hidden="true">
            <path d="M4 10 C 60 4, 150 3, 216 8" />
          </svg>
        </em>{' '}
        cost?
      </h2>
      <p className="small muted bench-sub">
        Distance, mode, crew, stay — dial it in and watch every rupee explain itself. Then take the whole bill straight into a real plan.
      </p>
      <div className="bench-preset-row">
        {BENCH_PRESETS.map(p => {
          const active = input.km === p.km && input.mode === p.mode && input.nights === p.nights && input.crew === p.crew && input.roundTrip === p.roundTrip
          return (
            <button key={p.label} type="button" className={`chip ${active ? 'chip-teal' : 'chip-outline'}`} onClick={() => applyPreset(p)}>
              {p.label} · {p.km} km · <Odometer value={shortInr(presetPerHead.get(p.label) ?? 0)} animate={false} />/head
            </button>
          )
        })}
        <button type="button" className={`chip chip-outline bench-surprise${rolling ? ' rolling' : ''}`} onClick={surpriseMe} disabled={surpriseCooldown} aria-label="Surprise me with a random trip">
          <span className="bench-dice" aria-hidden="true"><Dices size={14} /></span> Surprise me
        </button>
        {dirty(input) && (
          <button type="button" className="chip chip-outline" onClick={resetAll} aria-label="Reset the calculator to defaults">
            <RotateCcw size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />Reset
          </button>
        )}
      </div>
      <div className="bench-grid">
        <div className="bench-controls">
          <div className="bench-control-block">
            <BenchSlider label="One-way distance" value={input.km} min={100} max={900} step={10}
              fmt={v => `${v} km`} ariaLabel="One-way distance in kilometres" onChange={v => patch({ km: v })} />
            <div className="bench-seg-row">
              <div className="bench-seg" role="group" aria-label="Trip direction">
                <button type="button" className={!input.roundTrip ? 'on' : ''} aria-pressed={!input.roundTrip}
                  onClick={() => { haptic(HAPTIC.toggle); patch({ roundTrip: false }) }}>One way</button>
                <button type="button" className={input.roundTrip ? 'on' : ''} aria-pressed={input.roundTrip}
                  onClick={() => { haptic(HAPTIC.toggle); patch({ roundTrip: true }) }}>Round trip</button>
              </div>
              <span className="bench-seg-badge">{shown.roadKm} km on the road</span>
            </div>
          </div>
          <div className="bench-control-block">
            <span className="bench-control-label">How you travel</span>
            <div className="bench-pills">
              {BENCH_MODES.map(m => (
                <button key={m} type="button" className={`bench-pill ${input.mode === m ? 'on' : ''}`}
                  aria-pressed={input.mode === m}
                  onClick={() => { haptic(HAPTIC.select); patch({ mode: m }) }}>
                  {m === 'motorcycle' ? <Bike size={15} aria-hidden style={{ verticalAlign: '-3px', marginRight: 6 }} />
                    : m === 'car' ? <Car size={15} aria-hidden style={{ verticalAlign: '-3px', marginRight: 6 }} />
                    : m === 'bus' ? <Bus size={15} aria-hidden style={{ verticalAlign: '-3px', marginRight: 6 }} />
                    : <TrainFront size={15} aria-hidden style={{ verticalAlign: '-3px', marginRight: 6 }} />}
                  {m}
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
                  aria-pressed={input.stay === s}
                  onClick={() => { haptic(HAPTIC.select); patch({ stay: s }) }}>
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
                  aria-pressed={input.crew === n}
                  onClick={() => { haptic(HAPTIC.select); patch({ crew: n }) }}>
                  <span className="bench-crew-emoji" aria-hidden="true">{n === 1 ? <User size={13} /> : <Users size={13} />}</span>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <BenchSlider label="Nights" value={input.nights} min={1} max={7} step={1}
            fmt={v => `${v} (${v + 1} days)`} ariaLabel="Number of nights" onChange={v => patch({ nights: v })} />
          {fuelMode && (<>
            <BenchSlider label="Fuel economy" value={input.kmPerL} min={2} max={80} step={1}
              fmt={v => `${v} km/L`} ariaLabel="Fuel economy in kilometres per litre" onChange={v => patch({ kmPerL: v })} />
            <BenchSlider label="Fuel price" value={input.inrPerL} min={50} max={250} step={1}
              fmt={v => `₹${v}/L`} ariaLabel="Fuel price in rupees per litre" onChange={v => patch({ inrPerL: v })} />
          </>)}
        </div>

        <div className={`bench-receipt card${tearing ? ' tearing' : ''}`} ref={receiptRef}
          onMouseMove={onTiltMove} onMouseLeave={onTiltEnd}>
          <span className="bench-stamp" key={stampKey} aria-hidden="true">ESTIMATE</span>
          <div className="bench-receipt-head">
            <span className="bench-receipt-kicker">YATRAFLOW · TRIP ESTIMATE</span>
            <span className="bench-receipt-date">{issued}</span>
          </div>
          <div className="bench-total" aria-live="polite">
            <div className="bench-total-label">Estimated total</div>
            <div className="bench-total-main">
              <Odometer value={formatInr(shown.total)} animate={animate} />
              <small>
                <Odometer value={formatInr(shown.perHead)} animate={animate} /> / person
              </small>
            </div>
            <span className="bench-total-sub sr-only">{formatInr(shown.total)} total, {formatInr(shown.perHead)} per person</span>
            <span className="bench-total-sub" aria-hidden="true">{shown.roadKm} km · {shown.days} days · {shownInput.crew} travellers · {shownInput.mode}</span>
          </div>
          <div className="bench-split" role="img" aria-label={`Cost split: ${pct(shown.transportCost)}% transport, ${pct(shown.stayCost)}% stay, ${pct(shown.mealCost)}% food`}>
            <div className="bench-split-bar bench-split-transport" style={{ width: `${pct(shown.transportCost)}%` }}>
              {pct(shown.transportCost) > 15 && <span>{pct(shown.transportCost)}%</span>}
            </div>
            <div className="bench-split-bar bench-split-stay" style={{ width: `${pct(shown.stayCost)}%` }}>
              {pct(shown.stayCost) > 15 && <span>{pct(shown.stayCost)}%</span>}
            </div>
            <div className="bench-split-bar bench-split-meal" style={{ width: `${pct(shown.mealCost)}%` }}>
              {pct(shown.mealCost) > 15 && <span>{pct(shown.mealCost)}%</span>}
            </div>
          </div>
          <div className="bench-split-legend">
            <span><span className="dot dot-transport" /> Transport</span>
            <span><span className="dot dot-stay" /> Stay</span>
            <span><span className="dot dot-meal" /> Food</span>
          </div>
          <div className="bench-receipt-lines" key={lineKey}>
            <div className="bench-line">
              <div className="bench-line-head"><span><Car size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 5 }} />Transport</span><b><Odometer value={formatInr(shown.transportCost)} animate={animate} /></b></div>
              <span className="bench-line-formula">{shown.transportFormula}</span>
            </div>
            <div className="bench-line">
              <div className="bench-line-head"><span><BedDouble size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 5 }} />Stay ({shown.rooms} room{shown.rooms === 1 ? '' : 's'})</span><b><Odometer value={formatInr(shown.stayCost)} animate={animate} /></b></div>
              <span className="bench-line-formula">{shown.stayFormula}</span>
            </div>
            <div className="bench-line">
              <div className="bench-line-head"><span><UtensilsCrossed size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 5 }} />Food</span><b><Odometer value={formatInr(shown.mealCost)} animate={animate} /></b></div>
              <span className="bench-line-formula">{shown.mealFormula}</span>
            </div>
          </div>
          <div className="bench-receipt-rules" />
          <div className="bench-fatigue">
            <FatigueGauge hoursPerDay={shown.hoursPerDay} tone={stampTone} />
            <div>
              <span className="bench-fatigue-title">{shown.fatigue.verdict}</span>
              <span className="bench-line-formula">
                {shown.wheelHours < 1 ? 'Under 1h' : `~${Math.round(shown.wheelHours)}h`} {rideWord} over {shown.days} days
                {shown.hoursPerDay > 0 && ` · ~${shown.hoursPerDay.toFixed(1)}h/day`}
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
            <button type="button" className={`chip chip-outline${copied ? ' chip-copied' : ''}`} onClick={copyBill}>
              {copied
                ? <><Check size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />Copied to clipboard</>
                : <><Copy size={13} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />Copy bill as text</>}
            </button>
            {copied && !reduced && (
              <span className="bench-confetti" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <i key={i} className="cf-bit" style={{
                    '--dx': `${Math.round(Math.random() * 140 - 70)}px`,
                    '--dy': `${Math.round(-(16 + Math.random() * 54))}px`,
                    '--rot': `${Math.round(Math.random() * 360)}deg`,
                    '--c': CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                  } as React.CSSProperties} />
                ))}
              </span>
            )}
          </div>
          <p className="bench-fineprint">
            We pre-fill your new trip with these numbers · excludes tolls, parking & entry fees · stay ₹{STAY_RATE_PER_NIGHT[input.stay]}/room-night, 2 per room · food ₹{MEALS_PER_HEAD_DAY}/head/day
          </p>
        </div>
      </div>
      {/* Mobile bill dock — the total follows the user while they tune the dials
          (one-screen rule: never scroll away from the number you're changing). */}
      <div className="bench-dock">
        <div className="bench-dock-figures">
          <b>{formatInr(shown.total)}</b>
          <span>{formatInr(shown.perHead)}/head · {input.crew} travelling</span>
        </div>
        <button type="button" className="btn btn-primary bench-dock-cta" onClick={handleCta}>
          Use these numbers →
        </button>
      </div>
    </section>
  )
}

/** True when the current inputs differ from the shipped defaults (shows Reset). */
function dirty(input: BenchInputs): boolean {
  return !benchInputsEqual(input, BENCH_DEFAULTS)
}

function modeHint(m: BenchMode): string {
  const speed = MODE_SPEED[m] ?? 40
  return isBenchFuelMode(m)
    ? `≈ ${speed} km/h average · you pay for fuel`
    : `≈ ${speed} km/h average · × ₹${MODE_COST_PER_KM[m]}/km fare`
}
