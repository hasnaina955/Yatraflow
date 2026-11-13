// Package C, item 2 (#898): the minute scope — 15 / 30 / 45 / 60 minutes of extra
// driving, default 30. Pure helpers first; the control is checked below.
import { describe, expect, it } from 'vitest'
import {
  MINUTE_SCOPE_STEPS, DEFAULT_SCOPE_MINUTES, scopeStorageKey, readScopeMinutes, scopeKmForMinutes,
  scopeCounts, scopeValueMinutesText, nextScopeMinutes,
} from '../src/pages/trip/map/minuteScope'

describe('minute scope steps', () => {
  it('offers 15, 30, 45 and 60 minutes, default 30', () => {
    expect(MINUTE_SCOPE_STEPS).toEqual([15, 30, 45, 60])
    expect(DEFAULT_SCOPE_MINUTES).toBe(30)
  })

  it('stores one value per trip', () => {
    expect(scopeStorageKey('t1')).not.toBe(scopeStorageKey('t2'))
  })

  it('reads a saved step and falls back to 30 for anything else', () => {
    expect(readScopeMinutes('45')).toBe(45)
    expect(readScopeMinutes('')).toBe(30)
    expect(readScopeMinutes('20')).toBe(30)
    expect(readScopeMinutes('abc')).toBe(30)
    expect(readScopeMinutes(null)).toBe(30)
  })

  it('turns extra driving into a one-way search radius at the engine speed', () => {
    // out and back: 30 min at 40 km/h is 10 km each way
    expect(scopeKmForMinutes(30)).toBe(10)
    expect(scopeKmForMinutes(60)).toBe(20)
    expect(scopeKmForMinutes(15)).toBe(5)
  })

  it('moves one step wider and stops at the last step', () => {
    expect(nextScopeMinutes(15)).toBe(30)
    expect(nextScopeMinutes(60)).toBe(60)
  })

  it('speaks its value in words', () => {
    expect(scopeValueMinutesText(30)).toBe('30 minutes of extra driving')
  })
})

describe('scopeCounts', () => {
  const rows = [
    { detourMin: 0 }, { detourMin: 12 }, { detourMin: 30 }, { detourMin: 31 },
    { detourMin: 45 }, { detourMin: 46 }, { detourMin: 90 }, { detourMin: null },
  ]
  it('counts inside, just past (one step wider) and unknown separately', () => {
    expect(scopeCounts(rows, 30)).toEqual({ inside: 3, justPast: 2, unknown: 1 })
  })
  it('never counts a missing detour as inside', () => {
    expect(scopeCounts([{ detourMin: null }, { detourMin: Number.NaN }], 60)).toEqual({ inside: 0, justPast: 0, unknown: 2 })
  })
  it('counts nothing for no rows', () => {
    expect(scopeCounts([], 30)).toEqual({ inside: 0, justPast: 0, unknown: 0 })
  })
})

import { dayPurposesFor } from '../src/pages/trip/map/minuteScope'
import { FUEL_INTERVAL_KM } from '../src/lib/ridePlan'

describe('dayPurposesFor', () => {
  const day = (over: Partial<{ startKm: number; endKm: number; nightHaltKm: number | null }>) =>
    ({ leg: 'outbound' as const, dayIndex: 1, startKm: 0, endKm: 200, nightHaltKm: null, nightHaltEtaMin: null, startMin: 510, ...over })
  it('asks only for sights and a meal when the day has no driving plan', () => {
    expect(dayPurposesFor(undefined)).toEqual(['meal', 'sight'])
  })
  it('adds a stretch break on a driving day', () => {
    expect(dayPurposesFor(day({}))).toEqual(['meal', 'sight', 'stretch'])
  })
  it('adds the night halt when the plan has one', () => {
    expect(dayPurposesFor(day({ nightHaltKm: 200 }))).toContain('overnight')
  })
  it('adds fuel only when the day reaches the fuel interval', () => {
    expect(dayPurposesFor(day({ endKm: FUEL_INTERVAL_KM - 1 }))).not.toContain('fuel')
    expect(dayPurposesFor(day({ endKm: FUEL_INTERVAL_KM }))).toContain('fuel')
  })
})

import { readFileSync } from 'node:fs'
import { scopeCountsText } from '../src/pages/trip/map/MinuteScopeControl'

describe('scope control copy and markup', () => {
  it('says each count state apart', () => {
    expect(scopeCountsText({ kind: 'ready', counts: { inside: 4, justPast: 0, unknown: 0 } })).toBe('4 inside · 0 just past')
    expect(scopeCountsText({ kind: 'ready', counts: { inside: 4, justPast: 2, unknown: 3 } })).toBe('4 inside · 2 just past · 3 with unknown driving')
    expect(scopeCountsText({ kind: 'loading' })).toBe('Counting places…')
    expect(scopeCountsText({ kind: 'unavailable', reason: 'Search failed' })).toBe('Search failed')
  })
  it('is a keyboard radio group with a live count', () => {
    const src = readFileSync('src/pages/trip/map/MinuteScopeControl.tsx', 'utf8')
    expect(src).toContain('role="radiogroup"')
    expect(src).toContain('role="radio"')
    expect(src).toContain('aria-live="polite"')
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) expect(src).toContain(key)
  })
})
