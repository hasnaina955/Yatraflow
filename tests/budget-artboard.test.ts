// ============ PW-13 — the Budget artboard's structure and its honest edges ============
//
// The redraw is held to the artboard's hierarchy without copying its sample
// numbers: four glance cards, a stacked day chart, the share/group/per-traveller
// table, the balances around an even line, and the read-only optional list.
// Every pin here is a property a screenshot review cannot keep: the accessible
// names, the table that carries every chart value, the read-only marker on the
// optional list, and the token-only colour.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const tab = read('../src/pages/trip/BudgetTab.tsx')
const css = read('../src/styles/pages/budget.css')
const code = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1

describe('PW-13 — the glance strip is the artboard’s four cards', () => {
  it('draws one estimate card and three tiles, all in one labelled group', () => {
    expect(count(code, '<article className="card bud-glance-main">')).toBe(1)
    expect(count(code, 'className="card bud-glance-tile')).toBe(3)
    expect(count(code, 'className="card bud-glance-tile bud-glance-kitty"')).toBe(1)
    expect(code).toContain('<section className="bud-glance" role="group" aria-label="Budget at a glance">')
  })

  it('keeps the pacing contract and the estimate, not a group-budget claim', () => {
    expect(code).toContain('safeToSpendPerDay(trip, totals.totalCostInr)')
    expect(code).toContain('<b>Budget headroom / day</b>')
    expect(code).toContain('<b>Budget headroom</b>')
    expect(code).toContain('{hasTarget ? \'Trip estimate\' : \'Estimate so far\'}')
    // The kitty is a spend total over untagged lines, never a funded balance.
    expect(code).toContain('Shared kitty spend')
    expect(code).toContain('no one is owed')
    // Settled is the ledger's own record, not a vendor-paid lifecycle.
    expect(code).toContain('Settled so far')
    expect(code).toContain('still open across')
  })
})

describe('PW-13 — the day chart is readable without a hover', () => {
  it('names the chart and its mark', () => {
    expect(code).toContain('<svg className="bud-plot-svg"')
    expect(code).toContain('role="img"')
    expect(code).toContain('aria-label={`Cost per day. ')
    expect(code).toContain('<title>Cost per day</title>')
    expect(code).toContain('Every value is also written in the table below the chart.')
  })

  it('gives every day a focusable read-out and a visible total', () => {
    expect(code).toContain('<div key={d.dayIndex} tabIndex={0} role="group"')
    expect(code).toContain('over the day target')
    expect(code).toContain('within the day target')
    expect(code).toContain('{formatInr(d.totalInr)}')
  })

  it('writes every segment into a semantic table', () => {
    expect(code).toContain('<summary>Table view of cost per day</summary>')
    expect(code).toContain('<caption id="bud-day-table-caption" className="sr-only">Cost per day by category</caption>')
    expect(code).toContain('{chartCats.map(c => <th key={c} scope="col" className="num">{titleCase(c)}</th>)}')
    expect(code).toContain('<th scope="row">Day {i + 1}{d.dateLabel ? ` · ${d.dateLabel}` : \'\'}</th>')
  })
})

describe('PW-13 — the category table names its own populations', () => {
  it('carries share, group and per-traveller columns', () => {
    for (const header of ['Share', 'Group', 'Per traveller']) {
      expect(code, header).toContain(`<th scope="col" className="num">${header}</th>`)
    }
    expect(code).toContain('Group totals and the per-traveller share')
    expect(code).toContain('<caption className="sr-only">Where the money goes, by category</caption>')
    // The per-traveller figure divides by the trip's travellers, never by the
    // balances' member-account count.
    expect(code).toContain('{formatInr(v / Math.max(1, trip.travellers))}')
  })

  it('lists every category with its own share and a text insight', () => {
    expect(code).toContain('aria-label={`Category shares: ')
    expect(code).toContain('is the biggest share at')
    expect(code).toContain('<tfoot>')
  })
})

describe('PW-13 — balances stay per line, and the optional list stays read-only', () => {
  it('draws the diverging balance with a real text label', () => {
    expect(code).toContain('aria-label={bal === 0 ? `${nameOf(b.user)} is settled` : bal > 0 ? `${nameOf(b.user)} gets back ${formatInr(bal)}` : `${nameOf(b.user)} owes ${formatInr(-bal)}`}')
    expect(code).toContain('<line className="bud-bal-even"')
    // Transfers are a suggestion, not a second write path.
    expect(code).toContain('Simplest way to settle')
    expect(code).toContain('The app records money per expense line.')
    expect(code).not.toContain('Ask on UPI')
  })

  it('keeps the optional list a read-out, not a fake checkbox', () => {
    expect(code).toContain('Read-only: the optional flag lives on each line')
    expect(code).toContain('<span className="bud-optional-check" aria-hidden="true">')
    expect(code).not.toContain('type="checkbox"')
    expect(code).not.toContain('Remove from plan')
  })

  it('keeps the optional watch as a tip with a spoken status', () => {
    expect(code).toContain('A soft line at {OPTIONAL_WATCH_PCT}% of the estimate — tips only, nothing changes.')
    expect(code).toContain('role="status"')
  })
})

describe('PW-13 — no design-tool control or mockup palette leaks in', () => {
  it('does not copy the Play or fake-choice controls', () => {
    expect(code).not.toContain('Play the charts')
    expect(code).not.toContain('role="radio"')
    expect(code).not.toContain('type="radio"')
  })

  it('uses the existing spend tokens, never the mockup hexes', () => {
    for (const token of ['--cat-transport', '--cat-accommodation', '--cat-food', '--cat-activities']) {
      expect(css, token).toContain(token)
    }
    expect(css).not.toMatch(/#008C7F|#3168C4|#CF5A2C|#A04CA8|#F0F8F6|#E0EBE9|#EAF3F2|#FCFEFD|#D3DEDC|#DCE7E6/i)
  })

  it('keeps the ledger filters and the capture control labelled', () => {
    expect(code).toContain('aria-label="Filter expense lines"')
    expect(code).toContain('aria-pressed={lineFilter === f}')
    expect(code).toContain('aria-expanded={adding}')
    expect(code).toContain('+ Add expense')
  })
})
