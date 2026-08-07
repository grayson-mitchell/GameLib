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
 * This file lands both halves of what a violation IS: plan 03's literal
 * collection / user-facing classification / glossary exemption, and plan
 * 04's D-14 dataflow/comment-marker exemptions (t-alias detection,
 * `[key, defaultText]` tuple tables, assigned-then-passed-to-`t()`
 * fallback, and the full-file leading-comment exemption). Plan 05 adds
 * scope orchestration (`scanScope()`) and the D-18 allowlist.
 */

import { readFileSync } from 'node:fs'

import { Node, Project, SourceFile, ts } from 'ts-morph'

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
  'to',
  'style'
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
// A single lowercase-leading token with no whitespace or separators reads as
// an internal identifier (a runner/store key, a CSS token, an enum-shaped
// value), not rendered prose — this codebase's own convention is that real
// UI text is sentence-cased ("Unrated", "Repair failed..."). This is what
// lets `{ key: 'legendary', label: 'Epic' }` (ConsoleMode's store-label map,
// D-21) need no code change: `legendary`/`gog`/`nile`/`steam`/`sideload`/
// `zoom` are all internal keys, exempt by shape; `label`'s glossary-listed
// brand strings are exempt by the glossary. A capitalized or multi-word
// literal (`Unrated`, `Repair failed. See the log.`) is NOT a single
// lowercase-leading token and is unaffected.
const LOWERCASE_TOKEN_RE = /^[a-z][a-zA-Z0-9]*$/

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
    if (LOWERCASE_TOKEN_RE.test(text)) return true
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

/**
 * Plan 05, discovered while measuring `useTauriOAuthLogin.ts` for the D-17 allowlist:
 * `window.api.logInfo(...)` / `window.api.logError(...)` are this codebase's diagnostic
 * logging channel under the Tauri sidecar (see memory `sidecar-console-and-logger-are-invisible`
 * — stdout IS the RPC pipe, so `console.*` is unreliable there and 26+ fork-owned frontend files
 * use `window.api.log*` instead). These strings are developer-facing log lines, never rendered
 * to a user — the exact same category `isConsoleArgument` already exempts, just reached through
 * the sidecar bridge instead of the global `console` object. Without this, every `window.api.log*`
 * call site in the 134-file scope would flood the gate with false positives, contradicting D-15's
 * "100% actionable" requirement for gate trust.
 */
function isWindowApiLogArgument(node: Node): boolean {
  const call = node.getFirstAncestor(Node.isCallExpression)
  if (!call) return false
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return false
  const methodName = callee.getName()
  if (methodName !== 'log' && !/^log[A-Z]/.test(methodName)) return false
  const target = callee.getExpression()
  if (!Node.isPropertyAccessExpression(target)) return false
  if (target.getName() !== 'api') return false
  const root = target.getExpression()
  return Node.isIdentifier(root) && root.getText() === 'window'
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

/**
 * Plan 05, discovered while measuring `SteamLogin/index.tsx` for the D-17 allowlist: a React
 * inline `style={{ fontSize: '2em', color: 'var(--text-default)' }}` attribute is always an
 * OBJECT literal, never a direct string value — so `getEnclosingJsxAttributeName` (which only
 * fires for `attr="text"` / `attr={'text'}`) never sees it, and every CSS value nested inside
 * that object literal falls through to the generic `object-property` classification meant for
 * real config/prose objects (`{ message: 'Repair failed.' }`). `EXCLUDED_ATTRIBUTES` gained
 * `'style'` for defense-in-depth on any future direct-string case, but the actual bug is this
 * nested-object shape: CSS declaration values (`'2em'`, `'var(--text-lg)'`, `'8px'`) are not
 * user-facing prose and were flooding the SteamLogin measurement (91 raw hits, ~70 of them CSS
 * values) before this fix. 17 of the 134 in-scope files use inline `style={{}}` — left unfixed,
 * this would have swamped plan 06's audit with non-actionable noise, contradicting D-15's
 * "100% actionable" requirement for gate trust.
 */
function isStyleAttributeValue(node: Node): boolean {
  const attribute = node.getFirstAncestor(Node.isJsxAttribute)
  return !!attribute && attribute.getNameNode().getText() === 'style'
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
// Discard decision. Split into two phases so the glossary exemption (which
// must win even over a technical-looking shape, e.g. glossary term "MB/s"
// or "Epic/Legendary" would otherwise match the path-shape check) still
// applies BEFORE the technical-token shape check runs. Structural-position
// discards (console arg, thrown Error arg, excluded JSX attribute,
// import/export specifier, literal type position, object key, enum member
// name, element-access key) are never candidates regardless of text or
// glossary — a glossary term used as an import specifier is still not a
// user-facing candidate.
// ---------------------------------------------------------------------------

function isStructuralNonCandidate(
  node: Node,
  classification: Classification
): boolean {
  if (isConsoleArgument(node)) return true
  if (isWindowApiLogArgument(node)) return true
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
  if (isStyleAttributeValue(node)) return true
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
// D-14 dataflow / comment-marker exemptions (plan 04). Four idioms this
// codebase relies on, all of which would otherwise false-positive the gate
// on day one:
//   1. t()-alias detection (collectTAliases) — `t`, `t2`, `tr`, ...
//   2. `[key, defaultText]` tuple tables — structural, not dataflow
//   3. assigned-then-passed-to-`t()` fallback — single-scope dataflow
//   4. full-file exemption via a leading `i18n-gate-exempt:` comment
// Every exemption here is a hole (see the threat register, T-34.8-09/10/11)
// so each one is kept as narrow as its real-file source demands, and each
// is proven by a paired negative fixture in the test suite.
// ---------------------------------------------------------------------------

/**
 * Collects every local binding that resolves to i18next's `t` function in
 * this source file, so the exemption checks below cover `t`, `t2`, `tr`, and
 * any future alias without a hardcoded name list (RESEARCH.md Pattern 1).
 *
 * Seeded with the bare name `t`: this alone is what makes
 * `repairFailure.ts`'s injected `{ t }: ReportRepairFailureOptions`
 * parameter and `CrossoverBadge.tsx`'s `const { t } = useTranslation()`
 * both resolve without any extra detection — an unaliased `t` call is
 * already covered by the seed.
 *
 * Two detection passes:
 *   - Any `ObjectBindingPattern` element whose resolved property name
 *     (`getPropertyNameNode()?.getText() ?? getName()`) is `t` adds its own
 *     local name to the set. This walks every destructuring context —
 *     `const { t: t2 } = useTranslation()` AND a destructured function
 *     parameter such as `{ t }: ReportRepairFailureOptions` — because both
 *     shapes are `ObjectBindingPattern` nodes in the AST regardless of
 *     whether their parent is a `VariableDeclaration` or a `Parameter`.
 *   - Any (non-destructured) parameter whose declared type text contains
 *     `TFunction` adds its own name — this is what makes an aliased,
 *     directly-typed `TFunction` parameter (plan 07's retrofit of
 *     `copy.ts` to this shape) recognisable even when it is never seeded
 *     as the bare name `t`.
 */
export function collectTAliases(sourceFile: SourceFile): Set<string> {
  const aliases = new Set<string>(['t'])

  sourceFile.forEachDescendant((node) => {
    if (Node.isObjectBindingPattern(node)) {
      node.getElements().forEach((element) => {
        const propertyName =
          element.getPropertyNameNode()?.getText() ?? element.getName()
        if (propertyName === 't') {
          aliases.add(element.getName())
        }
      })
      return
    }

    if (Node.isParameterDeclaration(node)) {
      const typeText = node.getTypeNode()?.getText() ?? ''
      if (typeText.includes('TFunction')) {
        const paramNameNode = node.getNameNode()
        if (Node.isIdentifier(paramNameNode)) {
          aliases.add(paramNameNode.getText())
        }
      }
    }
  })

  return aliases
}

/**
 * Pattern 1 consumption: a string literal that is a direct argument to a
 * `CallExpression` whose callee identifier resolves to a known t-alias is
 * exempt — both the key argument and the default-text argument, since D-13
 * is explicit that the gate does not enforce namespace/key choice, only
 * whether the string is wrapped in `t()` at all.
 */
function isTCallArgument(node: Node, aliases: Set<string>): boolean {
  const parent = node.getParent()
  if (!parent || !Node.isCallExpression(parent)) return false
  const callee = parent.getExpression()
  if (!Node.isIdentifier(callee) || !aliases.has(callee.getText())) {
    return false
  }
  return parent.getArguments().includes(node)
}

// Requires at least one literal `.`, matching this repo's `keySeparator: '.'`
// i18next config — RESEARCH.md Pattern 2, Assumption A1. Deliberately
// narrow: a developer wrapping two unrelated strings in a fake key-shaped
// tuple to dodge the gate is visible in review, and the paired negative
// fixture (`['Windows only', 'Not available on macOS']`) proves the shape
// alone is not enough to exempt.
const DOTTED_KEY_RE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/

/**
 * Pattern 2: exempts both string elements of a `[i18nKeyString,
 * englishDefaultString]` tuple — `CrossoverBadge.tsx`'s
 * `labelKeyByTier`, `LibraryFilters`' `crossoverRatingLabels`, and
 * `stateLabels.ts`'s `STATE_LABEL_KEYS` all build this table shape, then
 * destructure and call `t(key, defaultText)` at a DIFFERENT source
 * location than the literal itself — a pure per-call-site check cannot see
 * this link, so this exemption is structural (the tuple shape itself), not
 * dataflow-traced.
 */
function isKeyDefaultTupleElement(node: Node): boolean {
  const parent = node.getParent()
  if (!parent || !Node.isArrayLiteralExpression(parent)) return false
  const elements = parent.getElements()
  if (elements.length !== 2) return false
  const [first, second] = elements
  if (!Node.isStringLiteral(first) || !Node.isStringLiteral(second)) {
    return false
  }
  return DOTTED_KEY_RE.test(first.getLiteralText())
}

/**
 * Pattern 3: `repairFailure.ts`'s deliberate English fallback — a plain
 * string literal assigned to a local binding, later passed as that SAME
 * binding to a t-alias call as an argument (typically the default-text
 * argument), inside a `try`/`catch` that keeps the literal if `t` throws.
 * Bounded to references within the same source file — no cross-file
 * dataflow. This is the only exemption that runs `findReferencesAsNodes()`,
 * which is why it is evaluated last: by the time this runs, the glossary,
 * tuple, and direct-t-call-argument checks have already cleared everything
 * cheaper to prove exempt.
 */
function isAssignedThenPassedToT(
  node: Node,
  aliases: Set<string>,
  sourceFile: SourceFile
): boolean {
  const parent = node.getParent()
  if (!parent) return false

  let bindingNameNode: Node | undefined

  if (
    Node.isVariableDeclaration(parent) &&
    parent.getInitializer() === node
  ) {
    const nameNode = parent.getNameNode()
    if (Node.isIdentifier(nameNode)) bindingNameNode = nameNode
  } else if (
    Node.isBinaryExpression(parent) &&
    parent.getOperatorToken().getText() === '=' &&
    parent.getRight() === node
  ) {
    const left = parent.getLeft()
    if (Node.isIdentifier(left)) bindingNameNode = left
  }

  if (!bindingNameNode) return false

  const references = bindingNameNode.findReferencesAsNodes()
  return references.some(
    (reference) =>
      reference.getSourceFile() === sourceFile &&
      isTCallArgument(reference, aliases)
  )
}

/**
 * Pattern 4: D-14 says `bootErrorSurface.ts` (pre-i18n-boot) is "exempted
 * with an explanatory comment," not a config-file allowlist entry. The
 * marker must carry a reason on the same line — a bare `i18n-gate-exempt:`
 * with no explanation is NOT an exemption and the file is scanned normally
 * (D-14's own wording: "exempted with an explanatory comment"). Reaching
 * for this mechanism anywhere other than `bootErrorSurface.ts` should be
 * challenged in review — it is the single largest-blast-radius exemption
 * in the gate (T-34.8-09).
 */
export const FILE_EXEMPT_MARKER = 'i18n-gate-exempt:'

function checkFileExemptMarker(sourceFile: SourceFile): boolean {
  const firstStatement = sourceFile.getStatements()[0]
  const ranges = firstStatement
    ? firstStatement.getLeadingCommentRanges()
    : sourceFile.getLeadingCommentRanges()

  return ranges.some((range) => {
    const rangeText = range.getText()
    const markerIndex = rangeText.indexOf(FILE_EXEMPT_MARKER)
    if (markerIndex === -1) return false
    const afterMarker = rangeText
      .slice(markerIndex + FILE_EXEMPT_MARKER.length)
      .split('\n')[0]
    const reason = afterMarker.replace(/\*\/\s*$/, '').trim()
    return reason.length > 0
  })
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
  const aliases = collectTAliases(sourceFile)
  const fileExemptResult = checkFileExemptMarker(sourceFile)
  const violations: Violation[] = []
  let exempted = 0

  function record(
    node: Node,
    rawText: string,
    classification: Classification
  ): void {
    if (isStructuralNonCandidate(node, classification)) return

    const text = rawText.trim()
    if (!/[a-zA-Z]/.test(text)) return // pure punctuation/digits/whitespace/CSS units — not a candidate

    // Plan 04: the full-file comment-marker exemption blankets every
    // remaining candidate in the file — still counted toward `exempted` so
    // a zero-violation exempt file is distinguishable from an unscanned
    // one (T-34.8-07), but never individually classified.
    if (fileExemptResult) {
      exempted += 1
      return
    }

    if (glossarySet.has(text)) {
      exempted += 1
      return
    }

    // Cheapest-first per RESEARCH.md Pattern 1-3: tuple (structural) before
    // direct t-call-argument (one parent hop) before dataflow
    // (`findReferencesAsNodes()`, the only one that walks the whole file).
    if (isKeyDefaultTupleElement(node)) {
      exempted += 1
      return
    }

    if (isTCallArgument(node, aliases)) {
      exempted += 1
      return
    }

    if (isAssignedThenPassedToT(node, aliases, sourceFile)) {
      exempted += 1
      return
    }

    if (isTechnicalToken(text)) return

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
    fileExempt: fileExemptResult
  }
}

// ---------------------------------------------------------------------------
// scanScope — plan 05: whole-scope orchestration + D-18 allowlist
// reconciliation. scanSource() above stays pure and disk-free; everything
// below owns the I/O (reading the scope snapshot, the allowlist, and every
// scanned file from disk).
// ---------------------------------------------------------------------------

export interface AllowlistEntry {
  file: string // repo-root-relative POSIX path
  expectedCount: number // measured violation count at the time of deferral
  reason: string // names D-17 and the blocking phase
}

export interface ScopeScanReport {
  scannedFiles: number
  totalCandidates: number // sum of violations + exempted across the scope
  violations: Violation[] // violations OUTSIDE allowlisted files
  allowlisted: Array<{ file: string; measured: number; expected: number }>
  staleExemptions: string[] // allowlisted files whose measured !== expected
  fileExempt: string[] // files skipped by FILE_EXEMPT_MARKER
}

interface ScopeSnapshot {
  files: string[]
  excluded?: {
    deferred?: string[]
    reason?: Record<string, string>
  }
}

/**
 * A tool that cannot do its job must refuse loudly rather than pass silently
 * (mirrors `GlossaryLoadError` above and `buildCrossoverIndex.ts`'s
 * `ZeroRecordError`). Covers both the scope snapshot and the allowlist —
 * both are "config this gate cannot run without" — plus a scoped/allowlisted
 * file that cannot be read from disk (T-34.8-14's "clear error, not a
 * silent skip" for a stale/typo'd allowlist path).
 */
export class ScopeLoadError extends Error {
  constructor(message: string) {
    super(`ScopeLoadError: ${message}`)
    this.name = 'ScopeLoadError'
  }
}

function readJsonSafely<T>(path: string, context: string): T {
  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (error) {
    throw new ScopeLoadError(
      `could not read ${context} at "${path}": ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }

  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new ScopeLoadError(
      `${context} at "${path}" is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Builds D-18's per-entry stale-exemption failure lines, shared by
 * `formatReport()` and `StaleExemptionError` — the ONE place the wording
 * is written out, per D-18's requirement that it live in a single spot.
 */
function staleExemptionLines(report: ScopeScanReport): string[] {
  return report.staleExemptions.map((file) => {
    const entry = report.allowlisted.find((a) => a.file === file)
    const expected = entry?.expected ?? 0
    const measured = entry?.measured ?? 0
    return (
      `stale exemption — remove this entry: ${file} (expected ${expected}, ` +
      `measured ${measured}) in meta/i18nGateAllowlist.json`
    )
  })
}

/**
 * Reads the committed scope snapshot, scans every listed file plus every
 * D-18 allowlist entry (always scanned, regardless of `extraFiles`, so a
 * deferred file's exemption can go stale even on a run that never widens
 * coverage) plus any `extraFiles` audit-mode addition, and reconciles the
 * allowlist. Violations inside an allowlisted file never reach
 * `report.violations` — they surface only via `report.allowlisted` /
 * `report.staleExemptions`.
 */
export function scanScope(
  opts: {
    scopePath?: string
    allowlistPath?: string
    glossaryPath?: string
    extraFiles?: string[]
  } = {}
): ScopeScanReport {
  const scopePath = opts.scopePath ?? 'meta/i18nGateScope.json'
  const allowlistPath = opts.allowlistPath ?? 'meta/i18nGateAllowlist.json'
  const glossaryPath = opts.glossaryPath ?? 'meta/i18nGlossary.json'
  const extraFiles = opts.extraFiles ?? []

  const scope = readJsonSafely<ScopeSnapshot>(scopePath, 'scope snapshot')
  if (!Array.isArray(scope.files) || scope.files.length === 0) {
    throw new ScopeLoadError(
      `scope snapshot at "${scopePath}" has no files — an empty scope is a ` +
        'gate that passes everything, and it must be indistinguishable ' +
        'from a crash, not from a pass'
    )
  }

  const allowlist = readJsonSafely<AllowlistEntry[]>(
    allowlistPath,
    'allowlist'
  )
  if (!Array.isArray(allowlist)) {
    throw new ScopeLoadError(`allowlist at "${allowlistPath}" is not an array`)
  }

  const glossary = loadGlossary(glossaryPath)

  const scopeFileSet = new Set(scope.files)
  const allowlistFileSet = new Set(allowlist.map((entry) => entry.file))
  // Audit-mode widening (plan 06) must not double-scan a file already
  // covered by the committed scope or the allowlist.
  const extraOnlyFiles = extraFiles.filter(
    (file) => !scopeFileSet.has(file) && !allowlistFileSet.has(file)
  )

  const report: ScopeScanReport = {
    scannedFiles: 0,
    totalCandidates: 0,
    violations: [],
    allowlisted: [],
    staleExemptions: [],
    fileExempt: []
  }

  function scanFile(file: string): ScanResult {
    let text: string
    try {
      text = readFileSync(file, 'utf-8')
    } catch (error) {
      throw new ScopeLoadError(
        `could not read scoped file "${file}": ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
    return scanSource(file, text, { glossary })
  }

  // Scope snapshot files — the committed, always-enforced list.
  for (const file of scope.files) {
    const result = scanFile(file)
    report.scannedFiles += 1
    report.totalCandidates += result.violations.length + result.exempted
    if (result.fileExempt) report.fileExempt.push(file)
    report.violations.push(...result.violations)
  }

  // Allowlist entries — always scanned regardless of extraFiles, so a
  // deferred file's exemption can go stale on every single run, not only
  // an audit run that happens to widen coverage to include it.
  for (const entry of allowlist) {
    const result = scanFile(entry.file)
    report.totalCandidates += result.violations.length + result.exempted
    if (result.fileExempt) report.fileExempt.push(entry.file)
    const measured = result.violations.length
    report.allowlisted.push({
      file: entry.file,
      measured,
      expected: entry.expectedCount
    })
    if (measured !== entry.expectedCount) {
      report.staleExemptions.push(entry.file)
    }
  }

  // Audit-mode widening — extra files beyond the committed snapshot.
  for (const file of extraOnlyFiles) {
    const result = scanFile(file)
    report.scannedFiles += 1
    report.totalCandidates += result.violations.length + result.exempted
    if (result.fileExempt) report.fileExempt.push(file)
    report.violations.push(...result.violations)
  }

  return report
}

/**
 * Human-readable report text — one line per violation, no early return
 * (mirrors `lintTranslations.ts`'s report convention), a trailing summary,
 * one line per stale exemption, and a closing remediation hint.
 */
export function formatReport(report: ScopeScanReport): string {
  const lines: string[] = []

  for (const violation of report.violations) {
    lines.push(
      `${violation.file}:${violation.line}:${violation.column}  ` +
        `${violation.kind}  "${violation.text}"`
    )
  }

  lines.push(
    `Scanned ${report.scannedFiles} file(s), found ${report.violations.length} ` +
      `violation(s), ${report.totalCandidates} candidate(s) considered.`
  )

  lines.push(...staleExemptionLines(report))

  if (report.violations.length > 0 || report.staleExemptions.length > 0) {
    lines.push(
      "Fix: wrap the literal in t('gamelib:<key>', '<English default>'), " +
        'or add the term to meta/i18nGlossary.json if it is a brand or ' +
        'platform name.'
    )
  }

  return lines.join('\n')
}

/**
 * Thrown by the gate test (plan 10) when `report.staleExemptions` is
 * non-empty. Its message is built from the SAME `staleExemptionLines()`
 * helper `formatReport()` uses, so D-18's failure wording exists in
 * exactly one place.
 */
export class StaleExemptionError extends Error {
  constructor(report: ScopeScanReport) {
    super(staleExemptionLines(report).join('\n'))
    this.name = 'StaleExemptionError'
  }
}
