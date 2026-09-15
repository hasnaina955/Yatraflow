// ============ Landing page ============
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, MapPin, Rocket, Route, Users, Zap } from 'lucide-react'
import { RouteSquiggle } from '../components/ui'
import { PlanBench } from '../components/PlanBench'
import { scrollBehavior } from '../lib/motion'
import { looksLikeInviteCode, inviteRoute } from '../lib/inviteCode'
import { useDb, currentUser } from '../store/store'

export function LandingPage({ onNavigate }: { onNavigate: (r: string) => void }) {
  useReveal()
  const db = useDb()
  const me = currentUser(db)
  // Flow-aware hero CTA (Trip Ticket flow, Sep 2026): signed-in visitors go
  // straight to the create-trip page (route /new); everyone else funnels
  // through signup and lands back on it via the auth page's `next` param.
  const startPlanningHref = me ? '#/new' : '#/auth?mode=signup&next=%2Fnew'
  const [codeErr, setCodeErr] = useState<string | null>(null)
  function submitCode(raw: string) {
    if (!looksLikeInviteCode(raw)) {
      setCodeErr('That doesn\u2019t look like a trip code \u2014 check the dash and the last 4 letters, then try again.')
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
              <a className="btn btn-primary btn-lg" href={startPlanningHref}>Start planning free <ArrowRight size={16} aria-hidden style={{ verticalAlign: '-3px', marginLeft: 4 }} /></a>
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
          Price a trip in 10 seconds — no signup <ArrowDown size={14} aria-hidden style={{ verticalAlign: '-2px' }} />
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
            <input id="invite-code-input" className="input" name="invite-code"
              placeholder="e.g. GOA-K7QF" autoComplete="off" aria-describedby="invite-code-hint invite-code-err"
              style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'monospace' }} />
            <button type="submit" className="btn btn-outline">Join</button>
          </form>
          <p id="invite-code-hint" className="hint-text">e.g. GOA-K7QF or GOABEACHWE-K7QF — 1–10 letters/numbers, a dash, then 4 characters. Lowercase is fine.</p>
          {codeErr && <p id="invite-code-err" className="err-text" role="alert">{codeErr}</p>}
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
        <TravelMotifs mode="features" />
        <p className="small reveal" style={{ textAlign: 'center', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--yf-teal-600)', marginBottom: 8 }}>One place for the reality of a trip</p>
        <h2 className="section-title reveal reveal-d1" style={{ maxWidth: 640, margin: '0 auto 26px' }}><span className="reveal-underline">From “let’s go” to a plan everyone can actually follow.</span></h2>
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
              <div className="impact-cell impact-cell--warn" style={{ padding: '8px 10px' }}><div className="k">Too busy?</div><div className="v" style={{ color: 'var(--danger)', fontSize: 12 }}>Yes — late-arrival warning</div></div>
            </div>
            <p className="small muted" style={{ padding: '0 21px 14px', margin: 0 }}>📋 Car · 42 km/h · 10 min per stop · road ≈ straight-line ×1.25</p>
          </div>
          <div className="card feature-card reveal reveal-d1" style={{ padding: 0, overflow: 'hidden' }}>
  <div style={{ padding: '21px 21px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
    <div className="feature-ico" aria-hidden="true"><Route size={20} /></div>
    <div>
      <h3 style={{ margin: 0 }}>Plan around real road time</h3>
      <p className="small muted" style={{ margin: '4px 0 0' }}>Day 2 · Kochi 08:00 → Munnar 12:30 → Thekkady 16:00</p>
    </div>
  </div>
  <div style={{ display: 'flex', gap: 6, padding: '0 14px 14px', fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
    <span className="chip" style={{ fontSize: 10, padding: '2px 7px', background: 'var(--teal-soft)', color: 'var(--teal-deep)' }}>08:00 depart</span>
    <span>·</span>
    <span className="chip" style={{ fontSize: 10, padding: '2px 7px', background: 'var(--saffron-soft)', color: 'var(--ink-amber)' }}>Tea break 11:30</span>
    <span>·</span>
    <span>16:00 arrive</span>
  </div>
</div>
          <div className="card feature-card reveal reveal-d2" style={{ padding: '21px 21px 14px' }}>
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
    <div className="feature-ico" aria-hidden="true"><Users size={20} /></div>
    <h3 style={{ margin: 0 }}>Keep the whole group aligned</h3>
  </div>
  <p className="small muted" style={{ margin: '0 0 10px' }}>Decisions show who voted for what — no group-chat archaeology.</p>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span className="chip chip-ok" style={{ fontSize: 10, padding: '2px 7px' }}>You</span>
    <span className="chip" style={{ fontSize: 10, padding: '2px 7px', background: 'var(--bg-soft)', color: 'var(--text-2)' }}>Aarav</span>
    <span className="chip" style={{ fontSize: 10, padding: '2px 7px', background: 'var(--bg-soft)', color: 'var(--text-2)' }}>Meera</span>
    <span className="small muted" style={{ fontSize: 11 }}>+2 more voted</span>
  </div>
</div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="container" style={{ paddingBottom: 60, position: 'relative', overflow: 'clip' }}>
        <TravelMotifs mode="steps-quiet" />
        <h2 className="section-title reveal">From chaos to itinerary in four steps</h2>
        <div className="steps-grid">
          <Step cls="reveal" n={1} title="Create a trip" body="Pick Kochi → car · 4 travellers → ₹20k — searchable real places, not placeholders." />
          <Step cls="reveal reveal-d1" n={2} title="Build the timeline" body="Drag Day 2 → Day 3, watch +2h 10m and a late-arrival warning appear before you commit." />
          <div className="step-card reveal reveal-d2">
            <span className="step-num">3</span>
            <h3>Invite the crew</h3>
            <p className="small muted" style={{ margin: '6px 0 10px' }}>Share a link; friends suggest, vote and comment right inside the plan.</p>
            <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
                <span>Pothamedu viewpoint</span>
                <span className="chip chip-ok" style={{ fontSize: 10, padding: '2px 6px' }}>3 upvotes</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span className="consensus-bar" style={{ flex: 1, height: 6 }}><span style={{ width: '60%', background: 'var(--ink-ok)' }} /></span>
                <span className="small muted" style={{ fontSize: 11 }}>3 of 5 upvoted · Best fit</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 6px', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Drop Echo Point</span>
                <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>−₹1,840 · −95 min</span>
                <span className="chip" style={{ fontSize: 10, padding: '2px 6px', background: 'var(--saffron-soft)', color: 'var(--ink-amber)' }}>Needs your vote</span>
              </div>
              <p className="small" style={{ marginTop: 8, fontSize: 11, color: 'var(--text-2)' }}>Tally leans <b>Drop Echo Point</b> — your vote could flip it.</p>
            </div>
          </div>
          <Step cls="reveal reveal-d3" n={4} title="Lock it & go" body="Resolve Drop Echo Point, confirm the hotel, publish the finished plan to Explore." />
        </div>
      </section>
      </div>

      {/* ---------- Demo CTA ---------- */}
      <section className="container" style={{ paddingBottom: 70 }}>
        <div className="cta-band reveal">
          <h2>See the whole product on a real trip</h2>
          <p>
            A 4-day Kerala road trip — real stops, timings, votes and budgets. Loads with your account.
          </p>
          <DemoButtons startHref={startPlanningHref} signedIn={!!me} />
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
    <div className="dest-ticker" role="region" aria-label="Popular and offbeat Indian travel destinations">
      <div className="ticker-track">
        {set(false)}
        {set(true)}
      </div>
    </div>
  )
}

/** Lightweight travel-silhouette SVG motifs behind the feature/steps grids —
 *  spinning compass, floating plane, bobbing trekker, swaying boat, drifting
 *  hot-air balloon, gliding birds. transform-only, off under reduced motion. */
function TravelMotifs({ mode }: { mode: 'features' | 'steps' | 'steps-quiet' }) {
  return (
    <>
      {mode === 'features' ? (<>
        <span className="motif motif-compass" style={{ top: 30, right: 44 }}><CompassSvg /></span>
        <span className="motif motif-float" style={{ bottom: 34, left: 24 }}><PlaneSvg /></span>
        <span className="motif motif-rise" style={{ top: '38%', right: '8%' }}><BalloonSvg /></span>
        <span className="motif motif-birds" style={{ top: 70, left: '12%' }}><BirdsSvg /></span>
      </>) : mode === 'steps-quiet' ? (<>
        <span className="motif motif-compass" style={{ top: 22, left: 48, opacity: .08 }}><CompassSvg /></span>
        <span className="motif motif-birds" style={{ top: 40, right: '14%', opacity: .08 }}><BirdsSvg /></span>
      </>) : (<>
        <span className="motif motif-bob" style={{ top: 22, left: 48 }}><TrekkerSvg /></span>
        <span className="motif motif-float" style={{ bottom: 40, right: 34 }}><PlaneSvg /></span>
        <span className="motif motif-sway" style={{ bottom: 90, left: '6%' }}><BoatSvg /></span>
        <span className="motif motif-birds" style={{ top: 90, right: '14%' }}><BirdsSvg /></span>
        <span className="motif motif-rise" style={{ top: '30%', left: '22%' }}><BalloonSvg /></span>
      </>)}
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
function TrekkerSvg() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6" r="3" />
      <path d="M12 10c-4 2-6 1.4-6 1.4L7 21h10l1-9.6-5-1.4z" />
      <path d="M7 18l-2.5 3m12.5-3l2.5 3" stroke="currentColor" strokeWidth="1.4" fill="none" />
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
function BoatSvg() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 15h20l-3.5 5h-13z" fill="currentColor" opacity=".9" />
      <path d="M14 3v12M14 4l6 9h-6" fill="none" />
      <path d="M13 5l-5 8h5" fill="none" opacity=".55" />
      <path d="M2 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0 4 1.5 6 0" fill="none" strokeWidth="1.2" opacity=".5" />
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
        {signedIn ? 'Start a trip — demo trips included' : 'Create a free account — demo trips included'}
      </a>
      <span className="small" style={{ display: 'block', marginTop: 8, opacity: .78 }}>Free account · ~30 seconds · no card</span>
    </div>
  )
}

function Step({ cls, n, title, body }: { cls?: string; n: number; title: string; body: string }) {
  return (
    <div className={`step-card ${cls ?? ''}`.trim()}>
      <span className="step-num">{n}</span>
      <h3>{title}</h3>
      <p className="small muted">{body}</p>
    </div>
  )
}

