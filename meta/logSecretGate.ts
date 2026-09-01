/**
 * `logSecretGate` -- fails when a backend log call interpolates raw process
 * output, or a secret-named identifier, without reducing it to a presence or
 * length scalar first.
 *
 * WHY THIS EXISTS. `.planning/debug/resolved/log-upload-has-no-redaction.md`
 * censused every secret-adjacent log call in `src/backend` (77 of them) and
 * found exactly one real leak: `storeManagers/gog/user.ts` interpolated the raw
 * stdout of `gogdl auth --code <code>` -- the GOG token-exchange response --
 * into a `logError` template. `logError` resolves to `heroicLogWriter`, i.e.
 * `gamelib.log`, and `uploadLogFile` (src/backend/logger/uploader.ts) POSTs that
 * file verbatim to a public dpaste paste. The source was fixed; the ENFORCEMENT
 * gap was not. Nothing failed CI when that line was written, so the next one
 * would have landed just as silently.
 *
 * WHAT THIS IS NOT. This is not leak prevention and must never be described as
 * such. The gate cannot see WHICH command produced a `stdout` binding, and that
 * is the only thing that distinguishes the GOG defect from the twelve benign
 * `rsync`/`tar`/`cxbottle` sites exempted below. What it actually buys is a
 * forced conscious act: you cannot log raw process output without writing down,
 * at the call site, which command's output it is. That is precisely the step
 * that was skipped in `gog/user.ts`.
 *
 * WHY NOT A SCRUB AT THE UPLOAD BOUNDARY. Rejected in the debug ledger and
 * again when this gate was scoped. At the sink you would be pattern-matching
 * unbounded token VALUES over 10 MiB of arbitrary text -- a false-negative
 * machine that would have caught the real defect only by luck, since that token
 * sat inside an otherwise ordinary stdout dump. At the source you match a small,
 * bounded vocabulary of identifier NAMES. Only the second is tractable. Worse,
 * a scrub manufactures confidence: once "logs are scrubbed before upload" is
 * true on paper, the presence/length convention that actually works here
 * (`keyPresent=` / `bodyLength=` / `len=`, used consistently across `humble/`,
 * `keyringTokenStore.ts` and `devSecretVault.ts`) loses its rationale.
 *
 * VOCABULARY IS MEASURED, NOT GUESSED. See `EXCLUDED_IDENTIFIERS` -- the
 * obvious-looking words `key`, `code` and `session` are deliberately absent
 * because measuring them against the real tree produced almost entirely false
 * positives. A gate that convicts correct code gets suppressed wholesale, which
 * is worse than no gate.
 *
 * NO WHOLE-FILE ESCAPE HATCH, BY CONSTRUCTION. Unlike
 * `meta/hardcodedStringGate.ts`, this gate has no file-level exempt marker.
 * `src/backend/utils.ts` alone holds five baseline sites; a file-level marker
 * there would blank every future log call in a 1,700-line file. Exemptions are
 * per-call-site and must carry a reason naming the command, or they do not
 * count.
 *
 * SCOPE IS A LIVE GLOB, NOT A COMMITTED SNAPSHOT. `scanScope()` walks
 * `src/backend` on every run. A snapshot file is a thing someone can scope a
 * file out of, silently shrinking the gate; a glob cannot be quietly narrowed
 * without editing this module.
 *
 * WHERE IT RUNS: `meta/__tests__/logSecretGate.test.ts`, which is inside the
 * `meta` jest project, so `pnpm test:ci` executes it in CI with no bespoke
 * workflow wiring. A gate that needs its own workflow step is a gate that ends
 * up running nowhere.
 */

import { readFileSync, readdirSync } from 'fs'
import { join, posix, relative, sep } from 'path'

import { Node, Project, SyntaxKind } from 'ts-morph'

import type { Dirent } from 'fs'
import type { CommentRange, SourceFile } from 'ts-morph'

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * The logger's full call surface. `logInfo`/`logError`/`logWarning`/`logDebug`
 * are the module-level helpers exported by `src/backend/logger/index.ts`;
 * `logInfoSettled`/`logErrorSettled` are their promise-returning siblings; the
 * same four names also appear as methods on every `LogWriter` instance
 * (`heroicLogWriter.logInfo(...)`, `gogLogWriter.logInfo(...)`, the runner and
 * per-game writers). Matching on the NAME alone covers both call shapes.
 */
export const LOG_FUNCTION_RE = /^log(Error|Info|Warning|Debug)(Settled)?$/

/**
 * Raw child-process output. This is the defect class that actually occurred:
 * a token-bearing `stdout` interpolated whole. Both members are included
 * because a process that writes credentials to stdout can equally write them
 * to stderr -- `gogdl`'s own failure modes do.
 */
export const PROCESS_OUTPUT_IDENTIFIERS = ['stdout', 'stderr'] as const

/**
 * Identifiers whose NAME is unambiguous evidence of a credential. Every one of
 * these currently has zero unguarded occurrences inside a backend log call --
 * this half of the vocabulary is a ratchet holding a clean state, not a
 * backlog. (That zero is itself an independent AST re-confirmation of the
 * ledger's census, which reached the same conclusion by a different method.)
 */
export const SECRET_IDENTIFIERS = [
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'password',
  'passwd',
  'cookie',
  'cookies',
  'secret',
  'credential',
  'credentials',
  'sessionId',
  'apiKey',
  'authCode',
  'codeVerifier',
  'revealedKeyValue'
] as const

/**
 * Deliberately NOT in the vocabulary, with the measurement that excluded each.
 * Recorded here so a future author does not "helpfully" add them back:
 *
 * - `key` -- 6 hits, all config/settings key NAMES, none a secret value
 *   (`game_config.ts:326` logs which setting changed; `logger/index.ts:200`
 *   the same; `sidecar/humbleSecretStore.ts` x3 logs which migration slot
 *   failed). A secret-valued binding in this repo is named `revealedKeyValue`,
 *   which IS in the vocabulary above.
 * - `code` -- 4 hits, all process EXIT codes (`bottle.ts:804`/`:1212`,
 *   `helperProcess.ts:124`, `importScan.ts:112`). The auth-code sense is
 *   covered by `authCode`.
 * - `session` -- an HTTP/agent session object far more often than a session
 *   credential. The credential sense is covered by `sessionId`.
 */
export const EXCLUDED_IDENTIFIERS = ['key', 'code', 'session'] as const

/**
 * Calls that reduce a secret to something safe to print. `Boolean(x)` and
 * `!x`/`!!x` yield presence; `x.length` yields a size; the `redact*`/
 * `sanitize*`/`mask*`/`censor*` families are the project's existing explicit
 * redactors (e.g. `redactNileLoginData`, `authLogSanitizer`); `describe*` is
 * `humble/adapter.ts`'s `describeSchemaFailure` shape, which reports
 * contentType + lengths + zod issue paths and never the body.
 */
const GUARD_CALL_RE = /^(Boolean|redact|sanitize|mask|censor|describe)/i

const LENGTH_PROPERTIES = new Set(['length', 'byteLength', 'size'])

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ViolationKind = 'process-output' | 'secret-identifier'

export interface Violation {
  file: string
  line: number
  column: number
  kind: ViolationKind
  /** The offending identifier, e.g. `stdout`. */
  identifier: string
  /** The enclosing log call, collapsed to one line and truncated. */
  callText: string
}

export interface Exemption {
  file: string
  line: number
  identifier: string
  reason: string
}

export interface ScanResult {
  violations: Violation[]
  exemptions: Exemption[]
}

export interface ScopeScanReport {
  scannedFiles: number
  violations: Violation[]
  exemptions: Exemption[]
}

/**
 * A tool that cannot do its job must refuse loudly rather than pass silently
 * (mirrors `hardcodedStringGate.ts`'s `ScopeLoadError` and
 * `buildCrossoverIndex.ts`'s `ZeroRecordError`).
 */
export class ScopeLoadError extends Error {
  constructor(message: string) {
    super(`ScopeLoadError: ${message}`)
    this.name = 'ScopeLoadError'
  }
}

// ---------------------------------------------------------------------------
// Exemption marker
// ---------------------------------------------------------------------------

/**
 * Per-call-site only -- there is deliberately no whole-file variant (see the
 * module header). The marker must be followed by a non-empty same-line reason,
 * so `// log-secret-gate-exempt:` on its own exempts nothing.
 */
export const FILE_EXEMPT_MARKER = 'log-secret-gate-exempt:'

function extractExemptReason(
  ranges: readonly CommentRange[]
): string | undefined {
  for (const range of ranges) {
    const text = range.getText()
    const markerIndex = text.indexOf(FILE_EXEMPT_MARKER)
    if (markerIndex === -1) continue
    const afterMarker = text
      .slice(markerIndex + FILE_EXEMPT_MARKER.length)
      .split('\n')[0]
    const reason = afterMarker.replace(/\*\/\s*$/, '').trim()
    if (reason.length > 0) return reason
  }
  return undefined
}

/**
 * Ancestors of `node` up to and including the nearest block-level statement.
 * Stopping at the enclosing `Block`/`SourceFile`/case clause is what keeps the
 * marker call-site-scoped: for a log call in a function body the chain is just
 * the `ExpressionStatement`, so a comment on the enclosing FUNCTION never
 * exempts anything. The chain is longer than one node only for brace-less
 * forms like `if (x) logError(...)`, where the author's comment naturally sits
 * above the `if`.
 */
function exemptScopeChain(node: Node): Node[] {
  const chain: Node[] = []
  let current: Node = node
  let parent = current.getParent()
  while (parent) {
    chain.push(current)
    if (
      Node.isBlock(parent) ||
      Node.isSourceFile(parent) ||
      Node.isModuleBlock(parent) ||
      Node.isCaseClause(parent) ||
      Node.isDefaultClause(parent)
    ) {
      return chain
    }
    current = parent
    parent = current.getParent()
  }
  return chain
}

function findExemptReason(node: Node): string | undefined {
  for (const ancestor of exemptScopeChain(node)) {
    const reason = extractExemptReason(ancestor.getLeadingCommentRanges())
    if (reason) return reason
  }
  return undefined
}

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function calleeName(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) return undefined
  const expression = call.getExpression()
  if (Node.isIdentifier(expression)) return expression.getText()
  if (Node.isPropertyAccessExpression(expression)) return expression.getName()
  return undefined
}

/**
 * Walks from `node` up towards the enclosing log call, asking whether anything
 * on the way reduces the value to a presence or length scalar. Stops at the log
 * call itself: a guard has to be applied BEFORE the value reaches the logger,
 * which is the whole point.
 */
function isGuarded(node: Node): boolean {
  let current: Node = node
  let parent = current.getParent()

  while (parent) {
    // `x.length` / `x?.length` -- but only when `x` is the object being
    // measured, never when `current` is itself the property NAME (for
    // `res.stdout`, the `stdout` identifier is a name node and must keep
    // walking up to see whether `res.stdout.length` encloses it).
    if (
      Node.isPropertyAccessExpression(parent) &&
      LENGTH_PROPERTIES.has(parent.getName()) &&
      parent.getExpression() === current
    ) {
      return true
    }

    // `!x` / `!!x` -- presence, not value.
    if (
      Node.isPrefixUnaryExpression(parent) &&
      parent.getOperatorToken() === SyntaxKind.ExclamationToken
    ) {
      return true
    }

    if (Node.isCallExpression(parent)) {
      const name = calleeName(parent)
      // Reached the logger without passing a guard.
      if (name && LOG_FUNCTION_RE.test(name)) return false
      if (name && GUARD_CALL_RE.test(name)) return true
    }

    current = parent
    parent = current.getParent()
  }

  return false
}

/**
 * Identifiers that merely NAME something rather than reference a value: the
 * `stdout` in `{ stdout: ... }`, in `{ stdout }` shorthand's key position, and
 * the callee of a call. Flagging these would be noise.
 */
function isNamePositionOnly(node: Node): boolean {
  const parent = node.getParent()
  if (!parent) return false

  if (Node.isPropertyAssignment(parent) && parent.getNameNode() === node) {
    return true
  }

  if (Node.isCallExpression(parent) && parent.getExpression() === node) {
    return true
  }

  return false
}

function classify(identifier: string): ViolationKind | undefined {
  if ((PROCESS_OUTPUT_IDENTIFIERS as readonly string[]).includes(identifier)) {
    return 'process-output'
  }
  if ((SECRET_IDENTIFIERS as readonly string[]).includes(identifier)) {
    return 'secret-identifier'
  }
  return undefined
}

function collapse(text: string, max = 140): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine
}

// ---------------------------------------------------------------------------
// scanSource -- the pure entry point
// ---------------------------------------------------------------------------

/**
 * Parses `sourceText` in memory and reports every unguarded secret-shaped
 * identifier reaching a log call. Disk-free and dependency-free so the tests
 * can drive it with fixtures.
 */
export function scanSource(filePath: string, sourceText: string): ScanResult {
  const project = new Project({
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: false }
  })
  const sourceFile: SourceFile = project.createSourceFile(
    filePath.endsWith('.ts') || filePath.endsWith('.tsx')
      ? filePath
      : `${filePath}.ts`,
    sourceText
  )

  const violations: Violation[] = []
  const exemptions: Exemption[] = []
  const seen = new Set<string>()

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression
  )) {
    const name = calleeName(call)
    if (!name || !LOG_FUNCTION_RE.test(name)) continue

    const callText = collapse(call.getText())

    for (const identifier of call.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const text = identifier.getText()
      const kind = classify(text)
      if (!kind) continue
      if (isNamePositionOnly(identifier)) continue
      if (isGuarded(identifier)) continue

      const line = identifier.getStartLineNumber()
      // `getStartLinePos()` is the file offset of the line's first character,
      // not a column -- subtract it from the node's own offset to get one.
      const column = identifier.getStart() - identifier.getStartLinePos() + 1
      // A single identifier can be reached through nested log calls; report it
      // once per source position.
      const dedupeKey = `${line}:${column}:${text}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)

      const reason = findExemptReason(identifier)
      if (reason) {
        exemptions.push({ file: filePath, line, identifier: text, reason })
        continue
      }

      violations.push({
        file: filePath,
        line,
        column,
        kind,
        identifier: text,
        callText
      })
    }
  }

  return { violations, exemptions }
}

// ---------------------------------------------------------------------------
// scanScope -- whole-tree orchestration. Owns all the I/O.
// ---------------------------------------------------------------------------

export const DEFAULT_SCOPE_ROOT = 'src/backend'

const SKIPPED_DIRECTORIES = new Set(['__tests__', '__mocks__', 'node_modules'])

function collectSourceFiles(root: string): string[] {
  const found: string[] = []

  function walk(dir: string): void {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch (error) {
      throw new ScopeLoadError(
        `could not read directory "${dir}": ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }

    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.ts')) continue
      if (entry.name.endsWith('.d.ts')) continue
      if (entry.name.endsWith('.test.ts')) continue
      found.push(full)
    }
  }

  walk(root)
  return found.sort()
}

/**
 * Scans every non-test `.ts` file under `root` (default `src/backend`). An
 * empty scope is treated as a crash, not a pass -- a glob that matches nothing
 * must never report green.
 */
export function scanScope(
  opts: { root?: string; repoRoot?: string; extraFiles?: string[] } = {}
): ScopeScanReport {
  // `repoRoot` only ever affects the PATHS in the report, never which files
  // are scanned. It exists so the jest suite can anchor on `__dirname` (the
  // `meta` project's idiom) instead of inheriting whatever cwd the runner
  // happens to have.
  const repoRoot = opts.repoRoot ?? process.cwd()
  const root = opts.root ?? join(repoRoot, DEFAULT_SCOPE_ROOT)
  const files = [...collectSourceFiles(root), ...(opts.extraFiles ?? [])]

  if (files.length === 0) {
    throw new ScopeLoadError(
      `scope root "${root}" matched no TypeScript files -- an empty scope is ` +
        'a gate that passes everything, and it must be indistinguishable ' +
        'from a crash, not from a pass'
    )
  }

  const report: ScopeScanReport = {
    scannedFiles: 0,
    violations: [],
    exemptions: []
  }

  for (const file of files) {
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

    // Report repo-root-relative POSIX paths so assertions are stable across
    // platforms and independent of the caller's cwd depth.
    const relativePath = relative(repoRoot, file).split(sep).join(posix.sep)
    const result = scanSource(relativePath, text)

    report.scannedFiles += 1
    report.violations.push(...result.violations)
    report.exemptions.push(...result.exemptions)
  }

  return report
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Human-readable report text -- one line per violation, a trailing summary, and
 * a remediation hint that names the two ways out (reduce the value, or exempt
 * the call site with a reason). Mirrors `lintTranslations.ts`'s convention of
 * printing every finding rather than returning at the first.
 */
export function formatReport(report: ScopeScanReport): string {
  const lines: string[] = []

  for (const violation of report.violations) {
    lines.push(
      `${violation.file}:${violation.line}  ${violation.kind}  ` +
        `"${violation.identifier}" reaches a log call unreduced  ` +
        `-- ${violation.callText}`
    )
  }

  lines.push(
    `Scanned ${report.scannedFiles} file(s), found ` +
      `${report.violations.length} violation(s), ` +
      `${report.exemptions.length} exempted call site(s).`
  )

  if (report.violations.length > 0) {
    lines.push(
      'Fix: log a presence or length instead of the value -- the convention ' +
        'in this repo is `len=${x.length}` / `keyPresent=${Boolean(x)}` / ' +
        '`bodyLength=${x.length}`. If the value is provably not a credential, ' +
        `add a \`// ${FILE_EXEMPT_MARKER} <reason>\` comment on the line above ` +
        'the call, naming the command whose output it is. There is no ' +
        'whole-file exemption, by design.'
    )
  }

  return lines.join('\n')
}
