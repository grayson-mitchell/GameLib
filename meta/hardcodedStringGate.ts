/**
 * D-16's enforcement gate: a `ts-morph` AST scanner that finds hardcoded,
 * user-facing string literals in fork-owned frontend source that are not
 * wrapped in `t()` and not an exact do-not-translate glossary term.
 *
 * This file is exercised as a jest test at
 * `meta/__tests__/hardcodedStringGate.test.ts`, which rides the
 * already-blocking `pnpm test:ci` (the `meta/` directory is already a jest
 * project — see `meta/jest.config.js`). There is NO `pnpm` script for this
 * file and NO new CI YAML — the test suite itself IS the gate.
 *
 * `react/jsx-no-literals` was rejected (RESEARCH.md / D-16): it is
 * structurally blind to `.ts` files, so it cannot cover
 * `RedeemSteamKeyDialog/copy.ts`. `meta/lintTranslations.ts` was rejected: it
 * lints catalog JSON, not source AST. Neither is extended; this is new code.
 *
 * `scanSource()` MUST NEVER be given network or git access — it is a pure
 * function over `(filePath, sourceText, config)`, built on ts-morph's
 * `useInMemoryFileSystem: true` Project so it never touches disk itself.
 * The only disk read anywhere in this file is `loadGlossary()`'s fixed,
 * caller-overridable path.
 *
 * This file lands the half of the gate that decides what a violation IS
 * (literal collection, user-facing classification, glossary exemption).
 * Plan 04 adds the D-14 dataflow/comment-marker exemptions (see the
 * `// plan 04` marker below). Plan 05 adds scope orchestration
 * (`scanScope()`) and the D-18 allowlist.
 */

import { readFileSync } from 'node:fs'

import { Node, Project, ts } from 'ts-morph'

// ---------------------------------------------------------------------------
// Types (contract consumed by plans 04, 05, 06 — do not rename or reshape)
// ---------------------------------------------------------------------------

export interface Violation {
  file: string // repo-root-relative POSIX path
  line: number // 1-based
  column: number // 1-based
  text: string // the literal's own text, un-quoted
  kind:
    | 'jsx-text'
    | 'jsx-attribute'
    | 'object-property'
    | 'return'
    | 'variable'
    | 'argument'
  attribute?: string // set when kind === 'jsx-attribute'
}

export interface ScanResult {
  file: string
  violations: Violation[]
  exempted: number // count of literals considered and exempted — proves the
  // scanner actually looked, so a zero-violation file is
  // distinguishable from an unscanned one (T-34.8-07)
  fileExempt: boolean // set by plan 04's comment-marker exemption
}

export interface GateConfig {
  glossary: string[]
}

// ---------------------------------------------------------------------------
// User-facing scope (v1) — a deliberate, visible decision, not implicit
// scanner behaviour. Changing this scope is a scope change requiring a new
// decision (RESEARCH.md Open Question 1, resolved by this plan).
// ---------------------------------------------------------------------------

/** JSX attributes whose string value is treated as user-facing prose. */
export const USER_FACING_ATTRIBUTES = [
  'title',
  'aria-label',
  'alt',
  'placeholder',
  'label'
] as const

/**
 * JSX attributes whose string value is NEVER user-facing prose: CSS/DOM
 * plumbing (`className`, `id`, `htmlFor`, `key`, `type`, `role`, `name`),
 * navigation/reference targets (`href`, `src`, `to`), every `data-*`
 * attribute (matched by prefix — confirmed non-user-facing via
 * `LibraryFilters`' `data-tour="library-filters"`), and every `aria-*`
 * OTHER than `aria-label` (`aria-describedby`, `aria-controls`,
 * `aria-pressed`, `aria-hidden` are references and booleans, not text).
 */
export const EXCLUDED_ATTRIBUTES = [
  'className',
  'id',
  'htmlFor',
  'key',
  'type',
  'role',
  'name',
  'href',
  'src',
  'to'
] as const

function isExcludedAttribute(attributeName: string): boolean {
  if (attributeName.startsWith('data-')) return true
  if (attributeName.startsWith('aria-') && attributeName !== 'aria-label') {
    return true
  }
  return (EXCLUDED_ATTRIBUTES as readonly string[]).includes(attributeName)
}

// ---------------------------------------------------------------------------
// Glossary loading (D-02 / D-21) — a tool that cannot do its job must refuse
// loudly rather than pass silently (mirrors buildCrossoverIndex.ts's
// ZeroRecordError posture).
// ---------------------------------------------------------------------------

export class GlossaryLoadError extends Error {
  constructor(message: string) {
    super(`GlossaryLoadError: ${message}`)
    this.name = 'GlossaryLoadError'
  }
}

export function loadGlossary(path = 'meta/i18nGlossary.json'): string[] {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (error) {
    throw new GlossaryLoadError(
      `could not read glossary file at "${path}": ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new GlossaryLoadError(
      `glossary file at "${path}" is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  const terms = (parsed as { terms?: unknown })?.terms
  if (!Array.isArray(terms) || terms.length === 0) {
    throw new GlossaryLoadError(
      `glossary file at "${path}" has no terms — refusing to load an ` +
        'empty do-not-translate list (a silently empty glossary would ' +
        'exempt nothing and make the gate untrustworthy)'
    )
  }

  return terms as string[]
}

// ---------------------------------------------------------------------------
// Technical-token / non-prose shape detection
// ---------------------------------------------------------------------------

const URL_SCHEME_RE = /^(https?|file|steam|tauri):/
const HEX_COLOUR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/
const BARE_FILE_EXTENSION_RE = /^\.[a-zA-Z0-9]+$/
const KEBAB_OR_SNAKE_RE = /^[A-Za-z0-9]+([-_][A-Za-z0-9]+)+$/
// camelCase: starts lowercase, no whitespace, and contains at least one
// lower-to-upper transition (i.e., genuinely multiple concatenated words —
// a plain single English word like "Unrated" must NOT match this).
const CAMEL_CASE_RE = /^[a-z][a-zA-Z0-9]*$/
const CAMEL_CASE_TRANSITION_RE = /[a-z][A-Z]/

function isTechnicalToken(rawText: string): boolean {
  const text = rawText.trim()
  if (text.length <= 1) return true
  if (URL_SCHEME_RE.test(text)) return true
  if (HEX_COLOUR_RE.test(text)) return true
  if (BARE_FILE_EXTENSION_RE.test(text)) return true

  const hasWhitespace = /\s/.test(text)
  if (/[\\/]/.test(text) && !hasWhitespace) return true // path
  if (!hasWhitespace) {
    if (KEBAB_OR_SNAKE_RE.test(text)) return true
    if (CAMEL_CASE_RE.test(text) && CAMEL_CASE_TRANSITION_RE.test(text)) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// Non-user-facing structural positions — a candidate literal found in any
// of these AST positions is DISCARDED entirely: it does not even count
// toward `ScanResult.exempted`, because it was never a real candidate.
// ---------------------------------------------------------------------------

function isConsoleArgument(node: Node): boolean {
  const call = node.getFirstAncestor(Node.isCallExpression)
  if (!call) return false
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return false
  const target = callee.getExpression()
  return Node.isIdentifier(target) && target.getText() === 'console'
}

function isNewErrorArgument(node: Node): boolean {
  const newExpr = node.getFirstAncestor(Node.isNewExpression)
  if (!newExpr) return false
  const callee = newExpr.getExpression()
  return Node.isIdentifier(callee) && /Error$/.test(callee.getText())
}

function isModuleSpecifier(node: Node): boolean {
  const parent = node.getParent()
  if (!parent) return false
  if (Node.isImportDeclaration(parent)) {
    return parent.getModuleSpecifier() === node
  }
  if (Node.isExportDeclaration(parent)) {
    return parent.getModuleSpecifier() === node
  }
  return false
}

function isLiteralTypePosition(node: Node): boolean {
  const parent = node.getParent()
  return !!parent && Node.isLiteralTypeNode(parent)
}

function isObjectKey(node: Node): boolean {
  const parent = node.getParent()
  if (!parent) return false
  if (Node.isPropertyAssignment(parent) || Node.isPropertySignature(parent)) {
    return parent.getNameNode() === node
  }
  return false
}

function isEnumMemberName(node: Node): boolean {
  const parent = node.getParent()
  return !!parent && Node.isEnumMember(parent) && parent.getNameNode() === node
}

function isElementAccessKey(node: Node): boolean {
  const parent = node.getParent()
  return (
    !!parent &&
    Node.isElementAccessExpression(parent) &&
    parent.getArgumentExpression() === node
  )
}

// ---------------------------------------------------------------------------
// Kind classification — what shape of code position the literal sits in.
// ---------------------------------------------------------------------------

interface Classification {
  kind: Violation['kind']
  attribute?: string
}

/** Resolves the enclosing JsxAttribute for a literal used either directly
 * (`title="text"`) or wrapped in a JsxExpression (`title={'text'}`). */
function getEnclosingJsxAttributeName(node: Node): string | undefined {
  const parent = node.getParent()
  if (!parent) return undefined
  if (Node.isJsxAttribute(parent)) {
    return parent.getNameNode().getText()
  }
  if (Node.isJsxExpression(parent)) {
    const grandparent = parent.getParent()
    if (Node.isJsxAttribute(grandparent)) {
      return grandparent.getNameNode().getText()
    }
  }
  return undefined
}

function classify(node: Node): Classification {
  const attributeName = getEnclosingJsxAttributeName(node)
  if (attributeName !== undefined) {
    return { kind: 'jsx-attribute', attribute: attributeName }
  }

  const parent = node.getParent()
  if (parent) {
    if (Node.isPropertyAssignment(parent) && parent.getInitializer() === node) {
      return { kind: 'object-property' }
    }
    if (Node.isReturnStatement(parent)) {
      return { kind: 'return' }
    }
    if (
      Node.isVariableDeclaration(parent) &&
      parent.getInitializer() === node
    ) {
      return { kind: 'variable' }
    }
  }

  return { kind: 'argument' }
}

// ---------------------------------------------------------------------------
// Discard decision — every reason a candidate literal is NOT a real
// violation candidate at all (structural position, technical-token shape,
// or containing no letter whatsoever).
// ---------------------------------------------------------------------------

function shouldDiscard(
  node: Node,
  text: string,
  classification: Classification
): boolean {
  if (isConsoleArgument(node)) return true
  if (isNewErrorArgument(node)) return true
  if (
    classification.kind === 'jsx-attribute' &&
    classification.attribute !== undefined &&
    isExcludedAttribute(classification.attribute)
  ) {
    return true
  }
  if (isModuleSpecifier(node)) return true
  if (isLiteralTypePosition(node)) return true
  if (isObjectKey(node)) return true
  if (isEnumMemberName(node)) return true
  if (isElementAccessKey(node)) return true
  if (!/[a-zA-Z]/.test(text)) return true // pure punctuation/digits/whitespace/CSS units
  if (isTechnicalToken(text)) return true
  return false
}

// ---------------------------------------------------------------------------
// Template literal helper — per the interfaces contract, a TemplateExpression
// (a template literal WITH interpolations) contributes the concatenation of
// its literal spans only, dropping the interpolated expressions themselves.
// ---------------------------------------------------------------------------

function templateExpressionLiteralText(node: Node): string {
  // node.getText() includes the surrounding backticks; strip them and drop
  // every `${...}` interpolation, keeping only the literal spans.
  const raw = node.getText()
  const withoutBackticks = raw.slice(1, -1)
  return withoutBackticks.replace(/\$\{[^}]*\}/g, '')
}

// ---------------------------------------------------------------------------
// scanSource — the pure entry point
// ---------------------------------------------------------------------------

export function scanSource(
  filePath: string,
  sourceText: string,
  config: GateConfig
): ScanResult {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: false,
      target: ts.ScriptTarget.ES2020
    }
  })
  const sourceFile = project.createSourceFile(filePath, sourceText)

  const glossarySet = new Set(config.glossary)
  const violations: Violation[] = []
  let exempted = 0

  function record(
    node: Node,
    rawText: string,
    classification: Classification
  ): void {
    if (shouldDiscard(node, rawText, classification)) return

    const text = rawText.trim()
    if (glossarySet.has(text)) {
      exempted += 1
      return
    }

    const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart())
    violations.push({
      file: filePath,
      line,
      column,
      text,
      kind: classification.kind,
      ...(classification.attribute !== undefined
        ? { attribute: classification.attribute }
        : {})
    })
  }

  sourceFile.forEachDescendant((node) => {
    if (Node.isJsxText(node)) {
      const text = node.getText()
      if (!text.trim()) return // whitespace-only JsxText is not a candidate
      record(node, text, { kind: 'jsx-text' })
      return
    }

    if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
      const classification = classify(node)
      record(node, node.getLiteralText(), classification)
      return
    }

    if (Node.isTemplateExpression(node)) {
      const classification = classify(node)
      record(node, templateExpressionLiteralText(node), classification)
    }
  })

  return {
    file: filePath,
    violations,
    exempted,
    fileExempt: false // plan 04: D-14 comment-marker full-file exemption hooks in here
  }
}
