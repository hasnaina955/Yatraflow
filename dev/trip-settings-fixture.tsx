// ============ Trip Settings fixture (synthetic) ============
// LOADED ONLY BY vite.profile-fixture.config.ts. It mounts the REAL
// `TripSettingsForm` over a synthetic trip, so the ten Pace choices are the
// production buttons, with the production labels, order, keys and setter.
//
// Nothing here writes: the store is only read for the signed-in member, and the
// form's save path is untouched. No hosted request can leave this page.
import { createRoot } from 'react-dom/client'
import '../src/styles.css'
import type { CachedUser, Trip } from '../src/data/types'
import { getSnapshot, _installUsersForTest } from '../src/store/store'
import { TripSettingsForm } from '../src/pages/trip/TripSettingsForm'
import { Chip } from '../src/components/ui'

const params = new URLSearchParams(location.search)
if (params.has('read') || params.has('empty')) {
  throw new Error('Trip Settings fixture does not support read or empty. Use days=empty or days=filled.')
}
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'

const USER_ID = 'fixture-profile-user'

// The form reads the signed-in member for its owner-only section. Plant one
// through the store's own install gate, so the snapshot is stamped the way a
// real hydrate leaves it.
const user: CachedUser = {
  id: USER_ID,
  kind: 'private',
  email: 'fixture-trip@example.invalid',
  createdAt: 1,
  profile: { name: 'Fixture Traveller', homeCity: 'Kochi', languages: ['en'], travelStyles: [], isCreator: false },
}
getSnapshot().sessionUserId = USER_ID
_installUsersForTest([user])

/** The real `Trip` shape the form reads. Only the fields this form touches are
 *  meaningful; the rest are the model's own defaults, so nothing is invented. */
const trip: Trip = {
  id: 'fixture-trip-settings',
  name: 'Fixture Road Trip',
  startLocation: 'Kochi',
  destinations: ['Munnar', 'Thekkady'],
  startDate: '2026-12-01',
  endDate: '2026-12-04',
  travellers: 2,
  budgetPerPersonInr: 12000,
  transportMode: 'car',
  travelStyle: 'balanced',
  stayStyle: 'comfort',
  roundTrip: true,
  driverCount: 1,
  hasVulnerable: false,
  createdAt: 1,
  updatedAt: 1,
  members: [{ userId: 'fixture-profile-user', role: 'owner', joinedAt: 1 }],
  itinerary: [],
  days: params.get('days') === 'filled' ? [{ id: 'fixture-day', index: 0, title: 'First day', stops: [
    { id: 'fixture-stop', title: 'Fixture stop', category: 'sightseeing', locationName: 'Munnar', lat: 10.08, lng: 77.06, visitMinutes: 45, entryFeeInrPerPerson: 0, transportCostInrTotal: 0, priority: 'must-do', status: 'confirmed', orderInDay: 0 },
  ] }] : [],
  fixedCommitments: [],
  expenses: [],
} as unknown as Trip

/** The synthetic header, labelled as such so a capture cannot be mistaken for
 *  the shipped chrome. Same height contract as the app's floating nav. */
function Chrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <nav className="topnav" aria-label="Synthetic fixture header">
        <div className="container topnav-inner">
          <span className="brand"><span>Fixture<b style={{ color: 'var(--teal)' }}>Chrome</b></span></span>
          <span className="small" style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-2)' }}>
            Synthetic header, not the app nav
          </span>
        </div>
      </nav>
      <main id="main" tabIndex={-1} style={{ flex: 1 }}>
        <div className="container form-page yf-page tset-page">{children}</div>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <Chrome>
    <TripSettingsForm trip={trip} editable={params.get('role') !== 'viewer'} />
    {params.has('chips') && <div id="fixture-chips">
      <Chip tone="ok">ok</Chip><Chip tone="teal">teal</Chip><Chip tone="saffron">saffron</Chip>
      <Chip tone="danger">danger</Chip><Chip tone="info">info</Chip>
      <span className="chip chip-outline">outline</span><span className="chip chip-warn">warn</span>
    </div>}
  </Chrome>,
)
