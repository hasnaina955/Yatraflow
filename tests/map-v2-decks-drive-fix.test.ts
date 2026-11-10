// Static-render tests for the Drive and Fix deck components.
// The node test env has no DOM, so every check reads the markup string.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DriveTabs, tabKeyStep } from '../src/components/map/lenses/DriveTabs'
import { FixDeck } from '../src/components/map/lenses/FixDeck'
import type {
  DriveCardStrip, DriveTab, DriveTabGroup, DriveTabsResult,
} from '../src/pages/trip/map/driveLens'
import type { FixChangeSet, LensPhase } from '../src/lib/mapLensContracts'
import type { FixSummary } from '../src/pages/trip/map/fixLens'

type DriveRow = DriveTabGroup['shown'][number]
type DriveProps = Parameters<typeof DriveTabs>[0]
type FixProps = Parameters<typeof FixDeck>[0]

const noop = () => undefined
const row = { row: { hit: { name: 'Periyar boat', category: 'boat' } } } as unknown as DriveRow
const strip: DriveCardStrip = { arrive: '12:05', detour: '+6 min', budget: '4%' }
const group = (tab: DriveTab, label: string, total: number, moreCount = 0): DriveTabGroup =>
  ({ tab, label, total, shown: [row], moreCount })

function driveProps(): DriveProps {
  return {
    result: { phase: 'ready', tabs: [group('meal', 'Lunch gap', 3, 2), group('sights', 'Sights', 9)] },
    activeTab: null,
    onTab: noop,
    intro: null,
    stripOf: () => strip,
    bandOf: () => 'inside',
    nameOf: () => 'Nalla Ruchi Kitchen',
    onOpen: noop,
    onAdd: noop,
    dayNumber: 3,
  }
}

function renderDrive(patch: Partial<DriveProps> = {}): string {
  return renderToStaticMarkup(createElement(DriveTabs, { ...driveProps(), ...patch }))
}

function fixSet(id: string): FixChangeSet {
  return {
    id,
    dayIndex: 0,
    target: { code: 'hours', stopId: null },
    changes: [],
    verification: { kind: 'unverified' },
  }
}

const summary: FixSummary = {
  title: 'Go to the jetty first',
  change: 'Day 1: the boat comes before check-in',
  result: 'Clears it · same day length',
}

const problem = {
  title: 'You reach the boat after boarding closes',
  evidence: ['Boarding closes at 15:00.', 'You reach the jetty at 15:05.'],
  foundBy: 'opening-hours check',
}

function fixProps(patch: Partial<FixProps> = {}): FixProps {
  return {
    phase: 'ready',
    dayNumber: 3,
    problem,
    fixes: [{ set: fixSet('a'), summary }],
    onApply: noop,
    onPreview: noop,
  }
}

function renderFix(patch: Partial<FixProps> = {}): string {
  return renderToStaticMarkup(createElement(FixDeck, { ...fixProps(), ...patch }))
}

function phaseText(markup: string): string {
  const match = /<p class="mv2-lens-phase"[^>]*>([\s\S]*?)<\/p>/.exec(markup)
  return match ? match[1] : ''
}

const PHASES: Array<Exclude<LensPhase, 'ready'>> = ['unscanned', 'scanning', 'failed', 'quota', 'empty']

describe('DriveTabs', () => {
  it('renders a tablist with one tab labelled by name and total', () => {
    const markup = renderDrive()
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('role="tab"')
    expect(markup).toContain('aria-label="Lunch gap 3"')
    expect(markup).toContain('aria-label="Sights 9"')
    // One roving tab stop: the active tab only.
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('tabindex="-1"')
  })

  it('moves between tabs with the arrow keys, Home and End', () => {
    expect(tabKeyStep('ArrowRight', 0, 3)).toBe(1)
    expect(tabKeyStep('ArrowRight', 2, 3)).toBe(0)
    expect(tabKeyStep('ArrowLeft', 0, 3)).toBe(2)
    expect(tabKeyStep('ArrowDown', 1, 3)).toBe(2)
    expect(tabKeyStep('ArrowUp', 1, 3)).toBe(0)
    expect(tabKeyStep('Home', 2, 3)).toBe(0)
    expect(tabKeyStep('End', 0, 3)).toBe(2)
    expect(tabKeyStep('Enter', 1, 3)).toBeNull()
  })

  it('shows a dash and an unknown label for a null strip value', () => {
    const markup = renderDrive({ stripOf: () => ({ arrive: null, detour: '+6 min', budget: '4%' }) })
    expect(markup).toContain('—')
    expect(markup).toContain('aria-label="unknown"')
    // The strip labels sit in sentence case in the source. CSS sets the capitals.
    expect(markup).toContain('Detour')
    expect(markup).toContain('Budget')
  })

  it('greys an over-budget card and disables its Add button', () => {
    const markup = renderDrive({ bandOf: () => 'over-budget' })
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>.*Add as Day 3 lunch<\/button>/)
    expect(markup).toContain('is-over-budget')
    expect(markup).toContain('Over today')
  })

  it('tags a just-past card with the scope text', () => {
    const markup = renderDrive({ bandOf: () => 'just-past' })
    expect(markup).toContain('just past your scope')
    expect(markup).toContain('is-just-past')
  })

  it('shows no tag for the other bands', () => {
    expect(renderDrive({ bandOf: () => 'inside' })).not.toContain('mv2-lens-tag')
    expect(renderDrive({ bandOf: () => 'outside' })).not.toContain('mv2-lens-tag')
    expect(renderDrive({ bandOf: () => 'unknown' })).not.toContain('mv2-lens-tag')
  })

  it('shows the intro line and no duplicate count', () => {
    const markup = renderDrive({ intro: 'You pass at 12:05, inside the window' })
    expect(markup).toContain('You pass at 12:05, inside the window')
    expect(markup).not.toContain('more like this')
  })

  it('gives every phase its own text', () => {
    const texts = PHASES.map(phase => {
      const markup = renderDrive({ result: { phase, tabs: [] } })
      const text = phaseText(markup)
      expect(text.length).toBeGreaterThan(0)
      expect(markup).not.toContain('role="tablist"')
      return text
    })
    expect(new Set(texts).size).toBe(PHASES.length)
  })

  it('keeps the exact phase copy', () => {
    const text = (phase: Exclude<LensPhase, 'ready'>) =>
      phaseText(renderDrive({ result: { phase, tabs: [] } }))
    expect(text('unscanned')).toBe('Pick a day to see what is along the drive.')
    expect(text('scanning')).toBe('Looking along the drive…')
    expect(text('failed')).toBe('The search along the drive failed. Try again.')
    expect(text('quota')).toBe('The place search is over its limit for now.')
    expect(text('empty')).toBe('Nothing along this drive fits your scope.')
  })
})

describe('FixDeck', () => {
  it('shows at most three fixes, each with Apply and Preview on map', () => {
    const fixes = [1, 2, 3, 4].map(n => ({ set: fixSet(`f${n}`), summary }))
    const markup = renderFix({ fixes })
    expect(markup.match(/Apply<\/button>/g)).toHaveLength(3)
    expect(markup.match(/Preview on map<\/button>/g)).toHaveLength(3)
    expect(markup).toContain('Go to the jetty first')
    expect(markup).toContain('Clears it · same day length')
  })

  it('writes the header label in the singular and the plural', () => {
    expect(renderFix()).toContain('Fix · 1 problem on Day 3')
    expect(renderFix({ problem: null })).toContain('Fix · 0 problems on Day 3')
  })

  it('shows the evidence lines and the found-by footer', () => {
    const markup = renderFix()
    expect(markup).toContain('Boarding closes at 15:00.')
    expect(markup).toContain('You reach the jetty at 15:05.')
    expect(markup).toContain('Found by the opening-hours check · every fix below was run through the impact preview')
    expect(markup).toContain('You reach the boat after boarding closes')
  })

  it('says no safe fix was found when the fix list is empty', () => {
    const markup = renderFix({ fixes: [] })
    expect(markup).toContain('No safe fix was found. Every change we tried left the problem or made a new one.')
    expect(markup).not.toContain('Preview on map')
  })

  it('says there are no problems when the problem is null', () => {
    const markup = renderFix({ problem: null, fixes: [{ set: fixSet('a'), summary }] })
    expect(markup).toContain('No problems on this day.')
    expect(markup).not.toContain('Preview on map')
  })

  it('gives every phase its own text', () => {
    const texts = PHASES.map(phase => {
      const markup = renderFix({ phase })
      const text = phaseText(markup)
      expect(text.length).toBeGreaterThan(0)
      expect(markup).not.toContain('Apply</button>')
      return text
    })
    expect(new Set(texts).size).toBe(PHASES.length)
    expect(texts).toEqual([
      'Pick a day to see what is for this day.',
      'Looking for this day…',
      'The search for this day failed. Try again.',
      'The place search is over its limit for now.',
      'Nothing for this day fits your scope.',
    ])
  })
})
