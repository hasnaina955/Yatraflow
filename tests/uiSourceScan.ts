import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

export function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = join(root, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) ? [file] : []
  })
}

/** Parsing excludes comments without changing source offsets used by diagnostics. */
export function sourceTree(file: string, input = readFileSync(file, 'utf8')) {
  const source = input.replace(/\r\n/g, '\n')
  return { source, tree: ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true) }
}

// The dash character, its HTML entity, and the escape text a source file can carry.
const BANNED_DASH = /—|&mdash;|\\u2014/i

export function emDashLabels(file: string, input?: string): string[] {
  const normalized = (input ?? readFileSync(file, 'utf8')).replace(/\r\n/g, '\n')
  if (!BANNED_DASH.test(normalized)) return []
  const { source, tree } = sourceTree(file, normalized)
  const failures: string[] = []
  function visit(node: ts.Node) {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      // Check the literal source text, so an escape cannot hide a dash the emitted text would show.
      const raw = source.slice(node.getStart(tree), node.end)
      if (BANNED_DASH.test(raw)) failures.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${raw.trim()}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return failures
}

const visibleProps = /^(?:aria-label|aria-description|title|placeholder|alt|label|caption|subtitle|hint|message|emptyText|loadingText|errorText|description|text)$/
export function lowercaseMapLabels(file: string, input?: string): string[] {
  const { tree } = sourceTree(file, input)
  const failures = new Set<string>()
  function check(node: ts.Node, text: string) {
    const value = text.trim()
    if (/^[a-z]/.test(value) && !/^(?:min|km|m|h|s|k|px|am|pm)(?:\b|$)/.test(value)) failures.add(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: ${value}`)
  }
  function rendered(node: ts.Node) {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) check(node, node.text)
    else if (ts.isTemplateExpression(node)) check(node.head, node.head.text)
    else if (ts.isConditionalExpression(node)) { rendered(node.whenTrue); rendered(node.whenFalse) }
    else if (ts.isParenthesizedExpression(node)) rendered(node.expression)
    else if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) rendered(node.right)
      else if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) { rendered(node.left); rendered(node.right) }
    }
  }
  function visit(node: ts.Node) {
    if (ts.isJsxText(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const siblings = node.parent.children
      const earlier = siblings.slice(0, siblings.indexOf(node)).some(child => !ts.isJsxText(child) || child.text.trim() !== '')
      if (!earlier) check(node, node.text)
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent)) rendered(node.expression)
    if (ts.isJsxAttribute(node) && visibleProps.test(node.name.getText(tree)) && node.initializer) {
      if (ts.isJsxExpression(node.initializer) && node.initializer.expression) rendered(node.initializer.expression)
      else rendered(node.initializer)
    }
    if (ts.isPropertyAssignment(node) && visibleProps.test(node.name.getText(tree).replace(/['"]/g, ''))) rendered(node.initializer)
    if (ts.isReturnStatement(node) && node.expression) {
      let owner: ts.Node | undefined = node.parent
      while (owner && !ts.isFunctionDeclaration(owner)) owner = owner.parent
      if (owner && ts.isFunctionDeclaration(owner) && /(?:Text|Label|Bits|Kicker|Title|Meta)$/.test(owner.name?.text ?? '')) rendered(node.expression)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return [...failures]
}
