#!/usr/bin/env node
// Checks new prose against Simplified Technical English (ASD-STE100) rules.
//
// AGENTS.md §2 rule 13. The rule governs prose an agent writes FROM NOW ON,
// so this script checks only the lines a branch changed. The default run
// compares the working tree with the merge base of origin/test, or with
// origin/$GITHUB_BASE_REF in a pull request. Committed and uncommitted lines
// both count. Legacy text is never reported. Every sentence on a checked line
// is measured.
//
// Usage:
//   node scripts/lint-ste.mjs                 # changed lines vs origin/test
//   node scripts/lint-ste.mjs --base <ref>    # changed lines since <ref>'s merge base with HEAD
//   node scripts/lint-ste.mjs --staged        # staged lines only (index vs HEAD)
//   node scripts/lint-ste.mjs --file <path>   # whole file (a new file)
//   node scripts/lint-ste.mjs --stdin         # text on stdin
//
// The diff runs skip the paths in EXCLUDED_PATH_PREFIXES. An explicit --file still checks.
// Exit codes. 0 passes. 1 means a rule is broken. 2 means the gate cannot run.
// Exit 2 covers bad usage, unreadable input, and a shallow clone with no merge
// base. It also covers a missing base branch under CI. Outside CI, a missing
// origin/test falls back to origin/main, then to HEAD~1, with a warning. The
// base order is in scripts/lint-ste-base.mjs.
// Stage a new file with `git add -N` so the default run sees it.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { chooseLintBase, GateError, requireMergeBase } from './lint-ste-base.mjs'

const MAX_WORDS = 20

// A gerund starts a step only when a determiner or a code span follows it.
// "Checking the value." is a gerund step. "Landing page" is a page name.
const GERUND_FIRST = /^[A-Z][a-z]+ing$/
const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'each', 'every', 'all', 'your', 'its', 'their', 'our', 'any', 'some', 'both', 'no', 'one', 'my', 'his', 'her'])

// Plain-word substitutions. Each entry is [pattern, replacement].
const VOCAB = [
  [/\bobtain(?:s|ed|ing)?\b/gi, 'get'],
  [/\butili[sz](?:e|es|ed|ing|ation)\b/gi, 'use'],
  [/\bcommence(?:s|d)?\b/gi, 'start'],
  [/\bterminate(?:s|d)?\b/gi, 'stop'],
  [/\bendeavour|endeavor/gi, 'try'],
  [/\bnecessitate(?:s|d)?\b/gi, 'need'],
  [/\brequire(?:s|d)?\b/gi, 'need'],
  [/\battempt(?:s|ed|ing)?\b/gi, 'try'],
  [/\badditional(?:ly)?\b/gi, 'also'],
  [/\bsufficient\b/gi, 'enough'],
  [/\bprior to\b/gi, 'before'],
  [/\bsubsequent to\b/gi, 'after'],
  [/\bin the event that\b/gi, 'if'],
  [/\bwith regard to\b/gi, 'about'],
  [/\bin order to\b/gi, 'to'],
  [/\bpriorit(?:y|ise|ize)\w*\b/gi, 'prefer'],
  [/\bpermitted\b/gi, 'allowed'],
  [/\bprohibited\b/gi, 'not allowed'],
  [/\bvalidate\b/gi, 'check'],
  [/\bindicator\b/gi, 'sign'],
  [/\bapproximately\b/gi, 'about'],
  [/\bnumerous\b/gi, 'many'],
  [/\bfacilitate\b/gi, 'help'],
  [/\bleverage\b/gi, 'use'],
  [/\binquire\b/gi, 'ask'],
  [/\bascertain\b/gi, 'find'],
  [/\binitiate\b/gi, 'start'],
  [/\bsubsequently\b/gi, 'then'],
  [/\bcurrently\b/gi, 'now'],
  [/\bpreviously\b/gi, 'before'],
  [/\bhowever\b/gi, 'but'],
  [/\btherefore\b/gi, 'so'],
  [/\bmoreover\b/gi, 'also'],
  [/\bfurthermore\b/gi, 'also'],
  [/\bin order\b/gi, 'so'],
  [/\bfaithful(?:ly)?\b/gi, 'consistent'],
  [/\bimplement\b/gi, 'add'],
  [/\bfunctionality\b/gi, 'feature'],
  [/\butilis(?:e|es|ed|ing|ation)\b/gi, 'use'],
  [/\bsynchroni[sz]e\b/gi, 'sync'],
  [/\basynchronous\b/gi, 'async'],
]

const problems = []
let checkedLines = 0

// A CODE line is not prose, even when its tokens read as English. Without
// these exclusions the checker fired on real code and forced working code to
// be restructured to please it (an object key named `priority` read as the
// word "prefer"; a JSX prop list read as one long sentence) — and a gate
// that punishes correct code is a gate agents learn to ignore.
function isCode(t) {
  // a string literal on its own line: a fixture, a snapshot, a key
  if (/^['"`]/.test(t) && !/^>/.test(t)) return true
  // object / class property: `key: value`, `key:`, `"key": value`. The value may
  // also start with an identifier — a variable, or a type reference chained into
  // an index or member access (`category: ItineraryStop['category']`), which no
  // prose sentence is. Residual gap: a glossary-style ".md" definition line
  // ("word: lowercase text") now skips the vocab rules.
  if (/^['"]?[A-Za-z_$][\w$]*['"]?\s*:\s*([`'"{[(]|\d|[A-Za-z_$][\w$]*\s*[.[])/.test(t)) return true
  // JSX attribute: `onClick={...}`, `options={[...]`, bare `foo=`
  if (/^[A-Za-z_$][\w$.-]*\s*=\s*\{/.test(t)) return true
  // JSX element / closing tag: `<MapTab ... />`, `</div>`
  if (/^<\/?[A-Za-z]/.test(t) || /^>/.test(t)) return true
  // TypeScript member / signature shapes: `foo(a: string): void`
  if (/^[A-Za-z_$][\w$]*\([^)]*:\s*[A-Za-z]/.test(t)) return true
  // A bare call: `foo(bar, baz)` or `foo.bar(baz)`, including one that nests a
  // callback or a literal inside the parens — `expect(() => load(file))`,
  // `seen.add(key)`. An English sentence never opens with `word(` and closes
  // the call at the end of the line.
  if (/^[A-Za-z_$][\w$]*(?:\.[\w$]+)*\s*\(.*\)\s*;?\s*$/.test(t)) return true
  // ends in a statement terminator after code punctuation
  if (/[;{}]\s*$/.test(t) && /[()[\]=>]/.test(t)) return true
  return false
}

// A list marker starts a list item: "- ", "* ", "+ ", "1. " or "2) ".
// A task box after the marker belongs to the item: "- [ ] " or "- [x] ".
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/
const TASK_BOX = /^\[[ xX]\]\s+/

function stripListMarker(line) {
  const m = LIST_MARKER.exec(line)
  if (!m) return line
  return line.slice(m[0].length).replace(TASK_BOX, '')
}

const SQL_RAISE = /^raise\s+(?:exception|warning|notice|info|log|debug)\b/i

// The prose of a SQL statement: a RAISE message is shown to a user, so it is
// prose; every other literal on a statement line is an identifier, a path or a
// payload. This is the one supported string surface, not an all-string rule.
function sqlStatementProse(text) {
  if (!SQL_RAISE.test(text.trim())) return null
  const quote = text.indexOf("'")
  if (quote < 0) return null
  return readSqlQuoted(text, quote).value
}

function isProse(line, file) {
  const raw = line.trim()
  if (!raw) return false
  if (raw.startsWith('#')) return false        // heading
  if (raw.startsWith('```')) return false      // fence
  // The code rules judge the text after the list marker and the task box.
  const t = stripListMarker(raw)
  if (!t) return false
  if (t.startsWith('|')) return false          // table row, also inside a list item
  if (/^(?:const|let|var|function|import|export|return|if|for)\b/.test(t)) return false
  // A fat arrow outside a code span is a callback, not a sentence. stripCode
  // removes the spans first, so prose that quotes `=>` stays checked.
  if (/=>/.test(t.replace(/`[^`]*`/g, ''))) return false
  // An object or JSON literal: `{ id: 'slot:lunch', ... },`. No sentence starts
  // with a brace or a bracket, so this is code.
  if (/^[{[]\s*['"]?[A-Za-z_$][\w$]*['"]?\s*:/.test(t)) return false
  if (isCode(t)) return false                  // code, not prose
  if (/`[^`]*`/.test(t) && !/[a-z]{4,}/i.test(t.replace(/`[^`]*`/g, ''))) return false
  return true
}

// Codacy flags two of these as "Unsafe Regular Expression" and two lines below
// as "Function Call Object Injection Sink" (PR #577: lines 92, 134, 151, 165,
// 170). Checked, not dismissed: every pattern here is linear-time because none
// nests a quantifier inside another — `[^]]*` and `[^)]*` are single character
// classes with one `*` each, not `(a+)+`. Measured on 50,000-character inputs,
// the slowest is 0.09ms. `stripCode` only ever sees a line of prose or code
// from `git diff`, so the input is bounded by the file anyway.
function stripCode(text) {
  return text
    .replace(/`[^`]*`/g, ' CODE ')
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' LINK ')
    .replace(/\bsection §?\d+(\.\d+)?\b/g, ' section ')
    .replace(/\bv?\d+\.\d+\.\d+\b/g, ' version ')
    .replace(/#[A-Za-z_][\w/.-]*/g, ' issue ')
}

// A sentence ends at . ! or ?, then whitespace. Closing quotes, brackets and
// underscores may sit between the mark and the space. "e.g.", "i.e.", "vs." and
// "cf." and "etc." do not end a sentence, in any letter case, so a long sentence stays whole.
const SENTENCE_BREAK = /(?<!\b(?:e\.g|i\.e|vs|cf|etc)\.)(?<=[.!?][_"'”’)\]]*)\s+/i

function sentencesOf(text) {
  return text.split(SENTENCE_BREAK).map((s) => s.trim()).filter(Boolean)
}

// A word is a token with a letter or a digit. A bare "(", "," or "—" is not a word.
// An em dash or an en dash joins words, so each side counts as one word.
function countWords(sentence) {
  return sentence.replace(/[—–]/g, ' ').split(/\s+/).filter((t) => /[A-Za-z0-9]/.test(t)).length
}

function startsGerundStep(sentence) {
  const [first = '', second = ''] = sentence.split(/\s+/)
  if (!GERUND_FIRST.test(first)) return false
  return /^CODE\b/.test(second) || DETERMINERS.has(second.toLowerCase().replace(/[^a-z]/g, ''))
}

// The must rule applies only when a sentence states a rule. A question asks,
// so it is skipped. A sentence that names the rule itself ("use must, not
// should") is quoting, not violating it.
function usesShould(sentence) {
  if (/\?[_"'”’)\]]*$/.test(sentence)) return false
  const m = /\bshould\b/i.exec(sentence)
  if (!m) return false
  const around = sentence.slice(Math.max(0, m.index - 40), m.index + 40)
  const quoting = /\b(?:not|rather than|instead of|instead)\b.{0,24}\bshould\b/i.test(around)
    || /\bshould\b.{0,24}\b(?:not|never|rather than|instead)\b/i.test(around)
  return !quoting
}

function checkLine(file, lineno, raw) {
  const body = stripListMarker(raw.trim())
    .replace(/^>\s*/, '')                     // quote marker
    .replace(/\*+/g, '')                      // emphasis marks
    .trim()
  if (!body) return
  const text = stripCode(body)
  for (const sentence of sentencesOf(text)) {
    const n = countWords(sentence)
    if (n > MAX_WORDS) {
      problems.push({ file, lineno, kind: `sentence ${n} words (max ${MAX_WORDS})`, text: sentence.slice(0, 90) })
    }
    if (startsGerundStep(sentence)) {
      problems.push({ file, lineno, kind: 'sentence starts with a gerund', text: sentence.slice(0, 90) })
    }
    if (usesShould(sentence)) {
      problems.push({ file, lineno, kind: 'use "must", not "should"', text: sentence.slice(0, 90) })
    }
  }
  for (const [re, want] of VOCAB) {
    const m = text.match(re)
    if (m) {
      problems.push({ file, lineno, kind: `use "${want}", not "${m[0]}"`, text: text.slice(0, 90) })
    }
  }
}

// Classifies each line of a file. A fence line and a line inside a fence get
// "fence" and "fenced". A line indented four spaces or a tab is "indented" code
// when no list item is open, and a blank line or code line comes before it.
// Other lines are "text". Indented lines inside a list item stay "text".
function lineKinds(lines) {
  const kinds = []
  let fenced = false
  let inList = false
  let prev = 'blank'
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      kinds.push('fence')
      prev = 'fence'
      continue
    }
    if (fenced) {
      kinds.push('fenced')
      prev = 'fenced'
      continue
    }
    if (!line.trim()) {
      kinds.push('blank')
      prev = 'blank'
      continue
    }
    const width = indentWidth(line)
    if (width >= 4) {
      const code = !inList && (prev === 'blank' || prev === 'indented')
      kinds.push(code ? 'indented' : 'text')
      prev = code ? 'indented' : 'text'
      continue
    }
    if (LIST_MARKER.test(line)) inList = true
    else if (width === 0) inList = false
    kinds.push('text')
    prev = 'text'
  }
  return kinds
}

// The width of the leading whitespace. A tab counts as four spaces.
function indentWidth(line) {
  return /^[ \t]*/.exec(line)[0].replace(/\t/g, '    ').length
}

// Reads a SQL single-quoted literal that opens at `start`. A doubled quote is
// one literal quote inside the value.
function readSqlQuoted(text, start) {
  let i = start + 1
  let value = ''
  while (i < text.length) {
    if (text[i] === "'") {
      if (text[i + 1] === "'") {
        value += "'"
        i += 2
        continue
      }
      return { value, end: i + 1, closed: true }
    }
    value += text[i]
    i += 1
  }
  return { value, end: text.length, closed: false }
}

// The offset of a leading `--` comment, or -1. A `--` inside a quoted literal
// or a dollar-quoted body is not a comment.
function sqlLineCommentAt(text) {
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === "'") {
      i = readSqlQuoted(text, i).end
      continue
    }
    if (ch === '$') {
      const m = /^\$\w*\$/.exec(text.slice(i))
      if (m) {
        const close = text.indexOf(m[0], i + m[0].length)
        i = close < 0 ? text.length : close + m[0].length
        continue
      }
    }
    if (ch === '-' && text[i + 1] === '-') return i
    i += 1
  }
  return -1
}

// Classifies the lines of a SQL file as `comment` or `statement`, and returns
// the prose each one carries. A block comment may run over many lines, and a
// statement keeps going until its `;`, so both carry state from line to line.
// The prose of a comment is its body; the prose of a statement is the RAISE
// message it carries, if any. A `--` comment that starts a line is a comment
// line, even in the middle of a statement. Only SQL files get these kinds.
const SQL_STATEMENT_PROSE = /^raise\s+(?:exception|warning|notice|info|log|debug)\b/i

function sqlLineKinds(lines) {
  const kinds = []
  let blockDepth = 0
  let inStatement = false
  for (const line of lines) {
    const commentAt = sqlLineCommentAt(line)
    const startsComment = blockDepth === 0 && !inStatement && commentAt >= 0 && !line.slice(0, commentAt).trim()
    if (startsComment) {
      const at = sqlLineCommentAt(line)
      kinds.push({ kind: 'comment', prose: line.slice(at + 2).trim() })
      continue
    }
    let statement = ''
    let comment = ''
    let block = ''
    let i = 0
    while (i < line.length) {
      if (blockDepth > 0) {
        const pair = line.slice(i, i + 2)
        if (pair === '/*' || pair === '*/') {
          blockDepth += pair === '/*' ? 1 : -1
          block += ' '
          i += 2
        } else {
          block += line[i]
          i += 1
        }
        continue
      }
      const ch = line[i]
      if (ch === "'") {
        const q = readSqlQuoted(line, i)
        statement += line.slice(i, q.end)
        i = q.end
        continue
      }
      if (ch === '$') {
        const m = /^\$\w*\$/.exec(line.slice(i))
        if (m) {
          const close = line.indexOf(m[0], i + m[0].length)
          const end = close < 0 ? line.length : close + m[0].length
          statement += line.slice(i, end)
          i = end
          continue
        }
      }
      if (ch === '/' && line[i + 1] === '*') {
        blockDepth = 1
        i += 2
        continue
      }
      if (ch === '-' && line[i + 1] === '-') {
        comment = line.slice(i + 2).trim()
        break
      }
      statement += ch
      i += 1
    }
    const body = statement.replace(/\s+/g, ' ').trim()
    const comments = [block.trim(), comment].filter(Boolean).join(' ')
    if (inStatement && !body && comment) {
      kinds.push({ kind: 'comment', prose: comments })
      continue
    }
    if (!inStatement && !body) {
      kinds.push({ kind: 'comment', prose: comments })
      continue
    }
    const raise = SQL_STATEMENT_PROSE.test(body) ? sqlStatementProse(body) : null
    kinds.push({ kind: 'statement', prose: [comments, raise].filter(Boolean).join(' ') })
    // A function body ends at `$$;`, and a plain statement at `;`. Both close
    // the statement, so the next line starts fresh.
    if (/(?:^|[^$])\$\$;\s*$|;\s*$/.test(body) && !/^begin\b/i.test(body)) inStatement = false
    else inStatement = true
  }
  return kinds
}

// Directory prefixes the diff runs skip. Each entry names its reason beside it.
const EXCLUDED_PATH_PREFIXES = [
  'docs/consistency/', // planning notes written before the STE rules applied
  'docs/agents/AGENTS-FULL.md', // verbatim copy of AGENTS.md written before the STE rules applied
  // Exported design artifacts and their source notes. The mockups are generated
  // by a visual design tool and the wrapper text says so; rewriting that text
  // would falsify a record of what was exported. The notes beside them are the
  // design input, quoted in the export.
  'docs/redesign/papercut-warmth/',
]

// Vendored third-party bundles are not prose an agent wrote. The design export
// artifacts carry their own copies of React and React DOM, minified, under a
// `vendor/` directory. Scanning them reports the vendor's text as if it were our
// prose: 105 of the gate's findings came from two React files, which no rewrite
// here can fix and no reader of this repository wrote. A path segment is matched
// rather than a tree, so authored READMEs beside those bundles stay checked.
const EXCLUDED_PATH_SEGMENTS = ['/vendor/']

function isExcludedPath(file) {
  const normalised = file.replace(/\\/g, '/')
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => normalised.startsWith(prefix))) return true
  return EXCLUDED_PATH_SEGMENTS.some((segment) => normalised.includes(segment))
}

// Checks one line. A list item in a fence is code, and an indented block is
// code, so both are skipped. A plain line in a fence is still checked. A SQL
// file supplies its own kinds, and the prose its scanner found.
function checkIfProse(file, lineno, text, kind = 'text', prose) {
  const name = kind && typeof kind === 'object' ? kind.kind : kind
  if (name === 'indented') return
  if (name === 'code') return
  if (name === 'fenced' && LIST_MARKER.test(text)) return
  if (name === 'comment' || name === 'statement') {
    if (!prose) return
    checkedLines += 1
    checkLine(file, lineno, prose)
    return
  }
  if (!isProse(text, file)) return
  checkedLines += 1
  checkLine(file, lineno, text)
}

// The kinds a file uses for its lines. A SQL file is read as comments and
// statements, so a block-comment body and a RAISE message are prose while the
// statements stay code.
function kindsFor(file, lines) {
  if (file.endsWith('.sql')) return sqlLineKinds(lines)
  if (file.endsWith('.css')) return cssLineKinds(lines)
  if (/\.(?:[cm]?[jt]sx?)$/.test(file)) return codeLineKinds(lines)
  return lineKinds(lines)
}

/**
 * Classify one source line as code or comment prose.
 *
 * Before this existed, a TypeScript file fell through to `lineKinds`, which is
 * written for Markdown and treats every non-indented line as prose. That made the
 * gate report identifiers as prose: `attempt: number,` in a function signature
 * was scored as a sentence using a code word, and the suggested remedy
 * was to rewrite an API parameter. Line length limits were applied to code too.
 *
 * A line is prose only when it carries comment text, and only the comment body is
 * checked. Everything else is code and is skipped.
 */
function codeLineKinds(lines) {
  const kinds = []
  let blockDepth = 0
  for (const line of lines) {
    let prose = ''
    let i = 0
    let sawCode = false
    while (i < line.length) {
      if (blockDepth > 0) {
        const close = line.indexOf('*/', i)
        if (close < 0) {
          prose += ' ' + line.slice(i)
          i = line.length
        } else {
          prose += ' ' + line.slice(i, close)
          blockDepth = 0
          i = close + 2
        }
        continue
      }
      const ch = line[i]
      const pair = line.slice(i, i + 2)
      if (pair === '//') {
        prose += ' ' + line.slice(i + 2)
        break
      }
      if (pair === '/*') {
        blockDepth = 1
        i += 2
        continue
      }
      // A string or template literal is code, and it may hold comment markers.
      if (ch === '"' || ch === "'" || ch === '`') {
        let j = i + 1
        while (j < line.length) {
          if (line[j] === '\\') { j += 2; continue }
          if (line[j] === ch) { j += 1; break }
          j += 1
        }
        sawCode = true
        i = j
        continue
      }
      if (!/\s/.test(ch)) sawCode = true
      i += 1
    }
    const body = prose.replace(/\s+/g, ' ').trim()
    if (sawCode) kinds.push({ kind: 'statement', prose: body })
    else if (body) kinds.push({ kind: 'comment', prose: body })
    else kinds.push({ kind: 'code' })
  }
  return kinds
}

/**
 * Classify one stylesheet line.
 *
 * A line is code when it carries CSS syntax: a declaration, a brace, an
 * at-rule, or a selector list. A line is prose when it is a comment body or
 * bare text, which is where a stylesheet's own prose lives.
 *
 * The distinction is by line shape, not by file extension. An explicit
 * `--file` check on a stylesheet must still report bad prose, which is the
 * contract the extraction guard already pins.
 */
function cssLineKinds(lines) {
  const kinds = []
  let inComment = false
  for (const line of lines) {
    const t = line.trim()
    if (inComment) {
      kinds.push('text')
      if (t.includes('*/')) inComment = false
      continue
    }
    if (t.startsWith('/*')) {
      kinds.push('text')
      if (!t.includes('*/')) inComment = true
      continue
    }
    if (!t) {
      kinds.push('blank')
      continue
    }
    const looksLikeCss =
      t.endsWith('{') || t.endsWith('}') || t.endsWith(';') || t.endsWith(',') ||
      t.startsWith('@') || t.startsWith('}') || t.includes('{') ||
      /^[.#:\[*]|^[a-zA-Z][\w-]*\s*[>+~]/.test(t)
    kinds.push(looksLikeCss ? 'code' : 'text')
  }
  return kinds
}

function proseOf(kind) {
  if (!kind || typeof kind !== 'object') return undefined
  if (kind.message !== undefined) return kind.message || undefined
  return kind.prose
}

// Git runs with core.quotePath off, so file names stay unquoted for the parser.
function git(args) {
  return execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function commitOf(ref) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim()
  } catch {
    return null
  }
}

function fail(message) {
  throw new GateError(message)
}

// The merge base of a ref and HEAD, or an empty string when there is none.
// The caller decides what a missing merge base means. See requireMergeBase.
function mergeBaseOf(ref) {
  try {
    return git(['merge-base', ref, 'HEAD']).trim()
  } catch {
    return ''
  }
}

// Added lines of `git diff -U0`, each with its file and line number.
// The prefixes are forced, so a diff.noprefix setting cannot hide every file.
// Git adds a tab after a name that has a space. The tab is not part of the name.
function addedLines(args) {
  const out = git(['diff', '-U0', '--no-color', '--no-ext-diff', '--src-prefix=a/', '--dst-prefix=b/', ...args])
  const added = []
  let file = null
  let lineno = 0
  for (const line of out.split(/\r?\n/)) {
    let m
    if (line === '+++ /dev/null') { file = null; continue }
    if ((m = /^\+\+\+ b\/(.*?)\t?$/.exec(line))) { file = m[1]; continue }
    if ((m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line))) { lineno = parseInt(m[1], 10); continue }
    if (file !== null && line.startsWith('+')) {
      added.push({ file, lineno, text: line.slice(1) })
      lineno += 1
    }
  }
  return added
}

let topLevel = null

// The new text of a file: the index for --staged, otherwise the working tree.
function newText(file, staged) {
  if (staged) return git(['show', `:${file}`])
  topLevel ??= git(['rev-parse', '--show-toplevel']).trim()
  return readFileSync(path.join(topLevel, file), 'utf8')
}

// Checks each added line. The file's own text gives its code kinds, so a
// fence or an indented block is read in its context.
function checkAdded(added, staged) {
  const kinds = new Map()
  for (const a of added) {
    if (isExcludedPath(a.file)) continue
    if (!kinds.has(a.file)) kinds.set(a.file, kindsFor(a.file, newText(a.file, staged).split(/\r?\n/)))
    const kind = kinds.get(a.file)[a.lineno - 1]
    checkIfProse(a.file, a.lineno, a.text, kind, proseOf(kind))
  }
}

// Compare extracted files with the immutable extraction commit as well. Only
// lines still identical to that extraction are historical. If the commit is
// missing, check all lines rather than silently granting an exemption.
//
// A module can inherit comments from the frozen legacy sections when a move
// carries them out of `legacy/`. Its line numbers differ, so a positional
// compare cannot work.
//
// The exemption is deliberately narrow. It applies only to a module that the
// ownership map registers as a migration destination, and only to a line that
// is a comment and whose text exists in the extraction commit. New prose
// written in the same file is checked, and an identical sentence pasted into a
// file that is not a registered destination is checked too.
// Modules that a migration may have moved historical comments into. They come
// from the ownership map, so the list cannot drift away from what the CSS
// ownership check considers an owner module.
function migrationDestinations() {
  try {
    const mapPath = path.join(process.cwd(), 'docs/css-ownership.json')
    const map = JSON.parse(readFileSync(mapPath, 'utf8'))
    return new Set((map.owners ?? []).map((o) => o.file).filter(Boolean))
  } catch {
    return new Set()
  }
}

function excludeExtractedLines(added) {
  const extraction = '6d356f84b6a6d97d327a651b8295eeee6a38a3b9'
  const sha = commitOf(extraction)
  if (!sha) return added
  const prefix = 'src/styles/legacy/'
  const destinations = migrationDestinations()
  const changed = new Set(addedLines([sha, '--', prefix]).map(a => `${a.file}:${a.lineno}:${a.text}`))

  let extractionComments = null
  const loadExtractionComments = () => {
    if (extractionComments !== null) return extractionComments
    try {
      const files = execFileSync('git', ['ls-tree', '-r', '--name-only', sha, '--', prefix], { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean)
      const text = files
        .map((f) => execFileSync('git', ['show', `${sha}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 }))
        .join('\n')
      // Every line inside a block comment, not only the ones that carry the
      // delimiters. A moved multi-line comment keeps its continuation lines
      // verbatim, and those lines have no `/*` or `*/` to recognise them by.
      const collected = new Set()
      let inComment = false
      for (const raw of text.split(/\r?\n/)) {
        const l = raw.trim()
        if (!inComment && l.startsWith('/*')) {
          collected.add(l)
          if (!l.includes('*/')) inComment = true
          continue
        }
        if (inComment) {
          collected.add(l)
          if (l.includes('*/')) inComment = false
          continue
        }
        if (l.startsWith('*') || l.endsWith('*/')) collected.add(l)
      }
      extractionComments = collected
    } catch {
      extractionComments = new Set()
    }
    return extractionComments
  }

  const isHistoricalComment = (text) => {
    const t = String(text).trim()
    if (!t) return false
    return loadExtractionComments().has(t)
  }

  return added.filter((a) => {
    if (a.file.startsWith(prefix)) return changed.has(`${a.file}:${a.lineno}:${a.text}`)
    if (destinations.has(a.file)) return !isHistoricalComment(a.text)
    return true
  })
}

const argv = process.argv.slice(2)
const argValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)

// Prints the verdict and returns the exit code. Each problem line lists every
// rule it breaks.
function report(label, note = '') {
  if (!problems.length) {
    if (note) console.log(note)
    console.log(`STE100: OK. ${checkedLines} prose line(s) checked: ${label}.`)
    return 0
  }
  const byLine = new Map()
  for (const p of problems) {
    const key = `${p.file}:${p.lineno}`
    if (!byLine.has(key)) byLine.set(key, { text: p.text, kinds: [] })
    byLine.get(key).kinds.push(p.kind)
  }
  console.error(`STE100: ${problems.length} problem(s) on ${byLine.size} line(s)\n`)
  for (const [key, { text, kinds }] of byLine) {
    console.error(`  ${key}  ${kinds.join('; ')}`)
    console.error(`      ${text}`)
  }
  console.error(`\nSTE100: ${checkedLines} prose line(s) checked: ${label}.`)
  console.error('See AGENTS.md §2 rule 13.')
  return 1
}

// Resolves the commit the diff starts from. The --base option names its own
// ref. Otherwise the order in scripts/lint-ste-base.mjs picks the base.
function chooseBase() {
  if (argv.includes('--base')) {
    const ref = argValue('--base')
    if (!ref) fail('--base needs a ref.')
    if (!commitOf(ref)) fail(`--base ${ref} is not a commit.`)
    const sha = requireMergeBase(ref, mergeBaseOf)
    return { sha, label: `changed lines since the merge base of ${ref} and HEAD (${sha.slice(0, 7)})`, warning: '' }
  }
  return chooseLintBase({ env: process.env, commitOf, mergeBaseOf })
}

// Names an empty range, so a run that checks nothing says so.
function rangeNote(base, added) {
  if (added.length > 0) return ''
  const atHead = base.sha === 'HEAD' || base.sha === commitOf('HEAD')
  return `STE100: 0 lines in range (${atHead ? 'base == HEAD' : 'no added lines since the base'}).`
}

// Checks every line of a whole text, such as a file or stdin.
function checkWholeText(file, text) {
  const lines = text.split(/\r?\n/)
  const kinds = kindsFor(file, lines)
  lines.forEach((line, i) => checkIfProse(file, i + 1, line, kinds[i], proseOf(kinds[i])))
}

function main() {
  if (argv.includes('--stdin')) {
    checkWholeText('<stdin>', readFileSync(0, 'utf8'))
    return report('stdin')
  }
  if (argv.includes('--file')) {
    const f = argValue('--file')
    if (!f) fail('--file needs a path.')
    const abs = path.resolve(f)
    checkWholeText(abs, readFileSync(abs, 'utf8'))
    return report(`file ${f}`)
  }
  if (argv.includes('--staged')) {
    checkAdded(addedLines(['--cached']), true)
    return report('staged lines')
  }
  const base = chooseBase()
  if (base.warning) console.error(base.warning)
  const added = addedLines([base.sha])
  checkAdded(excludeExtractedLines(added), false)
  return report(base.label, rangeNote(base, added))
}

try {
  process.exitCode = main()
} catch (err) {
  const message = err instanceof GateError
    ? err.message
    : `cannot read the input: ${String(err.message).split('\n')[0]}`
  console.error(`STE100: ${message}`)
  process.exitCode = 2
}
