import type { Trip } from '../../../data/types'
import { uid } from '../../../data/seed'
import type { DrivingPlan } from '../../../lib/ridePlan'
import type { ApplyChange } from '../../../lib/mutationLifecycle'
import { acknowledgedReceiptOf } from '../../../lib/previewChain'
import { isoAddDays } from '../../../lib/weather'

/** Route advice uses the same driving plan as the map's travel clock. */
export function travelDayAdviceFor(plan: DrivingPlan, currentDays: number, actions: { onApply: () => void; onKeep: () => void }) {
  if (plan.clock.verdict !== 'ok' || plan.split == null) return null
  return <TravelDayAdvice currentDays={currentDays} neededDays={plan.dayCount} {...actions} />
}

function dayShellSignature(day: Trip['days'][number] | undefined): string {
  return JSON.stringify(day == null ? null : Object.entries(day).sort(([a], [b]) => a.localeCompare(b)))
}

/** Apply and Undo both stage changes through the workspace writer. */
export function applyTravelDays(trip: Trip, plan: DrivingPlan, applyChange: ApplyChange, onKept: (undo: () => void) => void): boolean {
  const add = plan.dayCount - trip.days.length
  if (plan.clock.verdict !== 'ok' || plan.split == null || !Number.isInteger(add) || add <= 0) return false
  const next = Math.max(...trip.days.map(day => day.index)) + 1
  const added = Array.from({ length: add }, (_, index) => ({
    id: uid('day'), index: next + index, title: `Travel day ${trip.days.length + index + 1}`, startTime: '08:30', stops: [],
  }))
  const oldEnd = trip.endDate
  const newEnd = oldEnd ? isoAddDays(oldEnd, add) : oldEnd
  const originalIds = trip.days.map(day => day.id)
  applyChange(draft => {
    if (draft.endDate !== oldEnd || JSON.stringify(draft.days.map(day => day.id)) !== JSON.stringify(originalIds)) throw new Error('The trip days changed. Apply the advice again.')
    draft.days.push(...structuredClone(added))
    draft.days.sort((a, b) => a.index - b.index)
    draft.endDate = newEnd
  }, 'add', -1, receipt => {
    if (acknowledgedReceiptOf(receipt) == null) return
    onKept(() => applyChange(draft => {
      if (draft.endDate !== newEnd || added.some(day => dayShellSignature(draft.days.find(current => current.id === day.id)) !== dayShellSignature(day))) throw new Error('The added days changed. Remove them from the plan to keep later edits.')
      const addedIndexes = new Set(added.map(day => day.index))
      if (draft.flights?.some(flight => addedIndexes.has(flight.dayIndex)) || draft.fixedCommitments.some(item => addedIndexes.has(item.dayIndex))) throw new Error('The added days changed. Remove their flights and commitments before Undo.')
      const addedIds = new Set(added.map(day => day.id))
      draft.days = draft.days.filter(day => !addedIds.has(day.id))
      draft.endDate = oldEnd
    }, 'edit', -1))
  })
  return true
}

/** The existing travel-day action adds empty days; it does not preview a new road. */
export function TravelDayAdvice({ currentDays, neededDays, onApply, onKeep }: {
  currentDays: number
  neededDays: number
  onApply: () => void
  onKeep: () => void
}) {
  const add = neededDays - currentDays
  if (!Number.isInteger(add) || add <= 0) return null
  return <div className="mv2-travel-day-actions">
    <p>New days · Empty · Existing dates unchanged</p>
    <button type="button" className="btn btn-primary btn-sm" onClick={onApply}>Apply - add {add} day{add === 1 ? '' : 's'}</button>
    <button type="button" className="btn btn-ghost btn-sm" onClick={onKeep}>Keep my {currentDays}-day plan</button>
  </div>
}
