// The landing links that once changed only the hash. Each one must render
// through appLink, so a web click runs one in-app navigation to its page (#714).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (rel: string) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const landing = read('src/pages/Landing.tsx')
const planBench = read('src/components/PlanBench.tsx')

// The text of each anchor that spreads appLink(target).
// It runs from the end of the opening tag to the closing tag.
// Elements other than anchors are skipped.
function anchorTextsFor(source: string, target: string): string[] {
  const texts: string[] = []
  for (const match of source.matchAll(/\{\.\.\.appLink\('([^']*)'\)\}/g)) {
    if (match[1] !== target) continue
    const spread = match.index ?? 0
    const tagStart = source.lastIndexOf('<', spread)
    const tagEnd = source.indexOf('>', spread)
    const close = source.indexOf('</a>', tagEnd)
    if (tagStart === -1 || tagEnd === -1 || close === -1) continue
    if (!/^<a\s/.test(source.slice(tagStart, tagEnd + 1))) continue
    texts.push(source.slice(tagEnd + 1, close))
  }
  return texts
}

// True when an anchor spreads appLink(target) and its text starts with label,
// with no nested element inside the anchor.
function linksTo(source: string, target: string, label: string): boolean {
  return anchorTextsFor(source, target).some(text => text.trimStart().startsWith(label) && !text.includes('<'))
}

describe('landing links open their pages through appLink', () => {
  it('spreads the hero planning link from one computed path', () => {
    expect(landing).toMatch(/const startPlanningPath = me \? CREATE_PATH : signupThenCreatePath\(\)/)
    expect(landing).toMatch(/<a\b[^>]*\{\.\.\.appLink\(startPlanningPath\)\}/)
  })

  it('sends Explore itineraries to /explore', () => {
    expect(linksTo(landing, '/explore', 'Explore itineraries')).toBe(true)
  })

  it('sends Create a free account to signup', () => {
    expect(linksTo(landing, '/auth?mode=signup', 'Create a free account')).toBe(true)
  })

  it('sends Copyright and DMCA to /dmca', () => {
    expect(linksTo(landing, '/dmca', 'Copyright and DMCA')).toBe(true)
  })

  it('sends or browse ready itineraries to /explore', () => {
    expect(linksTo(planBench, '/explore', 'Or browse ready itineraries')).toBe(true)
  })

  it('sends See how it works to /how-it-works', () => {
    expect(linksTo(landing, '/how-it-works', 'See how it works')).toBe(true)
  })

  it('keeps the calculator hub a plain href behind the web-only gate, in the hero and under the Plan Bench', () => {
    // The hub is a static page outside the router, so it cannot be an appLink.
    expect(landing).toMatch(/const showCalculator = !isNative/)
    expect(landing).toMatch(/\{showCalculator && <a className="text-link" href="\/trip-cost-calculators\/">Price a trip first<\/a>\}/)
    expect(landing).toMatch(/\{showCalculator && \(\s*<p className="small muted landing-hub-link">[\s\S]*?<a className="text-link" href="\/trip-cost-calculators\/">Try the destination calculators\.<\/a>/)
  })

  it('imports the native flag that the calculator gate reads', () => {
    expect(landing).toMatch(/import \{ isNative \} from '\.\.\/lib\/native'/)
  })

  it('imports the shared helper in both files', () => {
    expect(landing).toMatch(/import \{ appLink \} from '\.\.\/lib\/appLink'/)
    expect(planBench).toMatch(/import \{ appLink \} from '\.\.\/lib\/appLink'/)
  })
})
