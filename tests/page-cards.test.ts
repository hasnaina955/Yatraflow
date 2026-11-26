// ============ Link-preview cards for the copy pages and the invite (#1042) ============
// Five 1200 x 630 PNGs, drawn from the committed sources by scripts/build-page-cards.mjs.
// A preview crawler reads the image size from the file, so the size is checked from
// the PNG header, not from the script that wrote it.
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import cards from '../scripts/page-cards.json' with { type: 'json' }
import { LINES } from '../scripts/build-page-cards.mjs'

const KEYS = ['faq', 'how-it-works', 'about', 'for-creators', 'invite'] as const
interface CardEntry { source: string; file: string; headline: string }
const entries = KEYS.map(key => [key, (cards as unknown as Record<string, CardEntry>)[key]] as const)

/** The width and height a PNG declares in its IHDR chunk, after the 8-byte signature. */
function pngSize(url: URL): { width: number; height: number } {
  const bytes = readFileSync(url)
  expect(bytes.subarray(0, 8).toString('hex'), url.pathname).toBe('89504e470d0a1a0a')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe('the five link-preview cards exist and declare the right size', () => {
  it('has one card entry for each copy page and for the invite', () => {
    expect(Object.keys(cards).filter(key => !key.startsWith('$'))).toEqual(KEYS)
  })

  it.each(entries)('%s is a 1200 x 630 PNG under public/og', (_key, card) => {
    const url = new URL(`../public/og/${card.file}`, import.meta.url)
    expect(existsSync(url), card.file).toBe(true)
    expect(pngSize(url)).toEqual({ width: 1200, height: 630 })
  })

  it.each(entries)('%s is drawn from a committed 1536 x 1024 source', (_key, card) => {
    const url = new URL(`../design/art/og-source/${card.source}`, import.meta.url)
    expect(existsSync(url), card.source).toBe(true)
    expect(pngSize(url)).toEqual({ width: 1536, height: 1024 })
  })
})

describe('each card carries its headline, and its alt text is that headline', () => {
  it('uses the owner-approved headlines', () => {
    expect(cards.faq.headline).toBe('Questions, answered')
    expect(cards['how-it-works'].headline).toBe('How YatraFlow works')
    expect(cards.about.headline).toBe('About YatraFlow')
    expect(cards['for-creators'].headline).toBe('YatraFlow for creators')
    expect(cards.invite.headline).toBe("You're invited to plan a trip")
  })

  it.each(entries)('%s breaks its headline across lines without changing a word', (key, card) => {
    expect(LINES[key].lines.join(' ')).toBe(card.headline)
  })

  it('uses no em dash in any headline (owner rule for card text)', () => {
    for (const [, card] of entries) expect(card.headline).not.toMatch(/—/)
  })

  it('keeps the invite headline in the reviewed size, so its text clears the art', () => {
    expect(LINES.invite.size).toBeLessThanOrEqual(68)
  })
})
