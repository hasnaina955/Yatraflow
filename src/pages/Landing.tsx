// ============ Landing page ============
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowRight, MapPin, Rocket, Route, Users, Zap } from 'lucide-react'
import { RouteSquiggle } from '../components/ui'
import { PlanBench } from '../components/PlanBench'
import { scrollBehavior } from '../lib/motion'
import { looksLikeInviteCode, inviteRoute } from '../lib/inviteCode'
import { useSessionUserId } from '../store/store'

export function LandingPage({ onNavigate }: { onNavigate: (r: string) => void }) {
  useReveal()
  // Subscribe to the session id, not the whole DB: a slice selector is
  // reference-stable, so an unrelated store commit no longer re-renders this
  // page and its un-memoised children (PlanBench, RouteSquiggle, DestTicker).
  const signedIn = !!useSessionUserId()
  // Flow-aware hero CTA (Trip Ticket flow, Sep 2026): signed-in visitors go
  // straight to the create-trip page (route /new); everyone else funnels
  // through signup and lands back on it via the auth page's `next` param.
  const startPlanningHref = signedIn ? '#/new' : '#/auth?mode=signup&next=%2Fnew'
  const [codeErr, setCodeErr] = useState<string | null>(null)
  // A failed submit moves the caret to the field that failed. The movement is
  // both the fix path and the announcement — the field's aria-describedby
  // carries the message — so the error needs no live region doubling it. The
  // counter drives it rather than the error text, so submitting the same bad
  // code twice re-focuses and re-announces instead of going silent.
  const [badSubmit, setBadSubmit] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (badSubmit > 0) codeRef.current?.focus()
  }, [badSubmit])
  function submitCode(raw: string) {
    if (!looksLikeInviteCode(raw)) {
      setCodeErr('That doesn\u2019t look like a trip code. Check the dash and the last 4 characters, then try again.')
      setBadSubmit(n => n + 1)
      return
    }
    setCodeErr(null)
    onNavigate(inviteRoute(raw))
  }
  return (
    <div>
      {/* ---------- Hero (split layout, per CTI homepage mockup) ---------- */}
      {/* hero-blob spans + hero-rise choreography: the atmosphere drifts slowly
          and the copy rises in one orchestrated stagger on load. */}
      {/* One continuous atmospheric canvas behind the whole page — hero, bench and
          sections share a single fixed-attachment ramp, so there are no section
          seams; the canvas is pulled up behind the floating nav pill too. */}
      <div className="landing-canvas">
      <section className="hero">
        <span className="hero-blob hero-blob-a" aria-hidden="true" />
        <span className="hero-blob hero-blob-b" aria-hidden="true" />
        <div className="container hero-split">
          <div className="hero-copy">
            <span className="chip chip-saffron hero-rise">Built for Indian travellers</span>
            <h1 className="hero-rise rise-d1" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.7rem)', margin: '18px 0 14px', lineHeight: 1.12 }}>
              Plan trips that actually <span style={{ color: 'var(--yf-teal-600)' }}>flow together</span>
            </h1>
            <p className="hero-sub hero-rise rise-d2">
              Build the route, see every time and cost impact,
              and keep your whole crew on the same page.
            </p>
            <div className="hero-ctas hero-rise rise-d3">
              <a className="btn btn-primary btn-lg" href={startPlanningHref}>Start a trip <ArrowRight size={16} aria-hidden style={{ verticalAlign: '-3px', marginLeft: 4 }} /></a>
              <a className="btn btn-ghost" href="#/explore">Explore itineraries</a>
            </div>
            <p className="small muted hero-rise rise-d5" style={{ marginTop: 16 }}>No card needed · Free to use · Your planning data is yours</p>
          </div>

          {/* Adventure preview card (dark navy, animated multi-trip route, mockup) */}
          <div className="hero-adventure hero-rise rise-d2">
            <div className="ha-kicker">Your next adventure</div>
            {/* RouteSquiggle is a scenario carousel — it draws a different India trip
                on autopilot (Leh, Kerala, Spiti, Meghalaya) with a live caption AND
                count-up stats + warn/sync rows that change with each trip. */}
            <RouteSquiggle />
          </div>
        </div>
      </section>

      {/* Secondary row, above the bench so the ↓ points AT it: the bench jump
          link and the trip-code entry. Kept out of the hero CTA stack so the
          primary + ghost CTA above fold stay the only invitations up there. */}
      <div className="landing-aux container" style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 18px', alignItems: 'center', padding: '14px 0 6px', fontSize: 14 }}>
        <button type="button" className="hero-bench-link" style={{ padding: 0 }}
          onClick={() => {
            const el = document.getElementById('plan-bench')
            if (!el) return
            el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
            el.setAttribute('tabindex', '-1')
            el.focus({ preventScroll: true })
          }}>
          Price a trip in 10 seconds, no signup <ArrowDown size={14} aria-hidden style={{ verticalAlign: '-2px' }} />
        </button>
        <span aria-hidden="true" style={{ color: 'var(--line)' }}>·</span>
        <details className="invite-disclosure" style={{ marginTop: 0 }}>
          <summary>Have a trip code?</summary>
          <form style={{ display: 'flex', gap: 8, marginTop: 10, maxWidth: 360 }}
            onSubmit={e => {
              e.preventDefault()
              const code = new FormData(e.currentTarget).get('invite-code')
              if (typeof code === 'string') submitCode(code)
            }}>
            <label className="sr-only" htmlFor="invite-code-input">Trip code</label>
            <input id="invite-code-input" ref={codeRef} className="input" name="invite-code"
              placeholder="e.g. GOA-K7QF" autoComplete="off" aria-invalid={codeErr ? true : undefined}
              aria-describedby={codeErr ? 'invite-code-hint invite-code-err' : 'invite-code-hint'}
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace' }} />
            <button type="submit" className="btn btn-outline">Join</button>
          </form>
          <p id="invite-code-hint" className="hint-text">e.g. GOA-K7QF or GOABEACHWE-K7QF: 1–10 letters/numbers, a dash, then 4 characters. Lowercase is fine.</p>
          {/* No role="alert": focus moves to this field on a failed submit and the
              field's aria-describedby carries the message, so a live region here
              would announce the same error twice. */}
          {codeErr && <p id="invite-code-err" className="err-text">{codeErr}</p>}
        </details>
      </div>

      {/* Infinite destination ticker — hero hands off to the Plan Bench over a living
          marquee of common + offbeat India spots (pure CSS loop, hover-pause). */}
      <DestTicker />

      {/* ---------- Plan Bench (interactive cost calculator) — the showpiece, one scroll from the fold ---------- */}
      <PlanBench startHref={startPlanningHref} />

      <div className="landing-peak">
      {/* ---------- What changes for you ---------- */}
      <section className="container" style={{ paddingBottom: 8, position: 'relative' }}>
        <TravelMotifs />
        <p className="small reveal" style={{ textAlign: 'center', fontWeight: 700, color: 'var(--yf-teal-700)', marginBottom: 8 }}>One place for the reality of a trip</p>
        <h2 className="section-title reveal reveal-d1" style={{ maxWidth: 640, margin: '0 auto 26px' }}>From “let’s go” to a plan everyone can actually follow.</h2>
        <div className="feature-strip">
          <div className="card feature-card reveal" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '21px 21px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="feature-ico" aria-hidden="true"><Zap size={20} /></div>
              <div>
                <h3 style={{ margin: 0 }}>See the impact before you change</h3>
                <p className="small muted" style={{ margin: '4px 0 0' }}>Move Munnar → Day 3: preview the cost before anyone commits.</p>
              </div>
            </div>
            <div className="impact-grid" style={{ padding: '0 14px 14px', gap: 8 }}>
              <div className="impact-cell" style={{ padding: '8px 10px' }}><div className="k">Time on the road</div><div className="v delta-pos">+2h 10m</div></div>
              <div className="impact-cell" style={{ padding: '8px 10px' }}><div className="k">Distance</div><div className="v delta-pos">+42 km</div></div>
              <div className="impact-cell" style={{ padding: '8px 10px' }}><div className="k">Est. cost</div><div className="v delta-pos">+₹1,240</div></div>
              <div className="impact-cell impact-cell--warn" style={{ padding: '8px 10px' }}><div className="k">Too busy?</div><div className="v" style={{ color: 'var(--ink-danger)', fontSize: 12 }}>Late arrival</div></div>
            </div>
            <p className="small muted" style={{ padding: '0 21px 14px', margin: 0 }}>Car · 42 km/h · 10 min per stop · road ≈ straight-line ×1.25</p>
          </div>
          <div className="card feature-card reveal reveal-d1" style={{ padding: 0, overflow: 'hidden' }}>
  <div style={{ padding: '21px 21px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
    <div className="feature-ico" aria-hidden="true"><Route size={20} /></div>
    <div>
      <h3 style={{ margin: 0 }}>Plan around real road time</h3>
      <p className="small muted" style={{ margin: '4px 0 0' }}>Day 2 · Kochi 08:00 → Munnar 12:30 → Thekkady 16:00</p>
    </div>
  </div>
  <div style={{ display: 'grid', gap: 6, padding: '0 21px 12px', fontSize: 12 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span className="muted">Kochi → Munnar</span>
      <span className="num" style={{ fontWeight: 700 }}>130 km · 4h 30m</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span className="muted">Munnar → Thekkady</span>
      <span className="num" style={{ fontWeight: 700 }}>90 km · 3h 30m</span>
    </div>
  </div>
  <div style={{ padding: '0 21px 8px', fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
    08:00 depart · tea break 11:30 · 16:00 arrive
  </div>
  <p className="small muted" style={{ padding: '0 21px 14px', margin: 0 }}>Ghat roads ≈28 km/h · real road distances</p>
</div>
          <div className="card feature-card reveal reveal-d2" style={{ padding: '21px 21px 14px' }}>
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
    <div className="feature-ico" aria-hidden="true"><Users size={20} /></div>
    <h3 style={{ margin: 0 }}>Keep the whole group aligned</h3>
  </div>
  <p className="small muted" style={{ margin: '0 0 10px' }}>Decisions show who voted for what. No group-chat archaeology.</p>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
    <span className="chip chip-ok" style={{ fontSize: 12, padding: '2px 8px' }}>You</span>
    <span className="chip" style={{ fontSize: 12, padding: '2px 8px', background: 'var(--bg-soft)', color: 'var(--text-2)' }}>Aarav</span>
    <span className="chip" style={{ fontSize: 12, padding: '2px 8px', background: 'var(--bg-soft)', color: 'var(--text-2)' }}>Meera</span>
    <span className="small muted" style={{ fontSize: 12 }}>+2 more voted</span>
  </div>
  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)', display: 'grid', gap: 6, fontSize: 12 }}>
    <div className="small muted" style={{ fontWeight: 600 }}>2 decisions still open</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span className="muted">Hotel in Munnar</span>
      <span style={{ fontWeight: 600, color: 'var(--ink-amber)' }}>waiting on Meera</span>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <span className="muted">Day 4 ferry timing</span>
      <span className="muted" style={{ fontWeight: 600 }}>waiting on you</span>
    </div>
  </div>
</div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="container" style={{ paddingBottom: 60, position: 'relative', overflow: 'clip' }}>
        <h2 className="section-title reveal">From chaos to itinerary in four steps</h2>
        <div className="steps-grid">
          <Step cls="reveal" n={1} title="Create a trip" body="Pick Kochi → car · 4 travellers → ₹20k. Searchable real places, not placeholders."
            artifact={<>Kochi → Munnar → Thekkady<br />every stop is a real place on the map, not typed text.</>} />
          <Step cls="reveal reveal-d1" n={2} title="Build the timeline" body="Drag Day 2 → Day 3, watch +2h 10m and a late-arrival warning appear before you commit."
            artifact={<>Drag Day 2 ⇄ Day 3<br />time, distance and cost update before anything is saved.</>} />
          <Step cls="reveal reveal-d2" n={3} title="Invite the crew" body="Share a link; friends suggest, vote and comment right inside the plan."
            artifact={<>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
                <span>Pothamedu viewpoint</span>
                <span className="chip chip-ok" style={{ fontSize: 12, padding: '2px 8px' }}>3 upvotes</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span className="consensus-bar" style={{ flex: 1, height: 6 }}><span style={{ width: '60%', background: 'var(--ink-ok)' }} /></span>
                <span className="small muted" style={{ fontSize: 12 }}>3 of 5 upvoted · Best fit</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 6px', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Drop Echo Point</span>
                <span style={{ fontSize: 12, color: 'var(--ink-danger)', fontWeight: 700 }}>−₹1,840 · −95 min</span>
                <span className="chip" style={{ fontSize: 12, padding: '2px 8px', background: 'var(--saffron-soft)', color: 'var(--ink-amber)' }}>Needs your vote</span>
              </div>
              <p className="small" style={{ marginTop: 8, fontSize: 12, color: 'var(--text-2)' }}>Tally leans <b>Drop Echo Point</b>. Your vote could flip it.</p>
            </>} />
          <Step cls="reveal reveal-d3" n={4} title="Lock it & go" body="Resolve Drop Echo Point, confirm the hotel, publish the finished plan to Explore."
            artifact={<>Resolve the open votes<br />then publish, and anyone with the link can read it.</>} />
        </div>
      </section>
      </div>

      {/* ---------- Demo CTA ---------- */}
      <section className="container" style={{ paddingBottom: 70 }}>
        <div className="cta-band reveal">
          <h2>See the whole product on a real trip</h2>
          <p>
            A 4-day Kerala road trip: real stops, timings, votes and budgets. Loads with your account.
          </p>
          <DemoButtons startHref={startPlanningHref} signedIn={signedIn} />
        </div>
      </section>

      <footer className="footer" style={{ justifyContent: 'center', gap: 12 }}>
        <span>YatraFlow · Plan real trips, together.</span>
        <a className="footer-link" href={`mailto:support@yatraflow.app?subject=${encodeURIComponent(`YatraFlow feedback (v${__APP_VERSION__})`)}&body=${encodeURIComponent(`Page: /\nApp version: ${__APP_VERSION__}\n\nWhat worked, what broke, what you wish existed:\n\n`)}`}>Send feedback</a>
      </footer>
      </div>
    </div>
  )
}

/** One IntersectionObserver arms the reveal system once and flips every .reveal
 *  into .io-inview as it scrolls into the viewport (once, not re-hidden on
 *  re-entry). Arms body.reveal-armed first so content never hides if JS is off. */
function useReveal() {
  useEffect(() => {
    if (typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.body.classList.add('reveal-armed')
    const els = Array.from(document.querySelectorAll<HTMLElement>('.reveal'))
    if (!els.length) return
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('io-inview')
          io.unobserve(e.target)
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })
    for (const el of els) io.observe(el)
    return () => {
      io.disconnect()
      document.body.classList.remove('reveal-armed')
    }
  }, [])
}

/** Destination marquee: two identical tracks translate -50% for a seamless,
 *  fully-CSS infinite loop. Hover pauses. Mixes common + offbeat Indian spots. */
const DESTINATIONS: Array<{ label: string; tag: string; off?: boolean }> = [
  { label: 'Goa', tag: 'Beach' },
  { label: 'Leh · Ladakh', tag: 'High route' },
  { label: 'Alleppey', tag: 'Backwaters', off: true },
  { label: 'Hampi', tag: 'Heritage', off: true },
  { label: 'Manali', tag: 'Hills' },
  { label: 'Jaisalmer dunes', tag: 'Desert', off: true },
  { label: 'Munnar', tag: 'Tea hills' },
  { label: 'Ziro', tag: 'Northeast', off: true },
  { label: 'Udaipur', tag: 'Lake city' },
  { label: 'Tirthan Valley', tag: 'Hidden', off: true },
  { label: 'Mysore', tag: 'Palace' },
  { label: 'Meghalaya', tag: 'The East', off: true },
  { label: 'Andamans', tag: 'Islands', off: true },
  { label: 'Rishikesh', tag: 'River' },
]

function DestTicker() {
  const set = (dup: boolean) => (
    <div className="ticker-set" aria-hidden={dup || undefined}>
      {DESTINATIONS.map(({ label, tag, off }, i) => (
        <span key={`${dup ? 'b' : 'a'}-${i}`} className="ticker-item">
          <span className="t-ico"><MapPin size={13} aria-hidden /></span>
          <span>{label}</span>
          <span className={`t-tag${off ? ' t-off' : ''}`}>{tag}</span>
        </span>
      ))}
      {/* Decorative separator as an SVG shape, not the ◇ text glyph: text at
          saffron-on-cream can never reach AA contrast — a shape is exempt. */}
      <span className="ticker-sep" aria-hidden="true">
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
          <path d="M5 1 L9 5 L5 9 L1 5 Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  )
  return (
    <div className="dest-ticker" role="region" tabIndex={0} aria-label="Popular and offbeat Indian travel destinations">
      <div className="ticker-track">
        {set(false)}
        {set(true)}
      </div>
    </div>
  )
}

/** Lightweight travel-silhouette SVG motifs behind the features grid —
 *  spinning compass, floating plane, drifting hot-air balloon, gliding birds.
 *  transform-only, off under reduced motion. One section only: the ledger-calm
 *  world keeps ornament in a single band rather than repeating it per section.
 *  Every span is aria-hidden: these are untitled decorative SVGs, and every other
 *  decoration on the page (lucide icons, the route SVG, the ticker separator) is
 *  hidden from the tree the same way. */
function TravelMotifs() {
  return (
    <>
      <span className="motif motif-compass" aria-hidden="true" style={{ top: 30, right: 44 }}><CompassSvg /></span>
      <span className="motif motif-float" aria-hidden="true" style={{ bottom: 34, left: 24 }}><PlaneSvg /></span>
      <span className="motif motif-rise" aria-hidden="true" style={{ top: '38%', right: '8%' }}><BalloonSvg /></span>
      <span className="motif motif-birds" aria-hidden="true" style={{ top: 70, left: '12%' }}><BirdsSvg /></span>
    </>
  )
}

function CompassSvg() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5z" fill="currentColor" stroke="none" />
    </svg>
  )
}
function PlaneSvg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 3l-8 3 4 7-4 4-2-8-4 1 1 4-3 1 1-4-3-1z" />
    </svg>
  )
}
function BalloonSvg() {
  return (
    <svg width="30" height="34" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M12 2a8 8 0 0 1 8 8c0 4.5-4.5 8-8 12-3.5-4-8-7.5-8-12a8 8 0 0 1 8-8z" fill="currentColor" opacity=".9" />
      <path d="M12 2c-2.5 2-3.5 5-3.5 8S10 16 12 22c2-6 3.5-9 3.5-12S14.5 4 12 2z" fill="none" opacity=".45" />
      <path d="M9.5 23.5h5M10.5 26h3" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}
function BirdsSvg() {
  return (
    <svg width="34" height="14" viewBox="0 0 34 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 8c2-2.5 4-2.5 5 0 1-2.5 3-2.5 5 0" />
      <path d="M14 4c1.7-2 3.3-2 4.2 0 .9-2 2.5-2 4.2 0" opacity=".75" />
      <path d="M25 9c1.4-1.8 2.6-1.8 3.4 0 .8-1.8 2-1.8 3.4 0" opacity=".5" />
    </svg>
  )
}

function DemoButtons({ startHref, signedIn }: { startHref: string; signedIn: boolean }) {
  return (
    <div className="cta-buttons">
      <a className="btn btn-saffron btn-lg" href={startHref}>
        <Rocket size={16} aria-hidden style={{ verticalAlign: '-3px', marginRight: 6 }} />
        {signedIn ? 'Start a trip' : 'Create a free account'}
      </a>
      <span className="small" style={{ display: 'block', marginTop: 8, opacity: .78 }}>~30 seconds · no card · demo trips included</span>
    </div>
  )
}

function Step({ cls, n, title, body, artifact }: { cls?: string; n: number; title: string; body: string; artifact?: ReactNode }) {
  return (
    <div className={`step-card ${cls ?? ''}`.trim()}>
      <span className="step-num">{n}</span>
      <h3>{title}</h3>
      <p className="small muted">{body}</p>
      {artifact && <div className="step-artifact">{artifact}</div>}
    </div>
  )
}

