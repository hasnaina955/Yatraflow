/**
 * CSS ownership check for the YatraFlow stylesheet graph.
 *
 * The graph reader (`css-source-graph.mjs`) answers "what is in the cascade".
 * This check answers "who is allowed to write it". It reads the same graph, so
 * a rule can never pass here and fail there.
 *
 * Every finding names the real source file and line, because a cross-owner
 * patch that reports only a selector is a patch nobody can find.
 *
 *   node scripts/css-ownership.mjs            check the real stylesheet
 *   node scripts/css-ownership.mjs --json     machine output
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCssGraph, CssGraphError, DEFAULT_ENTRY } from './css-source-graph.mjs'

export const MAP_PATH = 'docs/css-ownership.json'

/**
 * Properties a page or layout file may set on a component's configuration
 * class. Placement, sizing and flow only.
 *
 * Padding is deliberately absent: it changes the control's own interior, so
 * `padding: 0` on `.select` is a repair, not a layout choice.
 */
export const ALLOWED_ON_CONFIG = new Set([
  'position', 'top', 'right', 'bottom', 'left', 'inset',
  'inset-block', 'inset-block-start', 'inset-block-end',
  'inset-inline', 'inset-inline-start', 'inset-inline-end',
  'z-index', 'display', 'float', 'clear', 'visibility', 'box-sizing',
  'flex', 'flex-basis', 'flex-direction', 'flex-flow', 'flex-grow', 'flex-shrink', 'flex-wrap',
  'align-items', 'align-self', 'align-content',
  'justify-content', 'justify-self', 'justify-items',
  'place-items', 'place-content', 'place-self',
  'gap', 'row-gap', 'column-gap', 'order',
  'grid', 'grid-area', 'grid-column', 'grid-row',
  'grid-template', 'grid-template-columns', 'grid-template-rows',
  'grid-auto-flow', 'grid-auto-columns', 'grid-auto-rows',
  'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'margin-block', 'margin-block-start', 'margin-block-end',
  'margin-inline', 'margin-inline-start', 'margin-inline-end',
  'overflow', 'overflow-x', 'overflow-y', 'overflow-wrap', 'contain',
])

const CLASS_RE = /\.(-?[A-Za-z_][\w-]*)/g

/** Every class token named by a selector, in order, without duplicates. */
/**
 * Every class token a selector targets, without duplicates.
 *
 * A class inside `:not(...)` is excluded, not targeted. `.btn:where(:not(.modal *))`
 * styles a button that is not inside a modal; it does not style `.modal`. Counting
 * that as a modal rule made the checker treat every page button recipe as a dialog
 * patch, and the dialog owner's own variables as undocumented.
 */
export function classTokens(selector) {
  const text = String(selector ?? '').replace(/:not\([^)]*(?:\([^)]*\)[^)]*)*\)/g, '')
  const out = new Set()
  for (const m of text.matchAll(CLASS_RE)) out.add(m[1])
  return [...out]
}

export function loadOwnershipMap(root = process.cwd()) {
  const abs = path.resolve(root, MAP_PATH)
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'))
  return normalizeMap(raw)
}

/** Index the map so a rule lookup is one hash hit, not a scan per rule. */
function normalizeMap(raw) {
  const ownedByClass = new Map()
  const configByClass = new Map()
  const ownerFiles = new Set()
  const ownerFileList = new Set()
  const owners = raw.owners ?? []
  for (const owner of owners) {
    ownerFiles.add(owner.file)
    for (const extra of owner.files ?? []) ownerFiles.add(extra)
    for (const cls of owner.owned ?? []) ownedByClass.set(cls, owner)
    for (const cls of owner.configClasses ?? []) configByClass.set(cls, owner)
  }
  return {
    raw,
    entry: raw.entry ?? DEFAULT_ENTRY,
    owners,
    ownerFiles,
    legacyFiles: new Set(raw.legacy ?? []),
    ownedByClass,
    configByClass,
    baselines: raw.baselines ?? {},
  }
}

const isCustomProp = (prop) => prop.startsWith('--')

/**
 * True for a selector that defines theme or primitive tokens.
 *
 * That covers `:root`, `html`, and a theme block such as `[data-theme='dark']`.
 * A theme block is a token definition, not a page rule. The contract gives
 * theme mappings to the token module. A theme block left behind moves every
 * `:root` block ahead of it, which silently changes which value wins in dark
 * mode.
 *
 * A custom property on a component class is a configuration variable, not a
 * token definition. Pages may set those, so this must not see them.
 */
export function isRootSelector(selector) {
  if (classTokens(selector).length) return false
  return /(^|[\s,>+~(])(:root|html|\[data-theme)/.test(String(selector ?? ''))
}

/**
 * Check one graph against one ownership map.
 * Returns findings sorted by file then line. An empty array means clean.
 */
const isOwnerFile = (owner, file) => owner.file === file || (owner.files ?? []).includes(file)

export function checkOwnership(graph, map, root = process.cwd()) {
  const findings = []
  const add = (code, file, line, selector, message, extra = {}) =>
    findings.push({ code, file, line, selector, message, ...extra })

  const rules = graph.records.filter((r) => r.kind === 'rule')

  for (const rule of rules) {
    const file = rule.file
    const tokens = classTokens(rule.selectorNormalized)
    if (!tokens.length) continue

    for (const token of tokens) {
      const owner = map.ownedByClass.get(token)
      if (owner) {
        if (!isOwnerFile(owner, file)) {
          add(
            'owner-scope', file, rule.line, rule.selectorNormalized,
            `.${token} belongs to ${owner.id} (${owner.file}). A shared control is not patched from another file.`,
          )
        }
        continue
      }

      const config = map.configByClass.get(token)
      if (config && !isOwnerFile(config, file)) {
        for (const decl of rule.declarations ?? []) {
          // A page may set a variable only when the owner documents it. Without
          // this, any custom property would be a free pass around the rule.
          if (isCustomProp(decl.prop)) {
            const allowed = config.variables ?? []
            if (allowed.includes(decl.prop)) continue
            add(
              'config-variable', file, decl.line ?? rule.line, rule.selectorNormalized,
              `.${token} does not document "${decl.prop}". A page may set only ${allowed.join(', ') || 'no variables'}. Add the variable to ${config.file} and to the map first.`,
              { prop: decl.prop, key: `${file}::${rule.selectorNormalized}::${decl.prop}` },
            )
            continue
          }
          if (ALLOWED_ON_CONFIG.has(decl.prop)) continue
          add(
            'config-appearance', file, decl.line ?? rule.line, rule.selectorNormalized,
            `.${token} is a ${config.id} configuration point. "${decl.prop}" is component appearance, not page placement. Set it in ${config.file}, or set a supported variable (${(config.variables ?? []).join(', ') || 'none'}).`,
            { prop: decl.prop, key: `${file}::${rule.selectorNormalized}::${decl.prop}` },
          )
        }
      }
    }
  }

  // A stylesheet nobody registered is a stylesheet nobody owns.
  for (const file of graph.files.map((f) => f.path)) {
    if (file === graph.entry) continue
    if (map.ownerFiles.has(file)) continue
    if (map.legacyFiles.has(file)) continue
    add('unregistered-file', file, 1, '', 'Add this file to docs/css-ownership.json as an owner module or a legacy file.')
  }

  // Root token definitions belong to the registered token owner and nowhere
  // else. The old rule skipped every owner module, so a component could define
  // `:root` tokens and pass. That was a hole straight through the ownership
  // rule.
  const tokenOwnerFiles = new Set(
    (map.owners ?? []).filter((o) => (o.tokenOwner ?? false) || o.id === 'tokens').map((o) => o.file),
  )
  const tokenBaseline = map.baselines.customPropertyFiles ?? {}
  const tokenCounts = new Map()
  for (const rule of rules) {
    if (!isRootSelector(rule.selectorNormalized)) continue
    const n = (rule.declarations ?? []).filter((d) => isCustomProp(d.prop)).length
    if (n) tokenCounts.set(rule.file, (tokenCounts.get(rule.file) ?? 0) + n)
  }
  for (const [file, n] of tokenCounts) {
    if (tokenOwnerFiles.has(file)) continue
    const allowed = tokenBaseline[file] ?? 0
    if (n > allowed) {
      add('token-context', file, 1, '', `Defines ${n} root custom properties; ${allowed} registered. Root token definitions belong to ${[...tokenOwnerFiles].join(', ') || 'a registered token owner'}.`)
    }
  }

  // !important may not grow anywhere.
  const importantBaseline = map.baselines.importantByFile ?? {}
  const importantCounts = new Map()
  for (const rule of rules) {
    const n = (rule.declarations ?? []).filter((d) => d.important).length
    if (n) importantCounts.set(rule.file, (importantCounts.get(rule.file) ?? 0) + n)
  }
  for (const [file, n] of importantCounts) {
    const allowed = importantBaseline[file] ?? 0
    if (n > allowed) {
      add('important-growth', file, 1, '', `Uses ${n} !important declarations; ${allowed} registered. Remove the need instead of raising the count.`)
    }
  }

  // Reduced motion must stay reachable in the final cascade.
  const reducedMotionRules = rules.filter((r) => (r.context ?? []).some((c) => /prefers-reduced-motion/.test(c))).length
  const reducedFloor = map.baselines.reducedMotionRules ?? 0
  if (reducedMotionRules < reducedFloor) {
    add('reduced-motion', graph.entry, 1, '', `${reducedMotionRules} rules sit inside prefers-reduced-motion; ${reducedFloor} registered. A move dropped reduced-motion coverage.`)
  }

  // A moved file changes the base for relative URLs.
  for (const asset of graph.assets ?? []) {
    const url = String(asset.url ?? '').trim()
    if (!url || url.startsWith('#') || url.startsWith('/') || /^[a-z]+:/i.test(url)) continue
    const clean = url.split(/[?#]/)[0]
    if (!clean) continue
    const abs = path.resolve(root, path.dirname(asset.file), clean)
    if (!fs.existsSync(abs)) {
      add('asset-target', asset.file, asset.line ?? 1, '', `url(${url}) does not resolve from this file.`)
    }
  }

  return findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line || (a.code < b.code ? -1 : 1)))
}

/**
 * Grandfather appearance already written on a configuration class.
 *
 * The key is the file, the exact selector and the property. A key that is not
 * registered is new, so one page-level repair is always caught. A batch
 * converts its own keys to variables and deletes them from the map, so the
 * recorded debt only shrinks.
 *
 * A registered key that no longer matches a finding is stale and fails. Without
 * that, a key for an owner module — which the rule never reports on — would sit
 * in the map forever and quietly inflate the debt figure.
 */
export function applyAppearanceBaseline(findings, baselines = {}) {
  const appearanceAllowed = new Set(baselines.configAppearanceKeys ?? [])

  // A variable exception names its file, selector and variable, and says why.
  // A bare key would let an exception hide which part of it is the exception.
  const variableAllowed = new Map()
  const malformed = []
  for (const entry of baselines.configVariableDebt ?? []) {
    const ok =
      entry && typeof entry === 'object' && entry.file && entry.selector && entry.variable && entry.reason
    if (!ok) {
      malformed.push(entry)
      continue
    }
    variableAllowed.set(`${entry.file}::${entry.selector}::${entry.variable}`, entry)
  }

  const usedAppearance = new Set()
  const usedVariable = new Set()

  const kept = findings.filter((f) => {
    if (f.code === 'config-appearance') {
      if (!appearanceAllowed.has(f.key)) return true
      usedAppearance.add(f.key)
      return false
    }
    if (f.code === 'config-variable') {
      if (!variableAllowed.has(f.key)) return true
      usedVariable.add(f.key)
      return false
    }
    return true
  })

  for (const key of appearanceAllowed) {
    if (usedAppearance.has(key)) continue
    const [file] = key.split('::')
    kept.push({
      code: 'config-baseline-stale',
      file,
      line: 1,
      selector: '',
      key,
      message: `"${key}" is registered as appearance debt but matches no declaration. Delete it from the map.`,
    })
  }

  for (const [key, entry] of variableAllowed) {
    if (usedVariable.has(key)) continue
    kept.push({
      code: 'config-variable-stale',
      file: entry.file,
      line: 1,
      selector: entry.selector,
      key,
      message: `"${key}" is registered as a variable exception but matches no declaration. Delete it from the map.`,
    })
  }

  for (const entry of malformed) {
    kept.push({
      code: 'config-variable-malformed',
      file: 'docs/css-ownership.json',
      line: 1,
      selector: '',
      key: JSON.stringify(entry ?? null),
      message: 'A configVariableDebt entry needs file, selector, variable and reason. Each exception must name its exact target.',
    })
  }

  return kept
}

/** Format findings the way the other repo checks do. */
export function formatFindings(findings) {
  return findings
    .map((f) => `${f.code}  ${f.file}:${f.line}  ${f.message}${f.selector ? `\n    ${f.selector}` : ''}`)
    .join('\n')
}

function runCli(argv) {
  const flag = (name) => argv.includes(name)
  const root = process.cwd()
  let graph
  try {
    graph = loadCssGraph(DEFAULT_ENTRY, { root })
  } catch (error) {
    if (error instanceof CssGraphError) {
      console.error(`css-ownership: the stylesheet graph does not load.\n${error.message}`)
      process.exit(1)
    }
    throw error
  }
  const map = loadOwnershipMap(root)
  const findings = applyAppearanceBaseline(checkOwnership(graph, map, root), map.baselines)

  if (flag('--json')) {
    console.log(JSON.stringify({ fingerprint: graph.fingerprint, findings }, null, 2))
  } else if (findings.length) {
    console.error(formatFindings(findings))
    console.error(`\ncss-ownership: ${findings.length} finding(s) in ${new Set(findings.map((f) => f.file)).size} file(s).`)
  } else {
    console.log(`css-ownership: OK. ${graph.files.length} files, ${graph.records.length} records, ${map.owners.length} owner module(s).`)
  }
  process.exit(findings.length ? 1 : 0)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runCli(process.argv)
}
