// @vitest-environment node
// The map Keep button routes through the shared writer.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { keepRoute } from '../src/pages/trip/map/useMapEdit'
import { editSessionReducer, type EditSession } from '../src/pages/trip/map/editing/editSession'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

describe('the writer handoff closes the preview', () => {
  const previewing: EditSession<string> = { phase: 'previewing', preview: 'p', lastOutcome: null }

  it('moves a saving session to idle with no outcome of its own', () => {
    const saving = editSessionReducer(previewing, { type: 'keep' })
    expect(saving.phase).toBe('saving')
    expect(editSessionReducer(saving, { type: 'handoff' })).toEqual({ phase: 'idle', lastOutcome: null })
  })

  it('ignores a handoff in any other phase', () => {
    expect(editSessionReducer(previewing, { type: 'handoff' })).toBe(previewing)
  })

  it('uses the handoff, not reject, after the writer call', () => {
    const src = read('src/pages/trip/map/useMapEdit.ts')
    const writer = src.slice(src.indexOf('// keep: writer path start'), src.indexOf('// keep: writer path end'))
    expect(writer).toContain("dispatch({ type: 'handoff' })")
    expect(writer).not.toContain("type: 'reject'")
  })
})

describe('keepRoute', () => {
  it('routes to the writer when a writer is set', () => {
    expect(keepRoute({ keepWithWriter: () => Promise.resolve() })).toBe('writer')
  })
  it('takes the direct path when no writer is set', () => {
    expect(keepRoute({})).toBe('direct')
  })
})

describe('MapTab wiring', () => {
  const page = read('src/pages/trip/MapTab.tsx')
  it('assigns the writer to the ref', () => {
    expect(page).toContain('keepWriterRef.current = addPoiToDay')
  })
  it('passes the writer option to the edit hook', () => {
    expect(page).toContain('keepWithWriter:')
  })
})

describe('writer branch', () => {
  const hook = read('src/pages/trip/map/useMapEdit.ts')
  const start = hook.indexOf('// keep: writer path start')
  const end = hook.indexOf('// keep: writer path end')
  const branch = start >= 0 && end > start ? hook.slice(start, end) : ''
  it('has two markers around a non-empty branch', () => {
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(branch.length).toBeGreaterThan(0)
  })
  it('does not call addMutator in the writer branch', () => {
    expect(branch).not.toContain('addMutator(')
  })
  it('awaits the writer with the hit and the day', () => {
    expect(branch).toContain('await keepWithWriter(hit, preview.dayIndex)')
  })
  it('closes the preview after the writer', () => {
    expect(branch).toContain("dispatch({ type: 'handoff' })")
    expect(branch).toContain('setUnknown(null)')
  })
  it('closes the preview even when the writer fails', () => {
    expect(branch).toContain('finally')
    expect(branch).toContain("setAnnouncement('The add could not start. Try again.')")
  })
  it('starts no second Undo and calls no taste log', () => {
    expect(branch).not.toContain('setUndoStartedAt')
    expect(branch).not.toContain('Undo is available')
    expect(branch).not.toContain('onAddKept')
  })
})
