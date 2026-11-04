// Scratch: toggle the cover-settle owner between the bad (band) and good
// (clipped artwork) variants, so the browser containment check can be shown to
// fail before the repair and pass after it. `--good` restores the repair.
import fs from 'node:fs'

const P = 'src/styles/legacy/16-motion-and-cover-v2.css'
const GOOD = `.yf-page .yf-cover-media > .yf-cover-img {
  animation: yfCoverSettle calc(var(--motion-slower) * 3) var(--ease-glide) backwards;
}`
const BAD = `.yf-page .yf-trip-head > .yf-cover-media {
  animation: yfCoverSettle calc(var(--motion-slower) * 3) var(--ease-glide) backwards;
}`

const text = fs.readFileSync(P, 'utf8')
const toGood = process.argv.includes('--good')
if (toGood) {
  if (!text.includes(BAD)) { console.log('already good (bad variant not present)'); process.exit(0) }
  fs.writeFileSync(P, text.replace(BAD, GOOD))
  console.log('restored: settle on the clipped artwork')
} else {
  if (!text.includes(GOOD)) { console.log('good variant not found'); process.exit(1) }
  fs.writeFileSync(P, text.replace(GOOD, BAD))
  console.log('applied: settle on the band (the reported defect)')
}
