// ============ Plan Bench — "Share as image" bill capture ============
// Instead of re-drawing the bill on a canvas, we snapshot the LIVE receipt
// DOM element with html-to-image — the image is then pixel-identical to what
// the visitor sees, including the theme-aware styling. The only deliberate
// divergence: the capture always forces the DARK till-roll look (via the
// `capture-dark` override class, which pins the receipt's --receipt-*
// custom properties to the dark values) because images travel out of
// context — group chats, downloads — where the navy bill reads on any
// background. The class is added just for the frame we rasterize and
// removed right after, whatever the outcome.
//
// html-to-image is lazy-imported on first click so the landing main chunk
// never carries the library.
//
// Share chain (shareBillImage): Web Share API with the PNG file when the
// platform allows it → clipboard image when ClipboardItem supports
// image/png → plain download as the last resort. Every failure throws so
// the caller can toast (and suggest "Copy bill as text").

const PNG_NAME = 'yatraflow-bill.png'
const CAPTURE_DARK_CLASS = 'capture-dark'
const PIXEL_RATIO = 2.5

async function receiptPngBlob(node: HTMLElement): Promise<Blob> {
  // tilt hover variables would skew the snapshot — zero them for the frame
  const prevRx = node.style.getPropertyValue('--rx')
  const prevRy = node.style.getPropertyValue('--ry')
  node.style.setProperty('--rx', '0deg')
  node.style.setProperty('--ry', '0deg')
  node.classList.add(CAPTURE_DARK_CLASS)
  try {
    // double rAF: let the forced-dark styles paint before rasterizing
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(node, { pixelRatio: PIXEL_RATIO })
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    if (!blob.size) throw new Error('empty capture')
    return blob
  } finally {
    node.classList.remove(CAPTURE_DARK_CLASS)
    node.style.setProperty('--rx', prevRx)
    node.style.setProperty('--ry', prevRy)
  }
}

export type BillShareResult = 'shared' | 'copied' | 'downloaded'

/** Share / copy / download fallback chain. Resolves with what happened so the
 *  UI can toast + celebrate; throws when nothing worked. */
export async function shareBillImage(receipt: HTMLElement | null): Promise<BillShareResult> {
  if (!receipt) throw new Error('receipt not mounted')
  const blob = await receiptPngBlob(receipt)
  const file = new File([blob], PNG_NAME, { type: 'image/png' })

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
    a.download = PNG_NAME
    document.body.appendChild(a)
    a.click()
    a.remove()
    return 'downloaded'
  } finally {
    URL.revokeObjectURL(url)
  }
}
