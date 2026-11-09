// Map day palette contrast. The gate reads the shipped paint from source: the
// selected-day route in TripMap.tsx and the real Linen and Night style layers.
// A missing or reshaped input throws, so a short read cannot turn this green.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { WORKSPACE_MAP_STYLES } from '../src/lib/workspaceMapStyles'

const FILE = 'TripMap.tsx'
const source = readFileSync(new URL('../src/components/TripMap.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile(FILE, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)

const textOf = (node: ts.Node): string => node.getText(ast).replace(/\s+/g, ' ')

function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node)
  ts.forEachChild(node, (child) => walk(child, visit))
}

type JsxTag = ts.JsxElement | ts.JsxSelfClosingElement

const tagNameOf = (element: JsxTag): string =>
  textOf(ts.isJsxElement(element) ? element.openingElement.tagName : element.tagName)
const attributesOf = (element: JsxTag): ts.JsxAttributes =>
  ts.isJsxElement(element) ? element.openingElement.attributes : element.attributes

// A self-closing tag and a tag with children both count as one element.
function elementsNamed(tag: string): JsxTag[] {
  const found: JsxTag[] = []
  walk(ast, (node) => {
    if ((ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) && tagNameOf(node) === tag) found.push(node)
  })
  return found
}

function attributeOf(element: JsxTag, name: string): ts.JsxAttribute | undefined {
  return attributesOf(element).properties.find(
    (property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && textOf(property.name) === name,
  )
}

// Every value below must be present. An absent attribute throws here.
function expressionOf(element: JsxTag, name: string): ts.Expression {
  const initializer = attributeOf(element, name)?.initializer
  if (!initializer || !ts.isJsxExpression(initializer) || !initializer.expression) {
    throw new Error(`${FILE}: <${tagNameOf(element)}> has no ${name} expression`)
  }
  return initializer.expression
}

function hexLiteral(node: ts.Expression, label: string): string {
  if (!ts.isStringLiteral(node) || !/^#[0-9A-Fa-f]{6}$/.test(node.text)) {
    throw new Error(`${label}: expected a six digit hex string, saw ${textOf(node)}`)
  }
  return node.text.toUpperCase()
}

function numberLiteral(node: ts.Expression, label: string): number {
  if (!ts.isNumericLiteral(node)) throw new Error(`${label}: expected a number, saw ${textOf(node)}`)
  const value = Number(node.text)
  if (!(value > 0 && value <= 1)) throw new Error(`${label}: ${value} is not an opacity`)
  return value
}

function dayColors(): string[] {
  let elements: readonly ts.Expression[] | undefined
  walk(ast, (node) => {
    if (
      elements === undefined &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'DAY_COLORS' &&
      node.initializer !== undefined &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      elements = node.initializer.elements
    }
  })
  if (elements === undefined) throw new Error(`${FILE}: no DAY_COLORS array`)
  return [...elements].map((element) => hexLiteral(element, 'DAY_COLORS entry'))
}

const DAY_COLORS = dayColors()
if (DAY_COLORS.length !== 7) throw new Error(`DAY_COLORS must hold seven hex values, saw ${DAY_COLORS.length}`)

// The selected-day route is the day casing plus the one line painted with
// colorForDay. Both must sit in the same day fragment, so the all-days and
// return cassings cannot stand in for them.
const casings = elementsNamed('MapRoute').filter((element) => {
  const id = attributeOf(element, 'id')
  return id !== undefined && /yf-day-casing/.test(textOf(id))
})
if (casings.length !== 1) throw new Error(`${FILE}: expected one yf-day-casing route, saw ${casings.length}`)

const drawnLines = elementsNamed('MapRoute').filter((element) => {
  const color = attributeOf(element, 'color')
  return color !== undefined && /colorForDay\(/.test(textOf(color))
})
if (drawnLines.length !== 1) throw new Error(`${FILE}: expected one colorForDay route, saw ${drawnLines.length}`)

function fragmentOf(element: JsxTag): ts.JsxElement | undefined {
  for (let node = element.parent; node !== undefined; node = node.parent) {
    if (ts.isJsxElement(node) && textOf(node.openingElement.tagName) === 'Fragment') return node
  }
  return undefined
}
if (fragmentOf(casings[0]) === undefined || fragmentOf(casings[0]) !== fragmentOf(drawnLines[0])) {
  throw new Error(`${FILE}: the selected-day casing and its colorForDay line are not in one fragment`)
}

// A themed pair reads `theme === 'dark' ? dark : light`. Any other shape throws
// rather than guessing which branch a theme takes.
function themedPair<T>(
  node: ts.Expression,
  label: string,
  read: (value: ts.Expression, where: string) => T,
): { dark: T; light: T } {
  if (!ts.isConditionalExpression(node)) throw new Error(`${label}: expected a conditional, saw ${textOf(node)}`)
  if (textOf(node.condition) !== "theme === 'dark'") {
    throw new Error(`${label}: expected the condition theme === 'dark', saw ${textOf(node.condition)}`)
  }
  return { dark: read(node.whenTrue, `${label} dark`), light: read(node.whenFalse, `${label} light`) }
}

const casingColor = themedPair(expressionOf(casings[0], 'color'), 'selected-day casing color', hexLiteral)
const casingOpacity = themedPair(expressionOf(casings[0], 'opacity'), 'selected-day casing opacity', numberLiteral)
const lineColor = expressionOf(drawnLines[0], 'color')
if (!ts.isConditionalExpression(lineColor)) throw new Error('selected-day line color is not a conditional')
if (!ts.isCallExpression(lineColor.whenFalse) || textOf(lineColor.whenFalse.expression) !== 'colorForDay') {
  throw new Error(`selected-day line color is not colorForDay(), saw ${textOf(lineColor.whenFalse)}`)
}

// A rough leg wears --warn at its own opacity. The measured road is the other
// branch, and that branch is the paint this gate measures.
const lineOpacityNode = expressionOf(drawnLines[0], 'opacity')
if (!ts.isConditionalExpression(lineOpacityNode)) throw new Error('selected-day line opacity is not a conditional')
if (textOf(lineOpacityNode.condition) !== 'rough') {
  throw new Error(`selected-day line opacity: expected the condition rough, saw ${textOf(lineOpacityNode.condition)}`)
}
numberLiteral(lineOpacityNode.whenTrue, 'rough-day line opacity')
const lineOpacity = numberLiteral(lineOpacityNode.whenFalse, 'measured-day line opacity')

// The workspace disc inks its number with one constant. A second assignment
// would mean the per-day branch came back.
const inks: ts.PropertyAssignment[] = []
walk(ast, (node) => {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && node.name.text === '--mv2-marker-ink') {
    inks.push(node)
  }
})
if (inks.length !== 1) throw new Error(`${FILE}: expected one --mv2-marker-ink assignment, saw ${inks.length}`)
const markerInk = hexLiteral(inks[0].initializer, 'workspace marker ink')

// The ink sits in `...(workspaceChrome ? { ink } : {})`, so a pin without the
// workspace keeps an empty style object.
const inkParent = inks[0].parent
if (!ts.isObjectLiteralExpression(inkParent)) throw new Error('marker ink is not inside a style object')
const workspaceOnly = inkParent.parent
if (!ts.isConditionalExpression(workspaceOnly) || textOf(workspaceOnly.condition) !== 'workspaceChrome') {
  throw new Error('marker ink is not behind a workspaceChrome conditional')
}
if (!ts.isObjectLiteralExpression(workspaceOnly.whenFalse) || workspaceOnly.whenFalse.properties.length !== 0) {
  throw new Error('the non-workspace marker style fallback must stay an empty object')
}

type Rgb = readonly [number, number, number]

const rgb = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
]

const channel = (value: number): number => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (color: Rgb): number =>
  0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2])

// WCAG contrast: the lighter luminance plus 0.05 over the darker plus 0.05.
const contrast = (a: Rgb, b: Rgb): number => {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// Composite a translucent line over an opaque surface in sRGB byte space.
const composite = (front: Rgb, alpha: number, back: Rgb): Rgb => [
  front[0] * alpha + back[0] * (1 - alpha),
  front[1] * alpha + back[1] * (1 - alpha),
  front[2] * alpha + back[2] * (1 - alpha),
]

type Theme = keyof typeof WORKSPACE_MAP_STYLES
type MapLayer = (typeof WORKSPACE_MAP_STYLES)[Theme]['layers'][number]
// The supplied Liberty-based styles name the same surfaces with these ids.
const SURFACE_LAYERS = ['background', 'landuse_residential', 'park', 'water', 'road_trunk_primary', 'road_minor', 'road_motorway'] as const

// Read the layer's own paint color. The switch narrows the union, so no cast
// is necessary, and an unexpected layer type throws.
function layerColor(layer: MapLayer, theme: Theme): Rgb {
  let value: unknown
  switch (layer.type) {
    case 'background':
      value = layer.paint?.['background-color']
      break
    case 'fill':
      value = layer.paint?.['fill-color']
      break
    case 'line':
      value = layer.paint?.['line-color']
      break
    default:
      throw new Error(`WORKSPACE_MAP_STYLES.${theme}: layer ${layer.id} is a ${layer.type}, not a surface`)
  }
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    throw new Error(`WORKSPACE_MAP_STYLES.${theme}: layer ${layer.id} paint is not a hex literal`)
  }
  return rgb(value)
}

function surfaceColors(theme: Theme): { id: string; color: Rgb }[] {
  return SURFACE_LAYERS.map((id) => {
    const layer = WORKSPACE_MAP_STYLES[theme].layers.find((candidate) => candidate.id === id)
    if (layer === undefined) throw new Error(`WORKSPACE_MAP_STYLES.${theme} has no ${id} layer`)
    return { id, color: layerColor(layer, theme) }
  })
}

const SURFACES = { light: surfaceColors('light'), dark: surfaceColors('dark') }

function land(theme: Theme): Rgb {
  const background = SURFACES[theme].find((surface) => surface.id === 'background')
  if (background === undefined) throw new Error(`no background layer in ${theme}`)
  return background.color
}

describe('approved map day palette', () => {
  it('keeps the brand teal as the first day', () => {
    expect(DAY_COLORS[0]).toBe('#0D8D82')
  })

  // The gate must be able to fail. These are the two RED values that the
  // original amber #F59E2D recorded, so a broken read cannot pass silently.
  it('fails the known-bad original amber on the same numbers as the RED run', () => {
    expect(contrast(rgb('#F59E2D'), land('light'))).toBeCloseTo(1.7726, 3)
    const casing = composite(rgb(casingColor.light), casingOpacity.light, land('light'))
    const line = composite(rgb('#F59E2D'), lineOpacity, casing)
    expect(contrast(line, casing)).toBeCloseTo(1.9746, 3)
  })

  it('keeps every day at least 3:1 against Linen and Night land', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const hex of DAY_COLORS) {
        expect(contrast(rgb(hex), land(theme)), `${hex} on ${theme} land`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('keeps the shipped day line over its casing at least 3:1 on seven surfaces', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const surface of SURFACES[theme]) {
        const casing = composite(rgb(casingColor[theme]), casingOpacity[theme], surface.color)
        for (const hex of DAY_COLORS) {
          const line = composite(rgb(hex), lineOpacity, casing)
          expect(contrast(line, casing), `${hex} over ${theme}/${surface.id}`).toBeGreaterThanOrEqual(3)
        }
      }
    }
  })

  it('keeps the approved opaque disc ink at least 4.5:1 on every day disc', () => {
    expect(markerInk).toBe('#02080D')
    for (const hex of DAY_COLORS) {
      expect(contrast(rgb(markerInk), rgb(hex)), `${markerInk} on ${hex}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
