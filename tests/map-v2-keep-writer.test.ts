// @vitest-environment node
// The map Keep button routes through the shared writer.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { keepRoute } from '../src/pages/trip/map/useMapEdit'

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

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
    expect(branch).toContain("dispatch({ type: 'reject' })")
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
