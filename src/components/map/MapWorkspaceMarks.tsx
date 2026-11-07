import { Flag, House, Lightbulb, LockKeyhole, Search, X } from 'lucide-react'

export function MapStopSymbol({ order, stay = false, fixed = false }: { order: number; stay?: boolean; fixed?: boolean }) {
  return <span className="mv2-stop-symbol" aria-hidden="true">
    {stay ? <><House size={18} /><span className="mv2-stay-order">{order}</span></> : <span>{order}</span>}
    {fixed && <span className="mv2-stop-lock"><LockKeyhole size={10} /></span>}
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
      <div><span className="mv2-key-mark mv2-key-slot">F</span><div><dt>Unplanned part</dt><dd>Open it to see that part of the plan.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-search"><Search size={16} /></span><div><dt>Search result</dt><dd>A magnifier marks a place you found.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-cluster">7</span><div><dt>Grouped suggestions</dt><dd>The count badge opens as you zoom in.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-route" /><div><dt>Road geometry</dt><dd>Direction arrows follow the road.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-route is-estimated" /><div><dt>Estimated geometry</dt><dd>Dashed route, without direction arrows.</dd></div></div>
      <div><span className="mv2-key-mark mv2-key-endpoint"><Flag size={16} /></span><div><dt>Journey anchor</dt><dd>The start or end of a journey.</dd></div></div>
    </dl>
  </section>
}
