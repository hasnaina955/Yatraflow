// The Chakra tile's mood rules (src/lib/budgetMood.ts). The order matters: the
// first rule that matches wins.
import { describe, expect, it } from 'vitest'
import { MOOD_POSE, budgetMood, type BudgetMood } from '../src/lib/budgetMood'
import { MASCOT_FILES, mascotFile } from '../src/lib/mascot'

const calm = { hasTarget: true, pctUsed: 40, ledgerLines: 0, settledPct: 0 }

describe('budgetMood rules', () => {
  it('is unset when the trip has no target', () => {
    expect(budgetMood({ ...calm, hasTarget: false })).toBe('unset')
  })

  it('is worried over 100 percent of the target', () => {
    expect(budgetMood({ ...calm, pctUsed: 101 })).toBe('worried')
  })

  it('is careful from 90 percent up to and including 100 percent', () => {
    expect(budgetMood({ ...calm, pctUsed: 90 })).toBe('careful')
    expect(budgetMood({ ...calm, pctUsed: 100 })).toBe('careful')
  })

  it('is happy below 90 percent', () => {
    expect(budgetMood({ ...calm, pctUsed: 89 })).toBe('happy')
  })

  it('is proud when there are ledger lines and every line is settled', () => {
    expect(budgetMood({ ...calm, ledgerLines: 2, settledPct: 100 })).toBe('proud')
  })

  it('is happy when every line is settled but the ledger is empty', () => {
    expect(budgetMood({ ...calm, ledgerLines: 0, settledPct: 100 })).toBe('happy')
  })

  it('is happy while any line is still open', () => {
    expect(budgetMood({ ...calm, ledgerLines: 2, settledPct: 99 })).toBe('happy')
  })
})

describe('budgetMood order', () => {
  it('ranks over 100 percent above proud', () => {
    expect(budgetMood({ hasTarget: true, pctUsed: 120, ledgerLines: 3, settledPct: 100 })).toBe('worried')
  })

  it('ranks careful above proud', () => {
    expect(budgetMood({ hasTarget: true, pctUsed: 95, ledgerLines: 3, settledPct: 100 })).toBe('careful')
  })

  it('ranks no target above every other rule', () => {
    expect(budgetMood({ hasTarget: false, pctUsed: 150, ledgerLines: 3, settledPct: 100 })).toBe('unset')
  })
})

describe('MOOD_POSE', () => {
  it('maps each mood to the pose the brief names', () => {
    expect(MOOD_POSE).toEqual({ unset: 'idle', happy: 'budget', careful: 'thinking', worried: 'sad', proud: 'love' })
  })

  it('gives every mood a pose that resolves to a shipped mascot file', () => {
    const moods: BudgetMood[] = ['unset', 'happy', 'careful', 'worried', 'proud']
    for (const mood of moods) {
      const pose = MOOD_POSE[mood]
      expect(MASCOT_FILES[pose]).toBeDefined()
      expect(mascotFile(pose, { animated: true })).toMatch(/^brand\/mascot\/.+\.svg$/)
    }
  })
})
