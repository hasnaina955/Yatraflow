// ============ PW-13 review — the component half of the fixes ============
//
// These are source pins. The workspaces run in node with no DOM, so the
// rendered checks live in dev/budget-fixture-check.mjs. The pins hold the
// shapes a refactor can quietly drop:
//   - the editor disappears when the live right does, and every writer gets
//     the acting user;
//   - a deferred Undo reads live refs rather than the render that raised it;
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
})

describe('PW-13 review — the deferred Undo reads live state', () => {
  it('refuses a staged preview and a lost role at Undo time', () => {
    expect(code).toContain('if (refuseWhileStaged(previewOpenRef.current)) return')
    expect(code).toContain('if (!canWriteRef.current)')
    expect(code).toContain('restoreExpense(trip.id, e, idx, meIdRef.current ?? null)')
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
    expect(code).toContain('className="compare-table bud-data-table" tabIndex={0} aria-labelledby="bud-day-table-caption"')
    expect(code).toContain('<caption id="bud-day-table-caption" className="sr-only">Cost per day by category</caption>')
  })
})

describe('PW-13 review — the narrow chart copy points at the table', () => {
  it('has a phone-only hint and hides the hover copy', () => {
    expect(code).toContain('bud-chart-hint-narrow')
    expect(code).toContain('Open the table below for every day’s split')
    expect(css).toContain('.bud-tip { display: none; }')
    expect(css).toContain('.bud-chart-hint-wide { display: none; }')
  })

  it('gives the table summary the coarse-pointer floor', () => {
    expect(css).toContain('.bud-table-view summary { display: flex; align-items: center; min-height: 40px; }')
  })
})
