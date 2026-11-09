// Pure rules to frame a route. The camera must keep marks clear of the panels,
// the journey bar and the attribution. Nothing here reads the DOM or the map.

export interface FrameRect { left: number; top: number; right: number; bottom: number }
export interface FrameInsets { top: number; bottom: number; left: number; right: number }

/** Room a mark needs beyond its coordinate: the badge above, the clock pill below. */
export const MARK_FRAME_MARGIN: FrameInsets = { top: 22, bottom: 46, left: 48, right: 48 }

const ZERO: FrameInsets = { top: 0, bottom: 0, left: 0, right: 0 }

/**
 * How far each edge of the canvas is covered by overlays. A tall overlay on the left or
 * right half covers that side. A wide overlay covers the top or the bottom. A small corner
 * control covers nothing, because a mark under it is still reachable around it.
 */
export function coverInsets(canvas: FrameRect, covers: FrameRect[]): FrameInsets {
  const width = canvas.right - canvas.left
  const height = canvas.bottom - canvas.top
  const out = { ...ZERO }
  if (width <= 0 || height <= 0) return out
  for (const cover of covers) {
    const left = Math.max(cover.left, canvas.left)
    const right = Math.min(cover.right, canvas.right)
    const top = Math.max(cover.top, canvas.top)
    const bottom = Math.min(cover.bottom, canvas.bottom)
    if (right <= left || bottom <= top) continue
    const widthShare = (right - left) / width
    const heightShare = (bottom - top) / height
    const centreX = (left + right) / 2 - canvas.left
    const centreY = (top + bottom) / 2 - canvas.top
    if (heightShare >= 0.6 && widthShare < 0.6) {
      if (centreX < width / 2) out.left = Math.max(out.left, right - canvas.left)
      else out.right = Math.max(out.right, canvas.right - left)
    } else if (widthShare >= 0.3) {
      if (centreY < height / 2) out.top = Math.max(out.top, bottom - canvas.top)
      else out.bottom = Math.max(out.bottom, canvas.bottom - top)
    }
  }
  return out
}

/** The larger of the stored insets and the measured covers, per edge. */
export function mergeInsets(base: FrameInsets, measured: FrameInsets): FrameInsets {
  return {
    top: Math.max(base.top, measured.top),
    bottom: Math.max(base.bottom, measured.bottom),
    left: Math.max(base.left, measured.left),
    right: Math.max(base.right, measured.right),
  }
}

export function addInsets(a: FrameInsets, b: FrameInsets): FrameInsets {
  return { top: a.top + b.top, bottom: a.bottom + b.bottom, left: a.left + b.left, right: a.right + b.right }
}

/** Keep at least `minOpen` px of open canvas. Shrink all four edges by one shared ratio. */
export function clampInsets(size: { width: number; height: number }, insets: FrameInsets, minOpen = 120): FrameInsets {
  const horizontal = Math.min(1, Math.max(0, size.width - minOpen) / Math.max(1, insets.left + insets.right))
  const vertical = Math.min(1, Math.max(0, size.height - minOpen) / Math.max(1, insets.top + insets.bottom))
  return {
    top: Math.floor(insets.top * vertical),
    bottom: Math.floor(insets.bottom * vertical),
    left: Math.floor(insets.left * horizontal),
    right: Math.floor(insets.right * horizontal),
  }
}

/** The open rectangle in canvas pixels, after the insets. */
export function safeRect(size: { width: number; height: number }, insets: FrameInsets): FrameRect {
  return { left: insets.left, top: insets.top, right: size.width - insets.right, bottom: size.height - insets.bottom }
}

export interface FrameBox { x: number; y: number; w: number; h: number }

/**
 * How many pixels each edge must grow so every box (centred on x and y) fits in `safe`.
 * Zero on an edge means that edge already holds all the boxes.
 */
export function frameOverflow(boxes: FrameBox[], safe: FrameRect): FrameInsets {
  const out = { ...ZERO }
  for (const box of boxes) {
    out.left = Math.max(out.left, Math.ceil(safe.left - (box.x - box.w / 2)))
    out.right = Math.max(out.right, Math.ceil(box.x + box.w / 2 - safe.right))
    out.top = Math.max(out.top, Math.ceil(safe.top - (box.y - box.h / 2)))
    out.bottom = Math.max(out.bottom, Math.ceil(box.y + box.h / 2 - safe.bottom))
  }
  return out
}

export function hasOverflow(overflow: FrameInsets): boolean {
  return overflow.top > 0 || overflow.bottom > 0 || overflow.left > 0 || overflow.right > 0
}
