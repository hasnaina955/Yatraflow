// ============ Member avatar tones ============
// A stack of three initials avatars painted the same pale mint reads as one
// blurred block: the circles overlap, so identical fills merge and the stack
// stops saying "three people". The mockup gives each circle its own approved
// colour — sea, marigold, bloom — so adjacent members stay distinguishable.
//
// Two properties have to hold at once, and they pull against each other:
//
//   1. A member's colour must be stable — across rerenders, and across the
//      reorder that happens when the same people arrive in a different order.
//      So the tone is derived from the member's identity, never from their
//      index in the render list.
//   2. Adjacent circles must never share a fill. A plain hash cannot promise
//      that: three real ids land on the same bucket often enough to be the
//      common case, and that is exactly the bug this replaced.
//
// Resolving (2) is what threatens (1), and the naive fix breaks it: walking the
// list in RENDER order means the collision is settled by whoever happens to sit
// first, so reversing the same three people swaps two of their colours. The
// tone therefore comes from a CANONICAL pass — the stack's distinct identities,
// sorted — and the result is then mapped back onto render order. For a stack of
// three or fewer identities the palette is large enough that every identity
// takes a different tone, so the canonical map is the whole answer and no
// render-order repair can fire. That is the guarantee: for a fixed set of up to
// three identities, every permutation paints the same person the same colour.
//
// Longer stacks exhaust the three-tone palette, and there the guarantee has to
// weaken to what overlap actually needs: a member is repaired only when they
// would otherwise sit on the same tone as the circle immediately to their left.
// That repair is a function of render order by necessity, so a member in a
// four-or-more stack may change tone when the cast around them changes. The
// alternative — identical neighbours — is the bug this exists to prevent.
//
// The tones are design tokens, never invented hues: `.avatar.tone-sea` and its
// siblings in styles.css pair each fill with a semantic `--pw-on-*` ink that
// clears AA in both themes. A real profile photo still wins — the tone only
// paints initials.
export const AVATAR_TONES = ['sea', 'marigold', 'bloom'] as const

export type AvatarTone = (typeof AVATAR_TONES)[number]

/** FNV-1a over the id: stable across renders, cheap, and spreads adjacent ids. */
function hashId(id: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** A blank or whitespace-only id is "no identity", not an identity called "". */
function identityOf(value: string | null | undefined): string | null {
  const seed = value?.trim()
  return seed ? seed : null
}

function bucketOf(identity: string | null, fallbackIndex: number): number {
  return identity
    ? hashId(identity) % AVATAR_TONES.length
    : Math.abs(Math.trunc(fallbackIndex)) % AVATAR_TONES.length
}

/** The first tone, walking forward from `start`, that `taken` does not hold. */
function firstFree(start: number, taken: ReadonlySet<AvatarTone>): AvatarTone {
  for (let step = 0; step < AVATAR_TONES.length; step += 1) {
    const candidate = AVATAR_TONES[(start + step) % AVATAR_TONES.length]
    if (!taken.has(candidate)) return candidate
  }
  // Every tone is taken; `start` is still deterministic and the caller's
  // adjacency repair decides whether it can stand.
  return AVATAR_TONES[start]
}

/**
 * The tone for one member, on its own.
 *
 * Use this only where a single avatar stands alone. In a stack, use
 * `assignAvatarTones`: a lone hash cannot promise that two neighbours differ,
 * which is the whole point of the stack treatment.
 */
export function avatarToneFor(identity: string | null | undefined, fallbackIndex = 0): AvatarTone {
  return AVATAR_TONES[bucketOf(identityOf(identity), fallbackIndex)]
}

/**
 * Tones for a whole stack, in render order.
 *
 * Pass the members' identities in the order they render. The result is one tone
 * per member, aligned to that order.
 *
 * Pure, and it does not touch its argument: the same list always produces the
 * same tones.
 */
export function assignAvatarTones(identities: (string | null | undefined)[]): AvatarTone[] {
  // Canonical pass: distinct identities, sorted, so the collision resolution
  // depends on WHO is in the stack and not on who renders first.
  const canonical = new Map<string, AvatarTone>()
  const claimed = new Set<AvatarTone>()
  const distinct = [...new Set(identities.map(identityOf).filter((id): id is string => id !== null))].sort()
  for (const id of distinct) {
    const tone = firstFree(bucketOf(id, 0), claimed)
    canonical.set(id, tone)
    claimed.add(tone)
  }

  // Render pass: look each identity's tone up, give an id-less row a tone no
  // known member holds, then repair only a genuine neighbour collision.
  const tones: AvatarTone[] = []
  for (let i = 0; i < identities.length; i += 1) {
    const id = identityOf(identities[i])
    let tone = id ? canonical.get(id)! : firstFree(Math.abs(Math.trunc(i)) % AVATAR_TONES.length, claimed)
    const previous = tones[i - 1]
    if (tone === previous) {
      const next = (AVATAR_TONES.indexOf(tone) + 1) % AVATAR_TONES.length
      tone = firstFree(next, new Set([previous]))
    }
    tones.push(tone)
  }
  return tones
}
