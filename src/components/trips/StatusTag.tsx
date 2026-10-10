// ============ My trips — status tag ============
// A dot plus a word. Colour never carries the status alone: the live dot is
// filled, the draft dot is a ring, and the label is always printed.
import type { TripStatus } from '../../lib/tripsPage'

const STATUS_LABEL: Record<TripStatus, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  past: 'Past',
  draft: 'Draft',
}

export function StatusTag({ status }: { status: TripStatus }) {
  return (
    <span className={`mt-tag mt-tag--${status}`}>
      <span className="mt-tag-dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  )
}
