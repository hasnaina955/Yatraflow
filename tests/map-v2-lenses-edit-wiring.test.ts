// Package C, item 3: source guards for the edit wiring. They check that the page
// uses the editing package's own entry points, and that no second write path appeared.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const hook = read('src/pages/trip/map/useMapEdit.ts')
const page = read('src/pages/trip/MapTab.tsx')
const css = read('src/styles.css')

describe('edit wiring', () => {
  it('holds the session in the editing reducer and previews before it writes', () => {
    expect(hook).toContain('useReducer(editSessionReducer')
    expect(hook).toContain('previewAdd({')
    expect(hook).toContain("dispatch({ type: 'preview'")
  })
  it('keeps through applyChange and settles only from the writer answer', () => {
    expect(hook).toMatch(/applyChange\(\s*addMutator/)
    expect(hook).toContain('outcomeFromKeep(receipt)')
    expect(hook).toContain('captureUndo(')
  })
  it('offers Undo only while the plan still matches, inside the 8 second window', () => {
    expect(hook).toContain("undoState(trip, undoRecord) === 'available'")
    expect(hook).toContain('undoMutator(rec)')
    expect(hook).toContain('undoSecondsLeft(undoStartedAt, now) > 0')
  })
  it('routes stop edits through proposeEdit, and asks before a fixed time moves', () => {
    for (const name of ['stepVisit', 'setVisitRequest', 'moveToDayRequest', 'swapWithStopRequest', 'proposeEdit', 'reorderFromKey', 'reorderRequest', 'announceReorder']) {
      expect(hook).toContain(name)
    }
    expect(hook).toContain('proposal.fixed.needsConfirm')
  })
  it('removes through removeStopWithUndo only', () => {
    expect(page).toContain('removeStop: removeStopFromMap')
    expect(page).toMatch(/removeStopWithUndo\(\{ trip, stopId/)
  })
  it('keeps one polite live region for edit messages', () => {
    expect(read('src/pages/trip/map/MapEditPanel.tsx')).toContain('aria-live="polite"')
  })
  it('styles every map-edit class the cards use, with motion tokens', () => {
    const cards = read('src/pages/trip/map/editing/EditCards.tsx')
    const used = new Set([...cards.matchAll(/map-edit-[a-z-]+/g)].map(m => m[0]).filter(c => !c.endsWith('-')))
    const missing = [...used].filter(c => !css.includes(`.${c}`) && !['map-edit-outcome-kept', 'map-edit-outcome-rejected', 'map-edit-outcome-forbidden', 'map-edit-outcome-conflict', 'map-edit-outcome-failed'].includes(c))
    expect(missing).toEqual([])
    const block = css.slice(css.indexOf('Map V2 package C. Edit cards'))
    expect(block).not.toMatch(/\d+ms/)
  })
})
