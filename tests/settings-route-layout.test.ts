import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Source-only contract for the Settings phone route rows. It pins the markup
// hook and the Settings-scoped CSS. Geometry needs Terra's browser pass.
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')
const css = read('src/styles/legacy/12-pages.css')
const shared = read('src/styles/legacy/08-map-review.css')
const tsx = read('src/pages/trip/TripSettingsForm.tsx')

// Only the Settings route region, not the shared strip in 08-map-review.css.
const routeStart = css.indexOf('.tsx-card .tsx-route {')
const routeEnd = css.indexOf('/* A row of choice buttons.', routeStart)
const routeCss = css.slice(routeStart, routeEnd)

describe('Settings phone route rows', () => {
  it('wraps the ordinal and name in one line element', () => {
    expect(tsx).toContain('<span className="tsx-node-line">')
    const line = tsx.indexOf('<span className="tsx-node-line">')
    const ord = tsx.indexOf('<span className="tsx-node-ord"', line)
    const name = tsx.indexOf('<span className="tsx-node-name">', line)
    expect(ord).toBeGreaterThan(line)
    expect(name).toBeGreaterThan(ord)
    expect(tsx.slice(line, name)).toContain('tsx-node-ord')
    // The pin stays paired with the name inside that line.
    expect(tsx).toContain('{d.lat != null && d.lng != null && <span className="dest-pin" aria-hidden>📍</span>}')
  })

  it('gives the name a full line and the tools a second row at phone width', () => {
    expect(routeCss).toMatch(/@container route-edit \(max-width: 480px\) \{/)
    expect(routeCss).toMatch(/\.tsx-card \.tsx-route \.tsx-node \{ flex-wrap: wrap;/)
    expect(routeCss).toMatch(/\.tsx-card \.tsx-route \.tsx-node-line \{ flex: 1 1 100%; \}/)
    expect(routeCss).toMatch(/\.tsx-card \.tsx-route \.tsx-node-tools \{ margin-left: 0; \}/)
  })

  it('scopes the new rules to Settings, not the shared strip', () => {
    expect(shared).not.toContain('tsx-node-line')
    expect(shared).not.toContain('route-edit')
    expect(css).toContain('container: route-edit / inline-size;')
    // The base line rule keeps the compact inline row on a wide desktop.
    expect(routeCss).toMatch(/\.tsx-card \.tsx-route \.tsx-node-line \{[\s\S]*?flex: 1;/)
  })

  it('keeps every action, the editable gates and the rename focus', () => {
    expect(tsx).toContain('aria-label={`Rename ${d.name}`}')
    expect(tsx).toContain('autoFocus')
    expect(tsx).toContain('onBlur={() => commitRename(i)}')
    expect(tsx).toContain('aria-label={`Move ${d.name} earlier`}')
    expect(tsx).toContain('aria-label={`Move ${d.name} later`}')
    expect(tsx).toContain('aria-label={`Remove ${d.name}`}')
    expect(tsx).toContain('disabled={!editable || i === 0}')
    expect(tsx).toContain('disabled={!editable || i === dests.length - 1}')
    expect(tsx).toContain('{editable && (')
  })

  it('keeps the derived return row and the start row read-only', () => {
    expect(tsx).toContain('<span className="tsx-node tsx-node--start"')
    expect(tsx).toContain('<span className="tsx-node tsx-node--return"')
    expect(tsx).toContain('<span className="tsx-return-marker">Return</span>')
    expect(tsx).toContain('{routeSummary.returnPlace !== null && (')
  })
})
