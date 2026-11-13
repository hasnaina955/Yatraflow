// ============ Shared retry-disposition presentation (#08 F3) ============
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { WriterResumeDisposition } from '../src/pages/trip/map/mapWriterActions'
import { writerResumePresentation } from '../src/pages/trip/map/writerResumeDisposition'

const ALL: WriterResumeDisposition[] = [
  'payload-changed', 'resume-unverifiable', 'operation-settled',
  'operation-unknown', 'road-changed', 'trip-changed',
]
const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('writerResumePresentation', () => {
  it('gives every disposition its own truthful terminal line', () => {
    const texts = new Set<string>()
    for (const disposition of ALL) {
      const entry = writerResumePresentation(disposition)
      expect(entry.text.length).toBeGreaterThan(0)
      expect(entry.text).not.toMatch(/already completed/i)
      expect(entry.text).toMatch(/Saved edits/)
      expect(entry.terminal).toBe(true)
      texts.add(entry.text)
    }
    expect(texts.size).toBe(ALL.length)
    expect(writerResumePresentation('road-changed').text).toMatch(/road/i)
    expect(writerResumePresentation('trip-changed').text).toMatch(/trip/i)
    expect(writerResumePresentation('operation-settled').text).toMatch(/complete/i)
    expect(writerResumePresentation('operation-unknown').text).toMatch(/Save unavailable/i)
  })

  it('is the one presentation used by Map, shortlist, arc and Timeline', () => {
    const map = read('src/pages/trip/map/useMapWriters.ts')
    const shortlist = read('src/pages/trip/map/useShortlist.ts')
    const arc = read('src/pages/trip/map/arcAdd.ts')
    const timeline = read('src/pages/trip/timeline/timelineWriterRunner.ts')
    for (const source of [map, shortlist, arc, timeline]) {
      expect(source).toContain('writerResumePresentation(')
      expect(source).not.toMatch(/resume\.disposition === 'payload-changed'/)
    }
  })
})
