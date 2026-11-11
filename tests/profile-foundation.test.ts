// Profile layout foundation: the artboard's three columns, its ten anchored
// sections, the rail's current-section mark and the real-data-only supporting
// rail. Static source checks, the same shape as the other page gates: each one
// names a structural promise a later refactor could quietly break.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const TSX = read('src/pages/Profile.tsx')
const LAYOUT = read('src/styles/legacy/02-select-and-print.css')
const PAGES = read('src/styles/legacy/12-pages.css')

/** The section keys, in the order the artboard reads them. */
const SECTIONS = ['details', 'styles', 'display', 'notify', 'accounts', 'creator', 'ai', 'install', 'data', 'account']

describe('Profile: the three-column layout comes from the artboard', () => {
  it('declares the rail / form / supporting rail grid, and drops a column at each breakpoint', () => {
    expect(LAYOUT).toContain('grid-template-columns: 240px minmax(0, 1fr) 380px;')
    // 1180: the supporting rail drops under the form.
    expect(LAYOUT).toMatch(/@media \(max-width: 1180px\) \{\s*\.prof-grid \{ grid-template-columns: 200px minmax\(0, 1fr\); \}/)
    // 860: one column. The rail's phone rules live in 12-pages.css, after the
    // base `.prof-nav` — a copy here loses the cascade, which is what drew a
    // vertical nav card on a phone.
    expect(LAYOUT).toMatch(/@media \(max-width: 860px\) \{\s*\.prof-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/)
    expect(PAGES).toContain('.prof-nav-item { flex: none; white-space: nowrap; }')
  })

  it('keeps the single-column fallback out of the page: no 720px column is left over', () => {
    expect(LAYOUT).not.toContain('.profile-col { max-width: 720px; }')
    expect(TSX).not.toContain('profile-col')
  })
})

describe('Profile: the rail is an anchor list with a current-section mark', () => {
  it('targets every section, and the page draws an element for each', () => {
    for (const key of SECTIONS) {
      expect(TSX, `the rail has no ${key} target`).toContain(`['${key}',`)
      expect(TSX, `the page draws no #prof-${key}`).toContain(`<Section id="${key}"`)
    }
    expect(TSX).toContain('href={`#prof-${key}`}')
  })

  it('draws the rail from the sections that render, so no anchor is dead', () => {
    // A gated section that draws nothing must not leave a jump link behind.
    expect(TSX).toContain('{shownSections.map(([key, label, Icon]) => (')
    expect(TSX).toContain('visibleSections({ ai: AI_COMPANION_ENABLED, install: installSectionShown })')
    // Each card reports into its own state. One shared setter meant the second
    // write always won, so a build with only one card still reported "nothing".
    expect(TSX).toContain('onRenderable={setUpdateShown}')
    expect(TSX).toContain('onRenderable={setInstallShown}')
  })

  it('marks the current section with aria-current, never with color alone', () => {
    expect(TSX).toContain("aria-current={activeSection === key ? 'true' : undefined}")
    // The mark is observed, not inferred from a click.
    expect(TSX).toContain('new IntersectionObserver(')
  })

  it('is a nav, not a tablist: every section is on the page at once', () => {
    expect(TSX).toContain('<nav ref={navRef} className="prof-nav yf-surface" aria-label="Settings sections">')
    expect(TSX).not.toContain('role="tablist"')
  })
})

describe('Profile: the supporting rail shows only saved data', () => {
  it('reads the profile the user already saved and invents no metric', () => {
    expect(TSX).toContain('How others see you')
    expect(TSX).toContain('me.profile.travelStyles')
    for (const invented of ['followers', 'completeness', 'Profile complete', 'lastSaved', 'Saved 2 min']) {
      expect(TSX, `the rail must not invent "${invented}"`).not.toContain(invented)
    }
  })

  it('draws connected accounts from the saved creator links only', () => {
    expect(TSX).toContain('me.profile.socialLinks')
    expect(TSX).toContain("['YouTube', socialLinks.youtube]")
    expect(TSX).toContain("['Instagram', socialLinks.instagram]")
    // No OAuth control, no connect/disconnect, no sync state.
    expect(TSX).not.toMatch(/Connect (YouTube|Instagram)/)
    expect(TSX).not.toContain('Disconnect')
  })
})

describe('Profile: the page keeps the Save handler and its error path', () => {
  it('keeps validation, the pending state and the scroll-to-error beside the fields', () => {
    expect(TSX).toContain("setNameErr('Pick a display name — it shows on shared trips.')")
    expect(TSX).toContain('el.scrollIntoView({ behavior: scrollBehavior(), block: \'center\' })')
    expect(TSX).toContain('disabled={saving}')
    expect(TSX).toContain('setSaveErr(r.error ?? PROFILE_NOT_SAVED)')
    // The control sits in the details section, under the fields it validates.
    const details = TSX.slice(TSX.indexOf('<Section id="details"'), TSX.indexOf('<Section id="styles"'))
    expect(details).toContain('>Save profile</button>')
  })

  it('keeps instant-save on the chips and the hooks above the guard', () => {
    expect(TSX).toContain('async function toggleStyle(s: TravelStyle) {')
    // The real guard, not a comment that quotes it: a statement at two spaces.
    const guard = TSX.search(/^ {2}if \(!me\) return null$/m)
    expect(guard).toBeGreaterThan(0)
    expect(TSX.slice(guard)).not.toMatch(/^\s{2}const\s+\w+\s*=\s*use[A-Z]\w*\(/m)
  })

  it('reads the install conditions before either card early-returns', () => {
    // A hook under an early return crashes when the condition flips after mount.
    for (const fn of ['function UpdatePanel', 'function InstallCard']) {
      const start = TSX.indexOf(fn)
      expect(start, fn).toBeGreaterThan(0)
      const body = TSX.slice(start, TSX.indexOf('\n}\n', start))
      const firstReturn = body.indexOf('if (!renderable) return null')
      const reportHook = body.indexOf('useEffect(() => { onRenderable(renderable) }')
      expect(firstReturn, `${fn} must early-return only after the report hook`).toBeGreaterThan(0)
      expect(reportHook).toBeGreaterThan(0)
      expect(reportHook).toBeLessThan(firstReturn)
    }
  })
})

describe('Profile: page-owned styling reaches no shared component default', () => {
  it('gives the pressed chip its own class and leaves the shared chip alone', () => {
    expect(PAGES).toContain(".prof-chip[aria-pressed='true'] {")
    expect(TSX).toContain('className="prof-chip"')
    // The shared rule is untouched: it still fills with ink.
    const explore = read('src/styles/legacy/10-explore.css')
    expect(explore).toContain(".ex-chip[aria-pressed='true'] { background: var(--text);")
  })

  it('scopes the 24px card corners to this page', () => {
    expect(PAGES).toContain('.prof-page .yf-surface.prof-panel { border-radius: var(--radius-lg); padding: var(--space-10); }')
    // The shared surface keeps its own radius.
    expect(read('src/styles/legacy/11-shared-page.css')).toContain('border-radius: var(--radius); box-shadow: var(--shadow-card);')
  })
})

describe('Profile: travel styles use the two-column row grid', () => {
  it('gives the style group its own grid and keeps multi-select chips', () => {
    expect(TSX).toContain('className="prof-style-grid"')
    expect(TSX).toContain('className="prof-chip"')
    expect(TSX).toContain('<div className="chip-row">')
    expect(PAGES).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));')
    expect(PAGES).toContain(".prof-chip[aria-pressed='true']")
  })

  it('leaves Trip Settings Pace single-select and unchanged', () => {
    const pace = read('src/pages/trip/TripSettingsForm.tsx')
    expect(pace).toContain('className="tset-pace-rows" role="group" aria-label="Travel style"')
    expect(pace).toContain('f.travelStyle === s')
  })
})
