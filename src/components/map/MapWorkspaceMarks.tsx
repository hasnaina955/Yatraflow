import { Armchair, Binoculars, BedDouble, Building2, Castle, Church, Coffee, Droplets, FerrisWheel, Flag, Flower2, Footprints, Fuel, House, Landmark, Leaf, Lightbulb, LockKeyhole, Mountain, MountainSnow, PlugZap, Search, Ship, Store, Sunrise, Trees, TreeDeciduous, Umbrella, Utensils, Waves, X, Drama, type LucideIcon } from 'lucide-react'
import { placeSubtype } from '../../lib/mapStyles/placeMarks'
import './mapMarks.css'

/** The subtype glyphs. One rule for the map mark and the deck card tile. */
export const SUBTYPE_ICON: Record<string, LucideIcon> = {
  waterfall: Waves, backwater: Ship, dam: Droplets, lake: Droplets, river: Waves, beach: Umbrella,
  wildlife: Trees, garden: Flower2, cave: Mountain, trek: Footprints, estate: Leaf, forest: TreeDeciduous,
  sun: Sunrise, viewpoint: Binoculars, peak: MountainSnow, hill: Mountain,
  mosque: Landmark, church: Church, gurdwara: Landmark, monastery: Landmark, temple: Landmark,
  fort: Castle, palace: Castle, ruins: Building2, monument: Landmark, museum: Building2,
  market: Store, amusement: FerrisWheel, show: Drama, adventure: Mountain,
  meal: Utensils, cafe: Coffee, fuel: Fuel, ev: PlugZap, rest: Armchair, stay: BedDouble, sight: Binoculars,
}

/** A pick tile by place subtype. The letter, when given, is the rank among picks for one gap. */
export function PlaceSubtypeMark({ category, name, size = 15, letter }: { category?: string | null; name?: string | null; size?: number; letter?: 'A' | 'B' | 'C' | null }) {
  const subtype = placeSubtype({ category, name })
  const Icon = SUBTYPE_ICON[subtype.key] ?? Binoculars
  return <span className="mv2-subtype-mark" data-family={subtype.family} data-subtype={subtype.key} aria-hidden="true">
    <Icon size={size} strokeWidth={1.75} />
    {letter && <span className="mv2-pick-letter">{letter}</span>}
  </span>
}

/** A problem with a fix. The parent supplies the facts. `text` is the short
 *  visible label built from real facts. Absent keeps the mark bare. */
export function WarningDiamond({ label, severe = false, onOpen }: { label: string; severe?: boolean; onOpen?: () => void }) {
  return <button type="button" className={`mv2-warn-diamond${severe ? ' is-severe' : ''}`} aria-label={label} title={label} onClick={onOpen}><b aria-hidden="true">!</b></button>
}

export function MapStopSymbol({ order, stay = false, fixed = false, warn = false }: { order: number; stay?: boolean; fixed?: boolean; warn?: boolean }) {
  return <span className="mv2-stop-symbol" aria-hidden="true">
    {stay ? <><House size={18} /><span className="mv2-stay-order">{order}</span></> : <span>{order}</span>}
    {fixed && <span className="mv2-stop-lock"><LockKeyhole size={10} /></span>}
    {warn && <span className="mv2-stop-warn"><b>!</b></span>}
  </span>
}

export function MapWorkspaceKey({ id, onClose }: { id: string; onClose: () => void }) {
  return <section id={id} className="map-legend-body mv2-map-key" aria-label="Map key" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose() }
  }}>
    <header><strong>Read the map</strong><button type="button" className="mv2-icon-btn" aria-label="Close map key" onClick={onClose}><X size={16} /></button></header>
    <dl>
      <div><span className="mv2-key-mark mv2-map-stop"><MapStopSymbol order={2} /></span><div><dt>Planned stop</dt><dd>Number follows the visible stop order.</dd></div></div>
      <div><span className="mv2-key-mark mv2-map-stop is-stay"><MapStopSymbol order={3} stay /></span><div><dt>Stay</dt><dd>A house marks a stay in the plan.</dd></div></div>
      <div><span className="mv2-key-mark mv2-map-stop"><MapStopSymbol order={4} fixed /></span><div><dt>Fixed time</dt><dd>The lock marks a timed commitment.</dd></div></div>
      <div><span className="mv2-key-mark mv2-map-stop is-tentative"><MapStopSymbol order={5} /></span><div><dt>Tentative stop</dt><dd>A dashed ring means maybe.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-pick"><Lightbulb size={16} /></span><div><dt>Suggested place</dt><dd>Select it to open its details.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-pick is-selected"><Lightbulb size={16} /></span><div><dt>Selected place</dt><dd>The ring follows the open place card.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-slot">F</span><div><dt>Unplanned part</dt><dd>Open it to see that part of the plan. A letter ranks the picks for it.</dd></div></div>
      <div><span className="mv2-key-mark"><span className="mv2-warn-diamond"><b aria-hidden="true">!</b></span></span><div><dt>Problem</dt><dd>A diamond marks a problem the plan can fix.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-search"><Search size={16} /></span><div><dt>Search result</dt><dd>A magnifier marks a place you found.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-cluster">7</span><div><dt>Grouped suggestions</dt><dd>The count badge opens as you zoom in.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-route" /><div><dt>Road geometry</dt><dd>Direction arrows follow the road.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-route is-estimated" /><div><dt>Estimated geometry</dt><dd>Dashed route, without direction arrows.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-endpoint"><Flag size={16} /></span><div><dt>Journey anchor</dt><dd>The start or end of a journey.</dd></div></div>
    </dl>
  </section>
}
