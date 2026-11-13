import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BASE_TAG_GAP,
  baseTagBox,
  ringCaptionMode,
} from '../src/lib/mapStyles/lensMarks'

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const marksCss = read('../src/components/map/mapMarks.css')
const stylesCss = read('../src/styles/components/map-v2-rail.css')
const map = read('../src/components/TripMap.tsx')

describe('baseTagBox', () => {
  it('puts the tag box beside the stop box', () => {
    const stop = { x: 0, y: 0, w: 36, h: 36 }
    const box = baseTagBox(stop, 101, 26)
    const gap = stop.x - stop.w / 2 - (box.x + box.w / 2)
    expect(gap).toBe(BASE_TAG_GAP)
    expect(gap).toBeGreaterThanOrEqual(6)
    expect(gap).toBeLessThanOrEqual(8)
    expect(box.y).toBe(stop.y)
  })

  it('moves with the stop and holds its own size', () => {
    const box = baseTagBox({ x: 240, y: 180, w: 36, h: 36 }, 80, 26)
    expect(box.x + box.w / 2).toBe(240 - 18 - BASE_TAG_GAP)
    expect(box.y).toBe(180)
    expect(box.w).toBe(80)
    expect(box.h).toBe(26)
  })
})

describe('the tag spread entry', () => {
  it('starts at the base tag box and follows its stop', () => {
    expect(map).toMatch(/baseTagBox\(\{ x: 0, y: 0, w: STOP_BOX\.drawW, h: STOP_BOX\.drawH \}/)
    expect(map).toMatch(/x: box\.x, y: box\.y/)
    expect(map).toMatch(/follows: `stop:\$\{p\.id\}`/)
  })

  it('uses the clock x offset in the layout maths', () => {
    expect(map).toMatch(/x \+ m\.ox \+ \(m\.layer === 'clock' \? m\.x : 0\)/)
  })

  it('keeps the 8px CSS gap and vertical centring', () => {
    expect(marksCss).toMatch(/\.mv2-stop-tag--base(?:, [^{]*)? \{[^}]*right: calc\(100% \+ 8px\)[^}]*translate: 0 -50%/)
  })
})

describe('ringCaptionMode', () => {
  it('is drive only for a drive ring id', () => {
    expect(ringCaptionMode('drive-30')).toBe('drive')
    expect(ringCaptionMode('walk-15')).toBe('walk')
    expect(ringCaptionMode(null)).toBe('walk')
  })
})

describe('the ring caption render', () => {
  it('sits on the ring foot with a walking or car icon', () => {
    expect(map).toMatch(/ringCaptionPoint\(ring\.ring\)/)
    expect(map).toMatch(/anchor="top"/)
    expect(map).toMatch(/ringCaptionMode\(ring\.id\) === 'drive' \? Car : PersonStanding/)
  })

  it('has the board mint pill style', () => {
    expect(marksCss).toMatch(/\.mv2-lens-ring-label \{[^}]*background: var\(--pw-lagoon-100\)/)
    expect(marksCss).toMatch(/\.mv2-lens-ring-label \{[^}]*color: var\(--pw-sea-700\)/)
    expect(marksCss).toMatch(/\.mv2-lens-ring-label \{[^}]*height: 22px/)
    expect(marksCss).toMatch(/\.mv2-lens-ring-label \{[^}]*font-size: 11\.5px/)
  })
})

describe('the Stay base mark', () => {
  it('uses the board rings only while the Stay lens is active', () => {
    expect(map).toMatch(/isBase && frameStayRing \? ' is-stay-hero' : ''/)
    expect(stylesCss).toMatch(/\.mv2-workspace \.mv2-map-stop\.is-stay-hero \{[^}]*width: 36px/)
    expect(stylesCss).toMatch(/\.mv2-workspace \.mv2-map-stop\.is-stay-hero \{[^}]*0 0 0 3px #F2A33A/)
  })

  it('keeps the normal base size in other lenses', () => {
    expect(stylesCss).toMatch(/\.mv2-workspace \.mv2-map-stop\.is-stay, \.mv2-map-key \.mv2-map-stop\.is-stay \{[^}]*width: 36px/)
    expect(stylesCss).not.toMatch(/\.mv2-map-stop\.is-stay::after \{[^}]*width: 50px/)
  })
})
