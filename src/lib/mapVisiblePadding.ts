export interface MapInsets { top: number; bottom: number; left: number; right: number }

/** Retain at least 120px of usable map, even beside a full-height phone sheet. */
export function visibleMapPadding(size: { width: number; height: number }, insets?: MapInsets): MapInsets {
  const safe = insets ?? { top: 70, bottom: 70, left: 70, right: 70 }
  const horizontal = Math.min(1, Math.max(0, size.width - 120) / Math.max(1, safe.left + safe.right))
  const vertical = Math.min(1, Math.max(0, size.height - 120) / Math.max(1, safe.top + safe.bottom))
  return { top: Math.floor(safe.top * vertical), bottom: Math.floor(safe.bottom * vertical), left: Math.floor(safe.left * horizontal), right: Math.floor(safe.right * horizontal) }
}
