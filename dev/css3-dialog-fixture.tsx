import React from 'react'
import { createRoot } from 'react-dom/client'
// The fixture must pull the stylesheet in itself, or Vite never injects it and
// every measurement reads an unstyled element.
import '../src/styles.css'
import { Modal } from '../src/components/ui'

/**
 * CSS-3 dialog fixture.
 *
 * It mounts the real shared `Modal` from src/components/ui.tsx, so the portal
 * behaviour, the focus trap, the Escape handler, the scroll lock and the focus
 * restoration under test are the ones the product ships. A lookalike markup
 * fixture would prove nothing about any of them.
 *
 * Query parameters:
 *   variant   `dialog` (default) or `full`
 *   theme     `light` (default) or `dark`
 *   body      `short` (default) or `long`, for the phone-width clipping case
 *   trigger   `button` (default) or `none`, whether an opener is rendered
 */

const params = new URLSearchParams(location.search)
const variant = (params.get('variant') ?? 'dialog') as 'dialog' | 'full'
const theme = params.get('theme') ?? 'light'
const body = params.get('body') ?? 'short'
const withTrigger = (params.get('trigger') ?? 'button') !== 'none'

document.documentElement.setAttribute('data-theme', theme)

const LONG = Array.from({ length: 40 }, (_, i) => (
  <p key={i}>
    Line {i + 1}. A long paragraph inside the dialog body, used to check that the sheet scrolls rather than clips
    its content at phone width.
  </p>
))

function Harness() {
  const [open, setOpen] = React.useState(true)
  const [log, setLog] = React.useState<string[]>([])

  const note = (event: string) => setLog((prev) => [...prev, event])

  return (
    <div style={{ padding: 16 }}>
      {withTrigger && (
        <button
          id="opener"
          className="btn"
          onClick={() => {
            note('opened')
            setOpen(true)
          }}
        >
          Open dialog
        </button>
      )}
      {/* A control that sits underneath the overlay, used for hit-testing. */}
      <button id="behind" className="btn" style={{ marginLeft: 8 }}>
        Behind
      </button>
      <p id="log" data-testid="log">
        {log.join(',')}
      </p>
      <Modal
        open={open}
        onClose={() => {
          note('closed')
          setOpen(false)
        }}
        title="Dialog title"
        variant={variant}
      >
        <div id="body-content">
          <p>First paragraph inside the body.</p>
          {body === 'long' ? LONG : null}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button id="confirm" className="btn btn-primary">
              Confirm
            </button>
            <button id="cancel" className="btn btn-outline">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
