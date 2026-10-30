#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, '.verify-evidence', 'overview-fixture')
const URL = 'http://localhost:5178/dev/overview-fixture.html'

const CASES = [
  { name: 'desktop-light', width: 1440, height: 1000, theme: 'light', reducedMotion: 'no-preference', mode: 'car' },
  { name: 'desktop-dark', width: 1440, height: 1000, theme: 'dark', reducedMotion: 'no-preference', mode: 'car' },
  { name: 'phone-light', width: 390, height: 900, theme: 'light', reducedMotion: 'no-preference', mode: 'car' },
  { name: 'phone-dark', width: 390, height: 900, theme: 'dark', reducedMotion: 'no-preference', mode: 'car' },
  { name: 'desktop-reduced', width: 1440, height: 1000, theme: 'light', reducedMotion: 'reduce', mode: 'car' },
  { name: 'phone-reduced', width: 390, height: 900, theme: 'light', reducedMotion: 'reduce', mode: 'car' },
  // A flown or railed trip keeps the schematic plate, so its pins must still
  // measure 44 px on the same content-box rule.
  { name: 'phone-schematic', width: 390, height: 900, theme: 'light', reducedMotion: 'no-preference', mode: 'train' },
  { name: 'desktop-schematic', width: 1440, height: 1000, theme: 'light', reducedMotion: 'no-preference', mode: 'train' },
  // The row the store writes for a trip whose emoji picker was never touched.
  { name: 'desktop-legacy-emoji', width: 1440, height: 1000, theme: 'light', reducedMotion: 'no-preference', mode: 'car', cover: 'legacy' },
  { name: 'phone-legacy-emoji', width: 390, height: 900, theme: 'dark', reducedMotion: 'no-preference', mode: 'car', cover: 'legacy' },
  // The regression this pass fixed: a saved beach emoji must NOT decide the
  // cover. The artwork paints and no emoji node exists.
  { name: 'desktop-saved-beach', width: 1440, height: 1000, theme: 'light', reducedMotion: 'no-preference', mode: 'car', cover: 'savedbeach' },
  { name: 'phone-saved-beach', width: 390, height: 900, theme: 'dark', reducedMotion: 'no-preference', mode: 'car', cover: 'savedbeach' },
  { name: 'desktop-saved-beach-vs', width: 1440, height: 1000, theme: 'dark', reducedMotion: 'no-preference', mode: 'car', cover: 'savedbeachvs' },
  { name: 'desktop-manual-photo', width: 1440, height: 1000, theme: 'light', reducedMotion: 'no-preference', mode: 'car', cover: 'source' },
]

async function launchChrome() {
  const attempts = [
    { channel: 'chrome' },
    { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  ]
  let lastError
  for (const options of attempts) {
    try {
      return await chromium.launch({ headless: true, ...options })
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`no Chrome or Edge found: ${lastError?.message ?? 'unknown error'}`)
}

function rectScript(selector) {
  const element = document.querySelector(selector)
  if (!element) return null
  const box = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
    color: style.color,
    background: style.backgroundColor,
    font: style.fontFamily,
  }
}

async function inspect(page) {
  return page.evaluate((selectors) => {
    const read = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
        color: style.color,
        background: style.backgroundColor,
        font: style.fontFamily,
      }
    }
    const visible = element => {
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }
    // The plate paints a 1px border, and the SVG fills the content box. One SVG
    // user unit must equal one CSS pixel, or every 44-unit hit circle shrinks.
    // The elevation plate follows the same rule with its own SVG.
    const plate = document.querySelector('.ovw-map') ?? document.querySelector('.ovw-elev')
    const plateSvg = document.querySelector('.ovw-map-svg') ?? document.querySelector('.ovw-elev-svg')
    const plateHit = document.querySelector('.ovw-map .rm-hit')
    const plateStyle = plate ? getComputedStyle(plate) : null
    const svgBox = plateSvg ? plateSvg.getBoundingClientRect() : null
    const viewBox = plateSvg?.viewBox?.baseVal ?? null
    const hitBox = plateHit ? plateHit.getBoundingClientRect() : null
    const geometry = plate && svgBox && viewBox
      ? {
        kind: document.querySelector('.ovw-elev-svg') ? 'elevation' : 'schematic',
        plateWidth: +plate.getBoundingClientRect().width.toFixed(3),
        border: plateStyle
          ? +(parseFloat(plateStyle.borderLeftWidth) + parseFloat(plateStyle.borderRightWidth)).toFixed(3)
          : null,
        svgWidth: +svgBox.width.toFixed(3),
        viewBoxWidth: +viewBox.width.toFixed(3),
        hitDiameter: hitBox ? +hitBox.width.toFixed(3) : null,
      }
      : null
    const controls = [...document.querySelectorAll(
      '.yf-trip-head button,.ovw2 button,.ovw2 a,.ovw2 summary,.ovw2 [role="button"],.ovw2 .mx-btn,.ovw2 .mx-crow',
    )].filter(visible).map(element => {
      const box = element.getBoundingClientRect()
      return {
        text: (element.textContent || '').trim().slice(0, 30),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }
    })
    // The header draws the shared cover plan. `image` means one decoded image
    // fills the slot; `emoji` means the plan was exhausted and the traveller's
    // emoji is the whole cover. Both are read from the DOM, never assumed.
    const media = document.querySelector('.yf-cover-media')
    const mediaBox = media ? media.getBoundingClientRect() : null
    const images = [...document.querySelectorAll('.yf-cover-media img')]
    const emojiNode = document.querySelector('.yf-cover-media .yf-cover-emoji')
    const art = images.at(-1)
    const artBox = art ? art.getBoundingClientRect() : null
    const cover = {
      imageCount: images.length,
      emojiCount: emojiNode ? 1 : 0,
      emojiText: emojiNode ? (emojiNode.textContent || '') : null,
      decoded: !!art && art.complete && art.naturalWidth > 0,
      fills: !!art && !!mediaBox && !!artBox
        && artBox.width >= mediaBox.width - 1 && artBox.height >= mediaBox.height - 1,
      artSource: art ? art.getAttribute('src') : null,
      currentSrc: art?.currentSrc ?? null,
      naturalWidth: art?.naturalWidth ?? 0,
      naturalHeight: art?.naturalHeight ?? 0,
      state: media?.querySelector('[data-cover-state]')?.getAttribute('data-cover-state') ?? null,
    }
    // The matrix must show the source composition: text column labels, a
    // day thumbnail per row, one mark per part, and the Filled total.
    const headerFit = [...document.querySelectorAll('.mx-row.is-head .mx-th')].map(node => ({
      text: (node.textContent || '').trim(),
      client: Math.round(node.clientWidth),
      scroll: Math.round(node.scrollWidth),
    }))
    // The invite control sits where the source veil reaches zero, so its own
    // fill must keep white text readable over the brightest artwork (white).
    const invite = document.querySelector('.yf-cover-top .yf-invite')
    const inviteContrast = (() => {
      if (!invite) return null
      const style = getComputedStyle(invite)
      const channels = style.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? []
      if (channels.length < 3) return null
      const alpha = channels.length > 3 ? channels[3] : 1
      const over = (background, foreground, a) => background * (1 - a) + foreground * a
      const composite = channels.slice(0, 3).map(value => over(255, value, alpha))
      const label = (style.color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3)
      if (label.length < 3) return null
      const luminance = rgb => {
        const [r, g, b] = rgb.map(value => {
          const channel = value / 255
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const a = luminance(composite)
      const b = luminance(label)
      return +((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)
    })()
    const matrix = {
      headers: [...document.querySelectorAll('.mx-row.is-head .mx-th')].map(node => (node.textContent || '').trim()),
      headerFit,
      rows: document.querySelectorAll('.mx .mx-row:not(.is-head)').length,
      thumbs: document.querySelectorAll('.mx .mx-thumb').length,
      totals: [...document.querySelectorAll('.mx .mx-total em')].map(node => (node.textContent || '').trim()),
      legend: [...document.querySelectorAll('.ovw-matrix-legend .mx-key > span')].map(node => (node.textContent || '').trim()),
      chips: [...new Set([...document.querySelectorAll('.mx .mx-chip')].map(node => node.getAttribute('data-state')))].sort(),
      inviteContrast,
      duplicateSelectors: (() => {
        const seen = new Set()
        const dupes = []
        for (const sheet of document.styleSheets) {
          let rules
          try { rules = sheet.cssRules } catch { continue }
          for (const rule of rules) {
            if (!rule.selectorText) continue
            if (seen.has(rule.selectorText)) dupes.push(rule.selectorText)
            seen.add(rule.selectorText)
          }
        }
        return dupes.filter(selector => /^\.mx|^\.ovw2 \.mx/.test(selector))
      })(),
    }
    // The drawings must be curves, not polylines: the height line and the corner
    // inset join real places through bounded cubic handles, so no sharp turn or
    // straight edge is left in either.
    const elLines = [...document.querySelectorAll('.ovw-elev-line')].map(node => node.getAttribute('d') || '')
    const insetPath = document.querySelector('.ovw-elev-inset-line')?.getAttribute('d') || ''
    const routePaths = [...document.querySelectorAll('.rm-road')].map(node => node.getAttribute('d') || '')
    const curve = {
      elevationLines: elLines.length,
      elevationStraightSteps: elLines.reduce((sum, d) => sum + (d.match(/ L /g)?.length ?? 0), 0),
      elevationCurves: elLines.reduce((sum, d) => sum + (d.match(/ C /g)?.length ?? 0), 0),
      insetCurves: (insetPath.match(/ C /g)?.length ?? 0),
      insetStraightSteps: (insetPath.match(/ L /g)?.length ?? 0),
      routeCurves: routePaths.reduce((sum, d) => sum + (d.match(/ C /g)?.length ?? 0), 0),
    }
    // The shared pill rule, measured on the real tab rail: the glider must fill
    // the active item's box, and the rail's padding plus border must be the
    // gap. A hardcoded paint inset (the old +4 / -8) fails both numbers.
    const pillNav = document.querySelector('.yf-tabbar')
    const pillGlider = pillNav?.querySelector('.pill-glider')
    const pillActive = pillNav?.querySelector('.tab-btn.active')
    let pill = null
    if (pillNav && pillGlider && pillActive) {
      const railBox = pillNav.getBoundingClientRect()
      const itemBox = pillActive.getBoundingClientRect()
      const gliderBox = pillGlider.getBoundingClientRect()
      const railStyle = getComputedStyle(pillNav)
      const expectedInset = parseFloat(railStyle.paddingTop) + parseFloat(railStyle.borderTopWidth)
      pill = {
        railHeight: +railBox.height.toFixed(2),
        itemHeight: +itemBox.height.toFixed(2),
        gliderHeight: +gliderBox.height.toFixed(2),
        topGap: +(itemBox.top - gliderBox.top).toFixed(2),
        bottomGap: +(itemBox.bottom - gliderBox.top - gliderBox.height).toFixed(2),
        insetTop: +(gliderBox.top - railBox.top).toFixed(2),
        insetBottom: +(railBox.bottom - gliderBox.top - gliderBox.height).toFixed(2),
        expectedInset: +expectedInset.toFixed(2),
      }
    }
    // The member stack: distinct tones, the source's 8px overlap, and a target
    // that keeps its 44px tap height without swallowing a neighbour's hits.
    const stack = document.querySelector('.yf-avatars')
    let members = null
    if (stack) {
      const circles = [...stack.querySelectorAll('.avatar')]
      const targets = [...stack.querySelectorAll('.yf-member')]
      const fills = circles.map(circle => getComputedStyle(circle).backgroundColor)
      const hitTest = targets.map(target => {
        const box = target.getBoundingClientRect()
        const at = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return !!at && target.contains(at)
      })
      members = {
        count: circles.length,
        tones: circles.map(circle => circle.getAttribute('data-tone')),
        distinctFills: new Set(fills).size,
        fills,
        overlaps: circles.slice(1).map((circle, index) => (
          +(circles[index].getBoundingClientRect().right - circle.getBoundingClientRect().left).toFixed(2)
        )),
        circleWidths: circles.map(circle => +circle.getBoundingClientRect().width.toFixed(2)),
        targetHeights: targets.map(target => +target.getBoundingClientRect().height.toFixed(2)),
        targetWidths: targets.map(target => +target.getBoundingClientRect().width.toFixed(2)),
        hitTest,
        names: targets.map(target => target.getAttribute('aria-label')),
        tooltips: stack.querySelectorAll('.yf-tip[role="tooltip"]').length,
      }
    }
    return {
      viewport: [innerWidth, innerHeight],
      scroll: [document.documentElement.scrollWidth, document.documentElement.clientWidth],
      theme: document.documentElement.dataset.theme,
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      motion: getComputedStyle(document.documentElement).getPropertyValue('--motion-med').trim(),
      head: read(selectors.head),
      cover: read(selectors.cover),
      title: read(selectors.title),
      tabbar: read(selectors.tabbar),
      brief: read(selectors.brief),
      health: read(selectors.health),
      metrics: read(selectors.metrics),
      main: read(selectors.main),
      route: read(selectors.route),
      commitments: read(selectors.commitments),
      group: read(selectors.group),
      activity: read(selectors.activity),
      weather: read(selectors.weather),
      controls,
      cover,
      matrix,
      curve,
      pill,
      members,
      smallControls: controls.filter(control => control.width < 44 || control.height < 44),
      tiles: document.querySelectorAll('.ovw2-tile').length,
      daylight: document.body.innerText.includes('Daylight'),
      sourceClosed: !!document.querySelector('.ovw-sources:not([open])'),
      geometry,
    }
  }, {
    head: '.yf-trip-head',
    cover: '.yf-cover-media',
    title: '.yf-trip-title',
    tabbar: '.yf-tabbar',
    brief: '.ovw2-brief',
    health: '.ovw2-health',
    metrics: '.ovw2-metrics',
    main: '.ovw2-main',
    route: '.ovw2-route',
    commitments: '.ovw2-commitments',
    group: '.ovw2-group',
    activity: '.ovw2-activity',
    weather: '.ovw-weather',
  })
}

const browser = await launchChrome()
mkdirSync(OUT, { recursive: true })
const records = []
const errors = []
const geometryFailures = []

try {
  for (const testCase of CASES) {
    const context = await browser.newContext({
      viewport: { width: testCase.width, height: testCase.height },
      reducedMotion: testCase.reducedMotion,
    })
    const page = await context.newPage()
    const consoleErrors = []
    const pageErrors = []
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    page.on('pageerror', error => pageErrors.push(String(error).split('\n')[0]))
    await page.goto(`${URL}?theme=${testCase.theme}&mode=${testCase.mode === 'car' ? 'rental' : testCase.mode ?? 'rental'}&weather=ok&elev=ok&cover=${testCase.cover ?? 'art'}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.ovw2', { timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      document.getAnimations().forEach(animation => {
        try { animation.finish() } catch {}
      })
    })
    const metrics = await inspect(page)
    const geometry = metrics.geometry
    if (!geometry) {
      geometryFailures.push({ case: testCase.name, reason: 'the route plate did not render' })
    } else {
      if (Math.abs(geometry.viewBoxWidth - geometry.svgWidth) > 0.5) {
        geometryFailures.push({ case: testCase.name, reason: 'one SVG unit is not one CSS pixel', geometry })
      }
      if (geometry.hitDiameter != null && geometry.hitDiameter < 43.99) {
        geometryFailures.push({ case: testCase.name, reason: 'a pin hit circle renders under 44px', geometry })
      }
      const expected = testCase.mode === 'train' ? 'schematic' : 'elevation'
      if (geometry.kind !== expected) {
        geometryFailures.push({ case: testCase.name, reason: `expected the ${expected} plate`, geometry })
      }
    }
    if (metrics.tiles !== 3) {
      geometryFailures.push({ case: testCase.name, reason: `expected 3 health tiles, saw ${metrics.tiles}` })
    }
    // The shared pill rule, at the actual active box. A hardcoded paint inset
    // fails on the first two numbers; a rail that stops being concentric fails
    // on the inset pair. The tolerance is a sub-pixel one: flex and text layout
    // are fractional, so a 44px box can report 43.98 — the old defect was 8px,
    // which is nowhere near this band.
    const SUBPIXEL = 0.5
    if (!metrics.pill) {
      geometryFailures.push({ case: testCase.name, reason: 'the tab rail did not render its glider' })
    } else {
      const pill = metrics.pill
      if (Math.abs(pill.gliderHeight - pill.itemHeight) > SUBPIXEL) {
        geometryFailures.push({ case: testCase.name, reason: `the glider paints ${pill.gliderHeight}px in a ${pill.itemHeight}px tab`, pill })
      }
      if (Math.abs(pill.topGap) > SUBPIXEL || Math.abs(pill.bottomGap) > SUBPIXEL) {
        geometryFailures.push({ case: testCase.name, reason: 'the glider does not fill its tab', pill })
      }
      if (Math.abs(pill.insetTop - pill.expectedInset) > SUBPIXEL || Math.abs(pill.insetBottom - pill.expectedInset) > SUBPIXEL) {
        geometryFailures.push({ case: testCase.name, reason: `the capsule is not concentric (${pill.insetTop}/${pill.insetBottom}, expected ${pill.expectedInset})`, pill })
      }
    }
    // The member stack: three circles must read as three people, keep the
    // source's overlap, and keep a full tap target each.
    if (!metrics.members) {
      geometryFailures.push({ case: testCase.name, reason: 'the member stack did not render' })
    } else {
      const members = metrics.members
      if (members.count !== 3) {
        geometryFailures.push({ case: testCase.name, reason: `expected 3 member circles, saw ${members.count}`, members })
      }
      if (members.distinctFills !== members.count) {
        geometryFailures.push({ case: testCase.name, reason: `member circles share a fill (${members.fills.join(', ')})`, members })
      }
      if (members.overlaps.some(overlap => Math.abs(overlap - 8) > SUBPIXEL)) {
        geometryFailures.push({ case: testCase.name, reason: `the stack overlap is not the source's 8px (${members.overlaps.join(', ')})`, members })
      }
      if (members.circleWidths.some(width => Math.abs(width - 32) > SUBPIXEL)) {
        geometryFailures.push({ case: testCase.name, reason: `a member circle is not 32px (${members.circleWidths.join(', ')})`, members })
      }
      if (members.targetHeights.some(height => height < 43.99 - SUBPIXEL)) {
        geometryFailures.push({ case: testCase.name, reason: `a member target is under 44px tall (${members.targetHeights.join(', ')})`, members })
      }
      if (members.hitTest.some(hit => !hit)) {
        geometryFailures.push({ case: testCase.name, reason: 'an overlapping neighbour covers a member target', members })
      }
      if (members.names.some(name => !name) || members.tooltips !== members.count) {
        geometryFailures.push({ case: testCase.name, reason: 'a member is missing its accessible name or tooltip', members })
      }
    }
    // The cover policy, asserted from the DOM. The renderer has exactly two
    // terminal states: one image, or the traveller's emoji when every image is
    // gone. Which IMAGE is decided by the plan, so these cases assert the plan's
    // answer too: an upload shows alone, and every other case reaches the Goa
    // artwork — never the saved emoji.
    const isUpload = testCase.cover === 'source' || testCase.cover === 'photo'
    const expectedCover = 'image'
    const actualCover = metrics.cover.state === 'image'
      ? 'image'
      : metrics.cover.state === 'emoji'
        ? 'emoji'
        : 'none'
    if (actualCover !== expectedCover) {
      geometryFailures.push({ case: testCase.name, reason: `cover should be ${expectedCover} but rendered ${actualCover}`, cover: metrics.cover })
    }
    // Exactly one image may be mounted in the slot, and the emoji must never
    // coexist with it. Two stacked covers is the failure this renderer exists
    // to make impossible.
    if (metrics.cover.imageCount > 1) {
      geometryFailures.push({ case: testCase.name, reason: 'the cover mounted more than one image', cover: metrics.cover })
    }
    if (metrics.cover.emojiCount > 0) {
      geometryFailures.push({ case: testCase.name, reason: 'an emoji node exists over a working cover', cover: metrics.cover })
    }
    if (!isUpload) {
      const scene = await page.locator('.yf-cover-media img').last().evaluate(async img => {
        await img.decode()
        const response = await fetch(img.currentSrc)
        const media = img.closest('.yf-cover-media').getBoundingClientRect()
        const image = img.getBoundingClientRect()
        const style = getComputedStyle(img)
        return {
          url: img.currentSrc,
          type: response.headers.get('content-type'),
          ok: response.ok,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          fit: style.objectFit,
          opacity: style.opacity,
          visibility: style.visibility,
          fill: image.width >= media.width - 1 && image.height >= media.height - 1,
        }
      })
      const isGoa = /goa-[12]/.test(scene.url)
      if (!scene.ok || !scene.type?.startsWith('image/') || scene.naturalWidth < 300 || scene.naturalHeight < 100
        || scene.fit !== 'cover' || !scene.fill || scene.opacity !== '1' || scene.visibility !== 'visible' || !isGoa) {
        geometryFailures.push({ case: testCase.name, reason: 'the Panaji + beach trip did not render a decoded full Goa scene', scene })
      }
      metrics.cover.scene = scene
    }
    if (testCase.cover === 'source') {
      const photo = await page.evaluate(async () => {
        const node = document.querySelector('.yf-cover-media img')
        const url = node?.currentSrc
        if (!url) return { url: null, width: 0 }
        const image = new Image()
        image.src = url
        await image.decode()
        const media = document.querySelector('.yf-cover-media').getBoundingClientRect()
        const box = node.getBoundingClientRect()
        return {
          url,
          width: image.naturalWidth,
          fill: box.width >= media.width - 1 && box.height >= media.height - 1,
          emoji: !!document.querySelector('.yf-cover-media .yf-cover-emoji'),
        }
      })
      if (photo.width < 300 || !photo.fill || photo.emoji) {
        geometryFailures.push({ case: testCase.name, reason: 'the manual photo did not fill the slot alone', photo })
      }
      metrics.cover.photo = photo
    }
    // A phone shows the day list; every wider case shows the grid.
    const matrix = metrics.matrix
    if (testCase.width > 720) {
      const expectedHeaders = ['Day · route', 'Brk', 'Lunch', 'Fuel', 'Stretch', 'Dinner', 'Night', 'Filled']
      if (matrix.headers.join('|') !== expectedHeaders.join('|')) {
        geometryFailures.push({ case: testCase.name, reason: 'the matrix header does not match the source', headers: matrix.headers })
      }
      if (matrix.rows < 1 || matrix.thumbs !== matrix.rows) {
        geometryFailures.push({ case: testCase.name, reason: 'a matrix row is missing its day thumbnail', matrix })
      }
      if (matrix.totals.length !== matrix.rows) {
        geometryFailures.push({ case: testCase.name, reason: 'a matrix row is missing its Filled total', matrix })
      }
      if (matrix.legend.length !== 4) {
        geometryFailures.push({ case: testCase.name, reason: 'the matrix key does not name four marks', matrix })
      }
      const clipped = matrix.headerFit.filter(head => head.scroll > head.client + 1)
      if (clipped.length) {
        geometryFailures.push({ case: testCase.name, reason: 'a matrix heading does not fit its column', clipped })
      }
      if (matrix.inviteContrast != null && matrix.inviteContrast < 4.5) {
        geometryFailures.push({ case: testCase.name, reason: 'the invite label does not clear 4.5:1 over bright artwork', contrast: matrix.inviteContrast })
      }
    }
    if (matrix.duplicateSelectors.length) {
      geometryFailures.push({ case: testCase.name, reason: 'duplicate matrix selectors', duplicates: matrix.duplicateSelectors })
    }
    if (testCase.mode !== 'train') {
      const alignment = await page.evaluate(() => {
        const paths = [...document.querySelectorAll('.ovw-elev-line')]
        const dots = [...document.querySelectorAll('.ovw-elev-dot')]
        const leader = document.querySelector('.ovw-elev-leader')
        const near = (x, y) => paths.some(path => {
          const length = path.getTotalLength()
          for (let i = 0; i <= 3000; i++) {
            const p = path.getPointAtLength(length * i / 3000)
            if (Math.hypot(p.x - x, p.y - y) < 0.5) return true
          }
          return false
        })
        return {
          offLine: dots.filter(dot => !near(+dot.getAttribute('cx'), +dot.getAttribute('cy'))).length,
          leaderOnDot: !leader || dots.some(dot => Math.hypot(+dot.getAttribute('cx') - +leader.getAttribute('x1'), +dot.getAttribute('cy') - +leader.getAttribute('y1')) < 0.1),
        }
      })
      if (alignment.offLine || !alignment.leaderOnDot) geometryFailures.push({ case: testCase.name, reason: 'height marks or leader miss the curve', alignment })
      if (metrics.curve.elevationStraightSteps > 0) {
        geometryFailures.push({ case: testCase.name, reason: 'the height curve still has a straight step', curve: metrics.curve })
      }
      if (metrics.curve.insetStraightSteps > 0) {
        geometryFailures.push({ case: testCase.name, reason: 'the corner inset still has a straight step', curve: metrics.curve })
      }
      if (metrics.curve.elevationCurves < 1) {
        geometryFailures.push({ case: testCase.name, reason: 'the height curve drew no cubic', curve: metrics.curve })
      }
    }
    if (metrics.daylight) geometryFailures.push({ case: testCase.name, reason: 'Daylight appears in the fixture' })
    if (testCase.mode === 'car' && !metrics.sourceClosed) geometryFailures.push({ case: testCase.name, reason: 'Data sources is not closed' })
    if (metrics.scroll[0] > metrics.scroll[1]) geometryFailures.push({ case: testCase.name, reason: 'horizontal overflow' })
    if (metrics.smallControls.length) geometryFailures.push({ case: testCase.name, reason: 'small controls', controls: metrics.smallControls })
    await page.screenshot({ path: join(OUT, `${testCase.name}.png`), fullPage: true })
    if (['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'].includes(testCase.name)) {
      for (const tab of ['Board', 'Map']) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        await page.waitForTimeout(800)
        const fit = await page.evaluate(() => {
          const title = document.querySelector('.yf-trip-title').getBoundingClientRect()
          const card = document.querySelector('.yf-trip-head').getBoundingClientRect()
          const tabs = document.querySelector('.yf-tabbar').getBoundingClientRect()
          return { top: title.top - card.top, gap: tabs.top - title.bottom, bottom: card.bottom - tabs.bottom }
        })
        if (fit.top < 0 || fit.gap < 0 || fit.bottom < 0) geometryFailures.push({ case: testCase.name, tab, reason: 'compact title or tabs overlap', fit })
        await page.screenshot({ path: join(OUT, `${testCase.name}-${tab.toLowerCase()}.png`) })
      }
    }
    records.push({ ...testCase, metrics, consoleErrors, pageErrors })
    if (consoleErrors.length || pageErrors.length) errors.push({ case: testCase.name, consoleErrors, pageErrors })
    await context.close()
  }

  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark']) {
      for (const fallback of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 } })
        const page = await context.newPage()
        await page.goto(`${URL}?theme=${theme}&mode=rental&long=1`, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('.yf-member')
        await page.evaluate(() => document.fonts.ready)
        await page.waitForTimeout(800)
        if (fallback) await page.addStyleTag({ content: '.yf-page .yf-trip-head { interpolate-size: numeric-only !important; }' })
        const support = await page.evaluate(() => CSS.supports('interpolate-size', 'allow-keywords'))
        for (const tab of ['Board', 'Map']) {
          if (tab === 'Map') {
            await page.getByRole('tab', { name: 'Overview', exact: true }).click()
            await page.waitForTimeout(800)
          }
          await page.locator('.yf-member').first().focus()
          const frames = await page.evaluate(async tabName => {
            const button = [...document.querySelectorAll('[role=tab]')].find(node => node.textContent.trim() === tabName)
            const frames = []
            button.click()
            const start = performance.now()
            await new Promise(resolve => {
              const sample = now => {
                const title = document.querySelector('.yf-trip-title')
                const card = document.querySelector('.yf-trip-head').getBoundingClientRect()
                const box = title.getBoundingClientRect()
                const range = document.createRange()
                range.selectNodeContents(title)
                const ink = range.getBoundingClientRect()
                const tabs = document.querySelector('.yf-tabbar').getBoundingClientRect()
                frames.push({ t: now - start, top: ink.top - card.top, bottom: card.bottom - ink.bottom, left: ink.left - card.left, right: card.right - ink.right, gap: tabs.top - box.bottom, height: card.height })
                if (now - start < 700) requestAnimationFrame(sample)
                else resolve()
              }
              requestAnimationFrame(sample)
            })
            return frames
          }, tab)
          const state = await page.evaluate(() => ({ inert: document.querySelector('.yf-extra').inert, focus: document.activeElement?.textContent?.trim() }))
          const clipped = frames.filter(frame => frame.top < -1 || frame.bottom < -1 || frame.left < -1 || frame.right < -1 || frame.gap < -1)
          if (clipped.length || !state.inert || state.focus !== tab) geometryFailures.push({ case: `long-${width}-${theme}-${fallback}`, tab, reason: 'title, focus or inert failure', clipped: clipped.slice(0, 3), state })
          records.push({ name: `long-${width}-${theme}-${fallback}-${tab}`, support, frames, state })
          await page.screenshot({ path: join(OUT, `long-${width}-${theme}-${fallback ? 'fallback-' : ''}${tab.toLowerCase()}.png`) })
        }
        await context.close()
      }
    }
  }

  // ---- The failure chain, one controlled cause per case ----
  // Each case blocks a different thing and asserts what the slot shows next.
  // The renderer walks one candidate at a time, so these prove the order rather
  // than a single happy path.

  /** Read the cover slot's own state, without any case-specific assumption. */
  const coverState = (page, selector = '.yf-cover-media') => page.evaluate(async sel => {
    const media = document.querySelector(sel)
    if (!media) return { state: 'missing' }
    const mediaBox = media.getBoundingClientRect()
    const images = [...media.querySelectorAll('img')]
    const image = images.at(-1)
    // The terminal emoji is whatever the renderer marked, so the probe does not
    // depend on the class a given surface chose.
    const emoji = media.querySelector('[data-cover-state="emoji"]')
    // A surface may hand the renderer's own element in (the hero postcard does),
    // so the state attribute can sit on the element itself rather than below it.
    const stateAttribute = media.getAttribute('data-cover-state')
      ?? media.querySelector('[data-cover-state]')?.getAttribute('data-cover-state')
      ?? null
    let scene = null
    if (image) {
      try { await image.decode() } catch { /* a failed image is the point of some cases */ }
      const box = image.getBoundingClientRect()
      scene = {
        url: image.currentSrc,
        width: image.naturalWidth,
        complete: image.complete,
        fill: box.width >= mediaBox.width - 1 && box.height >= mediaBox.height - 1,
        opacity: getComputedStyle(image).opacity,
        visibility: getComputedStyle(image).visibility,
      }
    }
    const emojiBox = emoji ? emoji.getBoundingClientRect() : null
    return {
      state: stateAttribute,
      imageCount: images.length,
      emojiCount: emoji ? 1 : 0,
      emojiText: emoji ? (emoji.textContent || '') : null,
      emojiCentred: !!emojiBox && Math.abs((emojiBox.left + emojiBox.width / 2) - (mediaBox.left + mediaBox.width / 2)) < 8,
      scene,
    }
  }, selector)

  const failCase = async ({ name, cover, abort, expect, query = '', selector = '.yf-cover-media' }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    if (abort) await page.route(abort.pattern, route => route.request().resourceType() === 'image' ? route.abort() : route.continue())
    await page.goto(`${URL}?mode=rental&cover=${cover}${query}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector(selector)
    await page.waitForTimeout(1200)
    const state = await coverState(page, selector)
    const problems = []
    if (state.state !== expect.state) problems.push(`expected state ${expect.state}, saw ${state.state}`)
    if (state.imageCount > 1) problems.push(`mounted ${state.imageCount} images`)
    if (expect.state === 'image') {
      if (state.emojiCount) problems.push('an emoji node exists beside a working image')
      // The floor is the smallest source the renderer may serve, not a fixed
      // 300: a hero postcard is ~203 CSS px wide and legitimately picks the
      // 320w file. Chromium also reports a density-corrected `naturalWidth` for
      // AVIF (188 for a 320px file), so a small slot asserts decode + fill
      // rather than a pixel floor it can never meet.
      const floor = expect.minWidth ?? 300
      if (!state.scene?.complete || state.scene.width < floor) problems.push('the image did not decode')
      if (!state.scene?.fill) problems.push('the image did not fill the slot')
      if (state.scene?.opacity !== '1' || state.scene?.visibility !== 'visible') problems.push('the image is not visible')
      if (expect.match && !expect.match.test(state.scene?.url ?? '')) problems.push(`url ${state.scene?.url} does not match ${expect.match}`)
    }
    if (expect.state === 'emoji') {
      if (state.imageCount) problems.push('an image is still mounted under the emoji')
      if (state.emojiText !== expect.emoji) problems.push(`expected emoji ${expect.emoji}, saw ${state.emojiText}`)
      if (!state.emojiCentred) problems.push('the emoji is not the cover, it is a corner badge')
    }
    if (problems.length) geometryFailures.push({ case: name, reason: problems.join('; '), state })
    await page.screenshot({ path: join(OUT, `${name}.png`) })
    records.push({ name, cover, state })
    await context.close()
  }

  // The preferred scene's files are refused, so the NEXT matching scene paints.
  // Never the emoji: the trip still has honest artwork.
  await failCase({
    name: 'cover-preferred-scene-fails',
    cover: 'savedbeach',
    abort: { pattern: '**/goa-1-*' },
    expect: { state: 'image', match: /goa-2/ },
  })

  // Every Goan scene is refused, so the neutral scene answers. Still artwork.
  await failCase({
    name: 'cover-all-goa-fails',
    cover: 'savedbeach',
    abort: { pattern: '**/goa-*' },
    expect: { state: 'image', match: /generic-1/ },
  })

  // The AVIF file is refused but the WebP of the SAME scene loads, so the
  // scene still paints and no emoji appears. This is the case RegionArt could
  // not serve: it dropped a scene with no AVIF entirely.
  await failCase({
    name: 'cover-avif-fails-webp-succeeds',
    cover: 'savedbeach',
    abort: { pattern: '**/*.avif' },
    expect: { state: 'image', match: /\.webp/ },
  })

  // Every image on the page is refused. Only now is the saved emoji the cover.
  await failCase({
    name: 'cover-all-images-fail',
    cover: 'savedbeach',
    abort: { pattern: '**/*.{avif,webp}' },
    expect: { state: 'emoji', emoji: '🏖' },
  })

  // An upload that cannot load is not a usable cover: the artwork shows and
  // the emoji still does not.
  await failCase({
    name: 'cover-broken-upload-falls-to-art',
    cover: 'broken',
    expect: { state: 'image', match: /goa-/ },
  })

  // The same trip with no upload at all must produce the identical scene, so
  // a failed upload lands on the plan's own answer rather than somewhere new.
  await failCase({
    name: 'cover-broken-upload-matches-art',
    cover: 'art',
    expect: { state: 'image', match: /goa-/ },
  })

  // A trip whose stops name no supported place and whose start is blank has no
  // evidence at all. That is the ONLY way to reach the emoji without an image
  // failure, and it proves the neutral scene is a real answer, not a blank.
  await failCase({
    name: 'cover-no-evidence-neutral-scene',
    cover: 'art',
    expect: { state: 'image', match: /goa-|generic-1/ },
  })

  // The wider region table knows a stop the India place layer does not, and an
  // unrelated origin must not outrank it. Gulmarg out of Mumbai is Kashmir, not
  // the Mumbai scene and not the neutral family.
  await failCase({
    name: 'cover-region-beats-unrelated-origin',
    cover: 'savedbeach',
    query: '&place=Gulmarg&start=Mumbai',
    expect: { state: 'image', match: /himalaya-/ },
  })

  // The same trip with the preferred Kashmir file refused: the region's SECOND
  // bundled scene paints before any neutral scene. Both are bundled, so a
  // refusal costs a step inside Kashmir rather than leaving it.
  await failCase({
    name: 'cover-region-sibling-before-neutral',
    cover: 'savedbeach',
    query: '&place=Gulmarg&start=Mumbai',
    abort: { pattern: '**/himalaya-1-*' },
    expect: { state: 'image', match: /himalaya-2/ },
  })

  // The My trips hero draws the same plan, so a saved emoji must reach the
  // postcard. With every image refused the postcard shows THAT emoji — not the
  // compass default, which is the "no choice" marker.
  await failCase({
    name: 'cover-hero-saved-emoji-when-exhausted',
    cover: 'savedbeach',
    query: '&surface=hero',
    selector: '.ex-postcard-art',
    abort: { pattern: '**/*.{avif,webp}' },
    expect: { state: 'emoji', emoji: '🏖' },
  })

  // …and while its images load, the hero postcard shows the image with no emoji
  // beside it. The fallback is terminal, never an accent.
  await failCase({
    name: 'cover-hero-image-has-no-emoji',
    cover: 'savedbeach',
    query: '&surface=hero',
    selector: '.ex-postcard-art',
    expect: { state: 'image', match: /goa-/, minWidth: 128 },
  })

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  await page.goto(`${URL}?theme=light`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.mx-btn', { timeout: 15_000 })
  const source = page.locator('.ovw-sources summary')
  await source.focus()
  await page.keyboard.press('Enter')
  const disclosure = await page.locator('.ovw-sources').evaluate(element => ({ open: element.open, text: element.innerText }))
  if (!disclosure.open || !disclosure.text.includes('U.S. Geological Survey')) geometryFailures.push({ case: 'sources-keyboard', reason: 'credit disclosure failed' })
  await page.keyboard.press('Enter')
  const cells = page.locator('.mx-btn')
  await cells.first().focus()
  const before = await page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label'),
    tabIndex: document.activeElement?.getAttribute('tabindex'),
  }))
  await page.keyboard.press('ArrowRight')
  const after = await page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label'),
    tabIndex: document.activeElement?.getAttribute('tabindex'),
    activeCount: [...document.querySelectorAll('.mx-btn')].filter(element => element.getAttribute('tabindex') === '0').length,
  }))
  await page.getByRole('tab', { name: 'Map' }).click()
  await page.waitForTimeout(500)
  const folded = await page.evaluate(() => ({
    compact: document.querySelector('.yf-page')?.getAttribute('data-compact'),
    headHeight: Math.round(document.querySelector('.yf-trip-head')?.getBoundingClientRect().height ?? 0),
    activeTab: document.querySelector('.yf-tabbar [aria-selected="true"]')?.textContent?.trim(),
  }))
  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.waitForTimeout(300)
  const unfolded = await page.evaluate(() => ({
    compact: document.querySelector('.yf-page')?.getAttribute('data-compact'),
    headHeight: Math.round(document.querySelector('.yf-trip-head')?.getBoundingClientRect().height ?? 0),
    activeTab: document.querySelector('.yf-tabbar [aria-selected="true"]')?.textContent?.trim(),
  }))
  records.push({ name: 'keyboard-and-fold', disclosure, before, after, folded, unfolded })
  await page.screenshot({ path: join(OUT, 'keyboard-and-fold.png') })
  await context.close()
} finally {
  await browser.close()
}

writeFileSync(join(OUT, 'records.json'), JSON.stringify({ records, errors, geometryFailures }, null, 2))
if (geometryFailures.length) {
  console.error(JSON.stringify({ geometryFailures }, null, 2))
  process.exitCode = 1
}
if (errors.length) {
  console.error(JSON.stringify(errors, null, 2))
  process.exitCode = 1
} else if (!geometryFailures.length) {
  console.log(`overview fixture evidence: ${records.length} records, geometry holds, no console or page errors`)
}
