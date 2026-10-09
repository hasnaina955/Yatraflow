// Compares recorded card rectangles before and after the compact card correction.
// The checker refuses widening, a missing card, and a height that stays too tall.
// `checkCompactTarget` wraps it with the capture-condition guards the browser
// script applies. It lives here (not in the browser script) so node tests can
// drive it with synthetic results: the script itself runs on import.

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

export function checkCompactTarget(result, baselines, target) {
  if (!target) return { mode: 'record' }
  /* The height target describes the populated mixed fixture. Sparse, broken
     image, long text, and alternate states stay outside it. */
  if (result.scenario !== 'mixed' || result.state !== 'populated') {
    return { mode: 'skip', reason: 'geometry comparison covers the populated mixed fixture only' }
  }
  /* Each surface owns its groups. An empty group on either side would compare
     zero rows and pass without measuring anything. */
  const surfaceGroups = { 'my-trips': ['trips'], explore: ['catalog', 'trending', 'creators'] }
  const requiredGroups = surfaceGroups[result.surface]
  if (!requiredGroups) return { mode: 'skip', reason: 'this surface carries no card geometry' }
  const baseline = baselines.find(side => side.surface === result.surface
    && side.width === result.width && side.theme === result.theme && side.state === result.state
    && side.scenario === result.scenario && side.images === result.images
    && side.exploreAuth === result.exploreAuth && side.fontMode === result.fontMode
    && side.motion === result.motion)
  if (!baseline) return { mode: 'fail', failures: ['no baseline capture matches this surface, width, theme, state, scenario, images, auth mode, font mode, and motion mode'] }
  const fontsReady = side => Boolean(side.fonts?.interface)
    && (!side.fonts?.editorialTypeInUse || Boolean(side.fonts?.editorial))
  if (!fontsReady(baseline) || !fontsReady(result)) {
    return { mode: 'fail', failures: ['loaded interface and editorial fonts are required on both sides'] }
  }
  const emptyGroups = side => requiredGroups
    .filter(group => !side.compactGeometry?.[group]?.length)
    .map(group => `${side.surface} ${group}`)
  const missingGroups = [...emptyGroups(baseline), ...emptyGroups(result)]
  if (missingGroups.length) {
    return { mode: 'fail', failures: [`no recorded cards in ${missingGroups.join(', ')}`] }
  }
  return { mode: 'compare', failures: compareCompactCardGeometry(baseline.compactGeometry ?? {}, result.compactGeometry ?? {}) }
}
