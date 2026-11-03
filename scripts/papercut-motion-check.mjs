#!/usr/bin/env node
// Browser proof for the Papercut motion foundation.
// It checks the live gallery at both widths and themes, with OS reduced motion.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PORT = Number(process.env.PAPERCUT_PORT ?? 5181)
const MANAGED_URL = !process.env.PAPERCUT_URL
const URL = process.env.PAPERCUT_URL ?? `http://127.0.0.1:${PORT}/dev/papercut-tokens.html`
const EVIDENCE = join(ROOT, '.verify-evidence', 'papercut-motion')
const EXPECTED_PALETTE = {
  light: {
    '--pw-paper': '#F8F5F0',
    '--pw-sunken': '#ECE7DE',
    '--pw-soft': '#F2EDE4',
    '--pw-card': '#FEFDFB',
    '--pw-raised': '#FFFFFF',
    '--pw-line': '#DFDBD1',
    '--pw-line-soft': '#E8E4DB',
    '--pw-ink': '#22201E',
    '--pw-ink-2': '#57524C',
    '--pw-ink-3': '#6B645C',
    '--pw-ink-4': '#8C857B',
    '--pw-sea-700': '#0B5F67',
    '--pw-lagoon-600': '#0D8D82',
    '--pw-marigold-500': '#F2A33A',
    '--pw-marigold-ink': '#8A4F0E',
    '--pw-ok': '#1F6B41',
    '--pw-risk': '#B23A2E',
    '--pw-bloom-700': '#9C2347',
  },
  dark: {
    '--pw-paper': '#0C1420',
    '--pw-sunken': '#101B2B',
    '--pw-soft': '#182740',
    '--pw-card': '#16233A',
    '--pw-raised': '#1A2A44',
    '--pw-line': '#27395A',
    '--pw-line-soft': '#1E3050',
    '--pw-ink': '#E8EFF5',
    '--pw-ink-2': '#ADBCCF',
    '--pw-ink-3': '#8FA0B5',
    '--pw-ink-4': '#5F757F',
    '--pw-sea-700': '#3FB8AC',
    '--pw-lagoon-600': '#3FB8AC',
    '--pw-marigold-500': '#F5B04E',
    '--pw-marigold-ink': '#F2B45C',
    '--pw-ok': '#7FCF9A',
    '--pw-risk': '#F08A7A',
    '--pw-bloom-700': '#F08AA0',
  },
}

const CASES = []
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      CASES.push({ name: `${theme}-${width}-${reducedMotion}`, theme, width, reducedMotion })
    }
  }
}

async function waitForServer(tries = 120) {
  for (let i = 0; i < tries; i++) {
    try {
      const response = await fetch(URL)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`the gallery never answered at ${URL}`)
}

async function launchChrome() {
  const { chromium } = await import('playwright-core')
  const attempts = [
    { channel: 'chrome' },
    { executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { executablePath: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
    { executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
    { executablePath: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
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

const inspectAnimations = (selector) => {
  const elements = [...document.querySelectorAll(selector)]
  return elements.map((element) => {
    const animation = element.getAnimations()[0]
    const timing = animation?.effect.getTiming()
    const frames = animation?.effect.getKeyframes() ?? []
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      delay: Number(timing?.delay ?? 0),
      duration: Number(timing?.duration ?? 0),
      hasTransform: frames.some(frame => Object.prototype.hasOwnProperty.call(frame, 'transform')),
      opacity: style.opacity,
      animationName: style.animationName,
      box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
    }
  })
}

const inspectOverflow = () => {
  const root = document.documentElement
  const before = root.scrollLeft
  root.scrollLeft = 9999
  const canScrollRight = root.scrollLeft > before
  root.scrollLeft = before
  const main = document.querySelector('main')
  return {
    innerWidth,
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    canScrollRight,
    mainScrollWidth: main?.scrollWidth ?? 0,
    mainClientWidth: main?.clientWidth ?? 0,
  }
}

const inspectFinalState = () => {
  const route = document.querySelector('#final-route path')
  const pin = document.querySelector('#final-pin')
  const number = document.querySelector('#final-number')
  return {
    route: route ? { animationName: getComputedStyle(route).animationName, dashoffset: getComputedStyle(route).strokeDashoffset } : null,
    pin: pin ? { animationName: getComputedStyle(pin).animationName, opacity: getComputedStyle(pin).opacity, transform: getComputedStyle(pin).transform } : null,
    number: number ? { animationName: getComputedStyle(number).animationName, opacity: getComputedStyle(number).opacity, transform: getComputedStyle(number).transform } : null,
  }
}

const inspectFoundation = ({ expected, reduced }) => {
  const root = getComputedStyle(document.documentElement)
  const token = name => root.getPropertyValue(name).trim().toUpperCase()
  const tokens = Object.fromEntries(Object.keys(expected).map(name => [name, token(name)]))
  const paletteOk = Object.entries(expected).every(([name, value]) => tokens[name] === value)
  const motionTokens = ['--motion-instant', '--motion-fast', '--motion-med', '--motion-slow', '--motion-slower', '--stagger-step']
  const motion = Object.fromEntries(motionTokens.map(name => [name, root.getPropertyValue(name).trim()]))
  const expectedMotion = reduced
    ? ['0ms', '0ms', '0ms', '0ms', '0ms', '0ms']
    : ['90ms', '160ms', '240ms', '360ms', '560ms', '60ms']
  const motionOk = motionTokens.every((name, i) => motion[name] === expectedMotion[i])

  const rgb = value => {
    const hex = value.replace('#', '')
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  }
  const luminance = value => rgb(value)
    .map(channel => channel <= .03928 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0)
  const contrast = (foreground, background) => {
    const a = luminance(foreground)
    const b = luminance(background)
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
  }
  const pairs = [
    ['ink/paper', '--pw-ink', '--pw-paper'],
    ['ink-2/paper', '--pw-ink-2', '--pw-paper'],
    ['ink-3/card', '--pw-ink-3', '--pw-card'],
    ['on-sea/sea-700', '--pw-on-sea', '--pw-sea-700'],
    ['on-marigold/marigold-500', '--pw-on-marigold', '--pw-marigold-500'],
    ['sea-900/lagoon-100', '--pw-sea-900', '--pw-lagoon-100'],
    ['marigold-ink/marigold-100', '--pw-marigold-ink', '--pw-marigold-100'],
    ['ok/ok-100', '--pw-ok', '--pw-ok-100'],
    ['risk/risk-100', '--pw-risk', '--pw-risk-100'],
    ['bloom-700/bloom-100', '--pw-bloom-700', '--pw-bloom-100'],
  ].map(([name, foreground, background]) => {
    const ratio = contrast(token(foreground), token(background))
    return { name, foreground: token(foreground), background: token(background), ratio: Number(ratio.toFixed(2)), ok: ratio >= 4.5 }
  })
  const contrastsOk = pairs.every(pair => pair.ok)

  const h1 = getComputedStyle(document.querySelector('.gallery h1'))
  const body = getComputedStyle(document.querySelector('.gallery p'))
  const fonts = {
    display: h1.fontFamily,
    body: body.fontFamily,
    soraLoaded: document.fonts.check('700 56px Sora'),
    jakartaLoaded: document.fonts.check('500 15px "Plus Jakarta Sans"'),
  }
  const fontsOk = fonts.display.includes('Sora') && fonts.body.includes('Plus Jakarta Sans') && fonts.soraLoaded && fonts.jakartaLoaded
  const shadowHue = root.getPropertyValue('--shadow-navy-rgb').trim()
  const shadowAliases = { '--shadow': '--elev-1', '--shadow-soft': '--elev-1', '--shadow-card': '--elev-1', '--shadow-card-hover': '--elev-2' }
  const shadows = Object.fromEntries(Object.keys(shadowAliases).map(name => [name, token(name)]))
  const ring = token('--ring').replace(/\s+/g, ' ')
  const elevationOk = shadowHue === '34, 32, 30' && Object.entries(shadowAliases).every(([name, elevation]) => shadows[name] === token(elevation)) && ring === `0 0 0 3PX ${expected['--pw-lagoon-600']}`

  return { tokens, paletteOk, motion, motionOk, pairs, contrastsOk, fonts, fontsOk, shadowHue, shadows, ring, elevationOk }
}

function sameList(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

let server
let browser
const records = []
let failures = 0

try {
  if (MANAGED_URL) {
    const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
    if (!existsSync(vite)) throw new Error(`vite is missing at ${vite}`)
    server = spawn(process.execPath, [vite, '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
    })
  }
  await waitForServer()
  browser = await launchChrome()
  mkdirSync(EVIDENCE, { recursive: true })

  for (const testCase of CASES) {
    const context = await browser.newContext({
      viewport: { width: testCase.width, height: 900 },
      reducedMotion: testCase.reducedMotion,
    })
    const page = await context.newPage()
    const pageErrors = []
    const consoleErrors = []
    page.on('pageerror', error => pageErrors.push(String(error).split('\n')[0]))
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    try {
      await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForSelector('#stagger-list .gallery-stagger-item', { timeout: 10000 })
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme
        return document.fonts.ready
      }, testCase.theme)
      await page.waitForTimeout(50)

      const foundation = await page.evaluate(inspectFoundation, {
        expected: EXPECTED_PALETTE[testCase.theme],
        reduced: testCase.reducedMotion === 'reduce',
      })

      const appLifecycle = await page.evaluate(reduced => {
        const host = document.createElement('div'); host.innerHTML = '<section class="yf-surface tsx-card"></section>'.repeat(8); document.body.append(host)
        const cards = [...host.children]; const timings = () => cards.map(card => { const s = getComputedStyle(card); return [Math.round(parseFloat(s.animationDelay) * 1000), Math.round(parseFloat(s.animationDuration) * 1000), s.animationName] })
        const entrance = timings(); cards.forEach(card => card.dataset.presence = 'exit'); const exit = timings()
        const map = document.createElement('div'); map.className = 'map-shell map-shell--closing'; host.append(map)
        const mapStyle = getComputedStyle(map)
        const mapExit = [Math.round(parseFloat(mapStyle.animationDelay) * 1000), Math.round(parseFloat(mapStyle.animationDuration) * 1000), mapStyle.animationName]
        host.remove()
        const expectedDelays = [0, 60, 120, 180, 240, 300, 300, 300]
        const entranceOk = entrance.every((timing, i) => reduced
          ? timing[0] === 0 && timing[1] === 0 && timing[2] === 'none'
          : timing[0] === expectedDelays[i] && timing[1] === 240 && timing[2] !== 'none')
        const exitOk = exit.every(timing => reduced
          ? timing[0] === 0 && timing[1] === 0 && timing[2] === 'none'
          : timing[0] === 0 && timing[1] === 240 && timing[2] === 'presence-out')
        const mapExitOk = reduced
          ? mapExit[0] === 0 && mapExit[1] === 0 && mapExit[2] === 'none'
          : mapExit[0] === 0 && mapExit[1] === 360 && mapExit[2] === 'mapCollapse'
        if (!entranceOk || !exitOk || !mapExitOk) {
          throw new Error(`App lifecycle failed: ${JSON.stringify({ entrance, exit, mapExit })}`)
        }
        return { entrance, exit, mapExit }
      }, testCase.reducedMotion === 'reduce')

      const overflow = await page.evaluate(inspectOverflow)
      await page.click('#replay-stagger')
      await page.waitForTimeout(20)
      const entrance1 = await page.evaluate(inspectAnimations, '#stagger-list .gallery-stagger-item')
      await page.waitForTimeout(300)
      await page.click('#replay-stagger')
      await page.waitForTimeout(20)
      const entrance2 = await page.evaluate(inspectAnimations, '#stagger-list .gallery-stagger-item')

      await page.click('#replay-exit')
      await page.waitForTimeout(20)
      const exit1 = await page.evaluate(inspectAnimations, '#exit-card')
      await page.waitForTimeout(300)
      await page.click('#replay-exit')
      await page.waitForTimeout(20)
      const exit2 = await page.evaluate(inspectAnimations, '#exit-card')

      await page.click('#replay-reduced')
      await page.waitForTimeout(20)
      const reduced = await page.evaluate(inspectAnimations, '#reduced-demo')
      const finalState = await page.evaluate(inspectFinalState)

      const shot = join(EVIDENCE, `papercut-${testCase.name}.png`)
      await page.screenshot({ path: shot, fullPage: true })

      const reducedCase = testCase.reducedMotion === 'reduce'
      const delays = entrance1.map(item => item.delay)
      const expectedDelays = [0, 60, 120, 180, 240, 300, 300, 300]
      const geometryInside = entrance1.every(item =>
        item.box.width > 0 &&
        item.box.height > 0 &&
        item.box.left >= -1 &&
        item.box.right <= testCase.width + 1,
      )
      const entranceOk = reducedCase
        ? entrance1.every(item => item.delay === 0 && item.duration === 0 && item.animationName === 'none' && !item.hasTransform)
        : sameList(delays, expectedDelays) && entrance1.every(item => item.duration === 240 && item.hasTransform)
      const entranceReplayOk = reducedCase
        ? entrance2.every(item => item.delay === 0 && item.duration === 0 && item.animationName === 'none' && !item.hasTransform)
        : sameList(entrance2.map(item => item.delay), expectedDelays) && entrance2.every(item => item.duration === 240 && item.hasTransform)
      const exitOk = reducedCase
        ? exit1.every(item => item.animationName === 'none' && item.opacity === '0')
        : exit1.every(item => item.duration === 240 && item.delay === 0 && item.hasTransform)
      const exitReplayOk = reducedCase
        ? exit2.every(item => item.animationName === 'none' && item.opacity === '0')
        : exit2.every(item => item.duration === 240 && item.delay === 0 && item.hasTransform)
      const finalOk = !reducedCase || (
        finalState.route?.animationName === 'none' &&
        finalState.pin?.animationName === 'none' &&
        finalState.number?.animationName === 'none' &&
        finalState.pin?.opacity === '1' &&
        finalState.number?.opacity === '1'
      )
      const overflowOk = overflow.scrollWidth <= overflow.clientWidth + 1 && !overflow.canScrollRight && overflow.mainScrollWidth <= overflow.mainClientWidth + 1
      const foundationOk = foundation.paletteOk && foundation.motionOk && foundation.contrastsOk && foundation.fontsOk && foundation.elevationOk
      const clean = pageErrors.length === 0 && consoleErrors.length === 0
      const ok = geometryInside && entranceOk && entranceReplayOk && exitOk && exitReplayOk && finalOk && overflowOk && foundationOk && clean
      if (!ok) failures++

      records.push({
        ...testCase,
        url: URL,
        screenshot: shot,
        overflow,
        foundation,
        appLifecycle,
        geometryInside,
        entrance1,
        entrance2,
        exit1,
        exit2,
        reduced,
        finalState,
        pageErrors,
        consoleErrors,
        ok,
      })
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}: entrance=${entranceOk && entranceReplayOk}, exit=${exitOk && exitReplayOk}, final=${finalOk}, foundation=${foundationOk}, overflow=${overflowOk}, errors=${pageErrors.length + consoleErrors.length}`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser?.close().catch(() => {})
  server?.kill()
}

const report = {
  url: URL,
  generatedAt: new Date().toISOString(),
  cases: records,
  failures,
}
writeFileSync(join(EVIDENCE, 'papercut-motion.json'), JSON.stringify(report, null, 2))
console.log(`evidence ${join(EVIDENCE, 'papercut-motion.json')}`)
if (failures > 0) process.exitCode = 1
