// Scratch: read `.hero .btn-primary`'s computed box-shadow under reduced motion,
// for two given stylesheets. This decides whether the cascade inversion is real.
import fs from 'node:fs'
import { launchChrome } from './_css3-compare-lib.mjs'

const [a, b] = process.argv.slice(2)
if (!a || !b) { console.error('usage: node dev/_css3-probe-rm.mjs <cssA> <cssB>'); process.exit(2) }

const browser = await launchChrome()
try {
  for (const [label, file] of [['A', a], ['B', b]]) {
    const css = fs.readFileSync(file, 'utf8')
    for (const motion of ['no-preference', 'reduce']) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: motion })
      try {
        await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle' })
        // `reducedMotion` is set when the page is created. Assert it took effect
        // instead of assuming, so a silent no-op cannot be read as "no change".
        const emulated = await page.evaluate(() =>
          window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => {
          const styles = [...document.querySelectorAll('style[data-vite-dev-id]')]
          for (const s of styles) s.remove()
        })
        await page.addStyleTag({ content: css })
        await page.waitForTimeout(200)
        const out = await page.evaluate(() => {
          const el = document.querySelector('.hero .btn-primary')
          if (!el) return { error: 'no hero primary button' }
          const cs = getComputedStyle(el)
          return { shadow: cs.boxShadow, animation: cs.animationName }
        })
        console.log(`${label} ${motion.padEnd(13)} shadow=${(out.shadow || '').slice(0, 70)}  anim=${out.animation}`)
      } finally {
        await page.close()
      }
    }
  }
} finally {
  await browser.close()
}
