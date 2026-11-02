// ============ Display shares that sum to the whole ============
// A category table cannot print three 33% rows under a 100% footer. Rounding
// each share on its own loses or gains a point, so the displayed shares use
// largest remainder: every value keeps its integer floor, and the leftover
// points go to the largest fractions. The sum is always `total`, so the footer
// can be derived from the rows instead of hardcoded.
export function largestRemainderShares(values: number[], total = 100): number[] {
  const safe = values.map(value => (Number.isFinite(value) && value > 0 ? value : 0))
  const sum = safe.reduce((acc, value) => acc + value, 0)
  if (!(sum > 0) || !(total > 0)) return safe.map(() => 0)
  const raw = safe.map(value => (value / sum) * total)
  const floors = raw.map(value => Math.floor(value))
  const left = total - floors.reduce((acc, value) => acc + value, 0)
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  const shares = [...floors]
  for (let step = 0; step < left; step += 1) shares[order[step % order.length].index] += 1
  return shares
}
