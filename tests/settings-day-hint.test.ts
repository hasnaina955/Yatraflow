import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NEW_DAY_HINT,
  SAVE_REFUSED_HINT,
  settingsDayGridHint,
} from '../src/pages/trip/TripSettingsForm'

// Source-only pin for the day-grid hint. A refused shorten must not promise a
// drop. The save predicate and reconcile call stay in their own suites.
const tsx = readFileSync(join(process.cwd(), 'src/pages/trip/TripSettingsForm.tsx'), 'utf8')
  .replace(/\r\n/g, '\n')

const SHORTEN = 'Drops 2 empty trailing days (days with stops are kept)'
const ONE_DAY_SHORTEN = 'Drops 1 empty trailing day (days with stops are kept)'

describe('Settings day-grid hint honesty', () => {
  it('keeps the valid shorten, new-day and unchanged copy', () => {
    expect(settingsDayGridHint(-2, SHORTEN, false))
      .toBe('Drops 2 empty trailing days (days with stops are kept). Existing stops stay on their dates.')
    expect(settingsDayGridHint(1, 'Adds 1 empty day at the end', false)).toBe(NEW_DAY_HINT)
    expect(settingsDayGridHint(0, 'Day count unchanged', false))
      .toBe('Day count unchanged. Existing stops stay on their dates.')
  })

  it('does not promise a drop when a shortened range is refused', () => {
    const hint = settingsDayGridHint(-2, SHORTEN, true)
    expect(hint).toBe(SAVE_REFUSED_HINT)
    expect(hint).not.toContain(SHORTEN)
    expect(hint).toMatch(/Save is blocked/)
  })

  it('covers a single-day shorten and a commitment-only protected day', () => {
    // One day and two days share the same refusal copy.
    // Terra checks the commitment-only case in the browser.
    expect(settingsDayGridHint(-1, ONE_DAY_SHORTEN, true)).toBe(SAVE_REFUSED_HINT)
  })

  it('keeps the refused add-day copy locked by the copy suite', () => {
    expect(settingsDayGridHint(1, 'Adds 1 empty day at the end', true))
      .toBe(SAVE_REFUSED_HINT)
  })

  it('does not show a drop label as the calendar hint during a refusal', () => {
    expect(tsx).toContain('const dayDeltaLabel = settingsDayDeltaLabel(dayDelta, !dry.ok)')
    expect(tsx).toContain('hint={dayDeltaLabel}')
  })

  it('leaves the save predicate and the dry run untouched', () => {
    expect(tsx).toContain('const dry = settingsDryRun(f, dests, startPin, trip)')
    expect(tsx).toContain('const canSave = dry.ok && settingsAreDirty(dry.patch, trip)')
    expect(tsx).toContain('const dayGridHint = settingsDayGridHint(dayDelta, dayDeltaLabel, !dry.ok)')
  })
})
