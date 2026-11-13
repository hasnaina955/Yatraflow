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
    <p>Adds empty days. Existing stops keep their dates.</p>
    <button type="button" className="btn btn-primary btn-sm" onClick={onApply}>Apply - add {add} day{add === 1 ? '' : 's'}</button>
    <button type="button" className="btn btn-ghost btn-sm" onClick={onKeep}>Keep my {currentDays}-day plan</button>
  </div>
}
