import React from 'react'
import { createRoot } from 'react-dom/client'
// The fixture must pull the stylesheet in itself, or Vite never injects it and
// every measurement reads an unstyled element.
import '../src/styles.css'
import { ToastZone, toast, undoToast } from '../src/components/ui'

/**
 * CSS-3 toast fixture.
 *
 * It drives the real `toast` / `undoToast` API and renders the real
 * `ToastZone`, so the live region, the role assignment, the hover and focus
 * hold and the timers under test are the ones the product ships.
 *
 * Query parameters:
 *   theme   `light` (default) or `dark`
 *   kind    `ok` (default), `err`, `undo`, or `many`
 */

const params = new URLSearchParams(location.search)
const theme = params.get('theme') ?? 'light'
const kind = params.get('kind') ?? 'ok'

document.documentElement.setAttribute('data-theme', theme)

function Harness() {
  const fired = React.useRef(false)
  React.useEffect(() => {
    // `toast()` calls a module-level hook that ToastZone publishes on mount.
    // Firing in the same effect pass can run before that hook exists, and the
    // call would be a silent no-op, so wait one tick.
    if (fired.current) return
    fired.current = true
    const t = window.setTimeout(() => {
      if (kind === 'ok') toast('Trip saved')
      else if (kind === 'err') toast('Could not save the trip', 'err')
      else if (kind === 'undo') undoToast('Stop deleted', () => {})
      else if (kind === 'many') {
        toast('First toast')
        toast('Second toast', 'err')
        undoToast('Third toast', () => {})
      }
    }, 60)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <p>Toast fixture</p>
      <ToastZone />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
