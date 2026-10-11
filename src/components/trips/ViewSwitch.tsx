// ============ My trips — Grid | List switch ============
// A thin caller of SegmentedTabs. The two layouts are a pressed-state group,
// not tabs, so it uses the toggle semantics and keeps the mt-seg look. The group
// also sets data-layout to the active layout, the attribute the mt-seg glider reads.
import { LayoutGrid, List } from 'lucide-react'
import { SegmentedTabs, type SegmentedTabItem } from '../page/SegmentedTabs'

export type TripsLayout = 'grid' | 'list'

const LAYOUT_ITEMS: readonly SegmentedTabItem[] = [
  { key: 'grid', label: 'Grid', icon: <LayoutGrid size={15} aria-hidden /> },
  { key: 'list', label: 'List', icon: <List size={15} aria-hidden /> },
]

export function ViewSwitch({ layout, onChange }: { layout: TripsLayout; onChange: (next: TripsLayout) => void }) {
  return (
    <SegmentedTabs semantics="toggle" className="mt-seg" label="Layout" items={LAYOUT_ITEMS} value={layout}
      dataAttrs={{ 'data-layout': layout }} onChange={key => onChange(key as TripsLayout)} />
  )
}
