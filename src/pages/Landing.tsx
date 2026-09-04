// ============ Landing page ============
import { useEffect } from 'react'
import { RouteSquiggle } from '../components/ui'
import { PlanBench } from '../components/PlanBench'

export function LandingPage({ onNavigate }: { onNavigate: (r: string) => void }) {
  useReveal()
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
            <span className="chip chip-saffron hero-rise">🇮🇳 Built for Indian travellers</span>
            <h1 className="hero-rise rise-d1" style={{ fontSize: 'clamp(2.4rem, 5vw, 3.7rem)', margin: '18px 0 14px', lineHeight: 1.12 }}>
              Plan trips that actually <span style={{ color: 'var(--yf-teal-600)' }}>flow together</span>
            </h1>
            <p className="hero-sub hero-rise rise-d2">
              Build the route, see every time and cost impact,
              and keep your whole crew on the same page.
            </p>
            <div className="hero-ctas hero-rise rise-d3">
              <a className="btn btn-primary btn-lg" href="#/auth?mode=signup">Start planning free →</a>
              <a className="btn btn-saffron btn-lg" href="#/explore">Explore itineraries</a>
              <button type="button" className="hero-bench-cta hero-rise rise-d4"
                onClick={() => document.getElementById('plan-bench')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                <span className="hbc-label">Price a trip in 10 seconds <span className="hbc-arrow" aria-hidden="true">⬇</span></span>
              </button>
            </div>
            <p className="small muted hero-rise rise-d5" style={{ marginTop: 16 }}>No card needed · Free forever · Your planning data is yours</p>
          </div>

          {/* Adventure preview card (dark navy, animated multi-trip route, mockup) */}
          <div className="hero-adventure hero-rise rise-d2" aria-hidden="true">
            <div className="ha-kicker">Your next adventure</div>
            {/* RouteSquiggle is a scenario carousel — it draws a different India trip
                on autopilot (Leh, Kerala, Spiti, Meghalaya) with a live caption. */}
            <RouteSquiggle />
            <div className="ha-stats">
              <div><b>₹5,408</b><span>est. per person</span></div>
              <div><b>60h 15m</b><span>driving time</span></div>
              <div><b style={{ color: '#F3AA3D' }}>53</b><span>trip health</span></div>
            </div>
            <div className="ha-row">
              <div className="ha-warn">⚠️ Day 3 is overloaded<span>add a rest halt to protect your arrival time.</span></div>
              <div className="ha-sync">3 friends synced<span>live collaboration on</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* Infinite destination ticker — hero hands off to the Plan Bench over a living
          marquee of common + offbeat India spots (pure CSS loop, hover-pause). */}
      <DestTicker />

      {/* ---------- Plan Bench (interactive cost calculator) — the showpiece, one scroll from the fold ---------- */}
      <PlanBench />

      {/* ---------- What changes for you ---------- */}
      <section className="container" style={{ paddingBottom: 8, position: 'relative' }}>
        <TravelMotifs mode="features" />
        <p className="small reveal" style={{ textAlign: 'center', fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--yf-teal-600)', marginBottom: 8 }}>One place for the reality of a trip</p>
        <h2 className="section-title reveal reveal-d1" style={{ maxWidth: 640, margin: '0 auto 26px' }}><span className="reveal-underline">From “let’s go” to a plan everyone can actually follow.</span></h2>
        <div className="feature-strip">
          <FeatureCard cls="reveal" icon="⚡" title="See the impact before you change" body="Every move shows time, distance and budget consequences — no surprises later." />
          <FeatureCard cls="reveal reveal-d1" icon="🛣️" title="Plan around real road time" body="Route days, break suggestions and arrival times designed for how journeys really work." />
          <FeatureCard cls="reveal reveal-d2" icon="👥" title="Keep the whole group aligned" body="Share the itinerary, decide together, and know what still needs an answer." />
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="container" style={{ paddingBottom: 60, position: 'relative' }}>
        <TravelMotifs mode="steps" />
        <h2 className="section-title reveal"><span className="reveal-underline">From chaos to itinerary in four steps</span></h2>
        <div className="steps-grid">
          <Step cls="reveal" n={1} title="Create a trip" body="Dates, travellers, transport mode, budget — and searchable real locations." />
          <Step cls="reveal reveal-d1" n={2} title="Build the timeline" body="Add stops day by day; every change previews its impact instantly." />
          <Step cls="reveal reveal-d2" n={3} title="Invite the crew" body="Share a link; friends suggest, vote and comment right inside the plan." />
          <Step cls="reveal reveal-d3" n={4} title="Lock it & go" body="Resolve decisions, confirm bookings-worthy stops, publish if you like." />
        </div>
      </section>

      {/* ---------- Demo CTA ---------- */}
      <section className="container" style={{ paddingBottom: 70 }}>
        <div className="cta-band reveal">
          <h2>Try the full product in demo mode</h2>
          <p>
            A 4-day Kerala road trip (Kochi → Munnar → Thekkady → Alleppey) with real stops, timings,
            votes, decisions and budgets already loaded. No signup needed.
          </p>
          <DemoButtons onNavigate={onNavigate} />
        </div>
      </section>

      <footer className="container small muted" style={{ textAlign: 'center', padding: '26px 20px 34px', borderTop: '1px solid var(--line)' }}>
        YatraFlow · Plan real trips, together.
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
          <span className="t-ico">{off ? '🔭' : '🔖'}</span>
          <span>{label}</span>
          <span className={`t-tag${off ? ' t-off' : ''}`}>{tag}</span>
        </span>
      ))}
      <span className="ticker-sep">◇</span>
    </div>
  )
  return (
    <div className="dest-ticker" aria-label="Popular and offbeat Indian travel destinations">
      <div className="ticker-track">
        {set(false)}
        {set(true)}
      </div>
    </div>
  )
}

/** Lightweight travel-silhouette SVG motifs behind the feature/steps grids —
 *  spinning compass, plane on a dashed float, bobbing trekker. transform-only,
 *  off under reduced motion. */
function TravelMotifs({ mode }: { mode: 'features' | 'steps' }) {
  return (
    <>
      {mode === 'features' ? (<>
        <span className="motif motif-compass" style={{ top: 30, right: 44 }}><CompassSvg /></span>
        <span className="motif motif-float" style={{ bottom: 34, left: 24 }}><PlaneSvg /></span>
      </>) : (<>
        <span className="motif motif-bob" style={{ top: 22, left: 48 }}><TrekkerSvg /></span>
        <span className="motif motif-float" style={{ bottom: 40, right: 34 }}><PlaneSvg /></span>
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

function DemoButtons({ onNavigate }: { onNavigate: (r: string) => void }) {
  return (
    <div className="cta-buttons">
      <a className="btn btn-navy btn-lg" href="#/auth?mode=signup">
        🚀 Create a free account
      </a>
      <BrandHint />
    </div>
  )
}

function BrandHint() {
  return <span className="small cta-hint">demo trips are added to your account automatically on first sign-in</span>
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

function FeatureCard({ cls, icon, title, body }: { cls?: string; icon: string; title: string; body: string }) {
  return (
    <div className={`card feature-card ${cls ?? ''}`.trim()}>
      <div className="feature-ico">{icon}</div>
      <h3>{title}</h3>
      <p className="small muted">{body}</p>
    </div>
  )
}
