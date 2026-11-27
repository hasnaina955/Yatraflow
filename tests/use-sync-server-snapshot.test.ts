// ============ Every store hook has a server snapshot ============
// `useSyncExternalStore(subscribe, getSnapshot)` with no third argument throws
// during a server render ("Missing getServerSnapshot"). The build-time prerender
// renders the static copy pages with react-dom/server, so one hook without the
// argument would fail the whole build. This scan parses every source file, so a
// call split over several lines is still counted, and a new hook is checked too.
import { readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import * as ts from 'typescript'

const srcRoot = new URL('../src/', import.meta.url)

interface HookCall {
  file: string
  line: number
  args: number
}

/** Every `useSyncExternalStore(...)` call in one file, with its argument count. */
function hookCalls(file: string, text: string): HookCall[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
  const found: HookCall[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee) ? callee.name.text : ''
      if (name === 'useSyncExternalStore') {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        found.push({ file, line: line + 1, args: node.arguments.length })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return found
}

/** Every hook call under src. Files are read in parallel: a sequential read of
 *  the whole tree is slow on this box. */
async function allSourceCalls(): Promise<HookCall[]> {
  const files = readdirSync(srcRoot, { recursive: true })
    .map(file => String(file).split('\\').join('/'))
    .filter(file => /\.(ts|tsx)$/.test(file))
  const texts = await Promise.all(
    files.map(async file => (await readFile(new URL(file, srcRoot), 'utf8')).replace(/\r\n/g, '\n')),
  )
  return files.flatMap((file, index) => hookCalls(file, texts[index]))
}

describe('every useSyncExternalStore under src passes a server snapshot', () => {
  it('finds the hooks it must check, so the scan cannot pass on nothing', async () => {
    const calls = await allSourceCalls()
    // The store alone has seventeen hooks, and the theme, timefmt and join gate add more.
    expect(calls.length).toBeGreaterThanOrEqual(18)
    expect(calls.some(call => call.file === 'store/store.ts')).toBe(true)
  })

  it('passes a third argument to every call', async () => {
    const calls = await allSourceCalls()
    const bare = calls.filter(call => call.args < 3).map(call => `${call.file}:${call.line}`)
    expect(bare, 'useSyncExternalStore without getServerSnapshot').toEqual([])
  })

  it('counts only real calls, not comments or strings, and reads a call split over lines', () => {
    const sample = hookCalls('sample.tsx', [
      '// useSyncExternalStore(subscribe, get)',
      "const s = 'useSyncExternalStore(a, b)'",
      'const x = React.useSyncExternalStore(',
      '  subscribe,',
      '  getSnapshot,',
      '  getSnapshot,',
      ')',
    ].join('\n'))
    expect(sample).toEqual([{ file: 'sample.tsx', line: 3, args: 3 }])
  })
})
