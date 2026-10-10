// ============ My trips — page banner ============
// Title, one line of context and the page actions, over a papercut skyline.
// The page passes the actions in, so each button keeps its own handler there.
import { useId, type ReactNode } from 'react'
import { BannerPanorama } from './TripArt'

export function TripsBanner({ children }: { children: ReactNode }) {
  const titleId = useId()
  return (
    <section className="mt-banner" aria-labelledby={titleId}>
      <BannerPanorama />
      <div className="mt-banner-title">
        <h1 id={titleId}>My trips</h1>
        <p className="mt-lede">Everything you’re planning or collaborating on.</p>
      </div>
      <div className="mt-banner-actions">{children}</div>
    </section>
  )
}
