#!/usr/bin/env node
// Build-time prerender of the four static copy pages (#1042): /faq, /how-it-works,
// /about and /for-creators. Runs after `vite build`, so it can read the hashed
// shell (dist/index.html) and keep its script and stylesheet tags.
//
//   1. Bundle src/prerender/static-pages.tsx with Vite's SSR build into a temp
//      folder inside the project (so the bundle resolves node_modules).
//   2. Render each page with renderToStaticMarkup.
//   3. Write dist/<slug>/index.html: the shell's head with this page's own
//      title, description, canonical, Open Graph and Twitter tags (api/_headTemplate.js
//      replaces them, never appends), and the rendered body inside #root.
//   4. Check each file. A page that throws, or whose head is not single, fails the build.
//
// Skipped for the file and native targets (VITE_BUILD_TARGET), which use a relative
// base and an in-app router, so a crawlable copy of a page is not what they serve.
// The temp folder is removed in every case.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build } from 'vite'
import { applyHead, singleHeadTags } from '../api/_headTemplate.js'
import { DEFAULT_ORIGIN } from '../api/_origin.js'
import pageCards from './page-cards.json' with { type: 'json' }

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DIST = path.join(ROOT, 'dist')
const TMP = path.join(ROOT, '.prerender-tmp')
const ENTRY = path.join(ROOT, 'src', 'prerender', 'static-pages.tsx')
const CARD_WIDTH = 1200
const CARD_HEIGHT = 630

/** True for the builds that must not get prerendered copy: a file or native shell. */
export function shouldSkipPrerender(env = process.env) {
  const target = (env.VITE_BUILD_TARGET ?? '').trim().toLowerCase()
  return target === 'file' || target === 'native'
}

/** The head one prerendered page carries. Every URL is absolute, and it names the
 *  production origin, so a preview build never writes its own address as canonical. */
export function pageHead(page) {
  const card = pageCards[page.slug]
  if (!card) throw new Error(`/${page.slug} has no card in scripts/page-cards.json`)
  const url = `${DEFAULT_ORIGIN}/${page.slug}`
  return {
    title: page.title,
    description: page.description,
    canonical: url,
    url,
    image: {
      url: `${DEFAULT_ORIGIN}/og/${card.file}`,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      type: 'image/png',
      alt: card.headline,
    },
    ...(page.jsonLd ? { jsonLd: page.jsonLd, jsonLdAttr: 'data-faq-schema' } : {}),
  }
}

/** Throws unless the written page has one of each tag a crawler reads, the right
 *  canonical and card, a rendered body, and the shell's hashed app assets. */
export function assertPrerenderedPage(html, page) {
  const counts = singleHeadTags(html)
  for (const [tag, n] of Object.entries(counts)) {
    if (n !== 1) throw new Error(`/${page.slug}: expected one ${tag} tag, found ${n}`)
  }
  const canonical = `${DEFAULT_ORIGIN}/${page.slug}`
  if (!html.includes(`<link rel="canonical" href="${canonical}" />`)) throw new Error(`/${page.slug}: wrong canonical`)
  if (!html.includes(`<meta property="og:image" content="${DEFAULT_ORIGIN}/og/${pageCards[page.slug].file}" />`)) {
    throw new Error(`/${page.slug}: wrong og:image`)
  }
  const root = html.indexOf('<div id="root">')
  const bodyEnd = html.indexOf('</body>')
  const body = root >= 0 && bodyEnd > root ? html.slice(root, bodyEnd) : ''
  if (!body.includes('<h1')) throw new Error(`/${page.slug}: no rendered heading in #root`)
  if (body.includes('Loading…') || body.includes('Loading...')) throw new Error(`/${page.slug}: the loader text reached the static body`)
  if (!/<script[^>]+src="\/assets\/[^"]+\.js"/.test(html)) throw new Error(`/${page.slug}: the hashed app script is missing`)
  if (!/<link[^>]+href="\/assets\/[^"]+\.css"/.test(html)) throw new Error(`/${page.slug}: the hashed stylesheet is missing`)
  if (page.jsonLd && !html.includes('data-faq-schema')) throw new Error(`/${page.slug}: the FAQPage block is missing`)
}

async function renderAll(template) {
  const entry = pathToFileURL(path.join(TMP, 'static-pages.mjs')).href
  const { STATIC_PAGES } = await import(entry)
  const written = []
  for (const page of STATIC_PAGES) {
    let html
    try {
      const body = renderToStaticMarkup(createElement(page.component))
      html = applyHead(template, pageHead(page), body)
    } catch (error) {
      throw new Error(`prerender of /${page.slug} failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    assertPrerenderedPage(html, page)
    const dir = path.join(DIST, page.slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), html)
    written.push(`/${page.slug}`)
  }
  return written
}

async function main() {
  if (shouldSkipPrerender()) {
    console.log('[prerender] skipped: VITE_BUILD_TARGET is file or native, so the shell serves the app with relative assets')
    return
  }
  const template = readFileSync(path.join(DIST, 'index.html'), 'utf8')
  rmSync(TMP, { recursive: true, force: true })
  try {
    await build({
      root: ROOT,
      logLevel: 'warn',
      build: {
        ssr: ENTRY,
        outDir: TMP,
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: { output: { entryFileNames: 'static-pages.mjs' } },
      },
    })
    const written = await renderAll(template)
    console.log(`[prerender] wrote ${written.length} static pages: ${written.join(', ')}`)
  } finally {
    rmSync(TMP, { recursive: true, force: true })
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`[prerender] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
