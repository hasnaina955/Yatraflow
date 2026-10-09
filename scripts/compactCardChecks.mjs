// Compares recorded card rectangles before and after the compact card correction.
// The checker refuses widening, a missing card, and a height that stays too tall.

const groups = ['trips', 'catalog', 'trending', 'creators']
const columns = rows => {
  if (!rows.length) return 0
  const firstTop = Math.min(...rows.map(row => row.top))
  return rows.filter(row => Math.abs(row.top - firstTop) <= 2).length
}

export function compareCompactCardGeometry(before, after) {
  const failures = []
  for (const group of groups) {
    const previous = before[group]
    const current = after[group]
    if (!Array.isArray(previous) || !Array.isArray(current)) {
      failures.push(`${group}: missing geometry`)
      continue
    }
    const keys = rows => rows.map(row => row.key).sort().join('\n')
    if (keys(previous) !== keys(current)) {
      failures.push(`${group}: card keys changed`)
      continue
    }
    if (new Set(current.map(row => row.key)).size !== current.length) {
      failures.push(`${group}: duplicate card keys`)
    }
    if (columns(previous) !== columns(current)) failures.push(`${group}: columns changed`)
    for (const oldRow of previous) {
      const row = current.find(item => item.key === oldRow.key)
      if (![row.width, row.height, oldRow.width, oldRow.height].every(value => Number.isFinite(value) && value > 0)) {
        failures.push(`${group}: invalid rectangle for ${row.key}`)
        continue
      }
      if (Math.abs(row.width - oldRow.width) > 2) failures.push(`${group}: width changed for ${row.key}`)
      if (group === 'trips' && row.height > oldRow.height + 2) failures.push(`${group}: height grew for ${row.key}`)
      if (['catalog', 'trending'].includes(group) && row.height > oldRow.height * 0.85) {
        failures.push(`${group}: height did not decrease by 15 percent for ${row.key}`)
      }
      if (group === 'creators' && row.height >= oldRow.height) failures.push(`${group}: height did not decrease for ${row.key}`)
    }
  }
  return failures
}
