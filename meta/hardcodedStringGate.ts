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

import { CommentRange, Node, Project, SourceFile, ts } from 'ts-morph'

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
  'style',
  // Plan 06 (34.8-06), discovered during the whole-scope audit run: these
  // four are the same category as the ten above -- CSS/DOM/routing
  // plumbing, never prose -- reached through component-library and
  // react-i18next conventions this codebase already relies on.
  // `i18nKey` is react-i18next's own `<Trans i18nKey="...">` prop (an i18n
  // KEY, not the text itself -- the text is the Trans children, handled by
  // `isWithinTransComponentChildren` below). `htmlId`/`extraClass` are this
  // codebase's own ToggleSwitch/InfoBox-family prop names for `id`/
  // `className` (LibraryFilters' `htmlId={\`crossover-rating-${tier}\`}`,
  // DownloadDialog's `extraClass="InstallModal__toggle--sdl"`).
  // `partition` is Electron/Tauri's `<webview partition="persist:...">`
  // session-partition identifier (WebView/index.tsx).
  'i18nKey',
  'htmlId',
  'extraClass',
  'partition'
  // 34.13 review A-16 MOVED `buttonClass` out of this list. It is
  // `Dropdown`'s own prop name for the CSS class it applies to its internal
  // `<button>` (frontend/components/UI/Dropdown/index.tsx), so the exemption
  // itself is right -- but as a BLANKET attribute-name entry it also exempted
  // `buttonClass` on every other component in the 164-file scope, where real
  // prose would then be silently unflagged (measured: `<Dropdown
  // buttonClass="Install with options now" />` scored 0 violations). It is now
  // scoped to the `Dropdown` family by `isDropdownButtonClassProp` below,
  // exactly the way `isInfoBoxTextKeyProp` scopes `text` to `InfoBox` and for
  // the identical stated reason ("too generic an attribute name to exempt
  // everywhere").
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
// Plan 06 (34.8-06): CSS custom-property syntax, discovered auditing the
// whole scope -- these values are used PROGRAMMATICALLY (MUI `createTheme()`
// objects, `getComputedStyle().getPropertyValue()`, `element.style.
// setProperty()`, a `getStatusColor()`-style helper whose RETURN feeds a
// `style={{color: ...}}`) rather than through a literal `style={{}}` JSX
// attribute, so plan 05's `isStyleAttributeValue` structural check never
// sees them. A content-shape check is the correct fix here (same idiom as
// `HEX_COLOUR_RE` above): no real UI prose in this codebase is shaped like
// `--primary-font-family`, `var(--accent)`, `2px`, or `blur(10px)`.
const CSS_CUSTOM_PROPERTY_RE = /^--[a-zA-Z0-9-]+$/
const CSS_VAR_FUNCTION_RE = /^var\(--[a-zA-Z0-9-]+(,\s*.+)?\)$/
const CSS_LENGTH_RE = /^-?\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%|s|ms|deg)$/
const CSS_FUNCTION_RE = /^[a-zA-Z-]+\([^()]*\)$/
// Plan 06 (34.8-06): a bracketed CSS attribute selector (`[data-tour="nav-menu"]`,
// `NavShellTour/index.tsx`'s/`LibraryTour.tsx`'s `intro.js` step targets) — content-shape,
// like the checks above, not property-name-based, so it also covers any future
// `querySelector`-style use of the same shape.
const CSS_ATTR_SELECTOR_RE = /^\[[a-zA-Z0-9_-]+(=("[^"]*"|'[^']*'))?\]$/
// Plan 10 (34.8-10), discovered flipping the gate to blocking and measuring
// the 62-item residual `34.8-AUDIT.md § Closure` had already triaged as
// `not-user-facing`/`glossary`: a FontAwesomeIcon `size` prop value
// (`"2x"`, `"3x"`) is an icon-size multiplier, not prose --
// EditGameDialog/index.tsx, GameCard/index.tsx, SideloadDialog/index.tsx.
const ICON_SIZE_MULTIPLIER_RE = /^\d+x$/
// A bare single all-caps word (letters/digits only, no whitespace) reads as
// an internal enum/state discriminator in this codebase's own convention,
// symmetric with `LOWERCASE_TOKEN_RE` below (whose own comment already
// states real UI prose here is sentence-cased): `showDialogModal({ type:
// 'MESSAGE' | 'ERROR' })`'s discriminator (helpers/library.ts,
// DownloadDialog/index.tsx, AnalyticsDialog.tsx, ShowValveProton.tsx,
// repairFailure.ts), Humble key-state comparisons (`REDEEMED`, `REVEALED`,
// `UNREDEEMABLE`, `UNPICKED`), `document.createElement('CANVAS'|'IMG')` tag
// names (index.tsx), and `.replace('THE ', '')` sort-key stripping
// (Library/index.tsx) -- every one confirmed genuinely not user-facing by
// direct read in `34.8-AUDIT.md`'s `## Triage`/`## Closure`.
const ALL_CAPS_TOKEN_RE = /^[A-Z][A-Z0-9]*$/
// A 32-character hex string with no separators is a GUID/hash, not prose --
// GameSubMenu/index.tsx's EOS overlay app-id constant.
const HEX_GUID_RE = /^[0-9a-fA-F]{32}$/
// A CDN query-string fragment (`?h=800&resize=1&w=600`) -- the literal span
// of a template expression whose interpolated head is the image URL
// (GamePicture/index.tsx, GameCard/constants.ts). Anchored so it cannot
// match real prose that merely starts with `?`.
const QUERY_STRING_RE = /^\?[a-zA-Z0-9=&]+$/
// A bare DNS hostname (`store.steampowered.com`) used for `url.includes(...)`
// domain matching (WebView/index.tsx) -- no whitespace, at least one dot,
// TLD-shaped tail.
const DOMAIN_RE = /^([a-z0-9-]+\.)+[a-z]{2,}$/
// A backend placeholder sentinel that starts with a literal "??" (e.g.
// `DownloadSizeInfo.tsx`'s `'?? MB'`, compared via `=== '?? MB'` against a
// Steam install-size lookup that failed) -- no real UI prose in this
// codebase starts a sentence with a bare double question mark.
const PLACEHOLDER_QUESTION_MARKS_RE = /^\?\?(\s|$)/
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

  // CSS custom-property syntax is fully anchored (`^...$`) and self-
  // describing, so it is checked before the no-whitespace gate below: a
  // `var(--x, fallback)` value legitimately contains a space after its
  // comma (`var(--cancel-button, var(--danger))`, DownloadManagerItem).
  if (CSS_CUSTOM_PROPERTY_RE.test(text)) return true
  if (CSS_VAR_FUNCTION_RE.test(text)) return true
  if (CSS_LENGTH_RE.test(text)) return true
  if (CSS_ATTR_SELECTOR_RE.test(text)) return true
  if (ICON_SIZE_MULTIPLIER_RE.test(text)) return true
  if (ALL_CAPS_TOKEN_RE.test(text)) return true
  if (HEX_GUID_RE.test(text)) return true
  if (QUERY_STRING_RE.test(text)) return true
  if (DOMAIN_RE.test(text)) return true
  if (PLACEHOLDER_QUESTION_MARKS_RE.test(text)) return true

  const hasWhitespace = /\s/.test(text)
  if (/[\\/]/.test(text) && !hasWhitespace) return true // path
  if (!hasWhitespace) {
    if (KEBAB_OR_SNAKE_RE.test(text)) return true
    if (LOWERCASE_TOKEN_RE.test(text)) return true
    if (CSS_FUNCTION_RE.test(text)) return true
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

/**
 * Plan 06 (34.8-06), discovered auditing the whole scope: `isStyleAttributeValue`
 * above only catches a literal nested DIRECTLY inside `style={{}}`'s object. It
 * does not catch a literal nested inside a TEMPLATE-LITERAL INTERPOLATION or a
 * CONDITIONAL EXPRESSION that is itself the value of an excluded attribute —
 * `className={\`discountFilters__toggle${active ? ' discountFilters__toggle--hasActive' : ''}\`}`
 * (DiscountFilters/index.tsx) or `className={loading ? 'searchButton fa-spin-pulse' :
 * 'searchButton'}` (SearchBar/index.tsx). `sourceFile.forEachDescendant` visits the
 * NESTED string literal inside the `${...}`/ternary independently of the outer
 * template/conditional, so it never inherits the outer attribute's exclusion.
 * This generalizes the check to walk up through ANY number of intermediate
 * expression nodes to the nearest enclosing `JsxAttribute`, regardless of shape —
 * which also transparently covers a `classNames('Sidebar__item', className, {...})`
 * call nested inside `className={classNames(...)}` (SidebarItem/index.tsx,
 * EditGameDialog/index.tsx, ConsoleMode/InstallOverlay/index.tsx,
 * InstallModal/DownloadDialog/index.tsx), since `getFirstAncestor` does not care
 * how many `CallExpression`/`ConditionalExpression`/`TemplateExpression` layers
 * sit between the literal and the attribute. `isStyleAttributeValue` above is
 * kept (and still exercised by its own tests) as the narrower case this
 * subsumes; both are wired into `isStructuralNonCandidate` for defense-in-depth.
 */
function isNestedInExcludedJsxAttribute(node: Node): boolean {
  const attribute = node.getFirstAncestor(Node.isJsxAttribute)
  if (!attribute) return false
  return isExcludedAttribute(attribute.getNameNode().getText())
}

/**
 * Plan 06 (34.8-06): a string literal compared against a DOM `KeyboardEvent`'s
 * `.key` property (`e.key === 'Escape'`) or matched in a `switch (e.key) { case
 * 'Escape': }` is a technical key-name constant, never rendered prose — this
 * codebase's ConsoleMode surfaces (`InstallOverlay`, `LaunchOverlay`, the main
 * grid) drive keyboard navigation entirely this way. Scoped to the property
 * name literally being `key` (not glossary-based, not content-shape-based) so
 * it cannot accidentally exempt a real comparison against unrelated data.
 */
function isKeyboardEventKeyComparison(node: Node): boolean {
  const parent = node.getParent()
  if (!parent) return false

  const isDotKeyAccess = (expr: Node): boolean =>
    Node.isPropertyAccessExpression(expr) && expr.getName() === 'key'

  if (Node.isBinaryExpression(parent)) {
    const op = parent.getOperatorToken().getText()
    if (!['===', '!==', '==', '!='].includes(op)) return false
    const other =
      parent.getLeft() === node ? parent.getRight() : parent.getLeft()
    return isDotKeyAccess(other)
  }

  if (Node.isCaseClause(parent)) {
    const switchStatement = parent.getFirstAncestor(Node.isSwitchStatement)
    if (!switchStatement) return false
    return isDotKeyAccess(switchStatement.getExpression())
  }

  return false
}

/**
 * Plan 06 (34.8-06): react-i18next's `<Trans i18nKey="...">English text with
 * <Link>nested elements</Link></Trans>` idiom (`GamePage/index.tsx`'s wikiLink,
 * `EmptyLibrary/index.tsx` x2, `DownloadDialog/index.tsx`'s anticheat warning,
 * `WineSelector/index.tsx` x2) keeps its translatable content as literal JSX
 * children, not as a `t()` call argument — `collectTAliases`/`isTCallArgument`
 * cannot see this at all, and it is a DIFFERENT, equally valid react-i18next
 * mechanism from `t()`, not a violation. Walks outward through every enclosing
 * `JsxElement` (not just the nearest one) so text nested inside a child element
 * INSIDE the `<Trans>` (`<Link>Open page</Link>`) is still recognised.
 */
function isWithinTransComponentChildren(node: Node): boolean {
  let current: Node = node
  for (;;) {
    const jsxElement = current.getFirstAncestor(Node.isJsxElement)
    if (!jsxElement) return false
    const tagName = jsxElement.getOpeningElement().getTagNameNode().getText()
    if (tagName === 'Trans') return true
    current = jsxElement
  }
}

/**
 * Plan 06 (34.8-06): `components/UI/InfoBox/index.tsx`'s own `text` prop is an
 * i18n KEY forwarded to an internal `t(text)` call (`<InfoBox text="infobox.help">`,
 * `ThemeSelector.tsx` x2, `DefaultSteamPath.tsx`, `PreferedLanguage.tsx`,
 * `WineVersionSelector.tsx`) — not prose itself. Scoped to the specific
 * `InfoBox` tag name (unlike the broader `EXCLUDED_ATTRIBUTES` list) because
 * `text` is too generic an attribute name to exempt everywhere — a hardcoded
 * `text="Some real prose"` on an arbitrary OTHER component would be a real
 * violation, so this must not become a blanket `text`-attribute exemption.
 */
/**
 * 34.13 review A-16: `buttonClass` is `Dropdown`'s own prop name for the CSS
 * class applied to its internal `<button>` (`frontend/components/UI/Dropdown/
 * index.tsx`), first hit when the D-21 split button (`MainButton.tsx`'s
 * `SteamInstallCaret`) passed `buttonClass="button outline"`. TAG-SCOPED, not
 * a blanket attribute exemption: `buttonClass` is a generic enough name that a
 * future component could legitimately carry real prose in it, and the blanket
 * form measurably created that blind spot across all 164 scoped files. Mirrors
 * `isInfoBoxTextKeyProp` below, including its rationale.
 */
function isDropdownButtonClassProp(node: Node): boolean {
  const attribute = node.getFirstAncestor(Node.isJsxAttribute)
  if (!attribute || attribute.getNameNode().getText() !== 'buttonClass') {
    return false
  }
  return jsxTagNameOf(attribute) === 'Dropdown'
}

/** The tag name of the JSX element owning `attribute`, or undefined. */
function jsxTagNameOf(attribute: Node): string | undefined {
  const jsxElement = attribute.getFirstAncestor(
    (n): n is Node => Node.isJsxElement(n) || Node.isJsxSelfClosingElement(n)
  )
  if (!jsxElement) return undefined
  const tagNameNode = Node.isJsxElement(jsxElement)
    ? jsxElement.getOpeningElement().getTagNameNode()
    : jsxElement.getTagNameNode()
  return tagNameNode.getText()
}

function isInfoBoxTextKeyProp(node: Node): boolean {
  const attribute = node.getFirstAncestor(Node.isJsxAttribute)
  if (!attribute || attribute.getNameNode().getText() !== 'text') return false
  const jsxElement = attribute.getFirstAncestor(
    (n): n is Node => Node.isJsxElement(n) || Node.isJsxSelfClosingElement(n)
  )
  if (!jsxElement) return false
  const tagNameNode = Node.isJsxElement(jsxElement)
    ? jsxElement.getOpeningElement().getTagNameNode()
    : jsxElement.getTagNameNode()
  return tagNameNode.getText() === 'InfoBox'
}

/**
 * Plan 10 (34.8-10): a compound glossary term (`GameLib`) split across
 * sibling JSX children for CSS styling —
 * `SidebarLinks/index.tsx`: `Game<span className="Sidebar__brandLib">
 * Lib</span>`. Only fires for a `JsxText` candidate; walks up to the
 * enclosing `JsxElement`/`JsxFragment`, reads EVERY child's own simple text
 * (a bare `JsxText`, or a `JsxElement` whose sole child is a bare `JsxText`
 * — never descending further), concatenates them in source order, and
 * checks the joined, trimmed result against the glossary. Any child that is
 * not one of these two simple shapes (e.g. a nested component, an
 * expression container) makes the whole check bail out (`undefined`),
 * exactly like `isTechnicalToken`'s other content-shape checks: narrow
 * enough that an unrelated multi-child fragment can never accidentally
 * match.
 */
function jsxSimpleChildText(child: Node): string | undefined {
  if (Node.isJsxText(child)) return child.getText()
  if (Node.isJsxElement(child)) {
    const kids = child.getJsxChildren()
    if (kids.length === 1 && Node.isJsxText(kids[0])) {
      return kids[0].getText()
    }
  }
  return undefined
}

/**
 * Walks `node` up through any chain of enclosing `JsxElement`s where `node`
 * (or the previous hop) is that element's ONLY child — the "Lib" `JsxText`
 * inside `<span className="Sidebar__brandLib">Lib</span>` needs this to
 * reach the SPAN element itself before the sibling-scan below can see the
 * span's own position among the Fragment's children (`Game`, `<span>Lib
 * </span>`); without this hop, checking "Lib"'s own immediate parent (the
 * span) would only ever see a one-child sibling list (`["Lib"]`), never the
 * `Game` text one level further out.
 */
function outermostSingleChildJsxAncestor(node: Node): Node {
  let current: Node = node
  for (;;) {
    const parent = current.getParent()
    if (
      parent &&
      Node.isJsxElement(parent) &&
      parent.getJsxChildren().length === 1 &&
      parent.getJsxChildren()[0] === current
    ) {
      current = parent
      continue
    }
    break
  }
  return current
}

function isPartOfSplitGlossaryTerm(
  node: Node,
  glossarySet: Set<string>
): boolean {
  const anchor = outermostSingleChildJsxAncestor(node)
  const parent = anchor.getParent()
  if (!parent) return false
  if (!Node.isJsxElement(parent) && !Node.isJsxFragment(parent)) return false

  const children = parent.getJsxChildren()
  const texts: string[] = []
  for (const child of children) {
    const childText = jsxSimpleChildText(child)
    if (childText === undefined) return false
    texts.push(childText)
  }

  const joined = texts.join('').trim()
  return joined.length > 0 && glossarySet.has(joined)
}

/**
 * Plan 06 (34.8-06): a string/template literal that is an argument (any
 * position, matching `isConsoleArgument`/`isWindowApiLogArgument`'s existing
 * any-position precedent above) to a config-store accessor call is a STORAGE
 * KEY, never prose — `configStore.get('games.hidden', [])`,
 * `nileConfigStore.get_nodefault('userData.name')`,
 * `window.api.storeGet(this.storeName, \`__timestamp.${key}\`)`
 * (`electronStores.ts`, `GlobalState.tsx`, `RecentlyPlayed/index.tsx`).
 * Method-name-gated (not tied to a specific store variable name, since this
 * codebase has `configStore`/`gogConfigStore`/`nileConfigStore`/
 * `zoomConfigStore`/`wineDownloaderInfoStore`, all sharing the same
 * `TypeCheckedStoreFrontend` method names from `electronStores.ts`).
 */
const STORE_KEY_METHOD_NAMES = new Set([
  'get',
  'set',
  'get_nodefault',
  'storeGet',
  'storeSet',
  'storeHas',
  'storeDelete'
])

function isConfigStoreKeyArgument(node: Node): boolean {
  const call = node.getFirstAncestor(Node.isCallExpression)
  if (!call) return false
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return false
  if (!STORE_KEY_METHOD_NAMES.has(callee.getName())) return false
  return call.getArguments().includes(node)
}

/**
 * Plan 10 (34.8-10): a string/template literal that is a direct argument to
 * `document.querySelector`/`querySelectorAll` (a CSS selector,
 * `index.tsx`'s `'style.customTheme'`, `ConsoleMode/index.tsx`'s
 * `'button:not(:disabled)'`), `canvas.getContext` (a canvas context-type
 * constant, `index.tsx`'s `'2d'`), or `webview.setUserAgent` (a technical
 * User-Agent string, `WebView/index.tsx`) is a browser/DOM API technical
 * constant, never rendered prose. Method-name-gated, mirroring
 * `isConfigStoreKeyArgument`'s precedent, so it cannot accidentally exempt
 * an unrelated same-named method on some other object.
 */
const TECHNICAL_DOM_API_METHOD_NAMES = new Set([
  'querySelector',
  'querySelectorAll',
  'getContext',
  'setUserAgent',
  // Plan 10 (34.8-10): Web Storage API key arguments — a session/local
  // storage key is a technical identifier, never rendered prose
  // (`WebView/index.tsx`'s `sessionStorage.getItem`/`setItem('last-url-
  // ${store}', ...)`). Named distinctly from `STORE_KEY_METHOD_NAMES`
  // above, which covers this codebase's OWN `electron-store` wrapper
  // methods (`get`/`set`/`storeGet`/...), not the browser's native Web
  // Storage API.
  'getItem',
  'setItem'
])

function isTechnicalDomApiArgument(node: Node): boolean {
  const call = node.getFirstAncestor(Node.isCallExpression)
  if (!call) return false
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return false
  if (!TECHNICAL_DOM_API_METHOD_NAMES.has(callee.getName())) return false
  return call.getArguments().includes(node)
}

/**
 * Plan 10 (34.8-10): a string literal argument (any position, mirroring
 * `isConfigStoreKeyArgument`'s any-position precedent -- `.replace()`'s
 * replacement value included) to `.includes()`/`.endsWith()`/
 * `.startsWith()`/`.replace()` is used ONLY as an internal comparison or
 * prefix-strip operand at that call site -- never rendered there --
 * confirmed by direct read for every real occurrence this covers:
 * `InstalledInfo.tsx`'s `.replace('Wine - ', '')`/`.includes('Default')`,
 * `Library/index.tsx`'s `.replace('THE ', '')` sort-key stripping,
 * `WineVersionSelector.tsx`'s `.includes('-latest')`,
 * `WineManager/index.tsx`'s `.endsWith('LoL')`, and `WebView/index.tsx`'s
 * `url.includes('epicgames.com')`-style domain matching (also covered by
 * `DOMAIN_RE` above; either check exempting it is fine).
 */
const INTERNAL_STRING_COMPARISON_METHOD_NAMES = new Set([
  'includes',
  'endsWith',
  'startsWith',
  'replace'
])

function isInternalStringComparisonArgument(node: Node): boolean {
  const call = node.getFirstAncestor(Node.isCallExpression)
  if (!call) return false
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return false
  if (!INTERNAL_STRING_COMPARISON_METHOD_NAMES.has(callee.getName())) {
    return false
  }
  return call.getArguments().includes(node)
}

/**
 * Plan 10 (34.8-10): a string-literal element of an array literal that is
 * IMMEDIATELY `.includes()`'d (`['Denied', 'Broken', 'Unknown'].includes(
 * anticheatInfo.status)`, `DownloadDialog/index.tsx`) is an inline enum
 * comparison table, never rendered -- distinct from
 * `isKeyDefaultTupleElement`'s 2-element `[key, defaultText]` shape (which
 * requires a dotted-key-shaped first element and feeds a LATER `t()` call at
 * a different location); this shape has no length restriction and its
 * result is consumed by `.includes()` at the SAME expression, never `t()`.
 */
function isIncludesArrayLiteralElement(node: Node): boolean {
  const parent = node.getParent()
  if (!parent || !Node.isArrayLiteralExpression(parent)) return false
  const propertyAccess = parent.getParent()
  if (!propertyAccess || !Node.isPropertyAccessExpression(propertyAccess)) {
    return false
  }
  if (propertyAccess.getExpression() !== parent) return false
  if (propertyAccess.getName() !== 'includes') return false
  const call = propertyAccess.getParent()
  return !!call && Node.isCallExpression(call)
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
  if (isNestedInExcludedJsxAttribute(node)) return true
  if (isKeyboardEventKeyComparison(node)) return true
  if (isWithinTransComponentChildren(node)) return true
  if (isInfoBoxTextKeyProp(node)) return true
  if (isDropdownButtonClassProp(node)) return true
  if (isConfigStoreKeyArgument(node)) return true
  if (isTechnicalDomApiArgument(node)) return true
  if (isInternalStringComparisonArgument(node)) return true
  if (isIncludesArrayLiteralElement(node)) return true
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

/**
 * Plan 06 (34.8-06), discovered auditing the whole scope: `isTCallArgument`
 * above only recognises a literal that IS DIRECTLY one of the call's
 * arguments. It misses a literal that is one BRANCH of a ternary or one
 * OPERAND of a `+` string concatenation that is ITSELF the argument — both
 * genuinely-compliant, widely-used idioms in this codebase:
 *   `t('webview.login.oauth.awaiting.heading', runnerLabel ? \`Signing in to
 *   ${runnerLabel}\` : 'Signing in')` (TauriLoginPanel.tsx, every branch —
 *   20 of plan 06's 335 raw hits came from this ONE file, all already
 *   correctly wrapped)
 *   `t('webview.unavailable.body', "GameLib's Tauri build does not yet " +
 *   'embed a browser view for the store and wiki pages.')`
 *   (WebviewUnavailablePanel.tsx)
 *   `t(canRunOffline ? 'box.no' : 'box.yes')` (InstalledInfo.tsx — the KEY
 *   argument, not the default-text argument; position does not matter here)
 * Walks up through any chain of `ConditionalExpression`/`BinaryExpression
 * (+ or ??)`/`ParenthesizedExpression`/template-interpolation wrapping —
 * nested ternaries (`a ? x : b ? y : z`), repeated concatenation
 * (`a + b + c`), a nullish-coalescing fallback nested inside a template
 * interpolation (`TauriLoginPanel.tsx`'s `` `...${state?.message ?? 'unknown
 * error'}` `` passed directly to `t()`, plan 10/34.8-10), and a literal
 * referenced inside a `${...}` template interpolation that is itself
 * composed into a t()-argument (`TauriLoginPanel.tsx`'s `` `...${channelLabel}
 * ...` + '...' `` passed to `t()`, reached via `isAssignedThenPassedToT`'s
 * reference walk below, not directly here — the hop is shared so both
 * callers benefit) — all resolve to a single outermost composed expression —
 * then applies the same direct-argument-of-a-t-alias-call check
 * `isTCallArgument` uses. `??` is scoped narrowly (only inside this walk,
 * never as a general equality-comparison exemption) — the phase's own
 * negative-proof fixture ("still flags a string compared against an
 * unrelated property") specifically pins that an arbitrary `===` comparison
 * must stay flagged, so this file never grows a broad "any comparison
 * operand is exempt" rule.
 */
function walkUpThroughComposingWrappers(node: Node): {
  current: Node
  parent: Node | undefined
} {
  let current: Node = node
  let parent = current.getParent()

  while (parent) {
    if (
      Node.isConditionalExpression(parent) &&
      (parent.getWhenTrue() === current || parent.getWhenFalse() === current)
    ) {
      current = parent
      parent = current.getParent()
      continue
    }
    if (
      Node.isBinaryExpression(parent) &&
      ['+', '??'].includes(parent.getOperatorToken().getText()) &&
      (parent.getLeft() === current || parent.getRight() === current)
    ) {
      current = parent
      parent = current.getParent()
      continue
    }
    if (Node.isParenthesizedExpression(parent)) {
      current = parent
      parent = current.getParent()
      continue
    }
    // Plan 10 (34.8-10): a reference sitting inside a template
    // interpolation's `${...}` slot — first hop from the reference to its
    // enclosing `TemplateSpan`, second hop from that span to the enclosing
    // `TemplateExpression`, after which the loop's existing `+`/ternary/
    // paren rules can keep walking outward (e.g. the TemplateExpression
    // being one operand of a `+` concatenation whose result is the t()
    // argument).
    if (Node.isTemplateSpan(parent) && parent.getExpression() === current) {
      current = parent
      parent = current.getParent()
      continue
    }
    if (Node.isTemplateExpression(parent) && current !== node) {
      current = parent
      parent = current.getParent()
      continue
    }
    break
  }

  return { current, parent }
}

function isComposedTCallArgument(node: Node, aliases: Set<string>): boolean {
  const { current, parent } = walkUpThroughComposingWrappers(node)

  if (current === node) return false // no composing wrapper found at all
  if (!parent || !Node.isCallExpression(parent)) return false
  const callee = parent.getExpression()
  if (!Node.isIdentifier(callee) || !aliases.has(callee.getText())) {
    return false
  }
  return parent.getArguments().includes(current)
}

/**
 * Plan 06 (34.8-06): react-i18next's `t(key, { defaultValue: '...',
 * ...interpolationVars })` call shape — the OBJECT-FORM second argument used
 * whenever interpolation variables are needed (`SteamBottleSetup.tsx`,
 * `SteamBridgeSetup.tsx` x2, `SteamClientSetup.tsx`) — nests the English
 * default as the `defaultValue` PROPERTY of an object literal, not as a
 * direct call argument, so `isTCallArgument` cannot see it (the object
 * literal is the direct argument; the string is one level further in).
 */
function isTCallDefaultValueProperty(
  node: Node,
  aliases: Set<string>
): boolean {
  const propertyAssignment = node.getParent()
  if (!propertyAssignment || !Node.isPropertyAssignment(propertyAssignment)) {
    return false
  }
  if (propertyAssignment.getInitializer() !== node) return false
  const nameNode = propertyAssignment.getNameNode()
  if (!Node.isIdentifier(nameNode) || nameNode.getText() !== 'defaultValue') {
    return false
  }

  const objectLiteral = propertyAssignment.getFirstAncestor(
    Node.isObjectLiteralExpression
  )
  if (!objectLiteral) return false
  const call = objectLiteral.getParent()
  if (!call || !Node.isCallExpression(call)) return false
  const callee = call.getExpression()
  if (!Node.isIdentifier(callee) || !aliases.has(callee.getText())) {
    return false
  }
  return call.getArguments().includes(objectLiteral)
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
 * Plan 10 (34.8-10): the same binding-capture logic `isAssignedThenPassedToT`
 * below needs, generalized (via the shared `walkUpThroughComposingWrappers`
 * composing-walk) to also recognise a literal that reaches its binding
 * through a ternary — `MacArchBadge.tsx`'s `const variantClass = isMac ?
 * 'macArchBadge--warning' : 'macArchBadge--informational'` — not only a
 * direct `const x = 'text'`/`x = 'text'` assignment.
 */
function findAssignedBindingNameNode(node: Node): Node | undefined {
  const { current, parent } = walkUpThroughComposingWrappers(node)
  if (!parent) return undefined

  if (
    Node.isVariableDeclaration(parent) &&
    parent.getInitializer() === current
  ) {
    const nameNode = parent.getNameNode()
    return Node.isIdentifier(nameNode) ? nameNode : undefined
  }
  if (
    Node.isBinaryExpression(parent) &&
    parent.getOperatorToken().getText() === '=' &&
    parent.getRight() === current
  ) {
    const left = parent.getLeft()
    return Node.isIdentifier(left) ? left : undefined
  }
  return undefined
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
 *
 * Plan 10 (34.8-10): generalized in two directions, both confirmed
 * already-compliant by direct read rather than guessed:
 *   - the binding capture now also follows a ternary-composed assignment
 *     (`findAssignedBindingNameNode` above), and a reference is also
 *     recognised through `isComposedTCallArgument`'s composing walk (now
 *     including its own template-interpolation hop) —
 *     `TauriLoginPanel.tsx`'s `const channelLabel = channel ? \`...\` : 'the
 *     sign-in channel'`, later referenced as `` `...${channelLabel}...` + '...'
 *     `` inside a `t()` call, two AST layers deeper than the original
 *     direct-argument check alone could trace.
 *   - a reference is ALSO "safely consumed" (not only "passed to `t()`") when
 *     it is a diagnostic-only `console.*`/`window.api.log*` argument
 *     (`repairFailure.ts`'s `errorText`, referenced only inside
 *     `window.api.logError(...)`'s template) or sits inside a JSX attribute
 *     already excluded from user-facing scope (`MacArchBadge.tsx`'s
 *     `variantClass`, referenced only inside `className={...}`) — neither of
 *     these is an i18n idiom, but both are the SAME underlying claim this
 *     function already makes: the literal, through this one binding, is
 *     never rendered as untranslated prose.
 */
function isAssignedThenPassedToT(
  node: Node,
  aliases: Set<string>,
  sourceFile: SourceFile
): boolean {
  const bindingNameNode = findAssignedBindingNameNode(node)
  if (!bindingNameNode) return false

  const references = bindingNameNode.findReferencesAsNodes()
  return references.some((reference) => {
    if (reference.getSourceFile() !== sourceFile) return false
    return (
      isTCallArgument(reference, aliases) ||
      isComposedTCallArgument(reference, aliases) ||
      isConsoleArgument(reference) ||
      isWindowApiLogArgument(reference) ||
      isNestedInExcludedJsxAttribute(reference) ||
      isDropdownButtonClassProp(reference) ||
      // Plan 10 (34.8-10): `WebView/index.tsx`'s `userAgent` binding
      // (assigned via ternary, referenced only at `webview.setUserAgent(
      // userAgent)`) — the SAME "never rendered through this binding" claim,
      // reached through a technical browser-API call instead of an i18n one.
      isTechnicalDomApiArgument(reference)
    )
  })
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
 *
 * 34.8-08c: this ONE marker string now carries TWO granularities,
 * distinguished purely by WHERE its leading comment sits, not by any
 * different marker text:
 *   - on the source file's FIRST top-level statement -> the WHOLE FILE is
 *     exempt (existing, unchanged `checkFileExemptMarker` behaviour below;
 *     `bootErrorSurface.ts` remains its only real user)
 *   - on any OTHER top-level statement -> ONLY THAT ONE STATEMENT is
 *     exempt (`checkDeclarationExemptMarker` below; `Settings/index.tsx`'s
 *     `defaultWineVersion` declaration is the second-ever real user,
 *     34.8-08c)
 * This is a deliberate reuse of one marker string at two scopes, not an
 * accidental overlap — a future author placing this marker on a non-first
 * statement should not be surprised that it does NOT blank the whole file.
 */
export const FILE_EXEMPT_MARKER = 'i18n-gate-exempt:'

/**
 * Shared "does this comment range carry the marker plus a non-empty
 * same-line reason" check, used by both `checkFileExemptMarker` (whole-
 * file) and `checkDeclarationExemptMarker` (single top-level statement)
 * below, so the string-slicing logic exists in exactly one place.
 */
function commentRangesCarryExemptMarker(
  ranges: readonly CommentRange[]
): boolean {
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

function checkFileExemptMarker(sourceFile: SourceFile): boolean {
  const firstStatement = sourceFile.getStatements()[0]
  const ranges = firstStatement
    ? firstStatement.getLeadingCommentRanges()
    : sourceFile.getLeadingCommentRanges()

  return commentRangesCarryExemptMarker(ranges)
}

/**
 * 34.8-08c: walks `node`'s ancestors until it finds the direct child of
 * the `SourceFile` — i.e. the top-level statement that encloses `node`.
 * Returns `undefined` if `node` has no such ancestor (e.g. `node` is
 * already a top-level node with no further parent, or is the `SourceFile`
 * itself).
 */
function getEnclosingTopLevelStatement(node: Node): Node | undefined {
  let current: Node = node
  let parent = current.getParent()
  while (parent) {
    if (Node.isSourceFile(parent)) return current
    current = parent
    parent = current.getParent()
  }
  return undefined
}

/**
 * 34.8-08c: the declaration-scoped sibling of `checkFileExemptMarker`.
 * Exempts only the literal(s) inside the ONE top-level statement whose
 * OWN leading comment carries the marker plus a reason — never the whole
 * file. A marker on the file's first statement is handled entirely by
 * `checkFileExemptMarker` above (checked first in `record()`, see below);
 * this function only ever runs for candidates whose enclosing top-level
 * statement is some OTHER, later statement.
 */
function checkDeclarationExemptMarker(node: Node): boolean {
  const statement = getEnclosingTopLevelStatement(node)
  if (!statement) return false
  return commentRangesCarryExemptMarker(statement.getLeadingCommentRanges())
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

    // 34.8-08c: declaration-scoped sibling of the whole-file check above —
    // exempts only the one top-level statement the marker leads, never
    // `result.fileExempt` (that field means "the WHOLE file is exempt").
    if (checkDeclarationExemptMarker(node)) {
      exempted += 1
      return
    }

    if (glossarySet.has(text)) {
      exempted += 1
      return
    }

    // Plan 10 (34.8-10): a glossary term split across sibling JSX nodes for
    // CSS styling — `SidebarLinks/index.tsx`'s `Game<span
    // className="Sidebar__brandLib">Lib</span>`, whose concatenated rendered
    // text is `GameLib`, an already-glossed term (D-02/D-21). The exact-
    // string check above cannot see this because each node is a SEPARATE
    // JsxText/JsxElement candidate; this widens the match to the node's full
    // JSX-child siblings ONLY for `jsx-text` candidates, and only when every
    // sibling resolves to plain text (never descends into a sibling with its
    // own nested elements, so it cannot over-match an unrelated multi-child
    // fragment).
    if (
      classification.kind === 'jsx-text' &&
      isPartOfSplitGlossaryTerm(node, glossarySet)
    ) {
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

    if (isComposedTCallArgument(node, aliases)) {
      exempted += 1
      return
    }

    if (isTCallDefaultValueProperty(node, aliases)) {
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

    if (
      Node.isStringLiteral(node) ||
      Node.isNoSubstitutionTemplateLiteral(node)
    ) {
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

  const allowlist = readJsonSafely<AllowlistEntry[]>(allowlistPath, 'allowlist')
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
