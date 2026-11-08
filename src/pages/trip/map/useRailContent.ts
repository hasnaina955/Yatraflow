// #420 slice 13: the rail content — split, pool, arcs.
//
// The needs/sights split, the live filter, the alternative pool and the story
// arcs move together. All of them are data: plain filters and memos over the
// corridor plan. The hook returns values only, never callbacks. Render-called
// helpers (`detourMinFor`, `chipsFor`, the row renderers) stay with the page — a
// later slice moves them with the rails they serve.
//
// #08 AC5: this hook no longer derives per-hit detour minutes or cost labels
// from raw `pois`. The corridor cost fact is computed once by the Map page (the
// snapshot producer), carried on the canonical drive rows, and read back from
// those rows by the rail, the marker and the card. No second suggestion engine.
import { useMemo } from 'react'
import type { PlaceHit, SegmentHit } from '../../../lib/geocode'
import { detourKm } from '../../../lib/providers/hits'
import { NEED_PURPOSES } from './pageHelpers'
import { isAlreadyAdded, type PlaceIdentity } from '../../../lib/placeIdentity'
import { clusterStoryArcs } from '../../../lib/storyArcs'

export type RailContentArgs = {
  pois: SegmentHit[]
  anchors: { lat: number; lng: number }[]
  identity: PlaceIdentity
}

export function useRailContent({ pois, anchors, identity }: RailContentArgs) {
  // Split corridor suggestions into two curated columns: need-based halts
  // (fuel/food/rest/stretch/overnight/stay) on the LEFT in teal-amber, and
  // see-&-do / sightseeing + detours on the RIGHT in scenic purple — so the
  // map tab needs no scrolling to reach either kind (§6.10 CTI tone coding).
  const needs = useMemo(
    () => pois.filter(sh => sh.segment && NEED_PURPOSES.has(sh.segment.purpose)),
    [pois],
  )
  const seeAndDo = useMemo(
    () => pois.filter(sh => sh.segment && !NEED_PURPOSES.has(sh.segment.purpose)),
    [pois],
  )
  // The number printed on its card.
  // A resolved group vote lands its winner on the timeline; those stops then
  // drop out of the see-&-do rail entirely (count included), same as the
  // “Added” state does for need halts. Name-match matches the rail's dedupe.
  // Stable derivation: the Map's held-back budget walk and the corridor
  // snapshot key must not rebuild on a hover or chip-filter render.
  const seeAndDoLive = useMemo(
    () => seeAndDo.filter(sh => !(sh.hit && isAlreadyAdded(sh.hit, identity))),
    [seeAndDo, identity],
  )
  // Story arcs: themed bundles from live, not-yet-added sights. Memoised so
  // the clustering pass (#166) only re-runs when membership actually changes.
  const arcHits = useMemo(() => seeAndDoLive.flatMap(sh => {
    const h = sh.hit
    // #345: arcs advertise "live, not-yet-added sights" — so they read the
    // SAME predicate as the rails. They used to skip the trip-presence half
    // and push places you already own.
    if (!h || isAlreadyAdded(h, identity)) return []
    return [h]
  }), [seeAndDoLive, identity])
  // #166: clustering walks the whole sight pool per render — memo it so a
  // search keystroke or shortlist toggle doesn't re-cluster 200 sights. The
  // labels are pre-split once here too (title/body were parsed twice per arc
  // per render in JSX).
  const arcs = useMemo(() => clusterStoryArcs(arcHits).map(a => {
    const sep = a.label.indexOf(':')
    return { ...a, theme: sep >= 0 ? a.label.slice(0, sep) : a.label, arcBody: sep >= 0 ? a.label.slice(sep + 1).trim() : '' }
  }), [arcHits])

  const altPool = useMemo(() => {
    type AltEntry = { h: PlaceHit; dKm: number | null }
    const all: AltEntry[] = []
    const byPurpose = new Map<string, AltEntry[]>()
    const byCategory = new Map<string, AltEntry[]>()
    const push = (map: Map<string, AltEntry[]>, key: string, e: AltEntry) => {
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    for (const r of pois) {
      const h = r.hit
      if (!h) continue
      if (isAlreadyAdded(h, identity)) continue
      const e: AltEntry = { h, dKm: detourKm(h, anchors) }
      all.push(e)
      if (h.haltPurpose) push(byPurpose, h.haltPurpose, e)
      if (h.category) push(byCategory, h.category, e)
    }
    return { all, byPurpose, byCategory }
  }, [pois, identity, anchors])

  return { needs, seeAndDoLive, altPool, arcHits, arcs }
}
