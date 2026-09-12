// ============ Listbox index math — the pure half of the custom Select ============
// Kept out of the component so the keyboard contract is node-testable
// (tests/listbox.test.ts). The Select component (components/Select.tsx) wires
// these to real key events.

export type ListboxMove = 'down' | 'up' | 'home' | 'end'

/** Wrapping index move for a closed set of options (APG select-only combobox). */
export function moveActive(count: number, current: number, move: ListboxMove): number {
  if (count <= 0) return 0
  switch (move) {
    case 'down': return (current + 1) % count
    case 'up': return (current - 1 + count) % count
    case 'home': return 0
    case 'end': return count - 1
  }
}

/**
 * Typeahead for a listbox: the first option at-or-after `start + 1` (wrapping)
 * whose label starts with the accumulated buffer, case-insensitive.
 * Returns -1 when nothing matches — the caller keeps the previous highlight.
 */
export function typeaheadIndex(labels: readonly string[], buffer: string, start: number): number {
  const q = buffer.trim().toLowerCase()
  if (!q || labels.length === 0) return -1
  for (let step = 1; step <= labels.length; step++) {
    const i = (start + step) % labels.length
    if (labels[i].toLowerCase().startsWith(q)) return i
  }
  return -1
}
