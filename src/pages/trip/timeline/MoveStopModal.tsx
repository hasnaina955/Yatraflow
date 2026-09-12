// ============ Trip workspace — Timeline MoveStopModal (extracted from TimelineTab.tsx,
// restructure Phase 3) — modal of day chips to move a stop to another day.
// ============ Trip workspace — Timeline tab ============
// Mechanical extraction from src/pages/TripWorkspace.tsx (M3.4) — no behavior changes.
// Includes DaySection, DayWeatherChip, TravelPanel, HaltPlanRow, DaySpark,
// MoveStopModal and ClampedText — the whole timeline hot path.
import React, {  } from 'react'
import type { Trip, ItineraryStop } from '../../../data/types'
import { Chip, Modal } from '../../../components/ui'
export function MoveStopModal({ stop, trip, onClose, onMove }: {
  stop: ItineraryStop | null
  trip: Trip
  onClose: () => void
  onMove: (dayIndex: number) => void
}) {
  return (
    <Modal open={!!stop} onClose={onClose} title={`Move “${stop?.title ?? ''}”`}>
      <p className="muted small" style={{ marginBottom: 14 }}>Pick the day this stop should live on. The impact preview will recalculate.</p>
      <div className="chip-row">
        {trip.days.filter(d => d.stops.every(s => s.id !== stop?.id)).map(d => (
          <Chip key={d.index} tone="info" onClick={() => onMove(d.index)}>
            Day {d.index + 1}{d.title ? ` — ${d.title}` : ''}
          </Chip>
        ))}
      </div>
    </Modal>
  )
}
