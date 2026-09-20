// ============ Drag-and-drop reorder (Board + Timeline) ============
// Two defects found 2026-09-11 by reproducing them against the real code:
//
//  1. Same-day drop index. `useReorder`'s card-level onDrop called
//     `onMove(dragIdx, hoveredIdx)` — the HOVERED CARD's index. Dragging
//     downward therefore landed one slot too far: dropping A onto the adjacent
//     B read as `move(0, 1)` and swapped them, when the user was aiming at a
//     no-op; dropping onto the last card overshot the end. A drop onto a card
//     now resolves to an insertion SLOT (before/after, decided by the cursor's
//     half of the card), which is what "drop it here" actually means.
//
//  2. Realtime echo window. `persistTripFieldNow` called `markLocalWrite`
//     AFTER awaiting the row UPDATE. The echo guard only starts once the write
//     RESOLVES, leaving a hole the width of the whole round trip; an echo that
//     arrived first was treated as a collaborator's edit and replaced the
//     freshly reordered days with the stale server row. The reorder looked
//     like it "didn't save" even after the impact dialog was accepted.
//     `markLocalWrite` now runs before the await.
import { describe, it, expect } from 'vitest'

/**
 * Faithful model of the drop-index resolution in useReorder's onDrop
 * (src/components/ui.tsx). `slot` is an index into the list BEFORE the dragged
 * item is lifted out, so any slot past the dragged index shifts down by one.
 */
function resolveDrop(fromIdx: number, hoveredIdx: number, cursorInBottomHalf: boolean): number | null {
  let slot = cursorInBottomHalf ? hoveredIdx + 1 : hoveredIdx
  if (slot > fromIdx) slot -= 1
  return slot === fromIdx ? null : slot
}

function applyMove(list: string[], fromIdx: number, toIdx: number): string[] {
  const arr = [...list]
  const [m] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, m)
  return arr
}

describe('same-day drop index resolution', () => {
  const list = ['A', 'B', 'C', 'D']

  it('dropping onto the top half of a card inserts BEFORE it', () => {
    expect(resolveDrop(0, 2, false)).toBe(1)
    expect(applyMove(list, 0, 1)).toEqual(['B', 'A', 'C', 'D'])
  })

  it('dropping onto the bottom half of a card inserts AFTER it', () => {
    expect(resolveDrop(0, 2, true)).toBe(2)
    expect(applyMove(list, 0, 2)).toEqual(['B', 'C', 'A', 'D'])
  })

  it('dragging downward onto the ADJACENT card can be a no-op', () => {
    // A(0) onto the top half of B(1) → slot 1 → the position A already holds.
    expect(resolveDrop(0, 1, false)).toBeNull()
  })

  it('dragging downward onto the adjacent card still moves when aimed at its lower half', () => {
    expect(resolveDrop(0, 1, true)).toBe(1)
    expect(applyMove(list, 0, 1)).toEqual(['B', 'A', 'C', 'D'])
  })

  it('dragging UP resolves correctly from either half', () => {
    // D(3) onto the top half of B(1) → slot 1 (before B)
    expect(resolveDrop(3, 1, false)).toBe(1)
    expect(applyMove(list, 3, 1)).toEqual(['A', 'D', 'B', 'C'])
    // D(3) onto the bottom half of B(1) → slot 2 (after B)
    expect(resolveDrop(3, 1, true)).toBe(2)
    expect(applyMove(list, 3, 2)).toEqual(['A', 'B', 'D', 'C'])
  })

  it('the last card can be reached by dropping on its bottom half', () => {
    expect(resolveDrop(0, 3, true)).toBe(3)
    expect(applyMove(list, 0, 3)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('the REGRESSION: downward drag no longer lands one slot too far', () => {
    // The old rule was `onMove(dragIdx, hoveredIdx)` — i.e. slot = hoveredIdx
    // with no shift and no half-awareness.
    const oldRule = (from: number, hovered: number) => hovered
    // A(0) onto B(1): the old rule swapped them…
    expect(applyMove(list, 0, oldRule(0, 1))).toEqual(['B', 'A', 'C', 'D'])
    // …the new rule treats the top half as "before B" = no movement.
    expect(resolveDrop(0, 1, false)).toBeNull()
  })
})

describe('cross-day move (handleMoveStopInto, shared shape)', () => {
  /** Mirror of BoardView.handleMoveStopInto / TimelineTab.handleMoveStopInto. */
  function moveInto(days: Record<number, string[]>, stopId: string, toDay: number, position: number) {
    let moved: string | undefined
    for (const k of Object.keys(days)) {
      const d = Number(k)
      const i = days[d].indexOf(stopId)
      if (i >= 0) { [moved] = days[d].splice(i, 1); break }
    }
    if (moved !== undefined) {
      const pos = Math.max(0, Math.min(position, days[toDay].length))
      days[toDay].splice(pos, 0, moved)
    }
    return days
  }

  it('lands at the requested position', () => {
    expect(moveInto({ 0: ['A', 'B'], 1: ['C', 'D'] }, 'B', 1, 1)).toEqual({ 0: ['A'], 1: ['C', 'B', 'D'] })
  })

  it('clamps a position past the end to the end', () => {
    expect(moveInto({ 0: ['A', 'B'], 1: ['C'] }, 'B', 1, 99)).toEqual({ 0: ['A'], 1: ['C', 'B'] })
  })

  it('clamps a negative position to the front', () => {
    expect(moveInto({ 0: ['A', 'B'], 1: ['C'] }, 'B', 1, -5)).toEqual({ 0: ['A'], 1: ['B', 'C'] })
  })

  it('reindexes the source day so its stops stay contiguous', () => {
    const days = moveInto({ 0: ['A', 'B', 'C'], 1: ['D'] }, 'B', 1, 0)
    expect(days[0]).toEqual(['A', 'C'])
  })
})

// ============ Explicit move commands (Timeline up/down buttons) ============
// Defect found 2026-09-17 by clicking the real control: every Timeline stop's
// up/down arrow did nothing at all.
//
// `useReorder` handed BOTH contracts through one callback — a drag drop and the
// arrow buttons — and DaySection resolved the destination by reading
// `insertRef.current`, the live drag insertion slot. Outside a drag that ref is
// null, so it fell back to `fromIdx`, `toIdx` equalled `fromIdx`, and the
// guarded mutation was skipped every time. Board's own arrows were unaffected
// because Board implements them outside `useReorder`.
//
// The fix threads an explicit `ReorderSource` so the two contracts stop
// sharing a resolution rule: a `drag` still reads the insertion slot, a
// `command` carries its own destination.

/** Mirror of useReorder's returned moveUp/moveDown guard + the destination it
 *  passes (`onMove(idx, idx ± 1, 'command')`). */
function commandMove(list: string[], fromIdx: number, dir: 'up' | 'down'): string[] {
  if (dir === 'up' && !(fromIdx > 0)) return list
  if (dir === 'down' && !(fromIdx < list.length - 1)) return list
  const toIdx = dir === 'up' ? fromIdx - 1 : fromIdx + 1
  return toIdx === fromIdx ? list : applyMove(list, fromIdx, toIdx)
}

/** Mirror of the source-aware resolution in DaySection's callback. */
function resolveForSource(
  fromIdx: number,
  commandToIdx: number,
  source: 'drag' | 'command',
  insertSlot: number | null,
): number | null {
  const toIdx = source === 'command'
    ? commandToIdx
    : (() => { const idx = insertSlot ?? fromIdx; return idx > fromIdx ? idx - 1 : idx })()
  return toIdx === fromIdx ? null : toIdx
}

describe('explicit move commands resolve to their own destination', () => {
  const list = ['Cheeyappara', 'Valara', 'Resort', 'Park']

  it('moves a stop up one position', () => {
    expect(commandMove(list, 1, 'up')).toEqual(['Valara', 'Cheeyappara', 'Resort', 'Park'])
  })

  it('moves a stop down one position', () => {
    expect(commandMove(list, 1, 'down')).toEqual(['Cheeyappara', 'Resort', 'Valara', 'Park'])
  })

  it('is a no-op at the boundaries the buttons disable themselves on', () => {
    expect(commandMove(list, 0, 'up')).toEqual(list)
    expect(commandMove(list, list.length - 1, 'down')).toEqual(list)
  })

  it('resolves a command to the requested index even with no drag in flight', () => {
    // The reported defect: a button click has no insertion slot.
    expect(resolveForSource(1, 0, 'command', null)).toBe(0)
    expect(resolveForSource(1, 2, 'command', null)).toBe(2)
  })

  it('still resolves a DRAG through the insertion slot, not the passed index', () => {
    // Board and Timeline drags deliberately ignore the hit-tested index in
    // favour of the live slot, including its removal shift.
    expect(resolveForSource(0, 9, 'drag', 2)).toBe(1)
    expect(resolveForSource(3, 0, 'drag', 1)).toBe(1)
    expect(resolveForSource(0, 9, 'drag', 0)).toBeNull()
  })

  it('the REGRESSION: reading the insertion slot for a command is always a no-op', () => {
    // The old rule, verbatim: no `source`, destination derived from the slot.
    const oldRule = (fromIdx: number, insertSlot: number | null) => {
      const idx = insertSlot ?? fromIdx
      const toIdx = idx > fromIdx ? idx - 1 : idx
      return toIdx === fromIdx ? null : toIdx
    }
    // A button click never has a slot, so every arrow resolved to "no move" —
    // the exact silent no-op that shipped.
    expect(oldRule(1, null)).toBeNull()
    expect(oldRule(2, null)).toBeNull()
    // …while the fixed command path does move.
    expect(resolveForSource(1, 0, 'command', null)).toBe(0)
  })
})
