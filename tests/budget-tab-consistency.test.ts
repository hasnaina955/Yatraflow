// ============ P12 + PW-13 — the Budget tab reads like the other tabs ============
// The five panels sit on the shared card skin, their titles read the R20 rule,
// and each read state is its own compact block. The money pins at the end read
// the figure expressions, so a pass that rounds, merges or rewords a number
// fails here rather than in a screenshot review.
//
// PW-13 keeps every one of those contracts and adds the artboard's ordering:
// the chart and category panels share one grid, the balances and the optional
// panel share the next, and the ledger closes the tab.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { stateBlockRole } from '../src/components/page/StateBlock'
import { readCssSource } from '../scripts/css-source-graph.mjs'

const tab = readFileSync(new URL('../src/pages/trip/BudgetTab.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const css = readCssSource('src/styles.css')
const budgetCss = readFileSync(new URL('../src/styles/pages/budget.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

/** Code only - comments removed, so prose cannot satisfy an assertion. */
const code = tab.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('P12/PW-13 — the panels sit on the shared card skin', () => {
  it('every panel root is a Surface, and none is a bare card div', () => {
    // Five panels: cost per day, where it goes, who paid, essential vs
    // optional, and the expense ledger.
    expect([...code.matchAll(/<Surface className=/g)]).toHaveLength(5)
    expect(code).not.toMatch(/<div className="card/)
    expect(code).toContain("import { Surface } from '../../components/page/Surface'")
  })

  it('the panel skin is the budget module’s own recipe', () => {
    expect(budgetCss).toMatch(/\.bud-panel \{\n  padding: var\(--space-8\); background: var\(--card\);\n  border: 1px solid var\(--pw-line-soft\); border-radius: var\(--radius-lg\);\n  box-shadow: var\(--elev-1\);\n\}/)
  })

  it('the two card rows are one grid each, and the condition stays in the markup', () => {
    expect(budgetCss).toContain('.bud-grid-charts, .bud-grid-mid { grid-template-columns: 1.2fr 1fr; }')
    expect(code).toContain('className="bud-grid bud-grid-charts"')
    expect(code).toContain('className="bud-grid bud-grid-mid"')
    // The old conditional step between the right-hand cards is gone: the grid
    // owns the gap in both cases, so the crew card no longer changes layout.
    expect(code).not.toContain('bud-panel-gap')
  })

  it('the panels take no entrance of their own: the tab panel already owns one', () => {
    expect(css).toMatch(/^\.tab-panel \{ animation: panelIn /m)
    expect(code).not.toMatch(/enterIndex=/)
  })
})

describe('P12/PW-13 — the panel titles read R20', () => {
  it('every card title carries the shared rule, and the rule is the R20 one', () => {
    expect([...code.matchAll(/<h3 className="bud-card-title">/g)]).toHaveLength(5)
    expect(code).not.toMatch(/<h3>/)
    expect(budgetCss).toContain('.bud-card-title {\n  margin: 0; font-family: var(--font-body); font-size: 18px; font-weight: 800;\n  line-height: 1.3; letter-spacing: 0; color: var(--text);\n}')
  })
})

describe('P12/PW-13 — each read state is its own compact block (R22, R23)', () => {
  it('the ledger has a failed room, a loading room and an empty room', () => {
    expect(code).toMatch(/<StateBlock kind="failed" size="compact" title=\{copy\.title\} body=\{copy\.body\}/)
    expect(code).toMatch(/<StateBlock kind="loading" size="compact" title="Loading expenses…" \/>/)
    expect(code).toMatch(/<StateBlock kind="empty" size="compact" title="No expense lines yet"/)
  })

  it('the crew card keeps the ledger one status, in its own words', () => {
    expect(code).toMatch(/emptyCopyFor\('failed', 'expense lines', retryExpenses\)/)
    expect(code).toMatch(/<StateBlock kind="loading" size="compact" title="Loading expense lines…" \/>/)
  })

  it('the empty copy is reachable only after a read that succeeded', () => {
    // The order IS the bug that #383 fixed: the failure branch has to come
    // first, then loading, and only then the friendly empty line. The empty
    // marker is the StateBlock, not the glance card's "no expense lines yet"
    // sentence — that card is allowed to say it above the read.
    const failed = code.indexOf("emptyCopyFor('failed', 'expenses', retryExpenses)")
    const loading = code.indexOf('Loading expenses…')
    const empty = code.indexOf('<StateBlock kind="empty" size="compact" title="No expense lines yet"')
    expect(failed).toBeGreaterThan(-1)
    expect(failed, 'the failure branch precedes the loading state').toBeLessThan(loading)
    expect(loading, 'the loading state precedes the empty copy').toBeLessThan(empty)
  })

  it('the tab renders no ad-hoc loading line and no full-size block', () => {
    expect(code).not.toContain('loading-block')
    expect(code).not.toContain('<EmptyState')
    expect(code).not.toMatch(/<StateBlock(?![^>]*size="compact")/)
  })

  it('the roles are the shared ones, and the tab writes none of them by hand', () => {
    expect(stateBlockRole('failed')).toBe('alert')
    expect(stateBlockRole('loading')).toBe('status')
    expect(stateBlockRole('empty')).toBeUndefined()
    expect(code).not.toMatch(/bud-state[^"]*"[^>]*role=/)
  })

  it('a failed read keeps both retry paths, and a kept read adds one above them', () => {
    // Both consumers of the one read still offer Try again. A failed refresh
    // that kept rows also says so once, above the cards, and offers the same
    // retry there.
    expect(code.match(/onClick=\{retryExpenses\}>Try again<\/button>/g) ?? []).toHaveLength(3)
    expect(code).toContain('<StateBlock kind="kept" size="compact" title="Couldn’t refresh expense lines"')
    expect(code).toMatch(/const retryExpenses = \(\) => \{ void resumeSync\(\) \}/)
  })
})

describe('P12/PW-13 — the motion is on the tokens, with the opt-out', () => {
  it('a state block that appears inside a panel keeps the entrance it had', () => {
    expect(budgetCss).toContain('.bud-state { animation: errIn var(--motion-med) var(--ease-out); }')
  })

  it('every new bar and the state entrance opt out under reduced motion', () => {
    const optOut = budgetCss.slice(budgetCss.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const cls of ['.bud-track-fill', '.bud-share-bar', '.bud-essential-bar', '.bud-stack', '.bud-bal-bar', '.bud-state']) {
      expect(optOut, `${cls} must stop under reduced motion`).toContain(cls)
    }
    expect(optOut).toContain('.bud-tip { transition: none; }')
  })

  it('the budget module names no raw duration', () => {
    const section = budgetCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(section).not.toMatch(/\d+ms/)
  })
})

describe('P12/PW-13 — the money did not move', () => {
  it('every figure still comes from the same expression', () => {
    for (const figure of [
      '{formatInr(totals.costPerPersonInr)} each',
      'const pctUsed = Math.min(150, Math.round((totals.totalCostInr / Math.max(1, groupTarget)) * 100))',
      '{formatInr(remaining)} under target',
      '{formatInr(-remaining)} over target',
      "{perPersonDeltaPct > 0 ? '+' : '−'}{Math.abs(perPersonDeltaPct)}%",
      '{formatInr(pacing.perDayInr)}',
      '{formatInr(pacing.perPersonPerDayInr)}',
      'formatInr(totals.essentialInr)}</b>',
      'formatInr(totals.optionalInr)}</b>',
      'Fair share is {formatInr(fairShare)} {sharePer}',
      '{formatInr(openPayableTotal)}</b>',
      '{formatInr(lineTotal(e, trip.travellers))}',
      'const ledgerTotal = linesTotal(trip.expenses, trip.travellers)',
      '{formatInr(openLedgerTotal)} still open across',
      'formatInr(kittyTotal)',
      'formatInr(biggestLine.total)',
      '{formatInr(withoutOptional)}',
      '{formatInr(v)}',
      '{formatInr(v / Math.max(1, trip.travellers))}',
      '{formatInr(d.totalInr)}',
    ]) {
      expect(code, figure).toContain(figure)
    }
  })

  it('the caveats that make a figure honest are still on screen', () => {
    for (const caveat of [
      'All figures are estimates in INR.',
      'Amounts are group totals unless marked per person.',
      'The estimates above are your planning figure, not a debt.',
      'of the estimate',
      'trip over · the whole lump, not a daily rate',
    ]) {
      expect(code, caveat).toContain(caveat)
    }
  })

  it('the maths and its inputs are untouched', () => {
    // The engine, the split read-model and the settlement lib own every
    // figure; the tab only reads.
    expect(code).toContain("from '../../lib/engine'")
    expect(code).toContain("from '../../lib/budgetDaySplit'")
    expect(code).toContain("from '../../lib/budgetShares'")
    expect(code).toContain("from '../../lib/settlement'")
    expect(code).toContain('const pacing = safeToSpendPerDay(trip, totals.totalCostInr)')
    expect(code).toContain('const balances = computeBalances(members, trip.expenses, trip.travellers, userById)')
    expect(code).toContain('const openPayable = openTaggedLines(trip.expenses, memberIds)')
  })

  it('the hero names the planning figure, not a group budget', () => {
    expect(code).toContain("{hasTarget ? 'Trip estimate' : 'Estimate so far'}")
    expect(code).not.toContain('Group budget')
  })

  it('the glance cards branch on the read verdict and never announce a zero', () => {
    expect(code).toContain("const ledgerReading = expensesRead === 'reading'")
    expect(code).toContain('const ledgerUnread = !ledgerReady && !ledgerKept')
    expect(code).toContain('bud-mini-track is-unread')
    expect(code).toContain('Reading the expense lines…')
    expect(code).toContain('Couldn’t read the expense lines · this is not a zero')
    expect(code).not.toContain('Couldn’t read the ledger — this is not a zero')
    expect(code).not.toMatch(/% of the estimate is marked settled/)
    expect(code).not.toMatch(/% of the estimate sits in untagged lines/)
  })

  it('the settled footer measures open expense lines, not the estimate', () => {
    expect(code).toContain('const openLedgerExpenses = trip.expenses.filter(e => !e.settled)')
    expect(code).toContain('const openLedgerTotal = linesTotal(openLedgerExpenses, trip.travellers)')
    expect(code).not.toContain('stillToPay')
  })

  it('names the settled share as recorded spend on the money denominator', () => {
    expect(code).toContain('Math.round((settledTotal / ledgerTotal) * 100)')
    expect(code).toContain('Math.round((kittyTotal / ledgerTotal) * 100)')
    expect(code).toContain('% of recorded spend')
    expect(code).not.toContain('% of the expense lines')
  })

  it('the chart prints exact rupees, and the category footer is derived', () => {
    expect(code).not.toContain('formatInrShort')
    expect(code).toContain('formatInr(Math.round(t.value))')
    expect(code).toContain('{formatInr(d.totalInr)}')
    expect(code).toContain('{catShares[i]}%')
    expect(code).toContain('{catShareTotal}%')
    expect(code).not.toContain('>100%</td>')
  })
})

describe('P12/PW-13 — no inline styles remain', () => {
  it('the component carries zero, and the page baseline locks it in', () => {
    // Every measurement moved into SVG attributes; every static step is a
    // class. The delta from 10 to 0 is recorded in the baseline file.
    expect(code.match(/style=\{\{/g) ?? []).toHaveLength(0)
  })
})
