// Guards the checked-in Supabase type baseline, src/types/database.generated.ts.
//
// The generated file is type-only, and nothing imports it yet. This test keeps
// two promises. The file keeps its generated-file header. And every table or
// RPC name that the app queries is declared in the file, so a query against a
// name the schema does not declare fails here, before it reaches the database.
// The test reads source as text. It needs no Supabase client and no network.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TYPES_FILE = path.join(ROOT, 'src', 'types', 'database.generated.ts')

// Names the app passes to `.from()` through a variable, so no literal scan finds
// them. They come from refetchContributionRow and the collab hydration loop in
// src/store/store.ts. Update this list when such a call is added or removed.
const DYNAMIC_TABLES = ['suggestions', 'decisions', 'activity'] as const

// Reads a file as text and converts CRLF to LF, so the scan matches on Windows.
const readText = (abs: string) => readFileSync(abs, 'utf8').replace(/\r\n/g, '\n')

// Every file under one folder whose name matches the pattern, as text.
function sourceFiles(dir: string, pattern: RegExp): Array<{ rel: string; text: string }> {
  const abs = path.join(ROOT, dir)
  return readdirSync(abs, { recursive: true, encoding: 'utf8' })
    .filter((rel) => pattern.test(rel))
    .map((rel) => ({ rel: `${dir}/${rel.split(path.sep).join('/')}`, text: readText(path.join(abs, rel)) }))
}

// A `.from('x')` or `.rpc('x')` call with a literal name. Storage buckets and
// the built-in Array, Buffer, Uint8Array and Object statics are not queries.
const QUERY = /(?<!\b(?:storage|Array|Buffer|Uint8Array|Object))\.(from|rpc)\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\2/g

function queriedNames(files: Array<{ rel: string; text: string }>) {
  const tables = new Set<string>()
  const rpcs = new Set<string>()
  for (const file of files) {
    for (const m of file.text.matchAll(QUERY)) {
      if (m[1] === 'from') tables.add(m[3])
      else rpcs.add(m[3])
    }
  }
  return { tables, rpcs }
}

// The names declared directly under `    <section>: {`, at the six-space depth
// where the generator puts each table or function.
function declaredNames(text: string, section: string, nextSection: string): Set<string> {
  const start = text.indexOf(`\n    ${section}: {\n`)
  const end = text.indexOf(`\n    ${nextSection}: {`, start)
  if (start < 0 || end < 0) return new Set()
  const block = text.slice(start, end)
  return new Set([...block.matchAll(/^ {6}([a-z_0-9]+): \{/gm)].map((m) => m[1]))
}

const types = readText(TYPES_FILE)
const declaredTables = declaredNames(types, 'Tables', 'Views')
const declaredFunctions = declaredNames(types, 'Functions', 'Enums')
const app = [...sourceFiles('src', /\.(ts|tsx)$/), ...sourceFiles('api', /\.js$/)]
const { tables: queriedTables, rpcs: queriedRpcs } = queriedNames(app)

describe('Supabase database type baseline', () => {
  it('keeps the generated-file header', () => {
    const head = types.split('\n').slice(0, 6).join('\n')
    expect(head).toMatch(/GENERATED FILE\. DO NOT EDIT BY HAND\./)
    expect(head).toMatch(/Generated on \d{4}-\d{2}-\d{2}/)
    expect(head).toMatch(/schema `public`/)
    expect(head).toMatch(/docs\/supabase-types\.md/)
  })

  it('parses a non-empty public schema, so the checks below cannot pass vacuously', () => {
    expect(declaredTables.has('trips')).toBe(true)
    expect(declaredFunctions.has('join_trip')).toBe(true)
  })

  it('finds the app queries, so the scan cannot pass vacuously', () => {
    expect(queriedTables.has('trips')).toBe(true)
    expect(queriedRpcs.has('submit_collab_command')).toBe(true)
  })

  it('declares every table the app queries', () => {
    const wanted = new Set<string>([...queriedTables, ...DYNAMIC_TABLES])
    const missing = [...wanted].filter((name) => !declaredTables.has(name)).sort()
    expect(missing, 'add the table to src/types/database.generated.ts or fix the query').toEqual([])
  })

  it('declares every RPC the app calls as a function', () => {
    const missing = [...queriedRpcs].filter((name) => !declaredFunctions.has(name)).sort()
    expect(missing, 'add the function to src/types/database.generated.ts or fix the call').toEqual([])
  })
})
