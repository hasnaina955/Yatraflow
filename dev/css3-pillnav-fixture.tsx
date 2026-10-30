import React from 'react'
import { createRoot } from 'react-dom/client'
// The fixture must pull the stylesheet in itself, or Vite never injects it and
// every measurement reads an unstyled element.
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '../src/styles.css'
import { PillNav } from '../src/components/PillNav'
import { SegmentedTabs } from '../src/components/page/SegmentedTabs'

/**
 * CSS-3 pill nav fixture.
 *
 * It mounts the real `SegmentedTabs` and the real `PillNav`, so the glider
 * measurement, the ink copies, the roving tab stop and the overflow listener
 * are the product's. Nothing here re-implements the component.
 *
 * Nothing on this page needs a session. It is the whole reason the pill nav can
 * be measured without one.
 *
 * Query parameters:
 *   theme   `light` (default) or `dark`
 *   rows    `all` (default) or `tabbar`, `navlink`, `chip`, `wide`
 *   active  the active key, for a scripted state
 */
const params = new URLSearchParams(location.search)
const theme = params.get('theme') ?? 'light'
const rows = params.get('rows') ?? 'all'
document.documentElement.setAttribute('data-theme', theme)

/** The workspace rail: real tablist semantics, counts, and the clipped ink copy. */
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'timeline', label: 'Timeline', count: 3 },
  { key: 'board', label: 'Board' },
  { key: 'map', label: 'Map' },
  { key: 'budget', label: 'Budget', count: 12 },
  { key: 'group', label: 'Group', count: 1 },
  { key: 'health', label: 'Health' },
] as const

/** Enough links that the rail overflows at phone width, so the edge fade and scroll state are reachable. */
const NAV_LINKS = [
  'Home', 'My trips', 'Plan a trip', 'Explore', 'Creator hub', 'Profile', 'Settings', 'Help',
] as const

const CHIPS = [
  { key: 'all', label: 'All', tone: 'teal' },
  { key: 'open', label: 'Open', tone: 'teal' },
  { key: 'saffron', label: 'Hot deals', tone: 'saffron' },
  { key: 'muted', label: 'Closed', tone: 'plain' },
] as const

function chipClass(tone: string, active: boolean) {
  if (!active) return 'clickable-chip'
  if (tone === 'saffron') return 'clickable-chip on-saffron'
  if (tone === 'teal') return 'clickable-chip on-teal'
  return 'clickable-chip on-teal'
}

function Harness() {
  const [tab, setTab] = React.useState(params.get('active') ?? 'timeline')
  const [link, setLink] = React.useState('Explore')
  const [chip, setChip] = React.useState('open')

  // Exposed so a driver can switch the active item without a real click, which
  // is how an interrupted switch and a rapid reversal are staged.
  React.useEffect(() => {
    ;(window as unknown as { __setTab: (k: string) => void }).__setTab = setTab
    ;(window as unknown as { __setLink: (k: string) => void }).__setLink = setLink
    ;(window as unknown as { __setChip: (k: string) => void }).__setChip = setChip
  }, [])

  const showTabbar = rows === 'all' || rows === 'tabbar' || rows === 'wide'
  const showNav = rows === 'all' || rows === 'navlink'
  const showChip = rows === 'all' || rows === 'chip'
  const wide = rows === 'wide'

  return (
    <div style={{ padding: 16, maxWidth: wide ? 1400 : 900 }}>
      <h1 style={{ font: '600 18px/1.3 "Plus Jakarta Sans", sans-serif' }}>Pill nav fixture</h1>

      {/* A workspace rail inside the page scope that recolours its glider and
          paints the clipped ink copy. The `yf-tabbar` class is the real one. */}
      {showTabbar ? (
        <section className="yf-page" data-compact="false" style={{ marginTop: 12 }}>
          <div className="yf-cover-content" style={{ position: 'relative' }}>
            <SegmentedTabs className="tabbar yf-tabbar" semantics="tablist" label="Trip sections"
              value={tab} onChange={setTab} ink items={TABS.map((item) => ({ ...item }))} />
          </div>
        </section>
      ) : null}

      {/* The top-nav shape: real nav links inside the real PillNav, so the
          overflow listener and the edge-fade state are the component's own. */}
      {showNav ? (
        <div style={{ marginTop: 20 }}>
          <PillNav role="navigation" aria-label="Fixture navigation" activeKey={link}>
            {NAV_LINKS.map((label) => (
              <a key={label} href="#fixture" data-pill-key={label}
                className={`nav-link${link === label ? ' active' : ''}`}
                aria-current={link === label ? 'page' : undefined}
                onClick={(event) => { event.preventDefault(); setLink(label) }}>{label}</a>
            ))}
          </PillNav>
        </div>
      ) : null}

      {/* The filter-pillbar shape: teal and saffron chips, where the glider
          recolours through `:has()` and the chip supplies ink only. */}
      {showChip ? (
        <div className="pill-nav" data-fixture-row="chip" style={{ marginTop: 20 }}>
          <span className="pill-glider" aria-hidden />
          {CHIPS.map((item) => (
            <button key={item.key} type="button" data-pill-key={item.key}
              className={chipClass(item.tone, chip === item.key)}
              aria-pressed={chip === item.key}
              onClick={() => setChip(item.key)}>{item.label}</button>
          ))}
        </div>
      ) : null}

      <p style={{ marginTop: 24, font: '500 12px/1.4 "Plus Jakarta Sans", sans-serif' }}>
        Dev only - synthetic pill nav data
      </p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
