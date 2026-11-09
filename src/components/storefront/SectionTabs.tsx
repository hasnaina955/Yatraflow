// P11 trip kit: links to the parts of the Look inside view. The cover shows
// them and the fixed bar repeats them. Each copy watches the sections itself,
// so the page needs no hook after its early returns. The link that matches the
// section in the middle of the screen is marked as the current one.
import { useEffect, useState } from 'react'
import { scrollBehavior } from '../../lib/motion'

export interface SectionTab {
  /** The id of the section element on the page. */
  id: string
  label: string
}

export function SectionTabs({ tabs, label, hidden = false }: {
  tabs: readonly SectionTab[]
  label: string
  /** True while the holder is off screen: the links leave the tab order. */
  hidden?: boolean
}): JSX.Element | null {
  const key = tabs.map(t => t.id).join('|')
  const [active, setActive] = useState<string | null>(tabs[0]?.id ?? null)
  useEffect(() => {
    const ids = key.split('|').filter(Boolean)
    if (ids.length === 0 || typeof IntersectionObserver === 'undefined') return
    const inBand = new Map<string, boolean>()
    const io = new IntersectionObserver(entries => {
      for (const e of entries) inBand.set(e.target.id, e.isIntersecting)
      const first = ids.find(id => inBand.get(id))
      if (first) setActive(first)
    }, { rootMargin: '-35% 0px -55% 0px' })
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => { io.disconnect() }
  }, [key])
  if (tabs.length < 2) return null
  return (
    <nav className="pi-sections" aria-label={label}>
      {tabs.map(t => (
        <a
          key={t.id}
          href={`#${t.id}`}
          className={'pi-section-tab' + (active === t.id ? ' is-active' : '')}
          aria-current={active === t.id ? 'location' : undefined}
          tabIndex={hidden ? -1 : undefined}
          onClick={e => {
            const el = document.getElementById(t.id)
            if (!el) return
            e.preventDefault()
            el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
            setActive(t.id)
          }}
        >{t.label}</a>
      ))}
    </nav>
  )
}
