// W14 rail: build real board-left / live-right comparison pairs.
// Board crops come from the recorded r1 board screenshots. Live crops come
// from w14-rail-capture.mjs against the running fixture in this worktree.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const BOARD = 'E:/yatraflow-wt/scratch-832/r1-review/shots'
const LIVE = 'E:/yatraflow-wt/scratch-832/w14-shots/rail/final'
const OUT = LIVE
const data = file => 'data:image/png;base64,' + readFileSync(file).toString('base64')
const box = (src, crop, zoom = 2, native = false) => {
  const image = native
    ? `<img src="${src}" style="position:absolute;left:0;top:0;width:${crop[2]}px;height:auto;margin-left:${-crop[0]}px;margin-top:${-crop[1]}px">`
    : `<img src="${src}" style="position:absolute;left:0;top:0;transform:scale(${zoom});transform-origin:0 0;margin-left:${-crop[0] * zoom}px;margin-top:${-crop[1] * zoom}px">`
  return `<div style="width:${Math.round(crop[2] * zoom)}px;height:${Math.round(crop[3] * zoom)}px;overflow:hidden;position:relative;flex:none">${image}</div>`
}

const pairs = [
  { name: 'drive-rail', board: 'board-drive.png', boardCrop: [12, 162, 380, 740], live: 'drive-rail-live.png', liveCrop: [0, 0, 380, 700], zoom: 1, native: true },
  { name: 'fix-rail-dark', board: 'board-fix.png', boardCrop: [12, 162, 380, 740], live: 'fix-rail-live.png', liveCrop: [0, 0, 380, 700], zoom: 1, native: true },
  { name: 'stay-rail', board: 'board-stay.png', boardCrop: [12, 162, 380, 740], live: 'stay-rail-live.png', liveCrop: [0, 0, 380, 700], zoom: 1, native: true },
  { name: 'drive-strip', board: 'board-drive.png', boardCrop: [404, 816, 640, 72], live: 'drive-strip-live.png', liveCrop: [0, 0, 625, 72], zoom: 2 },
  { name: 'fix-strip-dark', board: 'board-fix.png', boardCrop: [404, 816, 640, 72], live: 'fix-strip-live.png', liveCrop: [0, 0, 625, 72], zoom: 2 },
]

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  for (const pair of pairs) {
    const width = Math.round((pair.boardCrop[2] + pair.liveCrop[2]) * pair.zoom + 30)
    const height = Math.round(Math.max(pair.boardCrop[3], pair.liveCrop[3]) * pair.zoom + 20)
    await page.setViewportSize({ width, height })
    await page.setContent(`<body style="margin:0;background:#777;display:flex;gap:10px;align-items:flex-start;padding:4px">${box(data(join(BOARD, pair.board)), pair.boardCrop, pair.zoom)}${box(data(join(LIVE, pair.live)), pair.liveCrop, pair.zoom, pair.native)}</body>`)
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(OUT, `pair-${pair.name}.png`), fullPage: true })
    console.log(`pair-${pair.name}.png`)
  }
} finally {
  await browser.close()
}
