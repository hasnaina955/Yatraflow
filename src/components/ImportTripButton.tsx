// ============ Import a trip JSON ============
// One affordance, two homes: My Trips (where a user arrives with a file) and
// the trip Share tab (where they already were). It accepts both formats a user
// can arrive with — see lib/tripImport.ts for why that matters.
//
// The file input is the whole interaction: no dummy trip, no placeholder
// details to fill in first.
import { useRef } from 'react'
import { Upload } from 'lucide-react'
import type { ID } from '../data/types'
import { importTrip } from '../store/store'
import { parseTripImport, TripImportError } from '../lib/tripImport'
import { digestImportReport } from '../lib/itinerarySpec'
import { toast } from './ui'

export function ImportTripButton({ ownerId, onNavigate, className = 'btn btn-outline', label = 'Import JSON' }: {
  ownerId: ID | null
  onNavigate: (r: string) => void
  className?: string
  label?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // so re-picking the same file fires again
    if (!file) return
    if (!ownerId) { onNavigate('/auth'); return }
    try {
      const parsed = parseTripImport(await file.text())
      importTrip(parsed.trip, ownerId)
      // A gallery file also carries publish details. Say so rather than let
      // them vanish — publishing stays a deliberate step in the Share tab.
      const note = parsed.publication
        ? ' Its publish details (title, price, cover) were not applied.'
        : ''
      toast(`Imported “${parsed.trip.name}” — ${parsed.summary}.${note}`)
      // An older (or hand-written) file is fixed, not rejected — and the person
      // holding it is told exactly what was fixed and what still needs a look.
      const digest = digestImportReport(parsed.report)
      if (digest) toast(digest.message, digest.kind)
      onNavigate('/trips')
    } catch (err) {
      toast(
        err instanceof TripImportError ? err.message : 'That file could not be read.',
        'err',
      )
    }
  }

  return (
    <>
      <button className={className} onClick={() => fileRef.current?.click()}>
        <Upload size={15} aria-hidden style={{ verticalAlign: '-2px', marginRight: 5 }} />
        {label}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={e => void onFile(e)}
      />
    </>
  )
}
