// ============ Plan Bench — "Share as image" bill renderer ============
// Draws the receipt as a shareable PNG with the Canvas 2D API — no
// dependencies, no html2canvas. Always renders the dark till-roll look:
// images travel out of context (group chats, downloads), so the navy bill
// that reads on any background wins over the theme-aware paper.
//
// All figures come from the SAME computeBenchBill result the component
// already holds — passed in, never recomputed — so the image can never
// disagree with the on-screen receipt.
//
// Share chain (shareBillImage): Web Share API with the PNG file when the
// platform allows it → clipboard image when ClipboardItem supports
// image/png → plain download as the last resort. Every failure throws so
// the caller can toast.

import { formatInr } from './engine'
import { isBenchFuelMode, type BenchBill, type BenchInputs } from './planBench'

// ---- palette (mirrors the dark receipt in styles.css) ----
const NAVY_TOP = '#123F49'
const NAVY_BOTTOM = '#0A222B'
const INK = '#EAF4F1'
const INK_SOFT = 'rgba(234, 244, 241, .8)'
const INK_FAINT = 'rgba(234, 244, 241, .68)'
const ACCENT = '#8ADBCA'
const SAFFRON = '#F5A94A'
const BAR_TEAL = '#0D8D82'
const BAR_SAFFRON = '#F3AA3D'
const BAR_PURPLE = '#897ABB'

const SANS = 'Inter, system-ui, sans-serif'
const MONO = 'ui-monospace, Consolas, monospace'

const W = 600            // logical width
const PAD = 40           // horizontal padding
const SCALE = 2          // device-pixel multiplier — crisp at 2x
const MAX_H = 900        // generous scratch height; cropped to content after

type Ctx = CanvasRenderingContext2D

/** The torn-bottom till-roll card path (rounded top corners, zigzag bottom). */
function billPath(ctx: Ctx, h: number): void {
  const r = 22
  const tooth = 24
  const teeth = Math.floor(W / tooth)
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(W - r, 0)
  ctx.quadraticCurveTo(W, 0, W, r)
  ctx.lineTo(W, h - 14)
  for (let i = 0; i < teeth; i++) {
    const x = W - i * tooth
    ctx.lineTo(x - tooth / 2, h)
    ctx.lineTo(x - tooth, h - 14)
  }
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
}

/** Left-aligned / right-aligned / centred text helper. */
function text(ctx: Ctx, s: string, x: number, y: number, font: string, color: string,
  align: CanvasTextAlign = 'left'): void {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(s, x, y)
}

/** Uppercase kicker with letter-spacing where the browser supports it. */
function tracked(ctx: Ctx, s: string, x: number, y: number, font: string, color: string,
  align: CanvasTextAlign = 'left', px = '2px'): void {
  const c = ctx as Ctx & { letterSpacing?: string }
  const had = c.letterSpacing
  if ('letterSpacing' in c) c.letterSpacing = px
  text(ctx, s.toUpperCase(), x, y, font, color, align)
  if ('letterSpacing' in c) c.letterSpacing = had
}

function dashedRule(ctx: Ctx, y: number, color: string): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.setLineDash([5, 5])
  ctx.beginPath()
  ctx.moveTo(PAD, y)
  ctx.lineTo(W - PAD, y)
  ctx.stroke()
  ctx.restore()
}

/** Deterministic pseudo-random barcode strip (same bars every render). */
function drawBarcode(ctx: Ctx, right: number, y: number, w: number, h: number): void {
  let seed = 7
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  ctx.save()
  ctx.fillStyle = 'rgba(234, 244, 241, .55)'
  let x = right - w
  while (x < right - 2) {
    const bw = 2 + Math.floor(rnd() * 4)
    ctx.fillRect(x, y, bw, h)
    x += bw + 1 + Math.floor(rnd() * 4)
  }
  ctx.restore()
}

/** One itemized bill line: label + amount, formula underneath. Returns next y. */
function billLine(ctx: Ctx, label: string, amount: string, formula: string, y: number): number {
  text(ctx, label, PAD, y, `700 14px ${SANS}`, INK)
  text(ctx, amount, W - PAD, y, `700 14px ${MONO}`, INK, 'right')
  text(ctx, formula, PAD, y + 17, `400 11px ${MONO}`, INK_FAINT)
  return y + 46
}

/** Draw the whole bill into a scratch canvas, return it (content may leave
 *  slack at the bottom — cropBill trims it). */
function drawBill(bill: BenchBill, input: BenchInputs): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = W * SCALE
  canvas.height = MAX_H * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d unavailable')

  ctx.scale(SCALE, SCALE)

  // torn card + atmosphere glows
  const bg = ctx.createLinearGradient(0, 0, W * 0.35, MAX_H)
  bg.addColorStop(0, NAVY_TOP)
  bg.addColorStop(1, NAVY_BOTTOM)
  billPath(ctx, MAX_H)
  ctx.fillStyle = bg
  ctx.fill()
  ctx.save()
  ctx.clip()
  let glow = ctx.createRadialGradient(W, 0, 0, W, 0, 420)
  glow.addColorStop(0, 'rgba(243, 170, 61, .14)')
  glow.addColorStop(1, 'rgba(243, 170, 61, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, MAX_H)
  glow = ctx.createRadialGradient(0, MAX_H, 0, 0, MAX_H, 460)
  glow.addColorStop(0, 'rgba(15, 158, 144, .2)')
  glow.addColorStop(1, 'rgba(15, 158, 144, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, MAX_H)
  ctx.restore()

  let y = 56

  // head: kicker + issue date, barcode strip top-right
  tracked(ctx, 'The Honest Bill', PAD, y, `800 12px ${SANS}`, ACCENT, 'left', '2.4px')
  const issued = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  text(ctx, issued, W - PAD - 128, y, `400 11px ${SANS}`, INK_FAINT, 'right')
  drawBarcode(ctx, W - PAD, y - 14, 112, 22)
  y += 44

  // hero: per-head figure in saffron
  tracked(ctx, 'Per head', W / 2, y, `800 11px ${SANS}`, INK_FAINT, 'center', '2.6px')
  y += 52
  text(ctx, formatInr(bill.perHead), W / 2, y, `800 52px ${MONO}`, SAFFRON, 'center')
  text(ctx, '/ head', W / 2 + ctx.measureText(formatInr(bill.perHead)).width / 2 + 34, y - 4,
    `700 15px ${SANS}`, INK_SOFT, 'left')
  y += 30
  const crew = input.crew
  text(ctx, `${formatInr(bill.total)} total · split ${crew} ${crew === 1 ? 'way' : 'ways'} · ${bill.roadKm} km · ${bill.days} days`,
    W / 2, y, `600 13px ${SANS}`, INK_SOFT, 'center')
  y += 34

  // split bar + legend with the percentages
  const pct = (v: number) => Math.round((v / bill.total) * 100) || 0
  const fuelMode = isBenchFuelMode(input.mode)
  const barW = W - PAD * 2
  ctx.save()
  roundRectPath(ctx, PAD, y, barW, 12, 6)
  ctx.clip()
  const segs: Array<[number, string]> = [
    [bill.transportCost, BAR_TEAL], [bill.stayCost, BAR_SAFFRON], [bill.mealCost, BAR_PURPLE],
  ]
  let sx = PAD
  for (const [v, color] of segs) {
    const segW = barW * (v / bill.total)
    ctx.fillStyle = color
    ctx.fillRect(sx, y, Math.max(segW, 0) + 1, 12)
    sx += segW
  }
  ctx.restore()
  y += 34
  const legend: Array<[string, number, string]> = [
    [fuelMode ? 'fuel' : 'fares', pct(bill.transportCost), BAR_TEAL],
    ['stays', pct(bill.stayCost), BAR_SAFFRON],
    ['food', pct(bill.mealCost), BAR_PURPLE],
  ]
  let lx = PAD
  for (const [name, p, color] of legend) {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(lx + 4.5, y - 4, 4.5, 0, Math.PI * 2)
    ctx.fill()
    const label = `${name} ${p}%`
    ctx.font = `650 12.5px ${SANS}`
    const labelW = ctx.measureText(label).width
    text(ctx, label, lx + 14, y, `650 12.5px ${SANS}`, INK_SOFT)
    lx += 14 + labelW + 26
  }
  y += 24
  dashedRule(ctx, y, 'rgba(234, 244, 241, .25)')

  // itemized lines — every line shows its own formula
  y += 26
  y = billLine(ctx, fuelMode ? 'Fuel' : 'Fares', formatInr(bill.transportCost), bill.transportFormula, y)
  dashedRule(ctx, y - 14, 'rgba(234, 244, 241, .14)')
  y = billLine(ctx, `Stays (${bill.rooms} room${bill.rooms === 1 ? '' : 's'})`, formatInr(bill.stayCost), bill.stayFormula, y)
  dashedRule(ctx, y - 14, 'rgba(234, 244, 241, .14)')
  y = billLine(ctx, 'Meals', formatInr(bill.mealCost), bill.mealFormula, y)
  y += 6
  dashedRule(ctx, y, 'rgba(234, 244, 241, .25)')

  // wheel-time verdict
  y += 30
  const rideWord = fuelMode ? 'driving' : 'on the move'
  const wheel = bill.wheelHours < 1 ? 'Under 1h' : `~${Math.round(bill.wheelHours)}h`
  text(ctx, bill.fatigue.verdict, PAD, y, `700 13.5px ${SANS}`, INK)
  y += 19
  text(ctx, `${wheel} ${rideWord} over ${bill.days} days · ~${bill.hoursPerDay.toFixed(1)}h/day`,
    PAD, y, `400 11.5px ${SANS}`, INK_FAINT)
  y += 44

  // footer wordmark
  tracked(ctx, 'Yatraflow', W / 2, y, `800 15px ${SANS}`, ACCENT, 'center', '5px')
  y += 22
  text(ctx, 'Excludes tolls, parking & entry fees · price your own on the Plan Bench',
    W / 2, y, `400 10.5px ${SANS}`, INK_FAINT, 'center')
  y += PAD - 14

  return cropBill(canvas, y)
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Trim the scratch canvas to the drawn content (device-pixel exact). */
function cropBill(src: HTMLCanvasElement, logicalH: number): HTMLCanvasElement {
  const h = Math.min(MAX_H, Math.ceil(logicalH))
  if (h >= MAX_H) return src
  const out = document.createElement('canvas')
  out.width = W * SCALE
  out.height = h * SCALE
  const octx = out.getContext('2d')
  if (!octx) return src
  octx.drawImage(src, 0, 0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

/** Render the bill as a PNG blob at 2x for crispness. */
export function billImageBlob(bill: BenchBill, input: BenchInputs): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = drawBill(bill, input)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('PNG encoding failed'))
      }, 'image/png')
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

export type BillShareResult = 'shared' | 'copied' | 'downloaded'

/** Share / copy / download fallback chain. Resolves with what happened so the
 *  UI can toast + celebrate; throws when nothing worked. */
export async function shareBillImage(bill: BenchBill, input: BenchInputs): Promise<BillShareResult> {
  const blob = await billImageBlob(bill, input)
  const file = new File([blob], 'yatraflow-bill.png', { type: 'image/png' })

  // 1) native share sheet (mobile / platforms that expose it)
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'YatraFlow trip estimate' })
      return 'shared'
    } catch (err) {
      // AbortError = user dismissed the sheet — not a failure to report
      if (err instanceof DOMException && err.name === 'AbortError') throw err
      // otherwise fall through to clipboard / download
    }
  }

  // 2) clipboard image (Chromium/Safari ClipboardItem with png support)
  try {
    if (typeof ClipboardItem === 'function' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      return 'copied'
    }
  } catch { /* permission denied / unsupported — fall through to download */ }

  // 3) last resort: download via an object URL
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = 'yatraflow-bill.png'
    document.body.appendChild(a)
    a.click()
    a.remove()
    return 'downloaded'
  } finally {
    URL.revokeObjectURL(url)
  }
}
