// Scratch: toggle the veil between the fixed structure and the reported defect,
// so the layering assertion can be shown to fail on the defect.
import fs from 'node:fs'

const TSX = 'src/pages/TripWorkspace.tsx'
const tsx = fs.readFileSync(TSX, 'utf8')
const eol = tsx.includes('\r\n') ? '\r\n' : '\n'
const FIXED = `            <div className="yf-cover-veil" aria-hidden="true" />${eol}          </div>`
const DEFECT = `          </div>${eol}          <div className="yf-cover-veil" aria-hidden="true" />`

const toGood = process.argv.includes('--good')
if (toGood) {
  if (!tsx.includes(DEFECT)) { console.log('already fixed'); process.exit(0) }
  fs.writeFileSync(TSX, tsx.replace(DEFECT, FIXED))
  console.log('restored: veil inside the media')
} else {
  if (!tsx.includes(FIXED)) { console.log('fixed pattern missing'); process.exit(1) }
  fs.writeFileSync(TSX, tsx.replace(FIXED, DEFECT))
  console.log('applied: veil as a sibling (the reported defect)')
}
