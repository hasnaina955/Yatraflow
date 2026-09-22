#!/usr/bin/env node
// ============ PWA icon generator ============
// Regenerates public/icons/*.png from the brand mark — the same geometry as the
// favicon SVG in index.html, so the launcher icon and the tab icon cannot drift:
//
//   disc : centre (50,50) r=46   navy    #0B2545
//   ridge: (28,62)(44,34)(56,52)(64,40)(76,62)   teal #0D8D82
//   sun  : centre (66,30) r=7    saffron #F59E2D
//
// Variants: 192/512 transparent ("any" launcher), a 512 maskable tile (cream
// full bleed, art at 72% so it survives the safe-zone crop) and an opaque
// 180 apple-touch-icon (iOS masks to a squircle and hates alpha).
//
// Written against node's stdlib only — the repo takes on no image dependency
// for four static assets. Run it when the mark changes, then let
// tests/pwa.test.ts confirm each file matches its declared size:
//
//   node scripts/generatePwaIcons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'

const NAVY = [0x0b, 0x25, 0x45]
const TEAL = [0x0d, 0x8d, 0x82]
const SAFFRON = [0xf5, 0x9e, 0x2d]
const CREAM = [0xfa, 0xf7, 0xf2]
const RIDGE = [[28, 62], [44, 34], [56, 52], [64, 40], [76, 62]]
const SS = 3 // supersample factor per axis

function inPoly(x, y, poly) {
  let inside = false
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]
    const [x2, y2] = poly[(i + 1) % poly.length]
    if ((y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

/** Colour at one art-space point, or null for transparent. */
function sample(artX, artY, scale) {
  const ax = (artX - 50) / scale + 50
  const ay = (artY - 50) / scale + 50
  if ((ax - 66) ** 2 + (ay - 30) ** 2 <= 49) return SAFFRON
  if (inPoly(ax, ay, RIDGE)) return TEAL
  if ((ax - 50) ** 2 + (ay - 50) ** 2 <= 46 ** 2) return NAVY
  return null
}

function render(size, scale, background) {
  const w = size * SS
  const rows = []
  for (let py = 0; py < w; py++) {
    const row = Buffer.alloc(w * 4)
    for (let px = 0; px < w; px++) {
      const c = sample(((px + 0.5) / w) * 100, ((py + 0.5) / w) * 100, scale) ?? background
      const o = px * 4
      if (c === null) continue // transparent: alpha stays 0
      row[o] = c[0]
      row[o + 1] = c[1]
      row[o + 2] = c[2]
      row[o + 3] = 0xff
    }
    rows.push(row)
  }
  const out = Buffer.alloc(size * (size * 4 + 1))
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    let off = y * (size * 4 + 1)
    out[off++] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let dy = 0; dy < SS; dy++) {
        const row = rows[y * SS + dy]
        for (let dx = 0; dx < SS; dx++) {
          const o = (x * SS + dx) * 4
          r += row[o]
          g += row[o + 1]
          b += row[o + 2]
          a += row[o + 3]
        }
      }
      out[off++] = r / n
      out[off++] = g / n
      out[off++] = b / n
      out[off++] = a / n
    }
  }
  return out
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(tag, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(tag), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function writePng(path, size, scale, background) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size, scale, background), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  writeFileSync(path, png)
  console.log(`${path}  ${size}x${size}  ${png.length} bytes`)
}

mkdirSync(new URL('../public/icons/', import.meta.url), { recursive: true })
const out = name => new URL(`../public/icons/${name}`, import.meta.url)
writePng(out('icon-192.png'), 192, 1.0, null)
writePng(out('icon-512.png'), 512, 1.0, null)
writePng(out('icon-maskable-512.png'), 512, 0.72, CREAM)
writePng(out('apple-touch-icon.png'), 180, 0.84, CREAM)
