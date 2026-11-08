// P7 storefront: the fixed price bar. Hidden means aria-hidden and no tab stop.
// P11: it names the plan, as the trip-kit bar does.
export function StickyPriceBar(p: {
  visible: boolean
  priceLabel: string
  ctaLabel: string
  mode: 'unlock' | 'fork'
  disabled?: boolean
  onCta: () => void
  /** The plan's name, and one line under it. */
  title?: string
  sub?: string
}): JSX.Element {
  return (
    <div className={'sf-sticky' + (p.visible ? ' is-visible' : '')} aria-hidden={!p.visible}>
      {p.title ? (
        <span className="sf-sticky-name">
          <b>{p.title}</b>
          {p.sub ? <span>{p.sub}</span> : null}
        </span>
      ) : null}
      <span className="sf-sticky-price">{p.priceLabel}</span>
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
