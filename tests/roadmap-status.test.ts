// ROADMAP status-section invariants (docs-freshness gate).
// Static source checks: they read the shipped files as text, so a regression
// in the version claims fails CI without a network call or a browser. The
// rot this guards against is exactly what happened twice — ROADMAP.md's
// "Current version" / snapshot lagging the shipped release. Issue numbers,
// table contents and commit SHAs churn legitimately, so none are asserted here.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const roadmap = readFileSync(new URL('../ROADMAP.md', import.meta.url), 'utf8')
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8')

// The single "Current version: **X.Y.Z**" line in the Snapshot block.
const roadmapVersion = roadmap.match(/Current version:\s*\*\*([0-9]+\.[0-9]+\.[0-9]+)\*\*/)?.[1]

// Newest dated release heading ("## [X.Y.Z] - YYYY-MM-DD"); [Unreleased] and
// the -native line carry no web semver, so the first match is the newest web release.
const changelogHead = changelog.match(/^## \[([0-9]+\.[0-9]+\.[0-9]+)\] - ([0-9]{4}-[0-9]{2}-[0-9]{2})/m)

// The Snapshot block's verification date ("Snapshot (YYYY-MM-DD, ...").
const snapshotDate = roadmap.match(/Snapshot \(([0-9]{4}-[0-9]{2}-[0-9]{2})/)?.[1]

describe('ROADMAP status section stays pinned to the shipped version', () => {
  it('declares a "Current version: **X.Y.Z**" line', () => {
    expect(roadmapVersion, 'ROADMAP.md must keep the "Current version: **X.Y.Z**" line').toBeTruthy()
  })

  it('matches package.json', () => {
    expect(roadmapVersion).toBe(pkg.version)
  })

  it('matches the newest CHANGELOG release heading', () => {
    expect(changelogHead?.[1], 'CHANGELOG.md must have a "## [X.Y.Z] - YYYY-MM-DD" heading').toBeTruthy()
    expect(roadmapVersion).toBe(changelogHead?.[1])
  })

  it('snapshot date is not older than the newest CHANGELOG release date', () => {
    expect(snapshotDate, 'the Snapshot block must carry a date').toBeTruthy()
    const snapshot = Date.parse(`${snapshotDate}T00:00:00Z`)
    const release = Date.parse(`${changelogHead?.[2]}T00:00:00Z`)
    expect(snapshot).toBeGreaterThanOrEqual(release)
  })
})
