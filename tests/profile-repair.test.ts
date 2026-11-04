// ============ Profile repair: the three review findings, pinned ============
// Each block below fails on the code the reviewer read and passes on the repair.
// The source is read as text, the same way this suite's other gates read it, so
// the test states the defect in the place it lives instead of asserting a
// behaviour it cannot render in a node environment.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const profile = read('../src/pages/Profile.tsx')
const pages = read('../src/styles/legacy/12-pages.css')
const select = read('../src/styles/legacy/02-select-and-print.css')

/** The text of one CSS rule, from its selector to its closing brace. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`)
  expect(at, `${selector} must exist`).toBeGreaterThan(-1)
  return css.slice(at, css.indexOf('}', at) + 1)
}

/** The start index of every occurrence of a selector as a rule head. */
function ruleHeads(css: string, selector: string): number[] {
  const out: number[] = []
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{`, 'g')
  for (let m = re.exec(css); m; m = re.exec(css)) out.push(m.index)
  return out
}

describe('P1 — a hidden section must not unmount its reporters', () => {
  it('Section renders the hidden attribute instead of returning null', () => {
    // The original body began `if (hidden) return null`. That is the deadlock:
    // the cards inside never mount, so they never report, so the section stays
    // hidden forever. Read the function body, not a CSS rule.
    const at = profile.indexOf('function Section(')
    expect(at).toBeGreaterThan(-1)
    // The signature is multi-line, so the body ends at the first `}` that starts
    // its own line AND closes the function — `\n}\n`, not `\n}`, which would
    // otherwise stop at the prop type's closing brace.
    const body = profile.slice(at, profile.indexOf('\n}\n', at) + 3)
    expect(body).not.toMatch(/if \(hidden\)\s+return null/)
    expect(body).toMatch(/hidden=\{hidden\}/)
  })

  it('the install section stays mounted and carries its own hidden state', () => {
    const section = profile.slice(profile.indexOf('id="install"') - 200, profile.indexOf('id="install"') + 320)
    expect(section).toMatch(/hidden=\{[^}]*installSectionShown[^}]*\}/)
    // Both cards are still rendered, so both can report.
    expect(section).toContain('<UpdatePanel')
    expect(section).toContain('<InstallCard')
  })

  it('each card reports into its own state, never one shared boolean', () => {
    // The original wiring passed setInstallShown to BOTH cards: last write won.
    expect(profile).toContain('<UpdatePanel onRenderable={setUpdateShown}')
    expect(profile).toContain('<InstallCard onRenderable={setInstallShown}')
    expect(profile).toMatch(/const installSectionShown = updateShown \|\| installShown/)
  })

  it('a section that hides itself exposes no focusable child', () => {
    // `hidden` is the mechanism, and it removes the subtree from the tab order.
    // A `display:none`-style override elsewhere would undo that, so it must not
    // exist for a hidden section.
    expect(pages).not.toMatch(/\.prof-section\[hidden\][^}]*display\s*:\s*(block|flex|grid)/)
  })
})

describe('P1 — the phone rail must beat the base column rule', () => {
  const baseHead = ruleHeads(pages, '.prof-nav')
  const phoneHeads = [...pages.matchAll(/@media \(max-width: 860px\)/g)].map(m => m.index ?? 0)

  it('the base rule is a column', () => {
    expect(rule(pages, '.prof-nav')).toMatch(/flex-direction:\s*column/)
  })

  it('the phone override comes after the base rule in the cascade', () => {
    // The defect was an equal-specificity phone rule in the file that loads
    // FIRST (02-select-and-print.css), so the later base rule won. The repair
    // moved it, rather than escalating specificity.
    const phoneRow = [...pages.matchAll(/\.prof-nav \{[^}]*flex-direction: row/g)].map(m => m.index ?? 0)
    expect(phoneRow.length, 'exactly one phone row rule').toBe(1)
    expect(phoneRow[0]).toBeGreaterThan(baseHead[0])
    expect(phoneHeads.some(h => h < phoneRow[0])).toBe(true)
  })

  it('no duplicate phone copy is left in the earlier stylesheet', () => {
    // A second copy there is the bug itself: it loses, and it misleads the next
    // reader into thinking the phone case is handled.
    expect(select).not.toMatch(/@media \(max-width: 860px\) \{[^}]*\.prof-nav\s*\{/)
    expect(ruleHeads(select, '.prof-nav')).toHaveLength(0)
  })

  it('the strip is sticky, scrolls on one axis, and keeps 44px rows', () => {
    const phone = pages.slice(pages.search(/\/\* -+ Profile: the phone rail/))
    expect(rule(pages, '.prof-nav')).toMatch(/position:\s*sticky/)
    expect(phone).toMatch(/overflow-x:\s*auto/)
    expect(phone).toMatch(/overscroll-behavior-inline:\s*contain/)
    expect(pages).toMatch(/@media \(pointer: coarse\)[\s\S]*?\.prof-nav-item \{ min-height: 44px; \}/)
  })
})

describe('P2 — the scroll spy must bind to the rendered user, not to a count', () => {
  it('there is exactly one observer', () => {
    // Two effects both attached an observer: the first, keyed on [], could never
    // re-attach, and both could run while no sections existed.
    expect(profile.match(/new IntersectionObserver\(/g)).toHaveLength(1)
  })

  it('the observer keys on the user and the rendered section ids', () => {
    expect(profile).toMatch(/const sectionKey = me \? `/)
    expect(profile).toMatch(/\}, \[sectionKey\]\)/)
    // The count-only dependency is the defect: it stays equal across a hydration
    // that adds no sections, so the effect never re-runs.
    expect(profile).not.toMatch(/sectionCount/)
  })

  it('hooks stay above the early return', () => {
    const guard = profile.indexOf('if (!loggedIn)')
    const install = profile.indexOf('const [installShown')
    expect(guard).toBeGreaterThan(-1)
    expect(install).toBeLessThan(guard)
    // The observer's own effect must also sit above it.
    expect(profile.indexOf('new IntersectionObserver(')).toBeLessThan(guard)
  })

  it('only rendered sections are observed', () => {
    // A hidden section is not on the page; observing it would mark a section the
    // reader cannot see.
    expect(profile).toContain(".prof-main > .prof-section:not([hidden])")
  })
})

describe('Section accents — tile tint and hairline border only', () => {
  it('maps exactly four sections, with the approved roles', () => {
    const expected = [
      ['details', 'teal'], ['styles', 'teal'], ['creator', 'marigold'], ['ai', 'jev'],
    ]
    for (const [id, accent] of expected) {
      expect(profile).toMatch(new RegExp(`id="${id}"[^>]*accent="${accent}"`))
    }
    // Nothing else is accented: a hue per card would invent a legend.
    const all = [...profile.matchAll(/<Section id="([^"]+)"[^>]*accent="([^"]+)"/g)].map(m => m[1])
    expect(all.sort()).toEqual(['ai', 'creator', 'details', 'styles'])
  })

  it('the Section component accepts only the three approved accents', () => {
    expect(profile).toMatch(/accent\?: 'teal' \| 'marigold' \| 'jev'/)
    expect(profile).toMatch(/data-accent=\{accent\}/)
  })

  it('tints the tile and the card border, and nothing else', () => {
    for (const accent of ['teal', 'marigold', 'jev']) {
      const rules = [...pages.matchAll(new RegExp(`\\.prof-section\\[data-accent='${accent}'\\] ([^{]+)\\{([^}]*)\\}`, 'g'))]
      expect(rules.length).toBe(2)
      const targets = rules.map(r => r[1].trim()).sort()
      // Exactly the icon tile and the card's own hairline; no text, no surface.
      expect(targets).toEqual(['.prof-tile', '.yf-surface.prof-panel'])
      for (const r of rules) {
        const decls = r[2]
        expect(decls).toMatch(/var\(--/)
        // A raw hex here would be a new colour, which the ruling forbids.
        expect(decls).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      }
    }
  })

  it('uses no semantic ok/risk token, so decoration claims no status', () => {
    const block = pages.slice(pages.indexOf("/* ---------- Profile: the section accent"))
    const region = block.slice(0, block.indexOf('/* ===== Trip settings: touch targets'))
    expect(region).not.toMatch(/--pw-ok|--pw-risk|--status-active/)
  })
})

describe('Typography — Profile card titles follow the adopted ruling', () => {
  it('the panel title uses the Sora title token', () => {
    // DESIGN.md's 28 Oct ruling supersedes R14: Sora carries card titles. The
    // user confirmed this for Profile alone.
    const r = rule(pages, '.prof-panel-title')
    expect(r).toMatch(/font:\s*var\(--pw-title\)/)
    expect(r).toMatch(/letter-spacing:\s*var\(--pw-title-tracking\)/)
    expect(r).not.toMatch(/var\(--font-body\)/)
  })

  it('Trip Settings keeps its own card-title face', () => {
    // Scoped to Profile: the shared Settings rules must not move with it.
    expect(pages).toMatch(/\.tsx-card \.tsx-q \{ font-family: var\(--font-body\); font-size: 18px; font-weight: 800; line-height: 1\.3;/)
  })

  it('no comment still claims Profile titles are Plus Jakarta Sans', () => {
    const near = pages.slice(pages.indexOf('.prof-panel-title') - 700, pages.indexOf('.prof-panel-title') + 200)
    expect(near).not.toMatch(/panel title[^.\n]*Plus Jakarta/i)
  })
})
