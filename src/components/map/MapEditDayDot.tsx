import type { CSSProperties, ReactNode } from 'react'
import { dayColor } from '../../lib/mapStyles/dayColors'

/** The day's palette dot. It owns the one inline custom property, so the page
 *  files stay free of inline styles (page-consistency rule d) while the colour
 *  still comes from src/lib/mapStyles/dayColors.ts alone. */
export function MapEditDayDot({ dayIndex, order }: { dayIndex: number | null; order: ReactNode }) {
  return (
    <span className="map-edit-day-dot" style={{ '--day': dayColor(dayIndex ?? 0) } as CSSProperties} aria-hidden="true">{order}</span>
  )
}