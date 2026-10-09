// Run with node scripts/browser-redesign-check.mjs. No live service may receive fixture data.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { checkCompactTarget } from './compactCardChecks.mjs'
import { buildFixture, buildSession, fixtureResponse, reserveFixtureFork, SYNTHETIC_FORK_ID, FIXTURE_NOW, FIXTURE_COVER, COVER_SVG, TRIP_ID, OWNER_ID, ANALYTICS_SESSION_ID } from './redesignFixture.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
function option(name, fallback) {
  const index = args.indexOf(name)
  if (index < 0) return fallback
  assert(args[index + 1] && !args[index + 1].startsWith('--'), `${name} needs a value`)
  return args[index + 1]
}
const base = new URL(option('--base-url', 'http://localhost:5188'))
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Only a loopback preview is allowed')
assert(base.protocol === 'http:' && !base.username && !base.password, 'Use a local HTTP preview without credentials')
const out = resolve(root, option('--out', '.cache/redesign-baseline'))
const outRelative = relative(root, out)
assert(!outRelative.startsWith('..') && !isAbsolute(outRelative), 'Artifacts must stay in this worktree')
const scenario = option('--scenario', 'mixed')
assert(['mixed', 'past-only', 'duplicate-names', 'equal-creators', 'sparse', 'many-publications', 'editor-cover', 'missing-cover', 'broken-cover'].includes(scenario), 'Unknown fixture scenario')
const state = option('--state', 'populated')
assert(['populated', 'loading', 'empty', 'error'].includes(state), 'Unknown fixture state')
const theme = option('--theme', 'light')
assert(['light', 'dark'].includes(theme), 'Unknown theme')
/* Widths drive their own device names, so the report names the width it
   actually captured. The two defaults keep the earlier runs' artifact names. */
const widths = option('--widths', '1440,390').split(',').map(value => Number(value.trim()))
assert(
  widths.length > 0 && widths.every(width => Number.isInteger(width) && width >= 320 && width <= 2560),
  'Widths must be integers between 320 and 2560',
)
const images = option('--images', 'synthetic')
assert(['synthetic', 'reference', 'broken'].includes(images), 'Unknown image mode')
const exploreAuth = option('--explore-auth', 'signed-out')
assert(['signed-out', 'signed-in'].includes(exploreAuth), 'Unknown Explore auth mode')
const fontMode = option('--fonts', 'allowed')
assert(['allowed', 'blocked'].includes(fontMode), 'Unknown font mode')
/* This simulates a scaled viewport. It does not establish actual browser zoom.
   Record actual 200% browser zoom as a separate manual check. */
const zoom = Number(option('--zoom', '1'))
assert(Number.isFinite(zoom) && zoom >= 0.5 && zoom <= 3, 'Zoom must be between 0.5 and 3')
const motion = option('--motion', 'reduce')
assert(['reduce', 'no-preference'].includes(motion), 'Unknown motion preference')
const workspaceSmoke = args.includes('--workspace-routes')
const productionBuild = args.includes('--production-build')
const requestedSurfaces = option('--surfaces', 'my-trips,timeline,creator-hub,explore').split(',')
assert(requestedSurfaces.every(name => ['my-trips', 'timeline', 'creator-hub', 'explore'].includes(name)), 'Unknown surface')
const surfaces = [
  { name: 'my-trips', route: '/trips', signedIn: true, heading: 'My trips', peers: ['.itin-card', '.trip-featured-card'] },
  { name: 'timeline', route: `/trip/${TRIP_ID}/timeline`, signedIn: true, peers: ['.day-section', '.stop-card'] },
  { name: 'creator-hub', route: '/creator-hub', signedIn: true, heading: 'Creator hub', peers: ['.hub-lead-row', '.hub-instrument-col'] },
  { name: 'explore', route: '/explore', signedIn: exploreAuth === 'signed-in', heading: 'Find your next great journey.', peers: ['.creator-card', '.trend-row', '.itin-card'] },
].filter(surface => requestedSurfaces.includes(surface.name))

/* The compact card correction records card rectangles before any interaction.
   A baseline run stores them. A target run reads one baseline report per theme
   and compares the same cards. Each flag may repeat, because the light and the
   dark baseline are two reports. */
const compactTarget = args.includes('--compact-target')
const compactBaselines = []
for (let index = args.indexOf('--compact-baseline'); index >= 0; index = args.indexOf('--compact-baseline', index + 1)) {
  const value = args[index + 1]
  assert(value && !value.startsWith('--'), '--compact-baseline needs a value')
  const resolved = resolve(root, value)
  const inside = relative(root, resolved)
  assert(!inside.startsWith('..') && !isAbsolute(inside), 'Baseline reports must stay in this worktree')
  const reportPath = (await stat(resolved)).isDirectory() ? resolve(resolved, 'results.json') : resolved
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  assert(!report.blocker, `Baseline report ${value} carries a blocker: ${report.blocker}`)
  assert(!report.sourceChangedDuringRun, `Baseline report ${value} changed source during its capture`)
  assert(!report.buildChangedDuringRun, `Baseline report ${value} changed its build during its capture`)
  for (const baselineResult of report.results) {
    assert(!baselineResult.failures?.length, `Baseline result ${baselineResult.surface} ${baselineResult.width} carries failures`)
    compactBaselines.push(baselineResult)
  }
}
if (compactTarget) {
  assert(compactBaselines.length > 0, '--compact-target needs at least one --compact-baseline report')
}

/** The authorised photographs this project may serve in reference mode. */
const ADOPTED_PHOTOS = ['kerala-backwaters.jpg', 'goa-panjim.jpg', 'rajasthan-forts.jpg', 'spit-valley.jpg', 'himalayan-loop.jpg', 'ch-hero.jpg', 'hero-banner.jpg']
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

const observedFiles = ['src/pages/Explore.tsx', 'src/styles.css', 'src/components/ExploreDiscovery.tsx', 'src/components/PubCard.tsx', 'src/components/CoverThumb.tsx', 'src/lib/discovery.ts', 'src/lib/editorialAssets.ts', 'src/store/store.ts', 'src/pages/TripsList.tsx', 'src/pages/CreatorHubPage.tsx', 'src/pages/trip/TimelineTab.tsx']
function localRevision() {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  return { commit: git('rev-parse', 'HEAD'), files: Object.fromEntries([...observedFiles, 'vite.config.ts', 'scripts/browser-redesign-check.mjs', 'scripts/compactCardChecks.mjs', 'scripts/redesignFixture.mjs', 'src/components/EditorialPhoto.tsx', 'index.html', 'public/img/mockup-adopted/sources.json'].map(path => [path, git('hash-object', path)])) }
}
async function servedRevision() {
  const hashes = {}
  for (const path of observedFiles) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(5000) })
    hashes[path] = response.ok && !response.headers.get('content-type')?.includes('text/html')
      ? createHash('sha256').update(await response.text()).digest('hex') : null
  }
  return hashes
}
function currentRoute(page) {
  const url = new URL(page.url())
  return url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname + url.search
}

async function productionRevision() {
  const html = await (await fetch(base, { signal: AbortSignal.timeout(5000) })).text()
  assert.equal(html, await readFile(resolve(root, 'dist/index.html'), 'utf8'), 'Production preview must serve this tree\'s built entry')
  const assets = [...html.matchAll(/(?:src|href)=["'](\.?\/assets\/[^"']+)["']/g)].map(match => new URL(match[1], base).pathname)
  assert(assets.some(path => path.endsWith('.js')) && assets.some(path => path.endsWith('.css')), 'Production entry needs its built script and stylesheet')
  const hashes = {}
  for (const path of [...assets, ...ADOPTED_PHOTOS.map(name => `/img/mockup-adopted/${name}`)]) {
    const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(5000) })
    assert(response.ok, `Built asset did not load: ${path}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert(bytes.equals(await readFile(resolve(root, 'dist', path.slice(1)))), `Production asset must match this tree: ${path}`)
    hashes[path] = createHash('sha256').update(bytes).digest('hex')
  }
  return { entrySha256: createHash('sha256').update(html).digest('hex'), assets: hashes }
}

async function configuredHost() {
  const response = await fetch(base, { signal: AbortSignal.timeout(5000) })
  assert(response.ok, `Preview returned ${response.status}`)
  const html = await response.text()
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/g)].map(match => match[1])
  for (const path of ['/src/lib/supabase.ts', ...scripts]) {
    const url = new URL(path, base)
    if (url.origin !== base.origin) continue
    const sourceResponse = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!sourceResponse.ok) continue
    const source = await sourceResponse.text()
    const host = source.match(/https:\/\/([a-z0-9]+\.supabase\.co)/)?.[1]
    if (host) return host
  }
  throw new Error('INCONCLUSIVE: no compiled Supabase host found in local served modules')
}

async function geometry(page, selectors) {
  return page.evaluate(groups => {
    const defects = []
    if (document.documentElement.scrollWidth > innerWidth + 1) defects.push(`Page overflow: ${document.documentElement.scrollWidth} > ${innerWidth}`)
    for (const selector of groups) {
      const boxes = [...document.querySelectorAll(selector)].map(element => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { element, rect, visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' }
      }).filter(item => item.visible)
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue
        const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
        const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
        if (width > 1 && height > 1) defects.push(`${selector}: items ${i + 1} and ${j + 1} overlap`)
      }
    }
    return defects
  }, ['.topnav .brand, .topnav .nav-links, .topnav .nav-actions', ...selectors])
}

async function visible(locator, label) {
  assert(await locator.first().isVisible(), `${label} is not visible`)
}
async function count(locator, minimum, label) {
  assert(await locator.count() >= minimum, `${label}: expected at least ${minimum}, found ${await locator.count()}`)
}
/** A sparse catalog is allowed to show one of everything — the page is
    supposed to collapse, not pad. These floors apply to the populated
    fixtures only. */
const populatedFloor = (scenario === 'sparse' ? 1 : 2)
async function catalogPagination(page, result, fixture) {
  const catalog = page.locator('.explore-grid')
  const ids = () => catalog.locator('a.trip-card-hit').evaluateAll(links => links.map(link => new URL(link.href).pathname.split('/').at(-1)))
  const live = fixture.published_itineraries.filter(row => row.unpublished_at == null)
  const featuredId = await page.locator('.featured-card a').first().getAttribute('href')
  const featured = new URL(featuredId, base).pathname.split('/').at(-1)
  const candidates = live.filter(row => row.id !== featured)
  assert(candidates.length > 12, 'Pagination needs more than one page of catalog rows')
  const sorts = [
    ['popular', 'Most popular', (a, b) =>
      (b.views + b.copies * 5) - (a.views + a.copies * 5)
      || b.published_at - a.published_at],
    ['newest', 'Newest first', (a, b) => b.published_at - a.published_at],
    ['budget-asc', 'Budget: low → high', (a, b) => a.estimated_budget_per_person_inr - b.estimated_budget_per_person_inr],
    ['budget-desc', 'Budget: high → low', (a, b) => b.estimated_budget_per_person_inr - a.estimated_budget_per_person_inr],
    ['duration', 'Longest first', (a, b) => b.duration_days - a.duration_days],
  ]
  result.pagination = { sorts: [], resets: [] }
  for (const [key, label, comparator] of sorts) {
    const combobox = page.getByRole('combobox', { name: 'Sort by', exact: true })
    await combobox.click()
    await page.getByRole('option', { name: label, exact: true }).click()
    const expected = [...candidates].sort((a, b) => comparator(a, b) || a.id.localeCompare(b.id)).map(row => row.id)
    await page.waitForTimeout(150)
    assert.deepEqual(await ids(), expected.slice(0, 12), `${key}: first page and stable tied-row order`)
    if (key !== 'popular') assert(currentRoute(page).includes(`sort=${key}`), `${key}: URL state`)
    await page.getByRole('button', { name: /^Load more/ }).click()
    assert.deepEqual(await ids(), expected, `${key}: appended page has exact order, no duplicates, and no missing rows`)
    assert.equal(await page.getByRole('button', { name: /^Load more/ }).count(), 0, `${key}: no more pages`)
    result.pagination.sorts.push({ key, rows: expected.length, stableTie: true })
  }
  // Each control must reset the expanded page. Choose filters with >12 rows,
  // or a collapsed page would be indistinguishable from exhausted results.
  const search = page.getByRole('textbox', { name: 'Search destination or creator' })
  const select = async (name, label) => {
    await page.getByRole('combobox', { name, exact: true }).click()
    await page.getByRole('option', { name: label, exact: true }).click()
  }
  for (const [name, apply, clear] of [
    ['search', () => search.fill('Fixture'), () => search.fill('')],
    ['travel-style', () => page.getByRole('button', { name: /^Balanced\s/ }).click(), () => page.getByRole('button', { name: 'All styles', exact: true }).click()],
    ['budget', () => select('Max budget', 'Under ₹20k'), () => select('Max budget', 'Any budget')],
    ['duration', () => select('Duration', '≤3 days'), () => select('Duration', 'Any length')],
  ]) {
    await apply(); await page.waitForTimeout(150)
    assert.equal((await ids()).length, 12, `${name}: pagination resets to one page`)
    await visible(page.getByRole('button', { name: /^Load more/ }), `${name}: more rows remain`)
    await clear(); await page.waitForTimeout(150)
    assert.equal((await ids()).length, 12, `${name}: clearing also starts on page one`)
    await page.getByRole('button', { name: /^Load more/ }).click()
    result.pagination.resets.push(name)
  }
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  assert.equal((await ids()).length, 0, 'Unsaved fixture has an empty saved subset')
  await page.getByRole('button', { name: 'Saved', exact: true }).click()
  assert.equal((await ids()).length, 12, 'Leaving Saved resets pagination')
  result.pagination.resets.push('saved')
  await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
  await page.locator('.explore-grid a.trip-card-hit').first().waitFor()
}

async function checkSignedInFork(page, result, fixture) {
  const target = page.locator('.explore-grid .pub-card-editorial').filter({ has: page.getByRole('heading', { name: 'Fixture Himalayan Paths', exact: true }) })
  await page.evaluate(id => {
    const original = crypto.randomUUID.bind(crypto)
    let reserved = true
    crypto.randomUUID = () => {
      if (reserved) { reserved = false; return id }
      return original()
    }
  }, SYNTHETIC_FORK_ID)
  const priorCopies = fixture.published_itineraries.find(row => row.id === 'fixture-publication-4').copies
  await target.getByRole('button', { name: 'Fork this trip', exact: true }).click()
  await page.waitForURL(url => (url.hash.startsWith('#/') ? url.hash.slice(1) : url.pathname) === '/trips', { timeout: 10000 })
  await page.getByRole('heading', { name: 'Fixture Himalayan Paths (copy)', exact: true }).waitFor({ state: 'visible' })
  assert(result.fixtureOperations.includes('synthetic-fork-trip'), 'Fork must persist its trip row')
  assert(result.fixtureOperations.includes('synthetic-fork-member'), 'Fork must persist owner membership')
  await page.waitForTimeout(300)
  assert(result.fixtureOperations.includes('synthetic-fork-counter'), 'Fork must persist the attributed copies counter')
  const copy = fixture.trips.find(row => row.id === SYNTHETIC_FORK_ID)
  assert.equal(copy.owner_id, OWNER_ID)
  assert.equal(copy.visibility, 'private')
  assert.equal(copy.ref, 'explore')
  assert.equal(fixture.published_itineraries.find(row => row.id === 'fixture-publication-4').copies, priorCopies + 1)
  await page.goto(`${base.origin}/#/trip/${SYNTHETIC_FORK_ID}/timeline`, { waitUntil: 'domcontentloaded' })
  await page.locator('#panel-timeline').waitFor({ state: 'visible' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('#panel-timeline').waitFor({ state: 'visible' })
  await page.getByRole('heading', { name: 'Fixture Himalayan Paths (copy)', exact: true }).waitFor({ state: 'visible' })
  assert.equal(currentRoute(page), `/trip/${SYNTHETIC_FORK_ID}/timeline`, 'Fork remains available after reload')
  await page.goto(`${base.origin}/#/trips`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Fixture Himalayan Paths (copy)', exact: true }).waitFor({ state: 'visible' })
  result.signedInFork = { tripPersisted: true, ownerMemberPersisted: true, counterPersisted: true, reloadPersisted: true, myTripsVisible: true }
  await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
  await page.locator('.explore-grid a.trip-card-hit').first().waitFor()
}

async function acceptance(page, surface, result, fixture) {
  if (surface.name === 'explore') {
    result.editorialSurfaces = await page.evaluate(() => ({
      nestedFrames: [...document.querySelectorAll('.explore-page .trend-row')].filter(row => {
        const style = getComputedStyle(row)
        return Number.parseFloat(style.paddingLeft) > 0 || Number.parseFloat(style.borderLeftWidth) > 0 || style.boxShadow !== 'none'
      }).length,
      photoInsets: [...document.querySelectorAll('.pub-card-editorial .itin-card')].map(card => {
        const cover = card.querySelector('.itin-cover')
        const bounds = card.getBoundingClientRect()
        const photo = cover.getBoundingClientRect()
        return Math.max(photo.left - bounds.left, bounds.right - photo.right)
      }),
    }))
    assert.equal(result.editorialSurfaces.nestedFrames, 0, 'Trending must not add a second frame around its editorial card')
    assert(result.editorialSurfaces.photoInsets.every(inset => inset <= 1.5), 'Editorial card photos meet the single card edge')
    result.cardGeometry = await page.evaluate(() => {
      const columns = selector => {
        const grid = document.querySelector(selector)
        return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : null
      }
      const clipped = []
      for (const card of document.querySelectorAll('.pub-card-editorial .itin-card')) {
        const bounds = card.getBoundingClientRect()
        for (const control of card.querySelectorAll('button, .creator-line, .card-title, .stop-meta')) {
          const rect = control.getBoundingClientRect()
          if (rect.width && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) {
            clipped.push({ control: control.className, cardWidth: bounds.width, controlWidth: rect.width,
              ancestors: [control, control.parentElement, control.parentElement.parentElement].map(el => {
                const style = getComputedStyle(el)
                return { className: el.className, width: style.width, minWidth: style.minWidth, whiteSpace: style.whiteSpace, display: style.display, alignItems: style.alignItems }
              }) })
          }
        }
      }
      return { catalogColumns: columns('.explore-grid'), trendingColumns: columns('.trending-grid'), clipped }
    })
    const expectedColumns = page.viewportSize().width <= 720 ? 1 : page.viewportSize().width <= 1150 ? 2 : 3
    for (const key of ['catalogColumns', 'trendingColumns']) {
      if (result.cardGeometry[key] != null) assert.equal(result.cardGeometry[key], expectedColumns, `${key} responsive layout`)
    }
    assert.deepEqual(result.cardGeometry.clipped, [], 'Publication controls and text must fit their card')
    /* Task 4 creator checks: the avatar and the creator name share one row,
       and the cover reaches the card edges without an inner frame. These stay
       behind the target flag until the whole correction is ready. */
    if (compactTarget && result.scenario === 'mixed' && result.state === 'populated') {
      const creator = page.locator('.creator-card').first()
      if (await creator.count()) {
        const avatarBox = await creator.locator('.avatar').boundingBox()
        const nameBox = await creator.locator('.creator-name').boundingBox()
        assert(avatarBox && nameBox, 'Creator identity needs an avatar and a name')
        assert(
          Math.min(avatarBox.y + avatarBox.height, nameBox.y + nameBox.height) > Math.max(avatarBox.y, nameBox.y),
          'Avatar and creator name share one row',
        )
        result.creatorEdges = await page.locator('.creator-card').evaluateAll(cards => cards.map(card => {
          const bounds = card.getBoundingClientRect()
          const cover = card.querySelector('.creator-cover')?.getBoundingClientRect()
          return cover ? Math.max(Math.abs(cover.left - bounds.left), Math.abs(bounds.right - cover.right)) : null
        }))
        assert(result.creatorEdges.every(inset => inset != null && inset <= 1.5), 'Creator covers reach the card edges')
      }
    }
    /* Task 3 anatomy: the compact editorial card carries one duration pill,
       one evidence row, a bookmark Save, a sans-serif title, no photo route
       caption, no footer divider, and no bio footer. Creator identity, social
       links, and the Fork action stay visible on every card. These stay behind
       the target flag until the whole correction is ready. */
    if (compactTarget) {
      const anatomy = await page.locator('.pub-card-editorial .itin-card').evaluateAll((cards, ownerId) => cards.map(card => {
        const seen = element => {
          if (!element) return false
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
        }
        const creatorLink = card.querySelector('.pub-card-creator .creator-line')
        const fork = card.querySelector('.row-between.itin-meta button')
        return {
          durations: card.querySelectorAll('.pub-card-duration').length,
          evidence: card.querySelectorAll('.itin-public-evidence').length,
          routeOverPhoto: card.querySelectorAll('.itin-cover-route').length,
          bookmark: Boolean(card.querySelector('.save-bookmark .lucide-bookmark')),
          titleFamily: getComputedStyle(card.querySelector('.card-title')).fontFamily,
          divider: getComputedStyle(card.querySelector('.itin-meta'), '::before').borderTopWidth,
          bioFooter: card.querySelectorAll('.itin-foot').length,
          identity: seen(creatorLink),
          creatorId: creatorLink ? new URL(creatorLink.href).pathname.split('/').at(-1) : null,
          socials: [...card.querySelectorAll('.pub-card-socials .icon-link')].filter(seen).length,
          forkVisible: seen(fork),
          forkLabel: (fork?.innerText ?? '').trim(),
        }
      }), OWNER_ID)
      /* A sparse catalog holds only the featured article, so it renders no
         editorial cards by design. Only the populated mixed fixture must have
         them. */
      if (anatomy.length === 0 && (result.scenario !== 'mixed' || result.state !== 'populated')) {
        result.editorialAnatomy = { cards: 0, skipped: 'no editorial cards in this fixture' }
      } else {
        assert(anatomy.length > 0, 'Anatomy checks need editorial cards')
        for (const card of anatomy) {
          assert.equal(card.durations, 1, 'Each editorial card carries one duration label')
          assert.equal(card.evidence, 1, 'Each editorial card carries one fork-evidence label')
          assert.equal(card.routeOverPhoto, 0, 'No route caption over the photo')
          assert.equal(card.bookmark, true, 'Editorial Save uses the bookmark glyph')
          assert(card.titleFamily.includes('Plus Jakarta Sans'), `Editorial title uses the compact sans face, found ${card.titleFamily}`)
          assert.equal(Number.parseFloat(card.divider) || 0, 0, 'No footer divider inside editorial cards')
          assert.equal(card.bioFooter, 0, 'No bio footer inside editorial cards')
          assert.equal(card.identity, true, 'Creator identity stays visible')
          assert.equal(card.socials, card.creatorId === OWNER_ID ? 2 : 0, 'Owner cards show both social links, other cards show none')
          assert.equal(card.forkVisible, true, 'Fork stays visible')
          assert(card.forkLabel.length > 0, 'Fork carries a readable label')
        }
        result.editorialAnatomy = { cards: anatomy.length }
      }
    }
    const creatorRail = page.locator('.creator-rail')
    if (await creatorRail.count()) {
      const creatorColumns = await creatorRail.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      assert.equal(creatorColumns, page.viewportSize().width <= 720 ? 1 : 2, 'Creator rail uses the approved two-card composition')
      for (const rank of await page.locator('.creator-rank').all()) assert(await rank.isVisible(), 'Creator rank is visible')
      assert.equal(await page.locator('.creator-rank').count(), await page.locator('.creator-card').count(), 'Every creator has a visible rank')
    }
    for (const footer of await page.locator('.pub-card-editorial .itin-foot').all()) {
      assert(await footer.isVisible(), 'Existing creator bio/social footer remains visible')
    }
  }
  if (surface.heading) await visible(page.getByRole('heading', { name: surface.heading, exact: true }), surface.heading)
  if (surface.signedIn) await visible(page.getByRole('button', { name: 'Account menu' }), 'Signed-in account menu')
  if (surface.name === 'my-trips') {
    await count(page.locator('.itin-card'), 2, 'Trip tiles')
    await count(page.locator('.trip-featured-card'), 1, 'Featured trip')
    /* Task 4 spacing: My Trips footers use spacing instead of a divider. This
       stays behind the target flag until the whole correction is ready. */
    if (compactTarget && state === 'populated') {
      const borders = await page.locator('.trip-card-foot').evaluateAll(rows => rows.map(row => getComputedStyle(row).borderTopWidth))
      assert(borders.length > 0, 'Footer divider check needs trip footers')
      assert(borders.every(value => Number.parseFloat(value) === 0), 'My Trips footers carry no divider')
      /* Foot integrity: padding, gaps, controls, and labels are pinned so a
         wrapped foot cannot hide a padding or overlap regression. */
      const feet = await page.locator('.trip-card-foot').evaluateAll(rows => rows.map(row => {
        const style = getComputedStyle(row)
        const box = element => {
          const rect = element.getBoundingClientRect()
          const elementStyle = getComputedStyle(element)
          return {
            label: (element.innerText ?? '').trim().slice(0, 48),
            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            visible: rect.width > 0 && rect.height > 0 && elementStyle.visibility !== 'hidden' && elementStyle.display !== 'none',
          }
        }
        const kids = [...row.children].map(box)
        const actions = [...row.querySelectorAll('.trip-card-actions > *')].map(box)
        const labels = [...row.querySelectorAll('.trip-next-label')].map(label => ({
          text: (label.innerText ?? '').trim(),
          clipped: label.scrollWidth > label.clientWidth + 1,
        }))
        return {
          padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
          gap: style.columnGap, kids, actions,
          buttons: row.querySelectorAll('button').length,
          labels,
        }
      }))
      for (const foot of feet) {
        assert.deepEqual(foot.padding, ['12px', '16px', '16px', '16px'], 'Foot padding stays at its specified values')
        assert.equal(foot.gap, '12px', 'Foot gap stays at its specified value')
        assert.equal(foot.kids.length, 3, 'Foot keeps its crew, action, and actions-group controls')
        assert(foot.kids.every(kid => kid.visible), 'Every foot control stays visible')
        assert(foot.actions.every(kid => kid.visible), 'Every grouped action stays visible')
        assert.equal(foot.buttons, 1, 'Foot keeps exactly its menu button')
        for (const label of foot.labels) {
          assert(label.text.length > 0, 'Foot action keeps its readable label')
          assert.equal(label.clipped, false, `Foot action label must wrap, not truncate: ${label.text}`)
        }
        for (const group of [foot.kids, foot.actions]) {
          for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
            const a = group[i], b = group[j]
            const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
            const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
            assert(!(width > 1 && height > 1), `Foot controls must not overlap: ${a.label} / ${b.label}`)
          }
        }
      }
      result.footIntegrity = { feet: feet.length }
      /* Cards sharing a grid row end together: the grid stretches boxes, so a
         spread wider than tolerance means a row escaped the stretch. */
      const rowSpreads = await page.locator('.trips-page .explore-grid .itin-card').evaluateAll(cards => {
        const buckets = []
        for (const card of cards) {
          const rect = card.getBoundingClientRect()
          const bucket = buckets.find(entry => Math.abs(entry.top - rect.top) <= 2)
          if (bucket) bucket.bottoms.push(rect.bottom)
          else buckets.push({ top: rect.top, bottoms: [rect.bottom] })
        }
        return buckets.map(entry => Math.max(...entry.bottoms) - Math.min(...entry.bottoms))
      })
      for (const spread of rowSpreads) {
        assert(spread <= 2, `Cards in one row end together (spread ${spread.toFixed(1)}px)`)
      }
      /* Foot and featured controls take keyboard focus with a changed ring. */
      const tripFocusTargets = [
        ['foot action', '.trip-card-foot a.trip-task-row'],
        ['foot button', '.trip-card-foot .icon-btn'],
        ['featured overview', '.trip-featured-overview-btn'],
      ]
      for (const [label, selector] of tripFocusTargets) {
        const control = page.locator(selector).first()
        if (await control.count() === 0) continue
        const before = await control.evaluate(element => {
          const style = getComputedStyle(element)
          return { outlineStyle: style.outlineStyle, shadow: style.boxShadow }
        })
        await page.keyboard.press('Tab')
        await control.focus()
        const focus = await control.evaluate(element => {
          const style = getComputedStyle(element)
          return {
            active: element === document.activeElement,
            visible: element.matches(':focus-visible'),
            outlineStyle: style.outlineStyle,
            shadow: style.boxShadow,
          }
        })
        assert(focus.active && focus.visible, `My Trips ${label} takes keyboard focus visibly (active ${focus.active} visible ${focus.visible})`)
        assert(
          focus.outlineStyle !== before.outlineStyle || focus.shadow !== before.shadow,
          `My Trips ${label} draws a focus ring on focus`,
        )
      }
    }
    if (scenario === 'past-only') {
      await visible(page.locator('.trip-featured-card').getByText('Completed', { exact: true }), 'Completed fallback hero')
      assert(!/upcoming|next departure/i.test(await page.locator('.trip-featured-card').innerText()), 'Completed hero must not claim an upcoming departure')
    }
    await visible(page.getByRole('textbox', { name: 'Search your trips' }), 'Trip search')
    await visible(page.getByRole('heading', {
      name: 'Fixture Long Name Journey Across The Western Ghats With Friends And Family',
      exact: true,
    }), 'Long trip name')
    await visible(page.getByRole('heading', { name: 'Fixture Undated Journey', exact: true }), 'Undated trip')
    await visible(page.getByRole('heading', { name: 'Fixture Himalayan Paths', exact: true }), 'Viewer trip')
    // The hero band carries the identity (ADR 0003); the body opens on where
    // and when. Read the hero heading, which is the name that must not repeat
    // as a tile below.
    const heroTitle = (await page.locator('.trip-featured-card .trip-featured-title').innerText()).trim()
    const heroTrip = fixture.trips.find(trip => trip.name === heroTitle)
    assert(heroTrip, 'Featured trip must match a fixture trip')
    const search = page.getByRole('textbox', { name: 'Search your trips' })
    await search.fill('Himalayan')
    await page.waitForTimeout(150)
    assert.equal(await page.locator('.itin-card').count(), 1, 'Trip search must narrow the collection')
    await visible(page.locator('.itin-card').getByRole('heading', { name: 'Fixture Himalayan Paths', exact: true }), 'Trip search result')
    await search.fill('fixture-no-match')
    await visible(page.getByRole('heading', { name: 'No trips match those filters', exact: true }), 'No-match state')
    // The sort check runs on the full collection, before anything clears the
    // filters: clearing resets sortKey to "recent", so a sort assertion after a
    // reset would read one trip and find nothing to order.
    await page.getByRole('button', { name: 'Clear filters', exact: true }).last().click()
    await page.waitForTimeout(200)
    for (const layout of ['List', 'Grid']) {
      const control = page.getByRole('button', { name: layout, exact: true })
      await control.focus()
      assert(await control.evaluate(element => element === document.activeElement), `${layout} must accept keyboard focus`)
      await page.keyboard.press('Enter')
      assert.equal(await control.getAttribute('aria-pressed'), 'true', `${layout} selection`)
      assert.equal(await page.locator('.explore-grid.as-list').count(), layout === 'List' ? 1 : 0, `${layout} collection layout`)
    }
    await page.getByRole('combobox', { name: 'Sort by', exact: true }).click()
    await page.getByRole('option', { name: 'Name A–Z', exact: true }).click()
    await page.waitForTimeout(300)
    // The trip card's own heading is an h2 (the featured hero carries h3s), so
    // the sort check reads the shelf's card-title elements directly.
    const names = await page.locator('.itin-card .card-title').allTextContents()
    assert(names.length > 1, `Sort needs multiple trip cards; found ${names.length} (${names.join(', ')}) with ${await page.locator('.itin-card').count()} cards and ${await page.locator('.trip-featured-card').count()} hero cards`)
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'Name sort order')
    for (const trip of fixture.trips.filter(trip => trip.owner_id === OWNER_ID || fixture.trip_members.some(member => member.trip_id === trip.id && member.user_id === OWNER_ID))) {
      const card = page.locator('.itin-card').filter({ has: page.getByRole('heading', { name: trip.name, exact: true }) })
      // A stored photo is a nonblank persisted cover, never an emoji and never
      // the runtime destination image. Only an owner or an editor is offered
      // the action, so the viewer card is the negative control.
      const editor = fixture.trips.some(row => row.id === trip.id && row.owner_id === OWNER_ID)
        || fixture.trip_members.some(member => member.trip_id === trip.id && member.user_id === OWNER_ID && member.role !== 'viewer')
      const prompts = await card.getByRole('link', { name: 'Add cover photo', exact: true }).count()
      assert.equal(prompts, editor && !trip.cover_image_url ? 1 : 0, `${trip.name} cover prompt: expected ${editor && !trip.cover_image_url ? 1 : 0}, found ${prompts}`)
    }
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click()
    await page.locator('.trip-featured-card').getByRole('button', { name: 'Trip overview', exact: true }).click()
    assert(currentRoute(page).startsWith(`/trip/${heroTrip.id}`), 'Hero overview must navigate to its own trip')
  } else if (surface.name === 'timeline') {
    await visible(page.getByRole('heading', { name: 'Fixture Kerala Coast', exact: true }), 'Trip identity')
    await count(page.locator('.day-section'), 3, 'Timeline days')
    await count(page.locator('.stop-card'), 6, 'Timeline stops')
    await visible(page.getByRole('navigation', { name: 'Jump to day' }), 'Review day navigation')
    await count(page.locator('.day-rail-card'), 3, 'Review day controls')
    await visible(page.locator('.stop-card').first(), 'First timeline stop')
    const originalViewport = page.viewportSize()
    const readStack = () => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tl-stack')))
    // The sticky stack is invariant across every state this fixture can reach:
    // the day rail takes the sticky rung from the trip-total strip, so opening
    // review swaps which bar is stuck without moving the measured line, and the
    // line reads the same 173px at 1440 and at 390. A check that demanded a
    // height change would be asserting something the app does not do, which is
    // why this run asserts the CONTRACT both consumers share instead: whatever
    // the line now reads, the marked day is the last one to have crossed
    // it. That is the assertion a stale closure breaks, and it is checkable here.
    const oldStack = await readStack()
    await page.getByRole('button', { name: 'All days', exact: true }).click()
    await page.waitForTimeout(400)
    const newStack = await readStack()
    assert(Number.isFinite(oldStack) && Number.isFinite(newStack), 'Timeline sticky stack is not measurable')
    // Marking is a function of the CURRENT line, so recompute the expected day
    // from it each time rather than from a remembered position.
    const markerCheck = async label => {
      const tracking = await page.evaluate(() => {
        const line = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tl-stack'))
        const cards = [...document.querySelectorAll('.day-section')]
        const crossed = cards.filter(card => card.getBoundingClientRect().top <= line + 1)
        const expected = (crossed.at(-1) ?? cards[0]).id.replace('day-card-', '')
        const controls = [...document.querySelectorAll('.day-rail-card')]
        const actual = controls.findIndex(control => control.getAttribute('aria-current') === 'true')
        return { line, expected: Number(expected), actual, dayTops: cards.map(card => card.getBoundingClientRect().top) }
      })
      assert.equal(tracking.actual, tracking.expected, `${label}: expected Day ${tracking.expected + 1}, found Day ${tracking.actual + 1}; line ${tracking.line}px, day tops ${tracking.dayTops.map(top => top.toFixed(0)).join('/')}`)
      return tracking
    }
    await markerCheck('Review marker at the top of the timeline')
    // Land Day 2 just under the line, then check that Day 2 is the marked one.
    await page.evaluate(top => {
      const card = document.getElementById('day-card-1')
      const desired = card.getBoundingClientRect().top - top
      const limit = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, Math.min(Math.max(window.scrollY + desired, 0), limit))
    }, newStack + 2)
    await page.waitForTimeout(400)
    await markerCheck('Review marker after a day jump')
    await page.setViewportSize({ width: originalViewport.width === 390 ? 1440 : 390, height: originalViewport.width === 390 ? 900 : 844 })
    await page.waitForTimeout(400)
    await markerCheck('Review marker after a viewport resize')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await markerCheck('Review marker back at the top')
    await page.setViewportSize(originalViewport)
  } else if (surface.name === 'creator-hub') {
    await count(page.locator('.hub-lead-row'), scenario === 'sparse' ? 1 : 4, 'Owned publications')
    /* The sparse catalog holds one live publication, so it has no archived row
       and no stale page to show. Those are populated-fixture facts. */
    if (scenario !== 'sparse') {
      await visible(page.getByText('Unpublished', { exact: true }), 'Archived publication status')
      await visible(page.getByText('Page behind itinerary', { exact: true }), 'Stale publication status')
      for (const title of ['Fixture Goa Weekend', 'Fixture Rajasthan Trail']) {
        const liveRow = page.locator('.hub-lead-row').filter({ has: page.getByRole('link', { name: title, exact: true }) })
        await visible(liveRow.getByText('Live', { exact: true }), `${title} Live status`)
      }
      for (const title of ['Fixture Kerala Coast', 'Fixture Goa Weekend', 'Fixture Rajasthan Trail']) {
        await visible(page.locator('.hub-lead-row').getByRole('link', { name: title, exact: true }), title)
      }
    }
  } else {
    const exploreSignedIn = surface.signedIn
    if (exploreSignedIn) {
      await visible(page.getByRole('button', { name: 'Account menu' }), 'Signed-in account menu')
    } else {
      assert(await page.getByRole('button', { name: 'Account menu' }).count() === 0, 'Public Explore is unexpectedly signed in')
    }
    /* One live publication is also the featured pick, and the trending shelf
       exists to avoid repeating it — so a sparse catalog correctly shows no
       trending row at all. Padding it would be the defect. */
    if (scenario !== 'sparse') {
      await count(page.locator('.creator-card'), 2, 'Featured creators')
      await count(page.locator('.trend-row'), 2, 'Trending plans')
      await visible(page.locator(`.creator-card[href="/creator/${OWNER_ID}"]`), 'Owner creator card')
    }
    const railLabels = await page.locator('.creator-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')))
    assert.equal(new Set(railLabels).size, railLabels.length, 'Every creator card must carry a distinct accessible name, since the name alone can repeat')
    const search = page.getByRole('textbox', { name: 'Search destination or creator' })
    await visible(search, 'Explore search')
    if (scenario === 'many-publications') await catalogPagination(page, result, fixture)
    await visible(page.getByRole('group', { name: 'Travel style', exact: true }), 'Style controls')
    /* The search term must name a route this fixture actually holds, or the
       check would be asserting that a no-match search shows a result. The
       sparse catalog keeps only the Kochi publication. */
    const searchTerm = scenario === 'sparse' ? 'Kochi' : 'Himalayan'
    const searchTitle = scenario === 'sparse' ? 'Fixture Kerala Coast' : 'Fixture Himalayan Paths'
    await search.fill(searchTerm)
    await page.waitForTimeout(250)
    assert(currentRoute(page).includes(`q=${searchTerm}`), 'Search did not update the route')
    await visible(page.getByRole('heading', { name: searchTitle, exact: true }), 'Search result')
    assert(await page.locator('.creator-card, .trend-row').count() === 0, 'Global discovery rails must hide under search')
    /* A featured pick that IS inside the active filters must not claim to be
       outside them. The sparse catalog's one publication always matches its own
       route search, so the label is the thing that must be absent there. */
    if (scenario === 'sparse') {
      assert.equal(await page.getByText(/outside your filters/i).count(), 0, 'A featured pick inside the active filters must not claim to be outside them')
    } else {
      await visible(page.getByText(/outside your filters/i), 'Global featured exception label')
    }
    await search.fill('')
    for (const query of ['style=adventure', 'max=15000', 'dur=short']) {
      await page.goto(`${base.origin}/#/explore?${query}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      assert(await page.locator('.creator-card, .trend-row').count() === 0, `Global discovery rails must hide under ${query}`)
    }
    await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    assert(await page.locator('.creator-card, .trend-row').count() === 0, 'Global discovery rails must hide under Saved')
    await page.getByRole('button', { name: 'Saved', exact: true }).click()
    // The name alone is not an identifier: two creators can carry the same
    // name, so the label carries each card's evidence and the check picks the
    // card by the route it must reach.
    const createdByName = await page.locator('.creator-card').evaluateAll(cards => cards.map(card => card.getAttribute('aria-label')))
    if (scenario !== 'sparse') assert(createdByName.length > 1, 'The creator rail needs more than one card')
    assert.equal(new Set(createdByName).size, createdByName.length, 'Every creator card needs a distinct accessible name')
    const creator = page.locator(`.creator-card[href="/creator/${OWNER_ID}"]`)
    await visible(creator, 'Owner creator card')
    assert.equal(await creator.getAttribute('href'), `/creator/${OWNER_ID}`, 'Creator route is wrong')
    await creator.click()
    assert(currentRoute(page) === `/creator/${OWNER_ID}`, 'Creator link did not navigate')
    await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    /* Sparse has one publication, and it is the featured pick — so the grid is
       deliberately empty and there is no trending row to act on. Assert that
       emptiness instead of reaching for rows that must not exist. */
    if (scenario === 'sparse') {
      assert.equal(await page.locator('.trend-row').count(), 0, 'A sparse catalog must not pad the trending shelf')
      assert.equal(await page.locator('.explore-grid .itin-card').count(), 0, 'The featured pick must not repeat in the grid')
      await visible(page.locator('.featured-card'), 'Featured card still leads a sparse catalog')
    } else {
    // Save is a browser-local toggle, so it must change state without a write.
    const heart = page.locator('.trend-row .save-heart').first()
    const before = await heart.getAttribute('aria-pressed')
    await heart.click()
    await page.waitForTimeout(150)
    assert.equal(await heart.getAttribute('aria-pressed'), before === 'true' ? 'false' : 'true', 'Trending Save must toggle')
    await heart.click()
    await page.waitForTimeout(150)
    assert.equal(await heart.getAttribute('aria-pressed'), before, 'Trending Save must toggle back')
    // Signed out, Fork is a login redirect — the button has to say so, and the
    // click has to actually reach Auth rather than silently doing nothing.
    // Signed in, check the label here. The reserved free catalog Fork below
    // performs bounded synthetic persistence, never a live service write.
    const fork = page.locator('.trend-row').first().getByRole('button', { name: /fork/i })
    await visible(fork, 'Trending fork action')
    assert(await fork.isEnabled(), 'Fork must be reachable')
    const forkLabel = (await fork.innerText()).trim()
    if (exploreSignedIn) {
      assert.equal(/log in to fork/i.test(forkLabel), false, 'A signed-in visitor must not be told to log in to fork')
      assert.equal(/fork this trip/i.test(forkLabel), true, 'A signed-in visitor must be offered the real fork action')
    } else {
      assert.equal(/log in to fork/i.test(forkLabel), true, 'A signed-out visitor must be told that Fork reaches Auth')
      await fork.click()
      await page.waitForTimeout(400)
      assert(currentRoute(page).startsWith('/auth'), `Signed-out Fork must reach Auth, reached ${currentRoute(page)}`)
      await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
    }
    // The catalog card's own link still opens the public plan it names.
    const card = page.locator('.explore-grid .itin-card').first()
    const cardTitle = (await card.locator('.card-title').innerText()).trim()
    await card.locator('.trip-card-hit').click()
    await page.waitForTimeout(400)
    assert(/^\/pub\//.test(currentRoute(page)), `Catalog card must open its public plan, reached ${currentRoute(page)}`)
    assert(await page.getByRole('heading', { name: cardTitle, exact: true }).count() > 0, 'Public plan must show the card title')
    await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    }
    if (exploreSignedIn && scenario !== 'sparse') await checkSignedInFork(page, result, fixture)
    // Keyboard: every discovery control must take focus visibly and the card
    // link must be reachable without a pointer.
    const navButtons = page.getByRole('navigation', { name: 'Explore discovery' }).getByRole('button')
    for (let index = 0; index < await navButtons.count(); index++) {
      const control = navButtons.nth(index)
      if (await control.isDisabled()) continue
      await page.keyboard.press('Tab')
      await control.focus()
      const focus = await control.evaluate(element => {
        const style = getComputedStyle(element)
        return { active: element === document.activeElement, visible: element.matches(':focus-visible'), ring: Number.parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none' }
      })
      assert(focus.active && focus.visible && focus.ring, 'Discovery controls need a rendered keyboard focus ring')
    }
    const cardLink = page.locator('.explore-grid .trip-card-hit').first()
    if (await cardLink.count()) {
      await cardLink.focus()
      const focus = await cardLink.evaluate(element => {
        const style = getComputedStyle(element)
        return { active: element === document.activeElement, visible: element.matches(':focus-visible'), ring: Number.parseFloat(style.outlineWidth) > 0 || style.boxShadow !== 'none' }
      })
      assert(focus.active && focus.visible && focus.ring, 'Card links need a rendered keyboard focus ring')
      await page.keyboard.press('Enter')
      await page.waitForTimeout(400)
      assert(/^\/pub\//.test(currentRoute(page)), `Enter on a card link must open its plan, reached ${currentRoute(page)}`)
    }
    /* Task 5 correction checks: four hero facts, the annotation, Places tiles
       with their search behaviour, and sampled motion. Populated mixed only,
       behind the target flag until the whole correction is ready. */
    if (compactTarget && scenario === 'mixed' && state === 'populated') {
      await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
      await page.locator('.explore-grid a.trip-card-hit').first().waitFor()
      assert.equal(await page.locator('.explore-live-counts > li').count(), 4, 'Hero shows four live facts')
      const annotation = await page.locator('.explore-hero-annotation p').innerText()
      for (const line of ['Real travellers', 'Real stories', 'Better trips']) {
        assert(annotation.includes(line), `Annotation carries its line: ${line}`)
      }
      /* While the annotation floats, it must not cover the hero copy. In flow
         layout the structure itself prevents overlap. */
      const annotationOverlap = await page.evaluate(() => {
        const note = document.querySelector('.explore-hero-annotation')
        const copy = document.querySelector('.explore-photo-hero-content')
        if (!note || !copy || getComputedStyle(note).position !== 'absolute') return false
        const a = note.getBoundingClientRect(), b = copy.getBoundingClientRect()
        return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1
      })
      assert.equal(annotationOverlap, false, 'Floating annotation must not cover hero copy')
      await page.getByRole('heading', { name: 'Places in the community', exact: true }).waitFor()
      const expectedPlaces = (() => {
        const counts = new Map()
        for (const row of fixture.published_itineraries.filter(row => row.unpublished_at == null)) {
          const seen = new Set()
          for (const raw of row.route_summary) {
            const name = raw.trim().replace(/\s+/g, ' ')
            if (!name) continue
            const key = name.toLocaleLowerCase('en')
            if (!counts.has(key)) counts.set(key, { key, name, pubCount: 0 })
            const place = counts.get(key)
            if (name < place.name) place.name = name
            if (!seen.has(key)) place.pubCount += 1
            seen.add(key)
          }
        }
        return [...counts.values()].sort((a, b) => b.pubCount - a.pubCount || (a.name < b.name ? -1 : 1)).slice(0, 6)
      })()
      const tiles = page.locator('.community-place')
      assert(await tiles.count() >= 1 && await tiles.count() <= 6, 'Places shows one to six tiles')
      assert.equal(await tiles.count(), expectedPlaces.length, 'Tile count matches the live fixture routes')
      for (const place of expectedPlaces) {
        const tile = tiles.filter({ hasText: place.name }).first()
        assert(await tile.count() === 1, `Place tile renders once: ${place.name}`)
        assert((await tile.innerText()).includes(String(place.pubCount)), `Tile states its count: ${place.name}`)
      }
      // Change the sort, clear a previous search, then take the Goa tile.
      const sortBox = page.getByRole('combobox', { name: 'Sort by', exact: true })
      await sortBox.click()
      await page.getByRole('option', { name: 'Newest first', exact: true }).click()
      await page.waitForTimeout(150)
      const searchBox = page.getByRole('textbox', { name: 'Search destination or creator' })
      await searchBox.fill('Himalayan')
      await page.waitForTimeout(250)
      await searchBox.fill('')
      await page.waitForTimeout(250)
      /* Every discovery control takes keyboard focus with a rendered ring that
         was not there before focus. Runs before the tile search hides them. */
      const focusTargets = [
        ['place button', '.community-place'],
        ['cover link', '.pub-card-editorial .pub-card-cover-link'],
        ['bookmark', '.pub-card-editorial .save-bookmark'],
        ['fork button', '.pub-card-editorial .row-between.itin-meta button'],
        ['creator link', '.pub-card-editorial .creator-line'],
      ]
      for (const [label, selector] of focusTargets) {
        const control = page.locator(selector).first()
        assert(await control.count() > 0, `Focus check needs a ${label}`)
        const before = await control.evaluate(element => {
          const style = getComputedStyle(element)
          return { outlineStyle: style.outlineStyle, shadow: style.boxShadow }
        })
        await control.focus()
        const focus = await control.evaluate(element => {
          const style = getComputedStyle(element)
          return {
            active: element === document.activeElement,
            visible: element.matches(':focus-visible'),
            outlineStyle: style.outlineStyle,
            shadow: style.boxShadow,
          }
        })
        assert(focus.active && focus.visible, `${label} takes keyboard focus visibly`)
        assert(
          focus.outlineStyle !== before.outlineStyle || focus.shadow !== before.shadow,
          `${label} draws a focus ring on focus (was ${before.outlineStyle} / ${before.shadow})`,
        )
      }
      const goaTile = tiles.filter({ hasText: 'Goa' }).first()
      await goaTile.click()
      await page.waitForTimeout(250)
      const query = new URL(currentRoute(page), 'http://fixture.test').searchParams
      assert.equal(query.get('q'), 'Goa', 'Place tile searches its place')
      assert.equal(query.has('style'), false, 'Place tile clears the style filter')
      assert.equal(query.has('max'), false, 'Place tile clears the budget filter')
      assert.equal(query.has('dur'), false, 'Place tile clears the duration filter')
      assert.equal(query.get('sort'), 'newest', 'Place tile keeps the selected sort')
      assert.equal(await page.locator('.community-places').count(), 0, 'Discovery hides under a place search')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      assert.equal(new URL(currentRoute(page), 'http://fixture.test').searchParams.get('q'), 'Goa', 'Place search survives reload')
      /* The featured pick sits outside a Goa filter, so it must still lead with
         its exception label while the place search is active. */
      await visible(page.locator('.featured-card'), 'Featured card leads under a place search')
      await visible(page.getByText(/outside your filters/i), 'Global featured exception under a place search')
      await page.goto(`${base.origin}/#/explore`, { waitUntil: 'domcontentloaded' })
      await page.locator('.explore-grid a.trip-card-hit').first().waitFor()
      // Motion is sampled from frames, never from a declaration. Scroll first so
      // the scroll itself cannot read as a lift, then sample across the hover.
      const motionCard = page.locator('.pub-card-editorial .itin-card').first()
      await motionCard.scrollIntoViewIfNeeded()
      await page.waitForTimeout(300)
      await page.mouse.move(0, 0)
      await page.waitForTimeout(100)
      const restY = await motionCard.evaluate(element => element.getBoundingClientRect().y)
      await motionCard.hover()
      const hovered = await motionCard.evaluate(element => new Promise(resolveSamples => {
        const rows = []
        const start = performance.now()
        const sample = time => {
          const image = element.querySelector('.editorial-photo-image')
          rows.push({
            time: time - start,
            y: element.getBoundingClientRect().y,
            imageTransform: image ? getComputedStyle(image).transform : 'none',
          })
          if (time - start < 600) requestAnimationFrame(sample)
          else resolveSamples(rows)
        }
        requestAnimationFrame(sample)
      }))
      const lifted = Math.min(...hovered.map(sample => sample.y)) < restY - 0.5
      const zoomed = hovered.some(sample => sample.imageTransform !== 'none')
      await page.waitForTimeout(200)
      const held = await motionCard.evaluate(element => ({
        cardTransform: getComputedStyle(element).transform,
        imageTransform: getComputedStyle(element.querySelector('.editorial-photo-image')).transform,
      }))
      if (motion === 'no-preference') {
        assert(lifted, `Card lifts on hover under normal motion (held card ${held.cardTransform}, photo ${held.imageTransform})`)
        assert(zoomed, `Photo zooms on hover under normal motion (held photo ${held.imageTransform})`)
      } else {
        assert(!lifted, 'Card holds still under reduced motion')
        assert(!zoomed, 'Photo holds still under reduced motion')
      }
      result.motionSamples = { frames: hovered.length, lifted, zoomed }
      const bookmark = page.locator('.pub-card-editorial .save-bookmark').first()
      await bookmark.hover()
      await page.waitForTimeout(200)
      /* The button never transforms; its glyph carries the feedback, so the
         hit bounds hold still through hover, press, and release. */
      const hoverTransform = await bookmark.evaluate(element => getComputedStyle(element.querySelector('svg')).transform)
      await page.mouse.down()
      await page.waitForTimeout(120)
      const pressedTransform = await bookmark.evaluate(element => getComputedStyle(element.querySelector('svg')).transform)
      await page.mouse.up()
      await page.waitForTimeout(200)
      const releasedTransform = await bookmark.evaluate(element => getComputedStyle(element.querySelector('svg')).transform)
      const buttonHeld = await bookmark.evaluate(element => getComputedStyle(element).transform)
      assert.equal(buttonHeld, 'none', 'Bookmark button keeps fixed hit bounds')
      if (motion === 'no-preference') {
        assert.notEqual(hoverTransform, 'none', 'Bookmark answers hover under normal motion')
        assert.notEqual(pressedTransform, hoverTransform, 'Bookmark presses under normal motion')
        assert.equal(releasedTransform, hoverTransform, 'Bookmark settles back to hover on pointer-up')
      } else {
        assert.equal(hoverTransform, 'none', 'Bookmark holds still on hover under reduced motion')
        assert.equal(pressedTransform, 'none', 'Bookmark holds still under reduced motion')
      }
      result.bookmarkSamples = { hoverTransform, pressedTransform, releasedTransform }
      await bookmark.click()
      await page.waitForTimeout(120)
    }
  }

  if (workspaceSmoke && surface.name === 'my-trips' && state === 'populated') {
    result.workspaceRoutes = []
    for (const tab of ['overview', 'timeline', 'board', 'map', 'group', 'budget', 'share', 'settings']) {
      const route = `/trip/${TRIP_ID}${tab === 'overview' ? '' : '/' + tab}`
      await page.goto(`${base.origin}/#${route}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector(`#panel-${tab}`, { timeout: 15000 })
      await page.waitForTimeout(600)
      assert.equal(currentRoute(page), route, `${tab} keeps its exact workspace route`)
      assert.equal(await page.locator(`#tab-${tab}`).getAttribute('aria-selected'), 'true', `${tab} is the active tab`)
      assert(await page.locator(`#panel-${tab}`).isVisible(), `${tab} has its own rendered panel`)
      await page.screenshot({ path: result.screenshot.replace(/\.png$/, `-workspace-${tab}.png`), fullPage: true, animations: 'disabled' })
      result.workspaceRoutes.push(tab)
    }
  }
}

await mkdir(out, { recursive: true })
const report = { state, scenario, baseUrl: base.origin, buildKind: productionBuild ? 'production' : 'development', fixtureOnly: true, startedAt: new Date().toISOString(), revisionStart: localRevision(), results: [], limits: ['Backend rows and writes are synthetic. External services are blocked; approved font reads may be allowed.', 'Screenshots need user visual review; no mockup comparison is automated.', 'Explore read states have explicit checks. Other alternate-state surfaces remain diagnostic.', 'Initial loading may be application hydration, not the catalog skeleton.', 'Viewport scaling is not actual browser zoom.', 'Signed-in free Fork is checked only in populated non-sparse signed-in Explore; premium Fork is untested.', 'Pagination and all five sorts with ties are checked only in the many-publications scenario.'] }
let browser
try {
  if (productionBuild) report.productionStart = await productionRevision()
  const backendHost = await configuredHost()
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' }) })
  for (const width of widths) {
    const device = widths.length === 2 && widths[0] === 1440 && widths[1] === 390
      ? (width === 1440 ? 'desktop' : 'phone')
      : `${width}px`
    for (const surface of surfaces) {
      const context = await browser.newContext({
        viewport: { width: Math.round(width / zoom), height: Math.round((width >= 1024 ? 900 : width >= 620 ? 844 : 780) / zoom) },
        deviceScaleFactor: zoom,
        serviceWorkers: 'block', locale: 'en-IN', timezoneId: 'Asia/Kolkata',
        reducedMotion: motion === 'reduce' ? 'reduce' : 'no-preference',
      })
      const result = { surface: surface.name, device, width, theme, scenario, state, images, exploreAuth, fontMode, zoom, motion, status: 'INCONCLUSIVE', failures: [], requests: [], rejectedMutations: [], fixtureOperations: [], screenshot: resolve(out, `${surface.name}-${device}-${state}${theme === 'dark' ? '-dark' : ''}${zoom === 1 ? '' : `-zoom${zoom * 100}`}${motion === 'reduce' ? '' : '-motion'}.png`) }
      const held = []
      const fixture = buildFixture(scenario)
      if (surface.name === 'explore' && surface.signedIn && scenario !== 'sparse' && state === 'populated') reserveFixtureFork(fixture)
      let catalogState = state
      try {
        // Never connect realtime sockets to any remote host.
        await context.routeWebSocket('**/*', socket => {
          if (new URL(socket.url()).host === base.host) socket.connectToServer()
          else socket.close()
        })
        await context.route('**/*', async route => {
          const request = route.request()
          const url = new URL(request.url())
          const backendPath = /^\/(auth|rest|storage|realtime|functions)\/v1\//.test(url.pathname)
          if (url.hostname === backendHost || backendPath) {
            let body = null
            try { body = request.postDataJSON() } catch { /* No JSON body. */ }
            const response = fixtureResponse({ method: request.method(), url: url.href, body, accept: request.headers().accept ?? '', state: catalogState, scenario, fixture, currentUserId: surface.signedIn ? OWNER_ID : null })
            result.requests.push(`${request.method()} ${url.pathname}`)
            if (response.rejected) {
              result.rejectedMutations.push(`${request.method()} ${url.pathname}`)
              result.rejectedMutationDetails ??= []
              result.rejectedMutationDetails.push({ method: request.method(), path: url.pathname, query: url.search, body })
            }
            if (response.fixtureOperation) result.fixtureOperations.push(response.fixtureOperation)
            if (response.unexpected) result.failures.push(`Unmapped fixture request: ${request.method()} ${url.pathname}`)
            if (catalogState === 'loading' && !url.pathname.startsWith('/auth/')) {
              await new Promise(resolveHeld => held.push(resolveHeld))
              await route.abort().catch(() => {})
              return
            }
            await route.fulfill({ status: response.status, contentType: 'application/json', body: typeof response.body === 'string' ? response.body : JSON.stringify(response.body) })
            return
          }
          /* Reference mode serves the project's own authorised photographs
             instead of the synthetic placeholder. A fixture cover may be the
             shared `cover.svg` or, in the editor-cover scenario, its own
             `cover-N.svg` — each numbered cover maps to its own photograph so
             a shared placeholder cannot pass for per-card imagery. */
          const publicationCover = fixture.published_itineraries.find(row => row.cover_image_url === url.href)
          const knownCover = url.href === 'https://redesign-fixture.invalid/cover.svg' || Boolean(publicationCover)
          if (url.origin === 'https://redesign-fixture.invalid' && knownCover && ['GET', 'HEAD'].includes(request.method())) {
            if (images === 'broken') {
              // A real failure, not an empty body: the component's error arm has
              // to fire for the fallback path to be exercised at all.
              await route.fulfill({ status: 404, contentType: 'text/plain', body: 'synthetic broken cover' })
              return
            }
            if (images === 'reference') {
              const routePlaces = publicationCover?.route_summary ?? fixture.trips[0].destinations
              const routeText = routePlaces.join(' ').toLowerCase()
              const photo = /goa|panjim/.test(routeText) ? 'goa-panjim.jpg'
                : /jaipur|rajasthan/.test(routeText) ? 'rajasthan-forts.jpg'
                  : /shimla|himalaya/.test(routeText) ? 'himalayan-loop.jpg' : 'kerala-backwaters.jpg'
              await route.fulfill({ contentType: 'image/jpeg', body: await readFile(resolve('public/img/mockup-adopted', photo)) })
              return
            }
            await route.fulfill({ contentType: 'image/svg+xml', body: COVER_SVG })
            return
          }
          const authorisedPhotos = new Set(['hero-banner.jpg', 'ch-hero.jpg', ...ADOPTED_PHOTOS])
          if (!productionBuild && images === 'reference' && url.origin === base.origin && ['GET', 'HEAD'].includes(request.method())
            && !url.search && url.pathname.startsWith('/img/mockup-adopted/')
            && authorisedPhotos.has(url.pathname.slice('/img/mockup-adopted/'.length))) {
            await route.fulfill({ contentType: 'image/jpeg', body: request.method() === 'HEAD' ? '' : await readFile(resolve('public', url.pathname.slice(1))) })
            return
          }
          /* Web fonts are an allowed read, not a live service: the app links
             them from index.html and a blocked font would silently render
             fallback faces that no colour or spacing reading can explain. */
          if (fontMode === 'allowed' && FONT_HOSTS.includes(url.hostname) && ['GET', 'HEAD'].includes(request.method())) {
            await route.continue()
            return
          }
          if (fontMode === 'blocked' && FONT_HOSTS.includes(url.hostname)) {
            await route.abort('blockedbyclient')
            return
          }
          if (url.origin === base.origin && ['GET', 'HEAD'].includes(request.method())) {
            await route.continue()
            return
          }
          // Block every other host and every same-origin mutation.
          await route.abort('blockedbyclient')
        })
        if (surface.signedIn) {
          await context.addInitScript(({ key, session, analyticsSession, requestedTheme }) => {
            localStorage.setItem(key, JSON.stringify(session))
            sessionStorage.setItem('yatraflow_create_funnel_session', analyticsSession)
            localStorage.setItem('yatraflow_theme', requestedTheme)
          }, { key: `sb-${backendHost.split('.')[0]}-auth-token`, session: buildSession(), analyticsSession: ANALYTICS_SESSION_ID, requestedTheme: theme })
        } else {
          await context.addInitScript(requestedTheme => { localStorage.setItem('yatraflow_theme', requestedTheme) }, theme)
        }
        const page = await context.newPage()
        page.on('pageerror', error => result.failures.push(`Unhandled browser exception: ${error.name}`))
        await page.clock.setFixedTime(FIXTURE_NOW)
        await page.goto(productionBuild ? `${base.origin}${surface.route}` : `${base.origin}/#${surface.route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.waitForSelector('.route-panel > *', { timeout: 15000 })
        if (surface.name === 'explore' && state !== 'loading') {
          await page.waitForSelector('.explore-page', { timeout: 15000 })
          if (state === 'error') await page.getByRole('button', { name: 'Try again', exact: true }).waitFor({ state: 'visible' })
          if (state === 'empty') await page.getByRole('heading', { name: 'The community catalog is just getting started', exact: true }).waitFor({ state: 'visible' })
        }
        await page.waitForTimeout(2000)
        if (surface.name === 'timeline' && state === 'populated') {
          await page.getByRole('button', { name: 'All days', exact: true }).click()
          await page.waitForTimeout(300)
        }
        result.observedAt = new Date().toISOString()
        result.servedModuleSha256 = await servedRevision()
        await page.evaluate(() => document.fonts.ready)
        // The requested theme must be the theme the page actually painted, or
        // every colour reading in this report is about the wrong surface.
        const renderedTheme = await page.evaluate(() => document.documentElement.dataset.theme)
        assert.equal(renderedTheme, theme, `Requested ${theme} but the page rendered ${renderedTheme}`)
        result.fonts = await page.evaluate(() => {
          const loaded = family => [...document.fonts].some(face => face.family.replace(/^['"]|['"]$/g, '') === family && face.status === 'loaded')
          return {
            interface: loaded('Plus Jakarta Sans') && document.fonts.check('500 16px "Plus Jakarta Sans"'),
            editorial: loaded('Playfair Display') && document.fonts.check('600 32px "Playfair Display"'),
            /* A face the page never paints is a face the browser never fetches,
               so asserting it loaded would be asserting a lazy load that has no
               reason to happen. Record whether editorial type is on screen. */
            editorialTypeInUse: [...document.querySelectorAll('*')].some(element => getComputedStyle(element).fontFamily.includes('Playfair Display')),
            handwritten: loaded('Caveat') && document.fonts.check('600 24px "Caveat"'),
            handwrittenInUse: [...document.querySelectorAll('*')].some(element => getComputedStyle(element).fontFamily.includes('Caveat')),
          }
        })
        if (fontMode === 'allowed') {
          assert(result.fonts.interface, 'Interface font must load before any visual reading')
          if (surface.name === 'explore' && result.fonts.editorialTypeInUse) {
            assert(result.fonts.editorial, 'Explore editorial font must load when editorial type is painted')
          }
          if (surface.name === 'explore' && result.fonts.handwrittenInUse) {
            assert(result.fonts.handwritten, 'Explore annotation font must load when handwritten type is painted')
          }
        } else {
          assert(!result.fonts.interface, 'Blocked-font run must not have loaded the interface font')
        }
        if ((images === 'broken' || scenario === 'broken-cover') && surface.name === 'explore' && state === 'populated') {
          const covers = page.locator('.creator-cover, .pub-card-editorial .editorial-photo, .featured-photo')
          assert(await covers.count() > 0, 'Broken-cover check needs publication photo surfaces')
          for (const cover of await covers.all()) {
            assert.equal(await cover.getAttribute('data-photo-state'), 'fallback', 'Failed publication photos use their neutral fallback')
            const bounds = await cover.boundingBox()
            assert(bounds?.width > 100 && bounds?.height > 70, 'A failed photo keeps its geometry')
          }
          assert.equal(await page.locator('.explore-photo-hero').getAttribute('data-photo-state'), 'image', 'The local hero still loads')
        }
        /* Record card rectangles here, before the initial screenshot and
           before any Save or Fork interaction changes the collection. */
        result.compactGeometry = await page.evaluate(() => {
          const selectors = {
            trips: '.trips-page .explore-grid:not(.as-list) .itin-card',
            catalog: '.explore-catalog .pub-card-editorial .itin-card',
            trending: '.trending-grid .pub-card-editorial .itin-card',
            creators: '.explore-page .creator-card',
          }
          return Object.fromEntries(Object.entries(selectors).map(([group, selector]) => [group,
            [...document.querySelectorAll(selector)].filter(card => {
              const rect = card.getBoundingClientRect()
              return rect.width > 0 && rect.height > 0
            }).map(card => {
              const link = card.matches('a') ? card : card.querySelector('.trip-card-hit')
              const rect = card.getBoundingClientRect()
              const cover = card.querySelector('.trip-card-media, .itin-cover, .creator-cover')?.getBoundingClientRect()
              return {
                key: new URL(link.href).pathname,
                width: rect.width, height: rect.height, top: rect.top,
                coverWidth: cover?.width ?? 0, coverHeight: cover?.height ?? 0,
              }
            }),
          ]))
        })
        result.compactGeometryCheck = checkCompactTarget(result, compactBaselines, compactTarget)
        if (result.compactGeometryCheck.mode === 'fail') {
          result.failures.push(...result.compactGeometryCheck.failures)
        } else if (result.compactGeometryCheck.mode === 'compare' && result.compactGeometryCheck.failures.length) {
          result.failures.push(`Card geometry check: ${result.compactGeometryCheck.failures.join('; ')}`)
        }
        await page.screenshot({ path: result.screenshot, fullPage: true, animations: 'disabled' })
        const initialScreenshotSha256 = createHash('sha256').update(await readFile(result.screenshot)).digest('hex')
        result.initialScreenshotSha256 = initialScreenshotSha256
        result.failures.push(...await geometry(page, surface.peers))
        if (surface.name === 'explore' && state !== 'populated') {
          assert.equal(await page.locator('.featured-card, .creator-card, .trend-row, .explore-grid .itin-card').count(), 0, 'Unread or empty data must not produce discovery claims')
          if (state === 'loading') {
            result.loadingLayer = await page.locator('.explore-page').count() ? 'catalog' : 'application'
            if (result.loadingLayer === 'catalog') assert.equal(await page.locator('.explore-page [role="status"]').innerText(), 'Loading the catalog')
            else assert(await page.locator('.loading-block[role="status"]').isVisible(), 'Initial application hydration remains in its loading state')
            assert.equal(await page.locator('.explore-live-counts').count(), 0, 'Loading is not a real zero')
            assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0)
          } else if (state === 'empty') {
            assert(await page.getByRole('heading', { name: 'The community catalog is just getting started', exact: true }).isVisible())
            assert.equal(await page.locator('.explore-live-counts strong').first().innerText(), '0')
            assert.equal(await page.getByRole('button', { name: 'Try again', exact: true }).count(), 0)
          } else {
            assert.equal(await page.locator('.explore-page [role="status"]').innerText(), 'The catalog could not be loaded')
            assert.equal(await page.locator('.explore-live-counts').count(), 0, 'Failure is not a real zero')
            assert(await page.getByRole('button', { name: 'Try again', exact: true }).isVisible())
            catalogState = 'populated'
            await page.getByRole('button', { name: 'Try again', exact: true }).click()
            await page.waitForSelector('.featured-card', { timeout: 10000 })
            assert.equal(await page.locator('.explore-live-counts strong').first().innerText(), String(fixture.published_itineraries.filter(row => !row.unpublished_at).length))
            await page.screenshot({ path: result.screenshot.replace('-error', '-recovered'), fullPage: true, animations: 'disabled' })
            result.retryRecovered = true
          }
          result.status = result.failures.length || result.rejectedMutations.length ? 'FAIL' : 'PASS'
        } else if (state === 'populated') {
          await acceptance(page, surface, result, fixture)
          assert.equal(createHash('sha256').update(await readFile(result.screenshot)).digest('hex'), initialScreenshotSha256, 'Interaction captures must not overwrite the initial surface screenshot')
          result.initialScreenshotPreserved = true
          if (result.rejectedMutations.length) result.failures.push(`Unexpected mutations rejected: ${result.rejectedMutations.join(', ')}`)
          result.status = result.failures.length ? 'FAIL' : 'PASS'
        } else result.status = result.failures.length ? 'FAIL' : 'DIAGNOSTIC'
      } catch (error) {
        result.failures.push(error.message)
        result.status = surface.signedIn && result.requests.length === 0 ? 'INCONCLUSIVE' : 'FAIL'
      } finally {
        for (const release of held) release()
        await context.close()
      }
      report.results.push(result)
      console.log(`${result.status} ${surface.name} ${device}: ${result.failures.join('; ') || 'checks complete'}`)
    }
  }
} catch (error) {
  report.blocker = error.message
  console.error(`INCONCLUSIVE: ${error.message}`)
} finally {
  await browser?.close()
  if (productionBuild && report.productionStart) {
    try {
      report.productionEnd = await productionRevision()
      report.buildChangedDuringRun = JSON.stringify(report.productionStart) !== JSON.stringify(report.productionEnd)
    } catch (error) { report.blocker = error.message }
  }
  report.revisionEnd = localRevision()
  report.sourceChangedDuringRun = JSON.stringify(report.revisionStart) !== JSON.stringify(report.revisionEnd)
  await writeFile(resolve(out, 'results.json'), JSON.stringify(report, null, 2) + '\n', 'utf8')
}
console.log(`Artifacts: ${out}`)
if (report.blocker || report.sourceChangedDuringRun || report.buildChangedDuringRun || report.results.some(result => ['FAIL', 'INCONCLUSIVE'].includes(result.status))) process.exitCode = 1
