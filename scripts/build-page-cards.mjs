#!/usr/bin/env node
// Draws the link-preview cards for the static copy pages and the invite card
// (#1042): public/og/page-faq.png, page-how-it-works.png, page-about.png,
// page-for-creators.png and invite.png. Each is 1200 x 630.
//
// Input: the five committed sources in public/og/source/ (1536 x 1024, text-free
// art with a dark left side). Each source is scaled to width 1200 (height 800),
// then a 630-pixel band is taken from its centre (85 px off the top and the
// bottom). The headline and a small brand line are drawn on the dark left side.
//
// The text comes from scripts/page-cards.json, and so does the alt text, so a
// card and its alt text cannot drift. A card whose line breaks do not rejoin to
// its headline is refused.
//
// Fonts: the headline uses Sora 800 and the brand line uses Plus Jakarta Sans 700,
// the app's own faces. fontconfig must list them on the machine that renders, as
// TTF or OTF files. The @fontsource packages ship WOFF, which librsvg did not load
// here, so the headline fell back to Inter silently. Without the faces the render
// falls back to a system face, so the committed PNGs are the reference.
//
// Usage: npm run og:pages   (sharp is a dev dependency; the output is committed.)

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import cards from './page-cards.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'public', 'og')
const SRC_DIR = path.join(OUT_DIR, 'source')
const WIDTH = 1200
const HEIGHT = 630

// How each headline breaks across lines. The lines must rejoin to the headline in
// page-cards.json, so the words stay the reviewed words.
export const LINES = {
  faq: { lines: ['Questions,', 'answered'] },
  'how-it-works': { lines: ['How YatraFlow', 'works'] },
  about: { lines: ['About', 'YatraFlow'] },
  'for-creators': { lines: ['YatraFlow', 'for creators'] },
  // The invite art has its orbit close to the text, so its headline sets smaller.
  invite: { lines: ["You're invited", 'to plan', 'a trip'], size: 68 },
}

const BRAND_TEAL = '#2BB8AC'
const CREAM = '#F8F7EF'

/** XML text is escaped, so an apostrophe or ampersand in a headline cannot end the SVG. */
function xmlText(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** The overlay: a soft scrim behind the text, the brand line, and the headline. */
function overlaySvg(lines, size = 74) {
  const lineHeight = Math.round(size * 1.14)
  const top = 300
  const headline = lines.map((line, index) =>
    `<text x="72" y="${top + index * lineHeight}" font-family="Sora ExtraBold, Sora, sans-serif" font-weight="800" font-size="${size}" fill="${CREAM}">${xmlText(line)}</text>`,
  ).join('')
  return Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">` +
      '<defs><linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0" stop-color="#06182A" stop-opacity=".55"/>' +
      '<stop offset=".6" stop-color="#06182A" stop-opacity=".12"/>' +
      '<stop offset="1" stop-color="#06182A" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#scrim)"/>` +
      `<text x="72" y="222" font-family="Plus Jakarta Sans" font-weight="700" font-size="32" fill="${BRAND_TEAL}">YatraFlow</text>` +
      headline +
      '</svg>',
  )
}

/** The 1200 x 630 band of a source, cut from its centre after scaling to 1200 wide. */
async function baseBand(source) {
  const scaled = await sharp(source).resize({ width: WIDTH }).png().toBuffer()
  const { height } = await sharp(scaled).metadata()
  const top = Math.round((height - HEIGHT) / 2)
  return sharp(scaled).extract({ left: 0, top, width: WIDTH, height: HEIGHT }).png().toBuffer()
}

async function drawCard(key, card) {
  const layout = LINES[key]
  if (!layout) throw new Error(`${key} has no line breaks in scripts/build-page-cards.mjs`)
  const { lines } = layout
  if (lines.join(' ') !== card.headline) {
    throw new Error(`${key}: the lines "${lines.join(' ')}" do not rejoin to the headline "${card.headline}"`)
  }
  const source = path.join(SRC_DIR, card.source)
  const band = await baseBand(source)
  const out = path.join(OUT_DIR, card.file)
  await sharp(band)
    .composite([{ input: overlaySvg(lines, layout.size), top: 0, left: 0 }])
    // A palette keeps each card near 200 KB; the gradients show no banding at 1200 px.
    .png({ palette: true, quality: 95, effort: 10, compressionLevel: 9 })
    .toFile(out)
  return out
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  const written = []
  for (const [key, card] of Object.entries(cards)) {
    if (key.startsWith('$')) continue
    written.push(await drawCard(key, card))
  }
  for (const file of written) console.log(`wrote ${path.relative(ROOT, file)}`)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  // Failures set the exit code and return (#656): a direct process.exit can cut off the message.
  main().catch(error => {
    console.error(`[og:pages] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
