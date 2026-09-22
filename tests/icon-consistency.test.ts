// ============ Icon-consistency pins (the lucide/colour-scheme audit fixes) ============
// Four fixes share one failure mode: the drift they close can quietly reopen
// because nothing but a test would notice. This file is that notice.
//   #1 raw --warn ink on light tints (contrast) — fixed at the source rules
//   #2 kind glyph on Board stop cards + the KIND map staying complete
//   #3 one mode-icon vocabulary (four private maps used to coexist)
//   #4 one inline-alignment rule (InlineIcon instead of 125 copy-pastes)
// Source-text pins, per the doc-drift idiom: the node suite has no DOM, and
// what these guard IS the source (a map's keys, a rule's ink, an import).
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STOP_KIND_LABELS } from '../src/lib/stopKind'
import { TRANSPORT_MODES } from '../src/data/types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

const rel = (f: string) => f.slice(root.length + 1).split('\\').join('/')
const tsxFiles = walk(SRC).filter(f => f.endsWith('.tsx'))
const ICONS_PATH = join(SRC, 'components', 'icons.tsx')
const iconsSrc = readFileSync(ICONS_PATH, 'utf8')
const stylesSrc = readFileSync(join(SRC, 'styles.css'), 'utf8')

/** Keys of an `export const NAME … = { … }` block in icons.tsx. */
function exportedKeys(name: string): string[] {
  const m = new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`).exec(iconsSrc)
  expect(m, `${name} block not found in icons.tsx`).not.toBeNull()
  return [...m![1].matchAll(/\b([A-Za-z_][A-Za-z0-9_]*):/g)].map(x => x[1])
}

describe('#4 — InlineIcon is the only inline-alignment rule', () => {
  it('no surface hand-rolls verticalAlign on an icon any more', () => {
    const offenders = tsxFiles
      .filter(f => f !== ICONS_PATH)
      .filter(f => readFileSync(f, 'utf8').includes("verticalAlign: '"))
    expect(offenders.map(rel), 'use InlineIcon (components/icons) instead of a raw style').toEqual([])
  })
})

describe('#2 — stop-kind glyphs', () => {
  it('KIND_ICONS covers exactly the seven display kinds (a kind without an icon renders Camera; an icon without a kind is dead)', () => {
    expect(exportedKeys('KIND_ICONS').sort()).toEqual(Object.keys(STOP_KIND_LABELS).sort())
  })

  it('the Board stop-card kicker actually renders the glyph', () => {
    const board = readFileSync(join(SRC, 'components', 'BoardView.tsx'), 'utf8')
    expect(board).toContain('<KindIcon kind={kind}')
  })
})

describe('#3 — one mode-icon vocabulary', () => {
  it('MODE_ICONS covers every TransportMode (adding a mode without a glyph fails here, not in review)', () => {
    expect(exportedKeys('MODE_ICONS').sort()).toEqual([...TRANSPORT_MODES].sort())
  })

  it('no private mode-icon map or function survives outside icons.tsx', () => {
    const offenders = tsxFiles
      .filter(f => f !== ICONS_PATH)
      .filter(f => {
        const s = readFileSync(f, 'utf8')
        return /function modeIcon\b/.test(s) || /MODE_ICON[^S]*:\s*Record</.test(s)
      })
    expect(offenders.map(rel)).toEqual([])
  })

  it('every mode-bearing surface imports the shared source', () => {
    for (const f of ['pages/CreateTrip.tsx', 'pages/trip/TripSettingsForm.tsx', 'components/PlanBench.tsx']) {
      const s = readFileSync(join(SRC, f), 'utf8')
      const m = /import \{([^}]*)\} from '([^']*icons)'/.exec(s)
      expect(m, `${f} no longer imports components/icons`).not.toBeNull()
      const names = m![1].split(',').map(x => x.trim())
      expect(names.some(n => n === 'modeIcon' || n === 'MODE_ICONS'), `${f} must consume the shared mode glyphs`).toBe(true)
    }
  })
})

describe('#1 — warn-ink on light tints (the ratchet-baseline entries)', () => {
  // The design-system ratchet reads each selector's OWN declaration pair, so
  // the fix has to live in the base rule — a :root override alone leaves the
  // finding in tests/design-system-baseline.json forever.
  it('the three base rules ink with --ink-amber, not raw --warn', () => {
    const pill = /\.day-warn-pill\s*\{([^}]*)\}/.exec(stylesSrc)
    expect(pill, '.day-warn-pill rule missing').not.toBeNull()
    expect(pill![1]).toContain('var(--ink-amber)')

    for (const sel of [
      /^\.clickable-chip\.on-saffron \{[^}]*\}/m,
      /^\.day-rail-chip\.warn \{[^}]*\}/m,
      /^\.day-rail-chip\.warn:hover \{[^}]*\}/m,
    ]) {
      const line = sel.exec(stylesSrc)
      expect(line, `rule ${sel} missing`).not.toBeNull()
      expect(line![0]).toContain('var(--ink-amber)')
    }
  })

  it('none of the three is still a ratcheted (accepted) violation', () => {
    const baseline = JSON.parse(readFileSync(join(root, 'tests', 'design-system-baseline.json'), 'utf8')) as { contrastLight: string[] }
    for (const name of ['.day-warn-pill', '.clickable-chip.on-saffron', '.day-rail-chip.warn:hover']) {
      expect(baseline.contrastLight.filter(e => e.startsWith(name + ' ')), `${name} re-entered the baseline`).toEqual([])
    }
  })
})
