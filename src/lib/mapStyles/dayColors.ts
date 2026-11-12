// ============ The one day palette ============
// The map line, the marker ink and the edit card dot all read these values.
// Brick clears amber by 28 degrees in hue, so no two orange days collide.
export const DAY_COLORS = ['#0D8D82', '#C27109', '#7D5EFC', '#E15279', '#228CC8', '#4A9539', '#CE5245'] as const

/** The colour for a day index. It wraps, so any index is safe. */
export function dayColor(index: number): string {
  const length = DAY_COLORS.length
  const i = ((Math.trunc(index) % length) + length) % length
  return DAY_COLORS[i]
}
