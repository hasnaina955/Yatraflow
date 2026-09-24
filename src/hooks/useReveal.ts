// ============ Scroll-reveal: arm once, observe every .reveal ============
// The CSS contract lives in styles.css: `body.reveal-armed .reveal` holds the
// hidden state (fade + rise + defocus) and `.io-inview` resolves it. That split
// is deliberate - the hidden state is only applied once this hook has armed the
// body, so content stays visible if JS is off or has not run yet.
//
// Extracted from Landing (where it was a page-local hook) so TripCreated can
// share one arming path instead of a second copy.
import { useEffect } from 'react'

/** One IntersectionObserver flips every `.reveal` into `.io-inview` as it
 *  scrolls into the viewport - once, deliberately not re-hidden on re-entry. */
export function useReveal() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const seen = new WeakSet<Element>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('io-inview')
          io.unobserve(e.target)
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' })

    const scan = () => {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('.reveal'))) {
        if (seen.has(el)) continue
        seen.add(el)
        io.observe(el)
      }
    }

    document.body.classList.add('reveal-armed')
    scan()
    // A `.reveal` node can mount AFTER this effect: TripCreated's cards are all
    // conditional (no items, no crew, no bill) and the store can settle a beat
    // after first paint. Without this re-scan such a node would be hidden by the
    // armed body class and never observed - invisible for good, which is the one
    // failure mode this system must not have.
    const mo = new MutationObserver(scan)
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      io.disconnect()
      document.body.classList.remove('reveal-armed')
    }
  }, [])
}
