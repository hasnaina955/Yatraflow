import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('overview day cards', () => {
  it('uses the shared day status and opens the selected day', () => {
    const source = read('src/pages/trip/OverviewTab.tsx')
    expect(source).toContain('dayStrip(trip, health.warnings)')
    expect(source).toContain('onOpenTimeline({ dayIndex: day.index })')
    expect(source).toContain('No days yet')
    expect(source).toContain('stop.status !== \'rejected\'')
  })
  it('keeps cards phone-only and respects reduced motion', () => {
    const css = read('src/styles/legacy/17-overview-tiles-and-cover.css')
    expect(css).toMatch(/\.ovw-day-list\s*\{\s*display:\s*none/)
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.ovw-day-list/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.ovw-day-card[\s\S]*?animation:\s*none/)
    expect(css).toContain('var(--motion-slower) var(--ease-paper)')
  })
})
