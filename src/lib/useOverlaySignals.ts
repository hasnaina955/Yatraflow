// ============ Overlay signals for the phone chrome ============
// Two hooks that the universal Add control (#1064) and the web bottom tab bar
// (row 27a) share, so both hide for the same reasons at the same time.

import { useEffect, useState } from 'react'
import { raisesKeyboard } from './universalAdd'

/** A modal surface is open. Modal, the Chakra drawer and the stop sheet all
 *  lock the page with an inline `overflow: hidden` on <body>: one signal. */
export function useBodyLocked(): boolean {
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    const read = () => { setLocked(document.body.style.overflow === 'hidden') }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.body, { attributes: true, attributeFilter: ['style'] })
    return () => { mo.disconnect() }
  }, [])
  return locked
}

/** A text field has focus, so the phone keyboard is up. */
export function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false)
  useEffect(() => {
    let current = false
    let focused: HTMLElement | null = null
    let mo: MutationObserver | null = null
    const stopWatch = () => { mo?.disconnect(); mo = null; focused = null }
    const read = () => {
      const active = document.activeElement as (HTMLElement & { type?: string; readOnly?: boolean }) | null
      const next = raisesKeyboard(active)
      if (next !== current) {
        current = next
        setUp(next)
      }
      if (next && active) {
        if (focused !== active) {
          stopWatch()
          focused = active
          // A removed input skips focusout; re-read when it leaves the DOM.
          mo = new MutationObserver(() => { if (!focused?.isConnected) read() })
          mo.observe(document.body, { childList: true, subtree: true })
        }
      } else {
        stopWatch()
      }
    }
    // focusout fires before the next element takes focus; read after it lands.
    let timer = 0
    const onOut = () => { window.clearTimeout(timer); timer = window.setTimeout(read, 0) }
    read()
    document.addEventListener('focusin', read)
    document.addEventListener('focusout', onOut)
    return () => {
      stopWatch()
      window.clearTimeout(timer)
      document.removeEventListener('focusin', read)
      document.removeEventListener('focusout', onOut)
    }
  }, [])
  return up
}
