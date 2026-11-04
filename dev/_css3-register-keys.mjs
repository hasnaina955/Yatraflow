// Scratch: register every current config-appearance key into the debt baseline.
// Run with no arguments to add; run with --dry to list.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const dry = process.argv.includes('--dry')
const MAP = 'docs/css-ownership.json'

let out = ''
try {
  out = execFileSync('node', ['scripts/css-ownership.mjs', '--json'], { encoding: 'utf8', shell: true })
} catch (e) {
  out = e.stdout ?? ''
}
const report = JSON.parse(String(out).replace(/^\uFEFF/, ''))
const keys = [...new Set(
  report.findings.filter((f) => f.code === 'config-appearance' && f.key).map((f) => f.key),
)].sort()

console.log('unregistered appearance keys:', keys.length)
for (const k of keys) console.log('  ' + k)
if (dry) process.exit(0)

const map = JSON.parse(fs.readFileSync(MAP, 'utf8'))
map.baselines.configAppearanceKeys = [...new Set([...(map.baselines.configAppearanceKeys ?? []), ...keys])].sort()
fs.writeFileSync(MAP, JSON.stringify(map, null, 2) + '\n')
console.log('total registered keys:', map.baselines.configAppearanceKeys.length)
