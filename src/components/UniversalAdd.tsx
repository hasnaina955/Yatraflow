// ============ Universal Add (#1064): the one phone add control ============
// Two skins of ONE control. What it offers comes from `resolveAddContext`
// (src/lib/universalAdd.ts); what it opens comes from the handlers the trip
// workspace and its tabs register (src/lib/universalAddStore.ts). This file
// only draws the control and its menu.
//
//   nav   native shell: a raised round "+" in the centre slot of BottomNav,
//         the label as a caption under it. The caption opens the menu.
//   pill  phone web (720px or less): a floating pill at the bottom right. It
//         shrinks to a round "+" on a scroll down and grows on a scroll up.
//
// Long press on the "+" opens the menu too. The menu is a real menu: arrow
// keys, Home and End move, Escape closes, and focus returns to the button.
//
// The control is never unmounted while it hides. A dialog (the Chakra drawer
// first) captures document.activeElement on open and focuses it again on
// close. The button stays connected, and focusable from script, so that
// the return lands here instead of on <body>.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, MapPin, MapPinPlus, Plus, Receipt, Route, Scale, UserPlus } from 'lucide-react'
import { resolveAddContext, tripIdOfRoute, raisesKeyboard, stepCompact, type AddAction, type AddKind } from '../lib/universalAdd'
import { registerAddMenuClose, runTripAdd, tripScopeOf, useAddSnapshot } from '../lib/universalAddStore'
import { LONG_PRESS_MS } from '../lib/touchDnd'
import { motionTiming } from '../lib/motion'
import { CREATE_PATH } from '../lib/routes'
import { Mascot } from './mascot/Mascot'

const MENU_GAP = 8
const MOVE_CANCEL_PX = 10

const KIND_ICON: Record<AddKind, ReactNode> = {
  'plan-trip': <Route size={18} aria-hidden />,
  'add-stop': <MapPinPlus size={18} aria-hidden />,
  'add-place': <MapPin size={18} aria-hidden />,
  'add-expense': <Receipt size={18} aria-hidden />,
  'add-decision': <Scale size={18} aria-hidden />,
  invite: <UserPlus size={18} aria-hidden />,
  'ask-chakra': <Mascot pose="mark-face" size={20} />,
}

/** A modal surface is open. Modal, the Chakra drawer and the stop sheet all
 *  lock the page with an inline `overflow: hidden` on <body>: one signal. */
function useBodyLocked(): boolean {
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
function useKeyboardUp(): boolean {
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

/**
 * The label. A new label cross-fades in over the old one while the box eases
 * to the new width. The width is measured, because `auto` does not animate.
 * The first paint does not animate: a load is not a change.
 */
function AddLabel({ text, compact, className, lines = false }: {
  text: string
  compact?: boolean
  className: string
  /** Break "Add stop · Day 3" into two lines (the narrow native nav column). */
  lines?: boolean
}) {
  const boxRef = useRef<HTMLSpanElement>(null)
  const textRef = useRef<HTMLSpanElement>(null)
  const last = useRef(text)
  const [prev, setPrev] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (last.current === text) return
    setPrev(last.current)
    last.current = text
    // The out copy lives for one fade. Reduced motion reads 0ms: it goes at once.
    const t = window.setTimeout(() => { setPrev(null) }, motionTiming('--motion-fast').duration)
    return () => { window.clearTimeout(t) }
  }, [text])
  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = textRef.current
    if (!box || !inner) return
    box.style.setProperty('--ua-label-w', `${inner.scrollWidth}px`)
  }, [text, compact])
  const body = (t: string) => (lines ? t.split(' · ').map(part => <span key={part} className="ua-label-line">{part}</span>) : t)
  return (
    <span ref={boxRef} className={className} data-compact={compact ? 'true' : undefined}>
      {prev !== null && <span className="ua-label-text ua-label-out" aria-hidden="true">{body(prev)}</span>}
      <span ref={textRef} key={text} className={prev !== null ? 'ua-label-text ua-label-in' : 'ua-label-text'}>{body(text)}</span>
    </span>
  )
}

export function UniversalAdd({ variant, route, signedIn, appOverlay, onNavigate }: {
  variant: 'nav' | 'pill'
  route: string
  signedIn: boolean
  /** App-level overlays: the web menu tray, notifications, the account menu. */
  appOverlay: boolean
  onNavigate: (route: string) => void
}) {
  const snapshot = useAddSnapshot()
  const locked = useBodyLocked()
  const keyboard = useKeyboardUp()
  const ctx = resolveAddContext({
    route,
    signedIn,
    overlayOpen: locked || appOverlay,
    keyboardOpen: keyboard,
    trip: tripScopeOf(snapshot, tripIdOfRoute(route)),
  })
  const primary = ctx.primary
  const hasMenu = ctx.menu.length > 1

  const mainRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  /** The control that opened the menu, so Escape can hand focus back to it. */
  const openerRef = useRef<HTMLButtonElement | null>(null)
  // A menu belongs to the context it opened in, and the shrink to the route it
  // happened on. The state uses them as its key, so a route change or a new context
  // closes the menu and grows the pill, and no effect resets them.
  const ctxKey = `${route}|${ctx.state}|${ctx.menu.map(a => a.label).join(',')}`
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const menuOpen = menuKey === ctxKey
  const setMenuOpen = useCallback((open: boolean) => { setMenuKey(open ? ctxKey : null) }, [ctxKey])
  const [compactRoute, setCompactRoute] = useState<string | null>(null)
  const compact = compactRoute === route
  const routeRef = useRef(route)
  useLayoutEffect(() => { routeRef.current = route })

  const run = useCallback((action: AddAction) => {
    if (action.kind === 'plan-trip') { onNavigate(CREATE_PATH); return }
    const tripId = tripIdOfRoute(routeRef.current)
    if (!tripId) return
    runTripAdd(action.kind, action.dayIndex, tripId)
  }, [onNavigate])

  // ---- web pill: shrink on a scroll down, grow on a scroll up ----
  useEffect(() => {
    if (variant !== 'pill') return
    let target: EventTarget | null = window
    let state = { compact: false, anchorY: window.scrollY }
    let pendingTarget: EventTarget | null = null
    let raf = 0
    const readY = (t: EventTarget | null) => (t instanceof HTMLElement ? t.scrollTop : window.scrollY)
    const onScroll = (e: Event) => {
      const t = e.target === document ? window : e.target
      if (t instanceof HTMLElement && (t.scrollHeight <= t.clientHeight || menuRef.current?.contains(t))) return
      pendingTarget = t
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const tNow = pendingTarget
        const y = readY(tNow)
        const here = routeRef.current
        if (tNow !== target) {
          target = tNow
          state = { compact: state.compact, anchorY: y }
          return
        }
        state = stepCompact(state, y)
        setCompactRoute(state.compact ? here : null)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true })
      if (raf) cancelAnimationFrame(raf)
    }
  }, [variant, route])

  // ---- menu ----
  const closeMenu = useCallback((refocus: boolean) => {
    setMenuOpen(false)
    if (refocus) {
      const target = openerRef.current === moreRef.current && compact ? mainRef.current : (openerRef.current ?? mainRef.current)
      target?.focus({ preventScroll: true })
    }
  }, [compact, setMenuOpen])
  const openMenu = useCallback((opener: HTMLButtonElement | null) => {
    if (!hasMenu) return
    openerRef.current = opener
    setMenuOpen(true)
  }, [hasMenu, setMenuOpen])

  useEffect(() => {
    if (!menuOpen || !hasMenu) return
    return registerAddMenuClose(() => { closeMenu(true) })
  }, [menuOpen, hasMenu, closeMenu])

  useLayoutEffect(() => {
    if (!menuOpen) return
    const place = () => {
      const anchor = (variant === 'nav' ? mainRef.current : mainRef.current?.parentElement) ?? null
      const menu = menuRef.current
      if (!anchor || !menu) return
      const r = anchor.getBoundingClientRect()
      const w = menu.offsetWidth
      const left = variant === 'nav'
        ? Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8)
        : Math.max(8, r.right - w)
      menu.style.setProperty('--ua-menu-left', `${left}px`)
      menu.style.setProperty('--ua-menu-bottom', `${window.innerHeight - r.top + MENU_GAP}px`)
    }
    place()
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || mainRef.current?.contains(t) || moreRef.current?.contains(t)) return
      setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', place)
    }
  }, [menuOpen, variant, setMenuOpen])

  function onMenuKey(e: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (i: number) => { e.preventDefault(); items[(i + items.length) % items.length]?.focus() }
    switch (e.key) {
      case 'ArrowDown': move(at + 1); break
      case 'ArrowUp': move(at < 0 ? items.length - 1 : at - 1); break
      case 'Home': move(0); break
      case 'End': move(items.length - 1); break
      case 'Escape': e.preventDefault(); e.stopPropagation(); closeMenu(true); break
      case 'Tab': e.preventDefault(); closeMenu(true); break
    }
  }

  function choose(action: AddAction) {
    // Focus goes back to the button BEFORE the flow opens, so a dialog that
    // records the active element returns focus here when it closes.
    setMenuOpen(false)
    mainRef.current?.focus({ preventScroll: true })
    run(action)
  }

  // ---- long press on the "+" ----
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null)
  const suppressClick = useRef(false)
  const cancelPress = useCallback(() => {
    if (press.current) window.clearTimeout(press.current.timer)
    press.current = null
  }, [])
  function onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
    suppressClick.current = false
    if (!hasMenu || e.button !== 0) return
    cancelPress()
    const p = { timer: 0, x: e.clientX, y: e.clientY, fired: false }
    p.timer = window.setTimeout(() => {
      p.fired = true
      suppressClick.current = true
      openMenu(mainRef.current)
    }, LONG_PRESS_MS)
    press.current = p
  }
  function onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
    const p = press.current
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_CANCEL_PX) cancelPress()
  }
  function onMainClick(e: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressClick.current) {
      suppressClick.current = false
      if (e.detail !== 0) return
    }
    if (menuOpen) setMenuOpen(false)
    if (primary) run(primary)
  }
  function onMainKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!hasMenu) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault()
      openMenu(mainRef.current)
    }
  }
  const pressHandlers = {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancelPress,
    onPointerCancel: () => { cancelPress(); suppressClick.current = false },
    onPointerLeave: cancelPress,
    onKeyDown: onMainKey,
    // The browser's own long-press menu would fight ours.
    onContextMenu: (e: ReactMouseEvent) => { if (hasMenu) e.preventDefault() },
  }

  const hidden = ctx.state === 'hidden' || (variant === 'pill' && ctx.state === 'none')
  useEffect(() => {
    if (hidden || !hasMenu) {
      cancelPress()
      suppressClick.current = false
    }
    return cancelPress
  }, [hidden, hasMenu, cancelPress])
  // Never leave focus inside an aria-hidden control or a collapsed chevron.
  useEffect(() => {
    const active = document.activeElement
    if (hidden) {
      if (active === mainRef.current || active === moreRef.current) (active as HTMLElement).blur()
    } else if (compact && active === moreRef.current) {
      mainRef.current?.focus({ preventScroll: true })
    }
  }, [hidden, compact])
  const state = hidden ? 'hidden' : ctx.state
  const menuId = `ua-menu-${variant}`
  const menu = menuOpen && hasMenu && createPortal(
    <div ref={menuRef} id={menuId} className="ua-menu" role="menu" aria-label="Add" onKeyDown={onMenuKey} data-variant={variant}>
      {ctx.menu.map(a => (
        <button key={a.kind} type="button" role="menuitem" tabIndex={-1} className="ua-menu-item" data-kind={a.kind}
          onClick={() => { choose(a) }}>
          <span className="ua-menu-icon">{KIND_ICON[a.kind]}</span>{a.label}
        </button>
      ))}
    </div>,
    document.body,
  )

  if (variant === 'nav') {
    return (
      <div className="ua-slot" data-state={state} aria-hidden={hidden || undefined}>
        <button ref={mainRef} type="button" className="ua-fab"
          disabled={ctx.state === 'none'}
          tabIndex={hidden ? -1 : undefined}
          aria-label={primary ? primary.label : 'Add (nothing to add on this screen)'}
          onClick={onMainClick} {...pressHandlers}>
          <Plus size={26} strokeWidth={2.4} aria-hidden />
        </button>
        {primary && (hasMenu ? (
          <button ref={moreRef} type="button" className="ua-caption"
            tabIndex={hidden ? -1 : undefined}
            aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
            aria-label="More ways to add"
            onClick={() => { if (menuOpen) closeMenu(true); else openMenu(moreRef.current) }}>
            <AddLabel className="ua-caption-label" text={primary.label} lines />
            <ChevronUp size={12} strokeWidth={2.6} aria-hidden className="ua-caption-chev" />
          </button>
        ) : (
          <span className="ua-caption" aria-hidden="true"><AddLabel className="ua-caption-label" text={primary.label} lines /></span>
        ))}
        {menu}
      </div>
    )
  }

  return (
    <div className="ua-pill" data-state={state} data-compact={compact ? 'true' : undefined} aria-hidden={hidden || undefined}>
      <button ref={mainRef} type="button" className="ua-pill-main"
        tabIndex={hidden ? -1 : undefined}
        aria-label={compact && primary ? primary.label : undefined}
        aria-haspopup={compact && hasMenu ? 'menu' : undefined}
        aria-expanded={compact && hasMenu ? menuOpen : undefined}
        aria-controls={compact && hasMenu && menuOpen ? menuId : undefined}
        onClick={onMainClick} {...pressHandlers}>
        <Plus size={20} strokeWidth={2.4} aria-hidden />
        {primary && <AddLabel className="ua-pill-label" text={primary.label} compact={compact} />}
      </button>
      {hasMenu && (
        <button ref={moreRef} type="button" className="ua-pill-more"
          tabIndex={hidden || compact ? -1 : undefined}
          aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
          aria-label="More ways to add"
          onClick={() => { if (menuOpen) closeMenu(true); else openMenu(moreRef.current) }}>
          <ChevronUp size={16} strokeWidth={2.6} aria-hidden />
        </button>
      )}
      {menu}
    </div>
  )
}
