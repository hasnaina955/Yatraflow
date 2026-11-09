// P7 storefront: the fixed price bar. Hidden means aria-hidden and no tab stop.
// P11: it names the plan, as the trip-kit bar does. The redesign puts it at the
// bottom of the screen, full width, with the section links in the middle. It
// shows only after the cover has left the screen; the page decides that.
import type { ReactNode } from 'react'

export function StickyPriceBar(p: {
  visible: boolean
  priceLabel: string
  /** A short line after the price, such as "one payment". */
  priceNote?: string
  ctaLabel: string
  mode: 'unlock' | 'fork'
  disabled?: boolean
  onCta: () => void
  /** The plan's name, and one line under it. */
  title?: string
  sub?: string
  /** A small picture of the plan. Decorative. */
  thumb?: ReactNode
  /** The section links. Built by the page with `hidden` set from `visible`. */
  nav?: ReactNode
}): JSX.Element {
  return (
    <div className={'sf-sticky' + (p.visible ? ' is-visible' : '')} aria-hidden={!p.visible}>
      {p.thumb ? <span className="sf-sticky-thumb" aria-hidden="true">{p.thumb}</span> : null}
      {p.title ? (
        <span className="sf-sticky-name">
          <b>{p.title}</b>
          {p.sub ? <span>{p.sub}</span> : null}
        </span>
      ) : null}
      {p.nav ? <span className="sf-sticky-nav">{p.nav}</span> : null}
      <span className="sf-sticky-price">{p.priceLabel}{p.priceNote ? <small>{p.priceNote}</small> : null}</span>
      <button
        className={'sf-sticky-cta' + (p.mode === 'fork' ? ' sf-sticky-cta--fork' : '')}
        type="button"
        tabIndex={p.visible ? 0 : -1}
        disabled={p.disabled}
        onClick={p.onCta}
      >
        {p.ctaLabel}
      </button>
    </div>
  )
}
