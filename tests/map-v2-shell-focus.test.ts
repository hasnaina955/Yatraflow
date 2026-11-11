// ============ Map V2 shell: focus rings and the detail handle (package B) ============
//
// Finding 2: `--ring` is a whole shadow, so `0 0 0 3px var(--ring)` is invalid and
// the deck disclosure lost its focus ring. Finding 5: the selected-detail handle
// did not hand focus on a keyboard snap. A node test cannot run a browser, so
// these read the real sources and pin the call sites.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sheetSnapForKey } from '../src/lib/mapSheetGesture'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (...parts: string[]) => readFileSync(join(root, ...parts), 'utf8').replace(/\r\n/g, '\n')
const css = read('src', 'styles.css')
const mapTab = read('src', 'pages', 'trip', 'MapTab.tsx')
const chrome = read('src', 'components', 'map', 'MapWorkspaceChrome.tsx')
const handle = read('src', 'components', 'map', 'MapPhoneSheetHandle.tsx')

describe('focus ring values', () => {
  it('never wraps --ring in a second shadow length', () => {
    expect(css).not.toMatch(/\d+px var\(--ring\)/)
  })

  it('gives the deck disclosure the whole ring as its shadow', () => {
    const rule = css.split('\n').find(line => line.includes('.lrow-deck .lrow-sum:focus-visible'))
    expect(rule).toBeDefined()
    expect(rule).toContain('box-shadow: var(--ring)')
  })

  it('keeps a visible ring on the sheet handle and the peek button', () => {
    // The handle is a full-width strip with square corners. Its ring sits on the grip pill, so it never fights the rounded sheet.
    expect(css).toMatch(/\.mv2-workspace \.mv2-sheet-handle:focus-visible > span \{[^}]*box-shadow: 0 0 0 4px/)
    expect(css).toMatch(/\.mv2-workspace \.mv2-sheet-handle:focus-visible \{ outline: none; \}/)
    expect(css).toMatch(/\.mv2-workspace \.mv2-peek-place:focus-visible[^{]*\{[^}]*box-shadow: var\(--ring\)/)
  })
})

describe('the selected-detail handle', () => {
  const handleCalls = mapTab.match(/<MapSheetHandle[^\n]*\/>/g) ?? []

  it('finds the three handles', () => {
    expect(handleCalls).toHaveLength(3)
  })

  it('passes onSnapSettled on every handle, so none bypasses the focus handoff', () => {
    for (const call of handleCalls) expect(call).toContain('onSnapSettled={')
  })

  it('points the detail handle at the place card', () => {
    const detail = handleCalls.find(call => call.includes("'rail-detail'"))
    expect(detail).toBeDefined()
    expect(detail).toContain('settleSheetSnap(source,')
    expect(chrome).toMatch(/<article id="rail-detail" className="mv2-pick-card" tabIndex=\{-1\}/)
  })

  it('moves focus only for a keyboard snap', () => {
    const body = mapTab.slice(mapTab.indexOf('function settleSheetSnap'), mapTab.indexOf('function selectPoint'))
    expect(body).toContain("if (source !== 'keyboard') return")
    expect(handle).toContain("commit(next, 'keyboard')")
    expect(handle.match(/commit\(result\.snap, 'pointer'\)/g)).toHaveLength(2)
  })

  it('owns arrows, Home and End, and leaves Escape to the opener return', () => {
    expect(sheetSnapForKey('half', 'ArrowUp')).toBe('full')
    expect(sheetSnapForKey('half', 'ArrowDown')).toBe('peek')
    expect(sheetSnapForKey('half', 'Home')).toBe('peek')
    expect(sheetSnapForKey('half', 'End')).toBe('full')
    expect(sheetSnapForKey('half', 'Escape')).toBeNull()
    expect(mapTab).toMatch(/className="mv2-detail" onKeyDown=\{e => \{ if \(e\.key === 'Escape'/)
  })
})
