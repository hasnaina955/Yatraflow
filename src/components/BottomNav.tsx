// ============ Bottom navigation (native shell only) ============
// The installed app's primary navigation. The website's floating pill
// (.nav-links) is hidden in the shell — a phone app navigates from a fixed
// bar at the thumb, not from a pill at the top of the screen — so these
// destinations are what the shell shows instead. Android grammar throughout:
// fixed bar above the gesture bar, equal columns, icon over an 11px label,
// 58px of tap height, the active destination tinted.
//
// Four destinations for everyone: Home, My trips, Explore and Profile. A
// creator reaches Creator hub from a row at the top of Profile, so the bottom
// bar stays five columns with the universal Add slot in the centre.
//
// This component never mounts on the web: App.tsx renders it only when
// isNative && me, so the website keeps the pill nav byte-for-byte.
//
// #1064: the centre slot. Between My trips and Explore sits the universal Add
// control (UniversalAdd), passed in as `centre`. It is not a destination, so it
// stays out of navDestinations() and areaOf(); `data-centre` adds its column.
//
// It is NOT an overlay: it does not join App.tsx's registerAndroidBack
// overlay-close contract, because closing "nothing" is the right answer for
// a navigation bar — back should walk history, not hide the nav.

import { Fragment, type ReactNode } from 'react'
import { Compass, House, Tent, User } from 'lucide-react'

export interface NavDestination {
  to: string
  label: string
  /** The full name, for the accessible label when the visible label is short. */
  title?: string
  Icon: typeof House
}

const HOME: NavDestination = { to: '/', label: 'Home', Icon: House }
const TRIPS: NavDestination = { to: '/trips', label: 'My trips', Icon: Tent }
const EXPLORE: NavDestination = { to: '/explore', label: 'Explore', Icon: Compass }
const PROFILE: NavDestination = { to: '/profile', label: 'Profile', Icon: User }

/** The ordered destinations for everyone: Profile always last. */
export function navDestinations(): NavDestination[] {
  return [HOME, TRIPS, EXPLORE, PROFILE]
}

/** Where the user is, for active-state purposes. */
export type Area = 'home' | 'trips' | 'explore' | 'profile' | null

/**
 * Map a hash route onto a destination. Query strings ride on the segment
 * (`/explore?style=beach`, App.tsx strips them the same way), so drop them
 * first. A trip workspace belongs to My trips — it is opened from that list
 * and back returns there; `/creator-hub` is reached from Profile, so it lights
 * Profile; every other route (/new, /creator/:id, /admin, /pub/:slug, …)
 * lights nothing, which is honest: the nav has no such tab.
 */
export function areaOf(route: string): Area {
  const path = route.split('?')[0]
  if (path === '/') return 'home'
  if (path === '/trips' || path.startsWith('/trip/')) return 'trips'
  if (path === '/explore') return 'explore'
  if (path === '/profile' || path === '/creator-hub') return 'profile'
  return null
}

export function badgeText(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null
  return unread > 9 ? '9+' : String(Math.floor(unread))
}

export function BottomNav({ route, onNavigate, unread = 0, centre }: {
  route: string
  onNavigate: (r: string) => void
  unread?: number
  /** The universal Add slot (#1064), drawn right after My trips. */
  centre?: ReactNode
}) {
  const current = areaOf(route)
  const items = navDestinations()
  const badge = badgeText(unread)
  return (
    <nav
      className="bottom-nav"
      role="navigation"
      aria-label="Primary"
      data-centre={centre ? 'true' : undefined}
    >
      {items.map(({ to, label, title, Icon }) => {
        // areaOf() never returns null for a destination, so a null `current`
        // (any route the nav does not own) leaves every item unlit.
        const active = current === areaOf(to)
        return (
          <Fragment key={to}>
            <button
              type="button"
              className={`bottom-nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={to === '/profile' && badge ? `${label}, ${unread} unread` : title}
              onClick={() => onNavigate(to)}
            >
              <span className="bottom-nav-icon"><Icon size={22} aria-hidden />{to === '/profile' && badge && <span className="bottom-nav-badge" aria-hidden>{badge}</span>}</span>
              <span className="bottom-nav-label">{label}</span>
            </button>
            {to === '/trips' && centre}
          </Fragment>
        )
      })}
    </nav>
  )
}
