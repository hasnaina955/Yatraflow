// ============ Phone chrome: one width rule (row 27a) ============
// The bottom tab bar, the universal Add control and the Chakra FAB hide all
// read this one query. Before row 27a, App.tsx and TripWorkspace.tsx each wrote
// their own copy. The CSS that pairs with it (`.nav-links` hide, the trip tab
// rail dock) uses the same 720px; tests/phone-chrome.test.ts pins both sides.
//
// The full-screen phone Map keeps its own 760px rule (MapTab, map-v2-rail.css).
// That rule is the Map layout, not the app chrome.
//
// Pure: no React, no DOM, so the rules are unit tests.

export const PHONE_QUERY = '(max-width: 720px)'

/** The bottom tab bar shows for a signed-in user in the native shell, and on
 *  the website at phone width. Signed out, the landing keeps its own calls to
 *  action, so nothing changes. */
export function showTabBar({ native, phoneWidth, signedIn }: {
  native: boolean
  phoneWidth: boolean
  signedIn: boolean
}): boolean {
  return signedIn && (native || phoneWidth)
}

/** Why the web bar is out of the way. `map`: the full-screen phone Map owns
 *  the screen. `overlay`: a sheet, a dialog or the web menu tray is open.
 *  `keyboard`: a text field has focus. null: the bar shows. */
export type TabBarHide = 'map' | 'overlay' | 'keyboard' | null

/** The native bar never hides (the shell keeps it as fixed Android chrome).
 *  The web bar steps aside in the order the user sees: the Map first, then a
 *  sheet, then the keyboard. */
export function tabBarHide({ native, mapFullscreen, overlayOpen, keyboardOpen }: {
  native: boolean
  mapFullscreen: boolean
  overlayOpen: boolean
  keyboardOpen: boolean
}): TabBarHide {
  if (native) return null
  if (mapFullscreen) return 'map'
  if (overlayOpen) return 'overlay'
  if (keyboardOpen) return 'keyboard'
  return null
}
