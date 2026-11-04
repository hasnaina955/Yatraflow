// Scratch: build a magnified side-by-side of the cover's top-left corner, so the
// before and after can be compared at a scale a person can read.
//   node dev/_corner-compare.mjs <before.png> <after.png> <out.png>
import sharp from 'sharp'

const [before, after, out] = process.argv.slice(2)
if (!before || !after || !out) { console.error('usage: node dev/_corner-compare.mjs <before.png> <after.png> <out.png>'); process.exit(2) }

// Crop the corner from a 3x strip: the arc sits in the first ~90 device rows and
// the first ~60 device columns.
const REGION = { left: 24, top: 24, width: 84, height: 120 }
const SCALE = 4

const crop = async (file) => {
  const img = sharp(file)
  const meta = await img.metadata()
  const region = {
    left: Math.min(REGION.left, Math.max(0, meta.width - 1)),
    top: Math.min(REGION.top, Math.max(0, meta.height - 1)),
    width: Math.min(REGION.width, meta.width - REGION.left),
    height: Math.min(REGION.height, meta.height - REGION.top),
  }
  return sharp(file).extract(region).resize({ width: region.width * SCALE, kernel: 'nearest' }).png().toBuffer()
}

const a = await crop(before)
const b = await crop(after)
const meta = await sharp(a).metadata()
const gap = 12
await sharp({
  create: { width: meta.width * 2 + gap, height: meta.height, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } },
})
  .composite([
    { input: a, left: 0, top: 0 },
    { input: b, left: meta.width + gap, top: 0 },
  ])
  .png()
  .toFile(out)
console.log(`wrote ${out} (${meta.width * 2 + gap}x${meta.height}, left=before right=after, ${SCALE}x)`)
