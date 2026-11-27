// ============ Budget Chakra: the animated tile art ============
// The Chakra tile in the Budget first row. It is art only: no text and no
// link. Its pose follows the budget mood (src/lib/budgetMood.ts). A tap squishes
// it and sends up hearts. In the dark theme it sleeps until a tap wakes it.
//
// The button carries the accessible name. The image is decoration (alt="").
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../lib/theme'
import { mascotFile, type MascotPose } from '../../lib/mascot'
import { haptic } from '../../lib/haptics'
import { MOOD_POSE, type BudgetMood } from '../../lib/budgetMood'

/** How long a tap's reaction stays on screen, in ms. */
const REACTION_MS = 1600
/** How long an awake Chakra stays awake after the last tap, in ms (dark theme). */
const AWAKE_MS = 6000

type ChakraState = 'idle' | 'poked' | 'asleep' | 'waking'
type TimerRef = { current: number | undefined }

/** Every pose the tile can show. Loaded on mount, so a swap does not flash. */
const PRELOAD_POSES: readonly MascotPose[] = ['celebrate', 'love', 'wave', 'sleep', ...Object.values(MOOD_POSE)]

function artUrl(pose: MascotPose): string {
  return `${import.meta.env.BASE_URL}${mascotFile(pose, { animated: true, dark: false })}`
}

function cancelTimer(timer: TimerRef): void {
  if (timer.current !== undefined) window.clearTimeout(timer.current)
  timer.current = undefined
}

/** The pose a state shows. A worried budget comforts you when you tap it. */
function poseFor(state: ChakraState, mood: BudgetMood): MascotPose {
  if (state === 'asleep') return 'sleep'
  if (state === 'waking') return 'wave'
  if (state === 'poked') return mood === 'worried' ? 'love' : 'celebrate'
  return MOOD_POSE[mood]
}

export function BudgetChakra({ mood }: { mood: BudgetMood }) {
  const dark = useTheme()
  useEffect(() => {
    for (const pose of PRELOAD_POSES) {
      const img = new Image()
      img.src = artUrl(pose)
    }
  }, [])
  // A theme change remounts the art, which resets it: dark starts asleep, light starts idle.
  return <ChakraArt key={dark ? 'dark' : 'light'} mood={mood} dark={dark} />
}

function ChakraArt({ mood, dark }: { mood: BudgetMood; dark: boolean }) {
  const [state, setState] = useState<ChakraState>(dark ? 'asleep' : 'idle')
  const [pokeKey, setPokeKey] = useState(0)
  const reactTimer = useRef<number | undefined>(undefined)
  const sleepTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => {
    cancelTimer(reactTimer)
    cancelTimer(sleepTimer)
  }, [])

  function poke() {
    haptic('tick')
    setPokeKey(key => key + 1)
    cancelTimer(reactTimer)
    cancelTimer(sleepTimer)
    // A tap on a sleeping Chakra plays the wave first. Any other tap plays the reaction.
    setState(state === 'asleep' ? 'waking' : 'poked')
    reactTimer.current = window.setTimeout(() => setState('idle'), REACTION_MS)
    if (dark) sleepTimer.current = window.setTimeout(() => setState('asleep'), AWAKE_MS)
  }

  return (
    <button
      type="button"
      className="bud-chakra"
      aria-label="Poke Chakra"
      data-mood={mood}
      data-state={state}
      onClick={poke}
    >
      <img src={artUrl(poseFor(state, mood))} alt="" aria-hidden="true" decoding="async" draggable={false} />
      {pokeKey > 0 && (
        <span className="bud-chakra-burst" aria-hidden="true" key={pokeKey}>
          <i /><i /><i />
        </span>
      )}
    </button>
  )
}
