// Scratch: print one row's pixels so the corner arc can be read exactly.
//   node dev/_edge-row.mjs <png> --row 60 [--x0 30] [--x1 78]
import sharp from 'sharp'

const file = process.argv[2]
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : d }
const ROW = Number(arg('row', '60'))
const X0 = Number(arg('x0', '30'))
const X1 = Number(arg('x1', '78'))

const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const { width, channels } = info
const px = (x, y) => {
  const i = (y * width + x) * channels
  return [data[i], data[i + 1], data[i + 2], data[i + 3]]
}
const out = []
for (let x = X0; x < Math.min(X1, width); x++) {
  const [r, g, b, a] = px(x, ROW)
  const l = (0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(1)
  out.push(`${x}:rgb(${r},${g},${b})a${a}/L${l}`)
}
console.log(`row ${ROW}\n` + out.join('\n'))
