import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { earlyArrivalAdvisory } from '../src/lib/engine'

describe('early arrival advisory', () => {
  it('suggests a start for a wait of 30 minutes, including the first stop', () => {
    expect(earlyArrivalAdvisory('08:30', '09:00', '07:00')).toEqual({ waitMinutes: 30, suggestedStart: '07:30', canShift: true })
  })

  it('ignores short waits and missing or invalid opening times', () => {
    expect(earlyArrivalAdvisory('08:31', '09:00', '07:00')).toBeNull()
    expect(earlyArrivalAdvisory('08:30', undefined, '07:00')).toBeNull()
    expect(earlyArrivalAdvisory('08:30', '25:99', '07:00')).toBeNull()
  })

  it('does not offer a start that crosses midnight', () => {
    expect(earlyArrivalAdvisory('00:15', '01:00', '23:30')).toEqual({ waitMinutes: 45, suggestedStart: null, canShift: false })
  })

  it('does not offer a start that reaches midnight', () => {
    expect(earlyArrivalAdvisory('00:30', '01:00', '23:30')).toEqual({ waitMinutes: 30, suggestedStart: null, canShift: false })
  })

  it('routes the action through the preview and keeps dismissal local', () => {
    const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    const day = read('src/pages/trip/timeline/DaySection.tsx')
    const tab = read('src/pages/trip/TimelineTab.tsx')
    const css = read('src/styles/pages/workspace-timeline.css')
    expect(day).toContain('saveFlag(advisoryKey, true)')
    expect(day).toContain('{editable && advisory.canShift && <button type="button" disabled={previewOpen}')
    expect(day).toContain('{renderEarlyArrival(ordered[i + 1])}')
    expect(day).toContain('{renderEarlyArrival(first)}')
    expect(tab).toMatch(/handleSuggestDayStart[\s\S]*?latest\.current\.applyChange/)
    expect(css).toContain('var(--motion-med) var(--ease-paper)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })
})
