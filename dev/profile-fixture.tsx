// ============ Profile fixture (development only) ============
// Renders the real ProfilePage with a synthetic signed-in user, so the layout and
// its entrance can be measured without a session. Nothing here is reachable from
// a production build: the page is a file under `dev/`, it is never imported by
// `src/`, and every value it writes is fixture data.
//
// WHAT THIS DOES NOT DO. It does not sign in, mint a session or touch Supabase.
// It never changes a production gate: the native and install states come from
// `dev/mocks/`, aliased by `vite.profile-fixture.config.ts`, and that config is
// the only place the substitution exists. `src/lib/featureFlags.ts` is the real
// module, so the AI companion still needs its own build switch — with the switch
// off, the card below says so rather than pretending.
//
// STATE knobs, all in the query string:
//   theme=light|dark      platform=web|native     update=none|current|newer|unconfigured
//   install=none|available|ios|installed          view=full|empty
// Whatever the mocks draw is LAYOUT EVIDENCE ONLY. It says nothing about how the
// native runtime, the update feed or a real install prompt behave on a device.
import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/sora/700.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '../src/styles.css'
import type { CachedUser } from '../src/data/types'
import { getSnapshot, _installUsersForTest } from '../src/store/store'
import { ProfilePage } from '../src/pages/Profile'
import { AI_COMPANION_ENABLED } from '../src/lib/featureFlags'
import { isNative } from '../src/lib/native'

const params = new URLSearchParams(location.search)
const THEME = params.get('theme') === 'dark' ? 'dark' : 'light'
const VIEW = params.get('view') === 'full' ? 'full' : 'empty'
const PLATFORM = params.get('platform') === 'native' ? 'native' : 'web'
const UPDATE = params.get('update') ?? 'none'
const INSTALL = params.get('install') ?? 'none'
// The full state set Terra asked for: AI on, native shell, an update to offer.
const CHROME = params.get('chrome') !== 'none'

const USER_ID = 'fixture-profile-user'

const user: CachedUser = {
  id: USER_ID,
  kind: 'private',
  email: 'fixture-profile@example.invalid',
  createdAt: 1,
  profile: {
    name: 'Fixture Traveller',
    homeCity: VIEW === 'full' ? 'Kochi' : undefined,
    languages: VIEW === 'full' ? ['en', 'hi', 'ml'] : ['en'],
    travelStyles: VIEW === 'full' ? ['balanced', 'food-focused', 'adventure'] : [],
    isCreator: VIEW === 'full',
    creatorAvailable: true,
    creatorBio: VIEW === 'full'
      ? 'Plans long road days with early starts. Writes down every fuel stop and every dhaba worth the halt.'
      : undefined,
    socialLinks: VIEW === 'full'
      ? { youtube: 'https://www.youtube.com/@fixture-channel', instagram: 'https://www.instagram.com/fixture.channel' }
      : undefined,
  },
}

const db = getSnapshot()
db.trips = []
db.decisions = []
db.activity = []
db.notifications = []
db.published = []
db.suggestions = []
db.ready = true
db.sliceReads = { trips: 'ok', decisions: 'ok', activity: 'ok' }

/**
 * Plant the user through the store's OWN install gate.
 *
 * A direct write to `db.users` leaves `catalogAuthority` unstamped, and the write
 * path refuses an edit on an unstamped catalogue (`installCatalogEdit` returns
 * null). That is correct product behaviour, and it is exactly why the save
 * contract could not be exercised until this went through the gate: a fixture
 * must describe a state the real store can reach.
 */
function plantUser() {
  getSnapshot().sessionUserId = USER_ID
  _installUsersForTest([user])
}

plantUser()

// `late=1` reproduces the case the review found: the page paints while the
// store has no user, and the user arrives afterwards. It is the same two steps
// the real store takes — the session id, then the catalogue install — so the
// page sees an ordinary hydration, not a special fixture path. The tip is driven
// by the probe (`window.__hydrateFixture()`), not a timer: a timer races the
// page load and would sometimes hydrate before the first paint, proving nothing.
if (params.get('late') === '1') {
  // Read the LIVE snapshot: the install above reassigns the store's cache
  // object, so the `db` captured before it is a stale reference.
  const idle = getSnapshot()
  idle.users = []
  idle.sessionUserId = null
  idle.catalogAuthority = null
  ;(window as unknown as { __hydrateFixture: () => void }).__hydrateFixture = plantUser
}

document.documentElement.dataset.theme = THEME

/** The build conditions this fixture cannot fake, said on screen. */
const conditions = [
  AI_COMPANION_ENABLED ? null : 'AI companion cards are off in this build (VITE_AI_COMPANION is not "on").',
  isNative ? null : 'Native-only cards are off in this build (not the Capacitor shell).',
].filter((line): line is string => line !== null)

/**
 * The app chrome, reproduced far enough to be honest about sticky offsets.
 *
 * The real Profile sits inside `.app-shell` under a sticky `.topnav` whose height
 * is `--nav-h`; the rail's `top` and each section's `scroll-margin-top` subtract
 * that height. So measuring the rail in a bare page would prove the wrong
 * thing — it would look flush at the top because nothing was there. This is
 * markup from the shell, not the shell itself: no nav links, no router, and the
 * brand is the fixture's own label. It is explicitly labelled SYNTHETIC on
 * screen so a capture can never be mistaken for the real app.
 */
function SyntheticChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <nav className="topnav" aria-label="Synthetic fixture header">
        <div className="container topnav-inner">
          <span className="brand" style={{ cursor: 'default' }}>
            <span>Fixture<b style={{ color: 'var(--teal)' }}>Chrome</b></span>
          </span>
          <span
            style={{
              font: '700 10px/1.4 "Plus Jakarta Sans", sans-serif',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--text-2)',
            }}
          >
            Synthetic header, not the app nav
          </span>
        </div>
      </nav>
      <main id="main" tabIndex={-1} style={{ flex: 1 }}>
        {children}
      </main>
    </div>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Profile fixture root not found')
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <>
      {CHROME
        ? <SyntheticChrome><ProfilePage onNavigate={route => { console.log('[fixture] navigate', route) }} /></SyntheticChrome>
        : <ProfilePage onNavigate={route => { console.log('[fixture] navigate', route) }} />}
      <div
        style={{
          position: 'fixed',
          right: 12,
          bottom: 12,
          zIndex: 2147483647,
          maxWidth: 360,
          padding: '8px 12px',
          borderRadius: 12,
          background: '#0C1420',
          color: '#FCFEFD',
          font: '700 11px/1.4 "Plus Jakarta Sans", sans-serif',
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
        }}
      >
        Dev only — synthetic data, no session
        <span style={{ display: 'block', textTransform: 'none', letterSpacing: 0, fontWeight: 500, opacity: .8 }}>
          platform={PLATFORM} update={UPDATE} install={INSTALL} view={VIEW}
        </span>
        {conditions.map(line => <span key={line} style={{ display: 'block', textTransform: 'none', letterSpacing: 0, fontWeight: 500, opacity: .8 }}>{line}</span>)}
      </div>
    </>
  </React.StrictMode>,
)
