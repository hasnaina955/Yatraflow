// ============ ToolbarMenu — a toolbar popover that cannot be clipped ============
// The timeline toolbar scrolls horizontally on a phone (`overflow-x: auto`), and
// an absolutely-positioned panel inside a scroll container is clipped by it: the
// ⋯ menu opened, then painted under the trip ribbon with nothing clickable. A
// portal to document.body escapes every ancestor's overflow and backdrop-filter,
// which is the same reason App.tsx portals its notification and account menus.
//
// A portaled panel is out of flow, so it needs `position: fixed` and the
// trigger's viewport rect, written to the panel's own custom properties once it
// exists. It re-syncs on resize and on any scroll (capture, so a nested scroller
// counts), because a fixed panel does not travel with the button it belongs to.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const GAP = 8

export function ToolbarMenu({ label, className, icon, children }: {
  label: string
  className?: string
  icon: ReactNode
  /** Receives a close callback: a menu item that navigates or opens a dialog
   *  must dismiss the panel in the same press. */
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const sync = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Written to the panel's own custom properties, never as an inline style
    // prop: the page-consistency ratchet forbids one in page files, and a
    // floating panel still has to carry a measured viewport position.
    const panel = menuRef.current
    if (!panel) return
    panel.style.setProperty('--menu-top', `${r.bottom + GAP}px`)
    panel.style.setProperty('--menu-right', `${Math.max(8, window.innerWidth - r.right)}px`)
  }, [])

  const close = useCallback(() => setOpen(false), [])

  // A portaled panel is out of flow, so it needs the trigger's viewport rect
  // before it can be placed. The panel does not exist until the open render
  // commits, which is why this runs on the effect rather than in the handler.
  useLayoutEffect(() => {
    if (open) sync()
  }, [open, sync])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus({ preventScroll: true })
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [open, sync])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { if (!open) sync(); setOpen(o => !o) }}
      >
        {icon}
      </button>
      {open && createPortal(
        <div ref={menuRef} className={`${className}-menu`} role="menu">
          {children(close)}
        </div>,
        document.body,
      )}
    </>
  )
}
