// ============ PW-13 review — the component half of the fixes ============
//
// These are source pins. The workspaces run in node with no DOM, so the
// rendered checks live in dev/budget-fixture-check.mjs. The pins hold the
// shapes a refactor can quietly drop:
//   - the editor disappears when the live right does, and every writer gets
//     the acting user;
//   - a deferred Undo reads live state and the workspace's staged ref rather
//     than the render that raised it;
//   - the What cell is a row header, the day table is a focusable scroll
//     target, and the optional list is not a clipped scroll box;
//   - the phone hint points at the table instead of a hidden tooltip.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tab = read('../src/pages/trip/BudgetTab.tsx')
const css = read('../src/styles/pages/budget.css')
const code = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

describe('PW-13 review — editor downgrade', () => {
  it('renders the editor and the row actions only while the right is live', () => {
    expect(code).toContain('editingId === e.id && editable && canWrite')
    expect(count(code, '{editable && canWrite && (')).toBe(2)
  })

  it('clears the open editor and the capture when the right is lost', () => {
    // TripWorkspace keys the tab on the right, so a realtime downgrade
    // remounts BudgetTab and drops editingId/adding. The render gates below
    // keep the editor hidden even before the remount lands.
    const workspace = read('../src/pages/TripWorkspace.tsx')
    expect(workspace).toContain("key={editable ? 'budget-edit' : 'budget-view'}")
  })

  it('gives every expense writer the acting user', () => {
    expect(count(code, "if (!canWrite) { toast('You can no longer edit this trip.', 'err'); return }")).toBe(3)
    expect(code).toContain('addExpense(trip.id, patchOf(form), meId ?? null)')
    expect(code).toContain('updateExpense(trip.id, expense.id, changedFields(form, openedWith.current), meId ?? null)')
    expect(code).toContain('deleteExpense(trip.id, e.id, me?.id ?? null)')
  })

  it('only announces add and delete success after the writer applied', () => {
    expect(code).toContain('const addOutcome = addExpense(trip.id, patchOf(form), meId ?? null)')
    expect(code).toContain("if (addOutcome === 'applied') {")
    expect(code).toContain("} else if (addOutcome === 'refused') {")
    expect(code).toContain('const deleteOutcome = deleteExpense(trip.id, e.id, me?.id ?? null)')
    expect(code).toContain("if (deleteOutcome === 'refused')")
    expect(code).toContain("if (deleteOutcome === 'no-such-line')")
    const noLineAt = code.indexOf("if (deleteOutcome === 'no-such-line')")
    const undoAt = code.indexOf('undoToast(`Removed', noLineAt)
    expect(undoAt).toBeGreaterThan(noLineAt)
  })
})

describe('PW-13 review — the deferred Undo reads live state', () => {
  it('refuses a staged preview and a lost role at Undo time', () => {
    expect(code).toContain('if (refuseWhileStaged(!!liveStagedRef.current)) return')
    expect(code).toContain('const liveTrip = tripById(trip.id)')
    expect(code).toContain('const liveMe = currentUser()')
    expect(code).toContain('const liveCanWrite = !!liveTrip && !!liveMe?.id')
    expect(code).toContain('if (!liveCanWrite)')
    expect(code).toContain('const outcome = restoreExpense(')
    expect(code).toContain("if (outcome === 'applied') toast(")
    expect(code).toContain("else if (outcome === 'invalid') return")
    expect(code).not.toContain('canWriteRef.current')
    expect(code).not.toContain('meIdRef.current')
  })

  it('uses the workspace stage ref so the check survives a remount', () => {
    const workspace = read('../src/pages/TripWorkspace.tsx')
    expect(workspace).toContain('stagedRef={pendingRef}')
  })

  it('checks the staged flag before restoring and toasts success only on applied', () => {
    const start = code.indexOf('undoToast(`Removed')
    const undo = code.slice(start, code.indexOf('}}><Trash2', start))
    const stagedAt = undo.indexOf('refuseWhileStaged(!!liveStagedRef.current)')
    const restoreAt = undo.indexOf('const outcome = restoreExpense(')
    const appliedAt = undo.indexOf("if (outcome === 'applied') toast(")
    expect(stagedAt).toBeGreaterThan(-1)
    expect(restoreAt).toBeGreaterThan(stagedAt)
    expect(appliedAt).toBeGreaterThan(restoreAt)
    expect(undo).not.toMatch(/restoreExpense\([^\n]*\)\s*\n\s*toast\(`Restored/)
  })
})

describe('PW-13 review — table semantics and optional scrolling', () => {
  it('makes the What cell the row header', () => {
    expect(code).toMatch(/<th scope="row">\s*<span className="bud-line-name">/)
  })

  it('leaves the optional list unclipped', () => {
    const start = css.indexOf('.bud-optional-list {')
    const rule = css.slice(start, css.indexOf('}', start))
    expect(rule).not.toContain('max-height')
    expect(rule).not.toContain('overflow-y')
  })

  it('gives the day table a labelled focusable scroll target', () => {
    expect(code).toContain('className="bud-table-scroll" tabIndex={0} role="region" aria-labelledby="bud-day-table-caption"')
    expect(code).toContain('className="compare-table bud-data-table"')
    expect(code).not.toContain('bud-data-table" tabIndex={0}')
    expect(code).toContain('<caption id="bud-day-table-caption" className="sr-only">Cost per day by category</caption>')
    expect(css).toContain('.bud-table-scroll')
    expect(css).toContain('.bud-table-scroll:focus { outline: none; box-shadow: var(--ring); }')
    expect(css).toContain('.bud-table-scroll > .bud-data-table { overflow: visible; }')
  })

  it('names the share as recorded spend on the money denominator', () => {
    expect(code).toContain('Math.round((settledTotal / ledgerTotal) * 100)')
    expect(code).toContain('Math.round((kittyTotal / ledgerTotal) * 100)')
    expect(code).toContain('{settledPct}% of recorded spend')
    expect(code).not.toContain('% of the expense lines')
  })

  it('says a kept read is refreshing while it revalidates', () => {
    expect(code).toContain('title="Refreshing expense lines"')
    expect(code).toContain('These figures are the last read.')
  })
})

describe('PW-13 review — the narrow chart copy points at the table', () => {
  it('has a phone-only hint and hides the hover copy', () => {
    expect(code).toContain('bud-chart-hint-narrow')
    expect(code).toContain('Open the table below for every day’s split')
    expect(css).toContain('.bud-tip { display: none; }')
    expect(css).toContain('.bud-chart-hint-wide { display: none; }')
  })

  it('gives the table summary the coarse-pointer floor without dropping its marker', () => {
    // 44px, not 40: a finger needs the same floor as every other control here.
    expect(css).toContain('.settled-history summary { min-height: 44px; padding: 12px 0; }')
    expect(css).not.toContain('.bud-table-view summary { display: flex;')
  })
})
