import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function deferred() {
  let resolve = (_value: unknown) => {}
  const promise = new Promise<unknown>(r => { resolve = r })
  return { promise, resolve }
}
function component(path: string, name: string, globals: Record<string, unknown>) {
  const source = readFileSync(path, 'utf8')
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const node = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)
  if (!node) throw new Error(`Missing ${name}`)
  const js = ts.transpileModule(node.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText
  const context = createContext(globals)
  return runInContext(`${js}; ${name}`, context) as (props: Record<string, unknown>) => ElementNode
}
type ElementNode = { type: unknown; props: Record<string, unknown>; children: unknown[] }
function findButton(node: unknown, label: string): ElementNode | undefined {
  if (Array.isArray(node)) return node.map(n => findButton(n, label)).find(Boolean)
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined
  const el = node as ElementNode
  if (el.type === 'button' && el.children.includes(label)) return el
  return findButton(el.children, label) ?? findButton(el.props.actions, label)
}
function harness() {
  const updates: unknown[] = []
  const effects: Array<() => unknown> = []
  let live = true
  let sequence = 0
  const scope = { live: () => live }
  const globals = {
    React: { createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: props ?? {}, children }) },
    useState: (initial: unknown) => [initial, (value: unknown) => { updates.push(value) }],
    useRef: (value: unknown) => ({ current: value }),
    useEffect: (effect: () => unknown) => { effects.push(effect) },
    captureJoinRequestScope: () => scope,
    nextAttemptId: () => ++sequence,
    StateBlock: 'StateBlock', Link2: 'Link2', Chip: 'Chip', ROLE_NAME: { viewer: 'Viewer' },
    timeAgo: () => '', appLink: () => ({}),
  }
  return { globals, effects, updates, switchAccount: () => { live = false } }
}

describe('stale join request UI continuations', () => {
  it('does not show sent or failed after an account switch', async () => {
    const h = harness()
    const pending = deferred()
    const render = component('src/App.tsx', 'ApprovalAsk', { ...h.globals, requestTripJoin: () => pending.promise })
    const tree = render({ code: 'CODE', signedIn: true, onNavigate: () => {} })
    const button = findButton(tree, 'Ask to join')
    expect(button).toBeDefined()
    ;(button!.props.onClick as () => void)()
    h.updates.length = 0
    h.switchAccount()
    pending.resolve({ kind: 'ok' })
    await pending.promise
    await Promise.resolve()
    expect(h.updates).toEqual([])
  })
  it('does not install a decision after an account switch', async () => {
    const h = harness()
    const pending = deferred()
    let state = 0
    const render = component('src/pages/trip/JoinRequests.tsx', 'JoinRequestsForIdentity', {
      ...h.globals,
      useState: (initial: unknown) => [state++ === 0 ? { kind: 'ok', requests: [{ id: 'r', role: 'viewer', name: 'A', createdAt: '2026-01-01' }] } : initial,
        (value: unknown) => { h.updates.push(value) }],
      listPendingJoinRequests: () => pending.promise, decideTripJoin: () => pending.promise,
    })
    const tree = render({ tripId: 'trip' })
    const button = findButton(tree, 'Approve')
    expect(button).toBeDefined()
    ;(button!.props.onClick as () => void)()
    h.updates.length = 0
    h.switchAccount()
    pending.resolve({ kind: 'ok' })
    await pending.promise
    await Promise.resolve()
    expect(h.updates).toEqual([])
  })
  it('does not install a pending list after an account switch', async () => {
    const h = harness()
    const pending = deferred()
    const render = component('src/pages/trip/JoinRequests.tsx', 'JoinRequestsForIdentity', {
      ...h.globals, listPendingJoinRequests: () => pending.promise, decideTripJoin: () => pending.promise,
    })
    render({ tripId: 'trip' })
    h.effects.forEach(effect => effect())
    h.switchAccount()
    pending.resolve({ kind: 'ok', requests: [] })
    await pending.promise
    await Promise.resolve()
    expect(h.updates).toEqual([])
  })
})
