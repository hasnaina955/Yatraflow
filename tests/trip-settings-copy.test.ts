import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NEW_DAY_HINT,
  SPENDING_STYLE_HINT,
  settingsBudgetScale,
  settingsDayGridHint,
  settingsEndPlace,
  settingsPeopleSummary,
  spendingStyleLabel,
} from '../src/pages/trip/TripSettingsForm'

const source = readFileSync(join(process.cwd(), 'src/pages/trip/TripSettingsForm.tsx'), 'utf8')
  .replace(/\r\n/g, '\n')

describe('Trip settings artboard copy and controls', () => {
  it('ends at the last destination, then the start location, then an honest empty state', () => {
    expect(settingsEndPlace([{ name: 'Kochi' }, { name: 'Alleppey' }], 'Kochi')).toBe('Alleppey')
    expect(settingsEndPlace([{ name: 'Kochi' }, { name: '  ' }], 'Kochi')).toBe('Kochi')
    expect(settingsEndPlace([], 'Kochi')).toBe('Kochi')
    expect(settingsEndPlace([], '  ')).toBe('No destination yet')
  })

  it('uses the artboard budget range for a normal plan and falls back outside it', () => {
    expect(settingsBudgetScale(15_000, 15_560)).toMatchObject({
      min: 5_000,
      max: 40_000,
      step: 500,
      minLabel: '₹5,000',
      maxLabel: '₹40,000',
      isTypical: true,
    })
    expect(settingsBudgetScale(4_999, 15_560)).toMatchObject({
      min: 0,
      max: 300_000,
      minLabel: '₹0',
      maxLabel: '₹3L',
      isTypical: false,
    })
    expect(settingsBudgetScale(40_001, 15_560).isTypical).toBe(false)
    expect(settingsBudgetScale(15_000, 40_001).isTypical).toBe(false)
  })

  it('keeps the artboard budget marker derived from the plan', () => {
    expect(source).toContain(
      'marker={{ value: planPerPerson, label: `Current plan ${formatInr(planPerPerson)} each` }}',
    )
    expect(source).toContain('const budgetScale = settingsBudgetScale(clampedBudget, planPerPerson)')
  })

  it('shows Shoestring, Balanced and Comfort without changing the stored style values', () => {
    expect((['budget', 'comfort', 'luxury'] as const).map(spendingStyleLabel)).toEqual([
      'Shoestring',
      'Balanced',
      'Comfort',
    ])
    expect(source).toContain('onClick={() => setF(x => ({ ...x, stayStyle: s }))}')
  })

  it('uses the new-day copy only when a positive date change can save', () => {
    expect(settingsDayGridHint(1, 'Adds 1 empty day at the end', false)).toBe(NEW_DAY_HINT)
    expect(settingsDayGridHint(0, 'Day count unchanged', false))
      .toBe('Day count unchanged. Existing stops stay on their dates.')
    expect(settingsDayGridHint(-2, 'Drops 2 empty trailing days (days with stops are kept)', false))
      .toBe('Drops 2 empty trailing days (days with stops are kept). Existing stops stay on their dates.')
    expect(settingsDayGridHint(1, 'Adds 1 empty day at the end', true))
      .toBe('Adds 1 empty day at the end. Existing stops stay on their dates.')
  })

  it('keeps one space in the People summary', () => {
    expect(settingsPeopleSummary(3, 2, 'private')).toBe('3 members · 2 can edit · link sharing off')
    expect(settingsPeopleSummary(1, 1, 'public')).toBe('1 member · 1 can edit · link sharing on')
  })

  it('keeps the spending hint to the artboard sentence and leaves the over-budget strip in place', () => {
    expect(SPENDING_STYLE_HINT).toBe('Changes which stays and restaurants the app suggests first.')
    expect(source).toContain('<span className="hint-text">{SPENDING_STYLE_HINT}</span>')
    expect(source).not.toContain('Prices the bed at')
    expect(source).toContain('{planOverPerPerson > 0 && (')
  })

  it('uses the car glyph for the travel section head, not the selected mode glyph', () => {
    const travelStart = source.indexOf('<Surface as="section" className="tsx-card tsx-card--machine"')
    const modeBlock = source.indexOf('<div className="bench-block bench-mode-block">', travelStart)
    const travelHead = source.slice(travelStart, modeBlock)
    expect(travelHead).toContain('<span className="tsx-ico" aria-hidden="true"><Car size={18} /></span>')
    expect(travelHead).not.toContain('modeIcon(f.transportMode)')
    expect(source).toContain('{modeIcon(m)}')
  })

  it('exposes the driver and pace hooks Ling styles, and keeps the product extras', () => {
    expect(source).toContain('<div className="tset-driver-pace-pair">')
    expect(source).toContain('<PillNav className="seg tset-pace-seg"')
    expect(source).toContain('{TRANSPORT_MODES.map(m => (')
    expect(source).toContain('{TRAVEL_STYLES.map(s => (')
    expect(source).toContain('{[2, 3].map(n => (')
    expect(source).toContain('className="vehicle-profile-form"')
  })
})
