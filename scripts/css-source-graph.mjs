#!/usr/bin/env node
// ============================================================================
// Shared CSS source-graph reader.
//
// Why this exists:
//   `src/styles.css` used to be one file, and ~48 checks read it as text.
//   The CSS migration splits it into modules joined by `@import`. A check that
//   still reads one file would silently stop seeing moved rules. This reader is
//   the one place that resolves the import graph, so every check sees the same
//   cascade.
//
// What it guarantees:
//   - Import order is preserved. Declaration order is preserved.
//   - Duplicate rules are kept. Nothing is deduplicated or reordered.
//   - Conditional context is kept for every rule: @media, @supports,
//     @container, @layer, @keyframes.
//   - Every rule and asset carries its original file and line.
//   - Local imports only. A remote import is an error, never a fetch.
//   - A missing import or a cycle is an error with a path trace.
//   - An unsupported form is an error. Content is never silently dropped.
//
// Two views of the same graph:
//   text     — the flattened cascade as one string (compatibility view).
//   records  — the same rules with file, line and context (ownership view).
//
// CLI (paths are relative to --root, default: the current directory):
//   node scripts/css-source-graph.mjs                       fingerprint + files
//   node scripts/css-source-graph.mjs --json                machine summary
//   node scripts/css-source-graph.mjs --text out.css        flattened cascade
//   node scripts/css-source-graph.mjs --records out.json    structured records
// ============================================================================

import postcss from 'postcss'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative, sep } from 'node:path'

/** The default entry. Runtime loading points at this same file. */
export const DEFAULT_ENTRY = 'src/styles.css'

/** A parse, resolution or form error. `trace` names the path that failed. */
export class CssGraphError extends Error {
  constructor(code, message, trace = []) {
    const where = trace.length ? `\n  ${trace.join('\n  ')}` : ''
    super(`${message}${where}`)
    this.name = 'CssGraphError'
    this.code = code
    this.trace = trace
  }
}

/** Absolute path for a string or a file URL. */
function toAbsolute(target, root) {
  if (target instanceof URL) return fileURLToPath(target)
  return resolve(root, target)
}

/** Repo-relative path with forward slashes, so reports are stable on Windows. */
function toPosix(from, to) {
  return relative(from, to).split(sep).join('/')
}

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const countNewlines = (text) => (text.match(/\n/g) ?? []).length
const atName = (node) => (node.type === 'atrule' ? String(node.name).toLowerCase() : '')

/**
 * Split an `@import` prelude into target and conditions.
 * Supported: `"x.css"`, `'x.css'`, `url(x.css)`, `url("x.css")`,
 * then an optional `layer` / `layer(name)`, an optional `supports(...)`,
 * then a media query list. Any other form returns a null target.
 */
export function parseImportParams(params) {
  const text = String(params).trim()
  const quoted = /^(?:"([^"]*)"|'([^']*)')/.exec(text)
  let target
  let rest
  if (quoted) {
    target = quoted[1] ?? quoted[2] ?? ''
    rest = text.slice(quoted[0].length).trim()
  } else {
    const urlFn = /^url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*?))\s*\)/i.exec(text)
    if (!urlFn) return { target: null, layer: null, supports: null, media: null }
    target = urlFn[1] ?? urlFn[2] ?? urlFn[3] ?? ''
    rest = text.slice(urlFn[0].length).trim()
  }

  let layer = null
  let supports = null
  const layerFn = /^layer(?:\(\s*([^)]*?)\s*\))?(?=\s|$)/i.exec(rest)
  if (layerFn) {
    layer = layerFn[1] ? layerFn[1].trim() : ''
    rest = rest.slice(layerFn[0].length).trim()
  }
  if (/^supports\(/i.test(rest)) {
    let depth = 0
    let end = -1
    for (let i = 'supports'.length; i < rest.length; i++) {
      if (rest[i] === '(') depth++
      else if (rest[i] === ')') {
        depth--
        if (depth === 0) {
          end = i
          break
        }
      }
    }
    if (end === -1) return { target: null, layer: null, supports: null, media: null }
    supports = rest.slice('supports'.length + 1, end).trim()
    rest = rest.slice(end + 1).trim()
  }
  return { target: target.trim(), layer, supports, media: rest ? rest : null }
}

/** Classify an import or asset target. Remote and bare specifiers are refused. */
function classifyTarget(target) {
  if (!target) return 'empty'
  if (/^(?:https?:)?\/\//i.test(target)) return 'remote'
  if (/^data:/i.test(target)) return 'data'
  if (target.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(target)) return 'root'
  if (target.startsWith('.') || target.startsWith('..')) return 'relative'
  return 'bare'
}

/** Context label for one at-rule, e.g. `@media (max-width: 720px)`. */
function contextOf(atrule) {
  const params = String(atrule.params ?? '').trim()
  return params ? `@${atrule.name} ${params}` : `@${atrule.name}`
}

/** `url(...)` values inside a declaration value, as declared. */
function urlsIn(value) {
  const out = []
  for (const m of String(value).matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    const url = (m[1] ?? m[2] ?? m[3] ?? '').trim()
    if (url) out.push(url)
  }
  return out
}

/**
 * Load the cascade graph for `entry`.
 *
 * A node is emitted as its own source bytes. A top-level `@import` is replaced
 * by a `text` segment for the whitespace that preceded it, then the imported
 * segments, so order and line numbers both stay honest.
 *
 * @param {string|URL} entry stylesheet path or file URL
 * @param {{root?: string}} [options] `root` anchors relative paths and reports
 */
export function loadCssGraph(entry = DEFAULT_ENTRY, options = {}) {
  const root = resolve(options.root ?? process.cwd())
  const entryAbs = toAbsolute(entry, root)

  /** @type {Map<string, {absPath: string, rel: string, raw: string, hash: string}>} */
  const files = new Map()
  const records = []
  const assets = []
  // The ancestors currently being walked. `parse` pushes, the import branch pops.
  const stack = []
  let order = 0

  function readSource(absPath, trace) {
    const cached = files.get(absPath)
    if (cached) return cached
    let raw
    try {
      raw = readFileSync(absPath, 'utf8')
    } catch {
      throw new CssGraphError('MISSING_IMPORT', `CSS import is missing: ${toPosix(root, absPath)}`, [
        ...trace,
        `${toPosix(root, absPath)} (missing)`,
      ])
    }
    const record = { absPath, rel: toPosix(root, absPath), raw, hash: sha256(raw) }
    files.set(absPath, record)
    return record
  }

  function parse(absPath, trace) {
    const source = readSource(absPath, trace)
    stack.push(absPath)
    try {
      return { source, rootNode: postcss.parse(source.raw, { from: absPath }) }
    } catch (error) {
      throw new CssGraphError('PARSE_ERROR', `CSS parse failed: ${source.rel}: ${error.message}`, [
        ...trace,
        source.rel,
      ])
    }
  }

  /** The file a node was written in, relative to root. */
  function fileOf(node) {
    const abs = node.source?.input?.file
    return abs ? toPosix(root, abs) : toPosix(root, entryAbs)
  }

  /** Resolve one `@import` into a target file and its conditions. */
  function resolveImport(node, from, trace) {
    const where = `${from.rel}:${node.source?.start?.line ?? 0}`
    const parsed = parseImportParams(node.params)
    if (parsed.target === null || parsed.target === '') {
      throw new CssGraphError('UNSUPPORTED_IMPORT', `Unsupported @import form at ${where}`, [...trace, where])
    }
    const kind = classifyTarget(parsed.target)
    if (kind === 'remote') {
      throw new CssGraphError(
        'REMOTE_IMPORT',
        `Remote @import is not fetched by a source check at ${where}: ${parsed.target}`,
        [...trace, where],
      )
    }
    if (kind !== 'relative' && kind !== 'root') {
      throw new CssGraphError(
        'UNSUPPORTED_IMPORT',
        `@import must name a local file at ${where}: ${parsed.target}`,
        [...trace, where],
      )
    }
    if (node.parent?.type !== 'root') {
      throw new CssGraphError(
        'UNSUPPORTED_IMPORT',
        `@import must be a top-level statement at ${where}`,
        [...trace, where],
      )
    }
    const absTarget =
      kind === 'root'
        ? resolve(root, parsed.target.replace(/^[\\/]+/, ''))
        : resolve(dirname(from.absPath), parsed.target)
    if (stack.includes(absTarget)) {
      const cycle = [...stack.slice(stack.indexOf(absTarget)), absTarget].map((p) => toPosix(root, p))
      throw new CssGraphError('IMPORT_CYCLE', `CSS import cycle: ${cycle.join(' -> ')}`, [
        ...trace,
        `${where} -> ${cycle.join(' -> ')}`,
      ])
    }
    return { absTarget, conditions: parsed, where }
  }

  /** Wrap imported segments in the conditions the `@import` declared. */
  function wrapSegments(children, { layer, supports, media }) {
    let segments = children
    if (media) segments = [{ kind: 'wrap', name: 'media', params: media, children: segments }]
    if (supports) {
      // `@supports` needs its own parentheses; the @import prelude may omit them.
      const condition = supports.startsWith('(') ? supports : `(${supports})`
      segments = [{ kind: 'wrap', name: 'supports', params: condition, children: segments }]
    }
    if (layer !== null) segments = [{ kind: 'wrap', name: 'layer', params: layer || '', children: segments }]
    return segments
  }

  /** Splice one file into ordered segments. Only `@import` changes the text. */
  function expandFile(source, rootNode, trace) {
    const out = []
    let importsAllowed = true
    for (const node of rootNode.nodes ?? []) {
      if (atName(node) === 'import') {
        const importLine = node.source?.start?.line ?? 0
        if (!importsAllowed) {
          const where = `${source.rel}:${importLine}`
          throw new CssGraphError(
            'UNSUPPORTED_IMPORT',
            `@import must come before other rules at ${where}`,
            [...trace, where],
          )
        }
        const { absTarget, conditions, where } = resolveImport(node, source, trace)
        // The whitespace before `@import` belongs to this file, not to the
        // imported one, so its line must not be attributed to the module.
        const before = node.raws?.before ?? ''
        if (before) {
          out.push({
            kind: 'text',
            text: before,
            file: source.rel,
            fileLine: Math.max(1, importLine - countNewlines(before)),
          })
        }
        const imported = parse(absTarget, [...trace, where])
        const children = expandFile(imported.source, imported.rootNode, [...trace, where])
        stack.pop()
        out.push(...wrapSegments(children, conditions))
        continue
      }
      // A bare `@layer a, b;` statement may precede @import. Nothing else may.
      if (!(node.type === 'comment' || atName(node) === 'charset' || (atName(node) === 'layer' && !node.nodes))) {
        importsAllowed = false
      }
      if (atName(node) === 'charset' && source.absPath !== entryAbs) {
        const where = `${source.rel}:${node.source?.start?.line ?? 0}`
        throw new CssGraphError(
          'UNSUPPORTED_FORM',
          `@charset is allowed only in the entry file: ${where}`,
          [...trace, where],
        )
      }
      out.push({ kind: 'node', node })
    }
    return out
  }

  /**
   * Where a url() actually resolves, measured from the file that declares it.
   * A root-relative asset first tries the repo root, then Vite's public dir.
   */
  function resolveAsset(url, fileRel) {
    const kind = classifyTarget(url)
    if (kind === 'data' || kind === 'remote' || kind === 'empty' || kind === 'bare') {
      return { kind, resolved: null, exists: false }
    }
    let candidate
    if (kind === 'root') {
      const rel = url.replace(/^[\\/]+/, '')
      candidate = resolve(root, rel)
      const fromPublic = resolve(root, 'public', rel)
      if (!existsSync(candidate) && existsSync(fromPublic)) candidate = fromPublic
    } else {
      candidate = resolve(dirname(resolve(root, fileRel)), url)
    }
    return { kind, resolved: toPosix(root, candidate), exists: existsSync(candidate) }
  }

  /** Record declarations and their url() assets for one rule. */
  function declarationsOf(rule, fileRel) {
    const out = []
    for (const node of rule.nodes ?? []) {
      if (node.type !== 'decl') continue
      const line = node.source?.start?.line ?? 0
      out.push({
        prop: String(node.prop ?? '').toLowerCase(),
        value: String(node.value ?? '').trim(),
        important: Boolean(node.important),
        line,
      })
      for (const url of urlsIn(node.value)) {
        assets.push({ file: fileRel, line, prop: node.prop, url, ...resolveAsset(url, fileRel) })
      }
    }
    return out
  }

  /** Walk one subtree and append its rule records. */
  function collect(node, context, parentSelector) {
    const fileRel = fileOf(node)
    if (node.type === 'rule') {
      const selector = String(node.selector ?? '')
      const record = {
        kind: 'rule',
        selector: selector.trim(),
        selectorNormalized: selector.replace(/\s+/g, ' ').trim(),
        selectors: selector
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        context,
        file: fileRel,
        line: node.source?.start?.line ?? 0,
        column: node.source?.start?.column ?? 0,
        declarations: declarationsOf(node, fileRel),
        order: order++,
      }
      if (parentSelector) record.parentSelector = parentSelector
      records.push(record)
      for (const child of node.nodes ?? []) collect(child, context, selector.trim())
      return
    }
    if (node.type === 'atrule' && node.nodes) {
      const next = [...context, contextOf(node)]
      records.push({
        kind: atName(node) === 'keyframes' ? 'keyframes' : 'atrule',
        name: node.name,
        params: String(node.params ?? '').trim(),
        context: next,
        file: fileRel,
        line: node.source?.start?.line ?? 0,
        column: node.source?.start?.column ?? 0,
        order: order++,
      })
      for (const child of node.nodes) collect(child, next, parentSelector)
    }
  }

  function collectSegments(segments, context) {
    for (const segment of segments) {
      if (segment.kind === 'node') collect(segment.node, context, '')
      else if (segment.kind === 'wrap') {
        const params = segment.params ? ' ' + segment.params : ''
        collectSegments(segment.children, [...context, `@${segment.name}${params}`])
      }
    }
  }

  const entryFile = parse(entryAbs, [])
  const expanded = expandFile(entryFile.source, entryFile.rootNode, [entryAbs])

  /** Flatten segments into ordered chunks. Text and line origins stay exact. */
  const chunks = []
  function flatten(segments) {
    for (const segment of segments) {
      if (segment.kind === 'text') {
        chunks.push({ text: segment.text, file: segment.file, fileLine: segment.fileLine })
        continue
      }
      if (segment.kind === 'wrap') {
        const params = segment.params ? ' ' + segment.params : ''
        chunks.push({ text: `@${segment.name}${params} {\n`, file: null, fileLine: 0 })
        flatten(segment.children)
        chunks.push({ text: '\n}', file: null, fileLine: 0 })
        continue
      }
      const node = segment.node
      const before = node.raws?.before ?? ''
      const startLine = node.source?.start?.line ?? 0
      chunks.push({
        text: before + node.toString(),
        file: fileOf(node),
        fileLine: Math.max(1, startLine - countNewlines(before)),
      })
    }
  }

  flatten(expanded)
  // Trailing whitespace lives on the root, not on its last child.
  if (entryFile.rootNode.raws?.after) chunks.push({ text: entryFile.rootNode.raws.after, file: null, fileLine: 0 })
  const rawText = chunks.map((c) => c.text).join('')

  // Records and line origins are the expensive views. A check that needs only
  // the text never pays for them.
  let recordsCache = null
  let originsCache = null

  function ensureRecords() {
    if (!recordsCache) {
      collectSegments(expanded, [])
      recordsCache = records
    }
    return recordsCache
  }

  function ensureOrigins() {
    if (originsCache) return originsCache
    const origins = []
    let line = 1
    for (const chunk of chunks) {
      const parts = chunk.text.split('\n')
      // A trailing newline opens a line that no character of this chunk owns.
      const lastOwnedPart = chunk.text.endsWith('\n') ? parts.length - 2 : parts.length - 1
      if (chunk.file) {
        for (let k = 0; k <= lastOwnedPart; k++) {
          const target = line + k
          if (!origins[target - 1]) origins[target - 1] = { file: chunk.file, line: chunk.fileLine + k }
        }
      }
      line += parts.length - 1
    }
    originsCache = origins
    return originsCache
  }

  const fileList = [...files.values()]
    .map(({ rel, hash, raw }) => ({ path: rel, hash, bytes: Buffer.byteLength(raw, 'utf8') }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const fingerprint = sha256(fileList.map((f) => `${f.path}\0${f.hash}\n`).join(''))

  return {
    entry: toPosix(root, entryAbs),
    root,
    files: fileList,
    rawText,
    text: rawText.replace(/\r\n/g, '\n'),
    fingerprint,
    get records() {
      return ensureRecords()
    },
    get assets() {
      ensureRecords()
      return assets
    },
    get origins() {
      return ensureOrigins()
    },
    /** Source location for a flattened line (1-based), or null. */
    sourceAt(line) {
      return ensureOrigins()[line - 1] ?? null
    },
  }
}

/** The compatibility view: the flattened cascade as text. */
export function readCssSource(entry = DEFAULT_ENTRY, options = {}) {
  return loadCssGraph(entry, options).text
}

/** Every file a check must watch. Handy in error messages. */
export function graphFileList(entry = DEFAULT_ENTRY, options = {}) {
  return loadCssGraph(entry, options).files.map((f) => f.path)
}

// --- CLI -------------------------------------------------------------------

function runCli(argv) {
  const args = argv.slice(2)
  const flag = (name) => args.includes(name)
  const option = (name) => {
    const i = args.indexOf(name)
    return i === -1 ? undefined : args[i + 1]
  }
  const root = option('--root')
  const entry = option('--entry') ?? DEFAULT_ENTRY

  let graph
  try {
    graph = loadCssGraph(entry, root ? { root } : {})
  } catch (error) {
    if (error instanceof CssGraphError) {
      console.error(`css-source-graph: ${error.code}: ${error.message}`)
      process.exitCode = 1
      return
    }
    throw error
  }

  if (option('--text')) writeFileSync(option('--text'), graph.rawText)
  if (option('--records')) {
    writeFileSync(
      option('--records'),
      JSON.stringify({ entry: graph.entry, files: graph.files, records: graph.records, assets: graph.assets }, null, 2) +
        '\n',
    )
  }
  if (flag('--json')) {
    console.log(
      JSON.stringify(
        {
          entry: graph.entry,
          fingerprint: graph.fingerprint,
          files: graph.files,
          records: graph.records.length,
          assets: graph.assets.length,
        },
        null,
        2,
      ),
    )
    return
  }
  if (flag('--quiet') || option('--text') || option('--records')) return
  console.log(`entry       ${graph.entry}`)
  console.log(`fingerprint ${graph.fingerprint}`)
  for (const file of graph.files) console.log(`  ${file.path}  ${file.bytes} bytes  ${file.hash.slice(0, 12)}`)
  console.log(`records     ${graph.records.length}`)
  console.log(`assets      ${graph.assets.length}`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  runCli(process.argv)
}
