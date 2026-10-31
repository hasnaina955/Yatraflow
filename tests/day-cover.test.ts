// A day's cover is optional and must round-trip through the trip's own day
// list. The card is memoised by day CONTENT, so the cover has to live on the
// day object itself — a side channel would not re-render the card.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const types = readFileSync(new URL('../src/data/types.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store/store.ts', import.meta.url), 'utf8')
const day = readFileSync(new URL('../src/pages/trip/timeline/DaySection.tsx', import.meta.url), 'utf8')
const tab = readFileSync(new URL('../src/pages/trip/TimelineTab.tsx', import.meta.url), 'utf8')

describe('a day carries its own cover photo', () => {
  it('declares the field as optional on the day', () => {
    expect(types).toMatch(/export interface ItineraryDay \{[\s\S]*?coverImageUrl\?: string/)
  })

  it('validates the field on a stored day rather than passing it through', () => {
    expect(store).toMatch(/day\.coverImageUrl !== undefined && typeof day\.coverImageUrl !== 'string'/)
  })

  it('writes the cover into the day list, not a separate store', () => {
    expect(tab).toMatch(/coverImageUrl: url \|\| undefined/)
  })

  it('always has a cover to draw, from the generated scene plan', () => {
    // A day used to draw no strip unless a traveller uploaded a photo, and the
    // artboard gives every day one. The cover now falls back to the shared
    // regionArt scene, so the only empty state is "every image failed".
    expect(day).toMatch(/if \(!coverAttemptsFor\(plan\)\.length\) return null/)
    expect(day).toMatch(/coverPlanFor\(\{/)
    expect(day).toMatch(/<CoverMedia/)
  })

  it('lets the day index pick the scene so consecutive days differ', () => {
    // A hash of the day's text collided: "Panaji market" and "Colva beach"
    // hashed to the same Goa scene, drawing one picture on two days.
    expect(day).toMatch(/sceneIndex: day\.index/)
  })

  it('gives the open day the 132px band and the folded day only a thumbnail', () => {
    // A closed card is denied the whole `trip` for render cost, so the cover
    // falls back to the small slice of it passed as `dayCover`.
    // The artboard splits the cover in two: the open day draws the full band
    // with "Change day cover" over it, and a folded day draws an 84x60
    // thumbnail at the start of its row. The band on a folded card turned four
    // days into four banners and buried the list.
    expect(day).toMatch(/\{!collapsed && <DayCover day=\{day\} trip=\{trip \?\? dayCover\}/)
    expect(day).toMatch(/\{collapsed && <DayThumb day=\{day\} trip=\{trip \?\? dayCover\} \/>\}/)
    // Both read ONE plan, so folding a day cannot swap the picture.
    expect(day).toMatch(/function DayThumb[\s\S]*?const plan = useDayCover\(day, trip\)/)
  })

  it('draws the thumbnail at the artboard size', () => {
    const css = readFileSync(new URL('../src/styles/legacy/02-select-and-print.css', import.meta.url), 'utf8')
    expect(css).toMatch(/\.day-thumb \{\s*\n\s*width: 84px; height: 60px;/)
  })
})
