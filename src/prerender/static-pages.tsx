// ============ The static copy pages, as the build prerenders them (#1042) ============
// scripts/prerender-static-pages.mjs bundles this file with Vite's SSR build,
// renders each page with renderToStaticMarkup, and writes dist/<slug>/index.html
// from the built app shell. The page text is in the HTML a crawler or a
// link preview receives, with no script. The app still boots and replaces the
// body with createRoot (src/main.tsx), so this file is never a hydration target.
//
// Only the page component and its own copy live here. The card art and the
// origin belong to the driver and to scripts/page-cards.json, so this file stays
// free of Node-only imports and of the plain-JS api/ modules.
import type { ComponentType } from 'react'
import { AboutPage } from '../pages/AboutPage'
import { FaqPage } from '../pages/FaqPage'
import { ForCreatorsPage } from '../pages/ForCreatorsPage'
import { HowItWorksPage } from '../pages/HowItWorksPage'
import { faqJsonLd } from '../lib/faqContent'
import { pageMeta } from '../lib/pageTitle'

export type StaticPageSlug = 'faq' | 'how-it-works' | 'about' | 'for-creators'

export interface StaticPage {
  /** The route without a trailing slash. `/faq` is written to dist/faq/index.html. */
  slug: StaticPageSlug
  component: ComponentType
  /** The document title, the same string the router applies after boot. */
  title: string
  /** The meta description, the same string the router applies after boot. */
  description: string
  /** FAQPage data, for the one page that carries a schema. */
  jsonLd?: Record<string, unknown>
}

/** The title and description one route carries. Throws when a page has none, so a
 *  missing description fails the build rather than shipping a page without one. */
function metaFor(slug: StaticPageSlug): { title: string; description: string } {
  const meta = pageMeta([slug])
  if (!meta.description) throw new Error(`/${slug} has no meta description to prerender`)
  return { title: meta.title, description: meta.description }
}

export const STATIC_PAGES: readonly StaticPage[] = [
  { slug: 'faq', component: FaqPage, ...metaFor('faq'), jsonLd: faqJsonLd() },
  { slug: 'how-it-works', component: HowItWorksPage, ...metaFor('how-it-works') },
  { slug: 'about', component: AboutPage, ...metaFor('about') },
  { slug: 'for-creators', component: ForCreatorsPage, ...metaFor('for-creators') },
]
