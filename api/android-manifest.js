// /android/manifest.json — the APK update feed, derived from the release page.
//
// Why a route and not a committed file: a static manifest has to be rewritten on
// every release, and no step in the tag workflow can commit one — a hand copy per
// release is the step that rots. This route derives the six fields the client
// parses (`src/lib/apkUpdates.ts`) from the release the tag workflow already
// publishes, so cutting a release is the whole activation story.
//
// Fail closed. A failed read, or no published release with an APK asset, is a
// 503. The client then reports a failed check and never offers a build it cannot
// name.
//
// `/android/latest.apk` is the same read, answered as a 302 to the release
// asset. The download URL stays on the approved host, so the app's
// `VITE_APK_UPDATE_HOSTS` stays exactly `www.yatraflow.in`.
//
// Postel, applied: the manifest is small and the client is strict, so every
// field here is produced in the shape the client checks, never a near miss.

import { resolveOrigin } from './_origin.js'

/** The production Android application id, matching `capacitor.config.ts`. */
export const PACKAGE_ID = 'app.yatraflow.mobile'

/** The only channel this feed serves. The audit channel is not public. */
export const CHANNEL = 'production'

/** Where the manifest and the download answer, from the client's side. */
export const MANIFEST_PATH = '/android/manifest.json'
export const DOWNLOAD_PATH = '/android/latest.apk'

/** Overridable so a preview deployment can read its own fork. */
const DEFAULT_REPO = 'hasnaina955/Yatraflow'

/** How many releases the route looks back through to find an APK asset. */
const RELEASE_WINDOW = 15

/** The card has room for one line. Longer names are cut, never wrapped. */
const NOTES_MAX = 160

/** A 5-minute edge cache keeps the unauthenticated GitHub read well inside its
 *  rate limit, and still shows a fresh release within a few minutes. */
const CACHE = 'public, s-maxage=300, stale-while-revalidate=600'

/** `[major, minor, patch]` from a `vX.Y.Z` tag, or null for any other name. */
export function versionFromTag(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(String(tag ?? '').trim())
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** The version code `build.gradle` bakes from `package.json`. */
export function versionCodeOf(version) {
  const [major, minor, patch] = version
  return major * 10000 + minor * 100 + patch
}

/** One short line for the card: the release name, else the tag. */
export function notesOf(name, tag) {
  const text = String(name ?? '').replace(/\s+/g, ' ').trim()
  const line = text && text !== tag ? text : `Release ${tag}`
  return line.length > NOTES_MAX ? `${line.slice(0, NOTES_MAX - 1)}…` : line
}

/**
 * The newest published release that carries an APK, or null.
 *
 * The window walks newest-first and skips a draft, a prerelease, a tag that is
 * not `vX.Y.Z`, and a release with no `.apk` asset. A release page can be
 * created before its asset is attached, so the asset is the real test.
 */
export function pickRelease(releases) {
  if (!Array.isArray(releases)) return null
  for (const release of releases) {
    if (!release || release.draft || release.prerelease) continue
    const version = versionFromTag(release.tag_name)
    if (!version) continue
    const assets = Array.isArray(release.assets) ? release.assets : []
    const apk = assets.find((asset) =>
      typeof asset?.name === 'string'
      && /\.apk$/i.test(asset.name)
      && typeof asset.browser_download_url === 'string'
      && asset.browser_download_url.startsWith('https://'))
    if (!apk) continue
    return { tag: String(release.tag_name).trim(), name: release.name, version, apk }
  }
  return null
}

/** The document the client parses. Every field is one it checks. */
export function manifestFor(picked, origin) {
  return {
    packageId: PACKAGE_ID,
    channel: CHANNEL,
    versionCode: versionCodeOf(picked.version),
    versionName: `${picked.version.join('.')}-native`,
    notes: notesOf(picked.name, picked.tag),
    downloadUrl: `${origin}${DOWNLOAD_PATH}`,
  }
}

/** The repo's public release list. No token: the repository is public. A token
 *  in `GITHUB_TOKEN` is optional and only raises the read's rate limit. */
async function readReleases(repo, fetchImpl, token) {
  const headers = {
    accept: 'application/vnd.github+json',
    'user-agent': 'yatraflow-android-manifest',
  }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=${RELEASE_WINDOW}`, { headers })
  if (!res || !res.ok) throw new Error(`the release list answered ${res?.status ?? 'nothing'}`)
  return await res.json()
}

function send(res, status, body, cache) {
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', cache)
  res.setHeader('access-control-allow-origin', '*')
  res.status(status)
  res.send(JSON.stringify(body))
}

export default async function handler(req, res) {
  const method = String(req?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    res.setHeader('allow', 'GET, HEAD')
    return send(res, 405, { error: 'method not allowed' }, 'no-store')
  }

  const repo = process.env.APK_UPDATE_REPO || DEFAULT_REPO
  const fetchImpl = globalThis.fetch
  let picked
  try {
    picked = pickRelease(await readReleases(repo, fetchImpl, process.env.GITHUB_TOKEN))
  } catch {
    return send(res, 503, { error: 'the release feed is unavailable' }, 'no-store')
  }
  if (!picked) {
    return send(res, 503, { error: 'no published release carries an APK' }, 'no-store')
  }

  if (req?.query?.apk) {
    res.setHeader('location', picked.apk.browser_download_url)
    res.setHeader('cache-control', CACHE)
    res.status(302)
    res.end()
    return
  }

  return send(res, 200, manifestFor(picked, resolveOrigin(process.env)), CACHE)
}
