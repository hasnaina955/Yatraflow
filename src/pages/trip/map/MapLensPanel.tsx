// One deck for the active Map lens. The panel renders exactly one deck and
// passes every deck callback through as a prop. It reads no store, no map and
// no provider.
import { DriveTabs } from '../../../components/map/lenses/DriveTabs'
import { FixDeck } from '../../../components/map/lenses/FixDeck'
import { GapDeck } from '../../../components/map/lenses/GapDeck'
import { LensDeckHeader } from '../../../components/map/lenses/LensDeckHeader'
import { StayDeck, type RingId } from '../../../components/map/lenses/StayDeck'
import type { DriveCardStrip, DriveTab, ScopeBand } from './driveLens'
import type { DriveLensRow, FixChangeSet } from '../../../lib/mapLensContracts'
import type { PlaceHit } from '../../../lib/geocode'
import type { GapPick } from './gapLens'
import type { StayPick } from './stayLens'
import type { MapLensId, MapLenses } from './useMapLenses'

type DriveRow = DriveLensRow

export interface MapLensPanelProps {
  lens: MapLensId
  lenses: MapLenses
  dayLabel: string
  dayNumber: number
  clock: (min: number) => string
  activeDriveTab: DriveTab | null
  onDriveTab: (tab: DriveTab) => void
  stripOf: (row: DriveRow) => DriveCardStrip
  bandOf: (row: DriveRow) => ScopeBand
  introOf: (row: DriveRow) => string | null
  onOpenDrive: (row: DriveRow) => void
  onAddDrive: (row: DriveRow) => void
  activeStayWindow: string | null
  onStayWindow: (id: string) => void
  stayRing: RingId
  onStayRing: (id: RingId) => void
  onOpenStayPick: (pick: StayPick) => void
  onAddStayPick: (pick: StayPick) => void
  onSetStay: () => void
  onOpenGapPick: (pick: GapPick) => void
  onAddGapPick: (pick: GapPick) => void
  onApplyFix: (set: FixChangeSet) => void
  onPreviewFix: (set: FixChangeSet) => void
  /** The Keep action of the deck cards. Absent hides the heart. */
  onShortlist?: (hit: PlaceHit) => void
  /** True draws the kept heart on a card. */
  shortlistedOf?: (hit: PlaceHit) => boolean
  /** The deck fold handler. Absent uses the Map tab fold button. */
  onFold?: () => void
}

/** The stay deck when the base exists but no free window is known. */
function StayWindowUnknown({ onClose }: { onClose?: () => void }) {
  return <section className="mv2-lens-deck" aria-label="Around the stay">
    <LensDeckHeader kicker="Around the stay" title="Around the stay" onClose={onClose} />
    <p className="mv2-lens-phase">The free time around this stay is unknown for this day.</p>
  </section>
}

export function MapLensPanel(props: MapLensPanelProps) {
  const { lens, lenses } = props
  if (lens === 'drive') {
    const groups = lenses.drive.tabs.tabs
    const active = groups.find(group => group.tab === props.activeDriveTab) ?? groups[0]
    const intro = active?.shown[0] ? props.introOf(active.shown[0]) : null
    return <DriveTabs
      result={lenses.drive.tabs}
      activeTab={props.activeDriveTab}
      onTab={props.onDriveTab}
      intro={intro}
      stripOf={props.stripOf}
      bandOf={props.bandOf}
      nameOf={row => row.row.hit.name}
      onOpen={props.onOpenDrive}
      onAdd={props.onAddDrive}
      dayNumber={props.dayNumber}
      reasonOf={row => row.row.reason}
      {...(props.onShortlist == null ? {} : { onShortlist: props.onShortlist })}
      {...(props.shortlistedOf == null ? {} : { shortlistedOf: props.shortlistedOf })}
      onClose={props.onFold}
    />
  }
  if (lens === 'stay') {
    const stay = lenses.stay
    if (stay.needsBase || stay.base == null) {
      return <StayDeck
        dayNumber={props.dayNumber}
        dayLabel={props.dayLabel}
        baseName={null}
        windows={[]}
        activeWindowId={null}
        onWindow={props.onStayWindow}
        result={{ kind: 'needs-base' }}
        ringId={props.stayRing}
        onRing={props.onStayRing}
        onOpenPick={props.onOpenStayPick}
        onAddPick={props.onAddStayPick}
        {...(props.onShortlist == null ? {} : { onShortlist: props.onShortlist })}
        {...(props.shortlistedOf == null ? {} : { shortlistedOf: props.shortlistedOf })}
        onSetStay={props.onSetStay}
        clock={props.clock}
        onClose={props.onFold}
      />
    }
    if (stay.windowUnknown) return <StayWindowUnknown onClose={props.onFold} />
    const activeWindow = stay.windows.find(window => window.id === props.activeStayWindow)
      ?? stay.windows[0]
    const result = activeWindow == null
      ? { kind: 'phase' as const, phase: stay.phase === 'needs-base' ? 'empty' as const : stay.phase }
      : stay.picks[activeWindow.id] ?? { kind: 'phase' as const, phase: stay.phase === 'needs-base' ? 'empty' as const : stay.phase }
    return <StayDeck
      dayNumber={props.dayNumber}
      dayLabel={props.dayLabel}
      baseName={stay.base.name}
      windows={stay.windows}
      activeWindowId={activeWindow?.id ?? null}
      onWindow={props.onStayWindow}
      result={result}
      ringId={props.stayRing}
      onRing={props.onStayRing}
      onOpenPick={props.onOpenStayPick}
      onAddPick={props.onAddStayPick}
      {...(props.onShortlist == null ? {} : { onShortlist: props.onShortlist })}
      {...(props.shortlistedOf == null ? {} : { shortlistedOf: props.shortlistedOf })}
      onSetStay={props.onSetStay}
      clock={props.clock}
      onClose={props.onFold}
    />
  }
  if (lens === 'gap') {
    return <GapDeck
      dayNumber={props.dayNumber}
      phase={lenses.gap.phase}
      gaps={lenses.gap.gaps}
      onOpenPick={props.onOpenGapPick}
      onAddPick={props.onAddGapPick}
      {...(props.onShortlist == null ? {} : { onShortlist: props.onShortlist })}
      {...(props.shortlistedOf == null ? {} : { shortlistedOf: props.shortlistedOf })}
      clock={props.clock}
      onClose={props.onFold}
    />
  }
  return <FixDeck
    phase={lenses.fix.phase}
    dayNumber={props.dayNumber}
    problem={lenses.fix.problem}
    fixes={lenses.fix.fixes}
    onApply={props.onApplyFix}
    onPreview={props.onPreviewFix}
    onClose={props.onFold}
  />
}
