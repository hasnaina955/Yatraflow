// Source pins for the footer route mark (consistency P1), and for the footer's
// four labelled link groups. The mark is a decorative svg. It is hidden from
// assistive tech, it is not a link, and it does not move.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { readCssSource } from '../scripts/css-source-graph.mjs'

const read = (rel: string) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const app = read('src/App.tsx')
const css = readCssSource('src/styles.css')
// The group rules live in the footer's owner file, so the token and layout pins read it directly.
const siteFooterCss = read('src/styles/components/site-footer.css')

const footerOpen = app.indexOf('<footer className="footer">')
const footerClose = app.indexOf('</footer>', footerOpen)
const footer = footerOpen < 0 || footerClose < 0 ? '' : app.slice(footerOpen, footerClose + '</footer>'.length)
const MARK_BLOCK_START = '/* ---------- Footer route mark'
const markStart = css.indexOf(MARK_BLOCK_START)
// Bound the assertion to the footer-mark RULE, not to EOF. This file appends
// unrelated motion after the block, and a to-EOF slice would reject that too.
const markBlock = markStart < 0 ? '' : css.slice(markStart, css.indexOf('\n}', markStart) + 2)

describe('footer route mark (P1)', () => {
  it('renders one decorative svg inside the footer, hidden from assistive tech', () => {
    expect(footer).not.toBe('')
    expect(footer.match(/<svg\b/g)?.length).toBe(1)
    expect(footer).toMatch(/<svg\b[^>]*aria-hidden="true"/)
    expect(footer).toMatch(/<svg\b[^>]*focusable="false"/)
  })

  it('keeps the about, copy-page, feedback, calculator, Ladakh and creator links, and adds no other anchor', () => {
    expect(footer).toContain('href={feedbackHref()}')
    expect(footer).toContain('Send feedback')
    // The hub is the discovery path for all four calculators. The footer also
    // keeps a plain link to the Ladakh page. That page already ranks in search.
    // A sitewide internal link helps it.
    expect(footer).toContain('href="/trip-cost-calculators/"')
    expect(footer).toContain('href="/ladakh-trip-cost-calculator/"')
    expect(footer).toContain('How it works')
    expect(footer).toContain('FAQ')
    expect(footer).toContain('appLink(\'/about\')')
    // The creator page is also an in-app route, so it renders through appLink
    // and keeps a real path in href. Seven anchors: four internal routes, one
    // feedback and two static calculator pages, the hub and Ladakh.
    expect(footer).toContain("appLink('/for-creators')")
    expect(footer.match(/<a\s/g)?.length).toBe(7)
  })

  it('groups the links under one labelled footer nav, with a real heading on each group', () => {
    expect(footer.match(/<nav\b/g)?.length).toBe(1)
    expect(footer).toContain('<nav className="footer-groups" aria-label="Footer">')
    const titles = [...footer.matchAll(/<div className="footer-group">\s*<h2 className="footer-group-title">([^<]+)<\/h2>/g)].map(match => match[1])
    expect(titles).toEqual(['Plan', 'Help', 'Creators', 'Company'])
    expect(footer.match(/<h2 className="footer-group-title">/g)?.length).toBe(4)
    // The disclaimer keeps its text and its own line, outside the groups.
    expect(footer).toContain('All costs are transparent estimates. No bookings. Planning plus paid itinerary unlocks.')
  })

  it('hides the static calculator pages from the installed shell, as they cannot route there', () => {
    expect(footer).toMatch(/\{!isNative && <li><a className="footer-link" href="\/trip-cost-calculators\/">Trip cost calculators<\/a><\/li>\}/)
    expect(footer).toMatch(/\{!isNative && <li><a className="footer-link" href="\/ladakh-trip-cost-calculator\/">Ladakh trip cost calculator<\/a><\/li>\}/)
  })

  it('lays the groups out in two columns on a phone, Plan and Help then Creators and Company, and four from 721px up', () => {
    // The base rule is the phone layout: two tracks, so the DOM order fills row one with Plan and Help.
    expect(siteFooterCss).toMatch(/\.footer-groups \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
    expect(siteFooterCss).toMatch(/@media \(min-width: 721px\) \{\s*\.footer-groups \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/)
    expect(css).toMatch(/@media \(min-width: 721px\) \{\s*\.footer-groups \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/)
    // Each phone link keeps a 44px tap row: 12px of padding above and below the line.
    expect(siteFooterCss).toMatch(/\.footer-link \{\s*display: block;\s*padding-block: var\(--space-5\);/)
  })

  it('paints the footer groups with tokens only, so both themes follow the token blocks', () => {
    expect(siteFooterCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(siteFooterCss).not.toMatch(/\b(rgb|hsl)a?\(/)
    expect(siteFooterCss).not.toMatch(/\d\s*ms\b/)
  })

  it('positions the mark against the footer itself, not against its padding', () => {
    expect(css).toMatch(/\.footer \{[^}]*position: relative/)
    expect(markBlock).toMatch(/position: absolute;/)
    expect(markBlock).toMatch(/top: -6px;/)
  })

  it('adds a static CSS block with no raw milliseconds, transition or animation', () => {
    expect(css.indexOf(MARK_BLOCK_START)).toBeGreaterThan(-1)
    expect(markBlock).not.toMatch(/\d\s*ms\b/)
    expect(markBlock).not.toMatch(/transition|animation/i)
  })

  it('bounds the assertion to the footer-mark rule, not to the end of the file', () => {
    // The glider and other appended motion live after this block. The slice
    // stops at the rule's own closing brace, so they are not scanned.
    expect(markBlock).toContain('.footer-route-mark {')
    expect(markBlock).not.toContain('bench-pair')
    expect(markBlock.trimEnd().endsWith('}')).toBe(true)
  })

  it('still rejects a transition or animation placed inside the footer-mark rule', () => {
    const guard = (block: string) => !/\d\s*ms\b/.test(block) && !/transition|animation/i.test(block)
    expect(guard(markBlock)).toBe(true)
    expect(guard('.footer-route-mark {\n  transition: left 200ms;\n}')).toBe(false)
    expect(guard('.footer-route-mark {\n  animation: spin 1s linear;\n}')).toBe(false)
  })
})
