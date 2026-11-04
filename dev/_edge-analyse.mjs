// Scratch: read an edge strip PNG and report the pixel profile across the cover's
// left perimeter, so a seam is a number rather than an impression.
//
//   node dev/_edge-analyse.mjs <png> [--rows 60-200] [--x0 0] [--x1 30]
import sharp from 'sharp'

const file = process.argv[2]
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const [rowA, rowB] = arg('rows', '60-200').split('-').map(Number)
const X0 = Number(arg('x0', '0'))
const X1 = Number(arg('x1', '78'))

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, height, channels } = info
const px = (x, y) => {
  const i = (y * width + x) * channels
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

// Average luminance per column across the sampled rows.
const cols = []
for (let x = X0; x < Math.min(X1, width); x++) {
  let sum = 0
  let n = 0
  for (let y = Math.max(0, rowA); y < Math.min(rowB, height); y++) {
    const p = px(x, y)
    if (p[3] < 8) continue
    sum += lum(p)
    n++
  }
  cols.push({ x, lum: n ? sum / n : null })
}

// A seam is a column that is a local extreme against both neighbours.
const seams = []
for (let i = 1; i < cols.length - 1; i++) {
  const a = cols[i - 1].lum
  const b = cols[i].lum
  const c = cols[i + 1].lum
  if (a == null || b == null || c == null) continue
  const isMax = b - a > 2.0 && b - c > 2.0
  const isMin = a - b > 2.0 && c - b > 2.0
  if (isMax || isMin) seams.push({ x: cols[i].x, lum: +b.toFixed(2), kind: isMax ? 'bright' : 'dark', left: +a.toFixed(2), right: +c.toFixed(2) })
}

console.log(`file=${file} ${width}x${height} channels=${channels}`)
console.log('column luminance profile (sampled rows ' + rowA + '-' + rowB + '):')
console.log(cols.filter((c) => c.lum != null).map((c) => `${c.x}:${c.lum.toFixed(1)}`).join('  '))
console.log('\nlocal extremes (possible seam):')
for (const s of seams) console.log(`  x=${s.x} ${s.kind} lum=${s.lum} (left ${s.left}, right ${s.right})`)
if (!seams.length) console.log('  none above the 2.0 luminance threshold')
