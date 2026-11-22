/**
 * The shared scan helper for the Phase 86 delete gates (86-05): `infoPortComplete.test.ts` (one
 * describe per slice) and `infoShimSchedule.test.ts` (the shim and resolver schedule) both read
 * through it, so a scan is written and proven able to fail exactly once.
 *
 * Modelled on `loggerPortComplete.test.ts` (82 D-05): every scan runs over comment-stripped text,
 * the walk returns a count a gate pins to a floor, and each scan has a self-test that plants a
 * violation and watches it fail. This file lives outside `__tests__` so jest never runs it, and it
 * names no slice, channel or flag of its own: every name arrives as a parameter.
 *
 * D-06 shape rule (`checkShimShape`): a shim body is exactly one returned typed
 * `requestRustInvoke` call whose arguments are built only from the shim's parameters; a resolver
 * body is `const` declarations whose names are exactly the row's `inputs`, then exactly one returned
 * typed call. Anything else is reported by name, never silently allowed.
 *
 * Pure: no timers, no handles, no module-level state, nothing mocked.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'
import * as ts from 'typescript'
import {
  stripSourceComments,
  stripTrailingLineComment,
  stripTrailingLineCommentTs
} from 'backend/testUtils/stripSourceComments'

/** The repository root (`src/backend/testUtils` is three levels down). */
export const REPO_ROOT = join(__dirname, '..', '..', '..')

export interface StrippedFile {
  /** Repo-relative path with `/` separators. */
  path: string
  /** The file as read. */
  raw: string
  /** `raw` with block comments, whole-line comments and trailing line comments removed. */
  code: string
}

export interface StrippedWalk {
  files: StrippedFile[]
  /** `files.length`; a gate asserts this against a floor so a mis-rooted walk cannot pass. */
  count: number
}

export interface WalkOptions {
  /** Defaults to non-test .ts/.tsx/.rs files. */
  ext?: RegExp
  /** Defaults to the repository root; a self-test passes a temp directory. */
  base?: string
}

const SKIPPED_DIRS = new Set(['node_modules', '__tests__', 'target', '.git'])
const DEFAULT_EXT = /\.(ts|tsx|rs)$/
const TEST_FILE = /\.test\.tsx?$/

/** Comment-stripped text for a source file, picking the Rust or TypeScript trailing-comment scanner. */
function stripForScan(path: string, raw: string): string {
  const trailing = path.endsWith('.rs')
    ? stripTrailingLineComment
    : stripTrailingLineCommentTs
  return stripSourceComments(raw).split('\n').map(trailing).join('\n')
}

function walkDir(dir: string, ext: RegExp, out: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIPPED_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walkDir(full, ext, out)
    else if (ext.test(entry.name) && !TEST_FILE.test(entry.name)) out.push(full)
  }
}

/**
 * Every non-test source file under `roots` (repo-relative), each with its comment-stripped text.
 * `__tests__`, `node_modules` and `target` are skipped, so a gate file may name what it forbids.
 */
export function walkStripped(
  roots: readonly string[],
  opts: WalkOptions = {}
): StrippedWalk {
  const base = opts.base ?? REPO_ROOT
  const ext = opts.ext ?? DEFAULT_EXT
  const found: string[] = []
  for (const root of roots) walkDir(join(base, root), ext, found)
  const files = found.map((full) => {
    const raw = readFileSync(full, 'utf8')
    const path = relative(base, full).split('\\').join('/')
    return { path, raw, code: stripForScan(path, raw) }
  })
  return { files, count: files.length }
}

/** Throws naming every path that still exists. */
export function assertDeleted(
  paths: readonly string[],
  base: string = REPO_ROOT
): void {
  const present = paths.filter((p) => existsSync(join(base, p)))
  if (present.length > 0) {
    throw new Error(`expected deleted, still on disk: ${present.join(', ')}`)
  }
}

/** Throws naming every path that is missing. */
export function assertKept(
  paths: readonly string[],
  base: string = REPO_ROOT
): void {
  const missing = paths.filter((p) => !existsSync(join(base, p)))
  if (missing.length > 0) {
    throw new Error(`expected kept, missing from disk: ${missing.join(', ')}`)
  }
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `path: name` for every file whose comment-stripped code names an identifier on a word boundary. */
export function findIdentifiers(
  files: readonly StrippedFile[],
  names: readonly string[]
): string[] {
  const hits: string[] = []
  for (const f of files) {
    for (const name of names) {
      const re = new RegExp(`(?<![\\w$])${escapeRe(name)}(?![\\w$])`)
      if (re.test(f.code)) hits.push(`${f.path}: ${name}`)
    }
  }
  return hits
}

/**
 * `path: channel` for every file that registers a channel as a literal sidecar `ipc.handle` or
 * `ipc.on`, including the multi-line form where the channel sits on the next line.
 */
export function findTsRegistrations(
  files: readonly StrippedFile[],
  channels: readonly string[]
): string[] {
  const hits: string[] = []
  for (const f of files) {
    for (const ch of channels) {
      const re = new RegExp(`ipc\\.(on|handle)\\(\\s*['"]${escapeRe(ch)}['"]`)
      if (re.test(f.code)) hits.push(`${f.path}: ${ch}`)
    }
  }
  return hits
}

/** `path` for every file whose raw text names the rollback flag (D-13: no flag helper exists). */
export function findRollbackFlag(
  files: readonly StrippedFile[],
  flag: string
): string[] {
  return files.filter((f) => f.raw.includes(flag)).map((f) => f.path)
}

interface RustInfoCall {
  path: string
  /** The `RUST_INFO_*` constant passed as the channel. */
  constant: string
  /** The enclosing function's name; `<anonymous>` when it has none. */
  fn: string
}

function parse(path: string, source: string): ts.SourceFile {
  const kind = path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind)
}

/** The name an enclosing function-like node goes by: its own, or its variable/property it is assigned to. */
function functionName(node: ts.Node): string | undefined {
  if (
    (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText()
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const p = node.parent
    if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
      return p.name.text
    }
    if (ts.isPropertyAssignment(p)) return p.name.getText()
  }
  return undefined
}

const isFunctionLike = (node: ts.Node): boolean =>
  ts.isFunctionDeclaration(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isArrowFunction(node) ||
  ts.isFunctionExpression(node)

function enclosingFunctionName(node: ts.Node): string {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (isFunctionLike(cur)) {
      const name = functionName(cur)
      if (name) return name
    }
  }
  return '<anonymous>'
}

/** True for `requestRustInvoke(...)` and `<anything>.requestRustInvoke(...)`. */
function isRequestRustInvokeCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false
  const callee = node.expression
  if (ts.isIdentifier(callee)) return callee.text === 'requestRustInvoke'
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === 'requestRustInvoke'
  )
}

const isRustInfoConstant = (node: ts.Node | undefined): node is ts.Identifier =>
  node !== undefined &&
  ts.isIdentifier(node) &&
  /^RUST_INFO_[A-Z0-9_]+$/.test(node.text)

/**
 * Every `requestRustInvoke(RUST_INFO_<X>, ...)` call in `files`, with its file, the constant and the
 * name of the function holding it. Parsed from the comment-stripped code, so a call named in a
 * comment is not a call.
 */
export function findRustInfoCalls(
  files: readonly StrippedFile[]
): RustInfoCall[] {
  const calls: RustInfoCall[] = []
  for (const f of files) {
    if (!/\.tsx?$/.test(f.path)) continue
    if (!f.code.includes('RUST_INFO_')) continue
    const sf = parse(f.path, f.code)
    const visit = (node: ts.Node): void => {
      if (
        isRequestRustInvokeCall(node) &&
        isRustInfoConstant(node.arguments[0])
      ) {
        calls.push({
          path: f.path,
          constant: node.arguments[0].text,
          fn: enclosingFunctionName(node)
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
  return calls
}

/** Names of every exported function in `source`: declarations, and `export const f = () => ...`. */
export function findExportedFunctions(path: string, source: string): string[] {
  void path
  void source
  return []
}

/**
 * Repo-relative paths of every file in `files` that imports `target` (a repo-relative .ts path).
 * Bare specifiers resolve against `src/` (the tsconfig `baseUrl`), relative ones against the importer.
 */
export function findImporters(
  files: readonly StrippedFile[],
  target: string
): string[] {
  void files
  void target
  return []
}

export interface ShimRow {
  shape: 'shim' | 'resolver'
  /** Resolvers only: the names of the `const` declarations that gather TS-only inputs. */
  inputs?: readonly string[]
}

/** Binding names a parameter or declaration introduces (`a`, `{ a, b }`, `[a, ...b]`). */
function bindingNames(name: ts.BindingName, out: string[]): string[] {
  if (ts.isIdentifier(name)) {
    out.push(name.text)
  } else {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) bindingNames(el.name, out)
    }
  }
  return out
}

function findFunction(
  sf: ts.SourceFile,
  fnName: string
): ts.SignatureDeclaration | undefined {
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === fnName) return st
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer
        if (
          ts.isIdentifier(d.name) &&
          d.name.text === fnName &&
          init &&
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        ) {
          return init
        }
      }
    }
  }
  return undefined
}

const unwrap = (e: ts.Expression): ts.Expression => {
  let cur = e
  for (;;) {
    if (ts.isParenthesizedExpression(cur) || ts.isAwaitExpression(cur)) {
      cur = cur.expression
    } else return cur
  }
}

/**
 * Why `expr` is not built only from `allowed` names, or undefined when it is. Allows identifiers in
 * `allowed`, literals, array and object literals, spreads and property or element reads of them.
 */
function impureReason(
  expr: ts.Expression,
  allowed: ReadonlySet<string>
): string | undefined {
  if (ts.isIdentifier(expr)) {
    if (expr.text === 'undefined' || allowed.has(expr.text)) return undefined
    return `names '${expr.text}', which is not a parameter`
  }
  if (
    ts.isStringLiteralLike(expr) ||
    ts.isNumericLiteral(expr) ||
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword
  ) {
    return undefined
  }
  if (
    ts.isParenthesizedExpression(expr) ||
    ts.isAsExpression(expr) ||
    ts.isNonNullExpression(expr) ||
    ts.isSpreadElement(expr)
  ) {
    return impureReason(expr.expression, allowed)
  }
  if (ts.isPropertyAccessExpression(expr)) {
    return impureReason(expr.expression, allowed)
  }
  if (ts.isElementAccessExpression(expr)) {
    return (
      impureReason(expr.expression, allowed) ??
      impureReason(expr.argumentExpression, allowed)
    )
  }
  if (ts.isArrayLiteralExpression(expr)) {
    for (const el of expr.elements) {
      const r = impureReason(el, allowed)
      if (r) return r
    }
    return undefined
  }
  if (ts.isObjectLiteralExpression(expr)) {
    for (const p of expr.properties) {
      let r: string | undefined
      if (ts.isShorthandPropertyAssignment(p)) {
        r = allowed.has(p.name.text)
          ? undefined
          : `names '${p.name.text}', which is not a parameter`
      } else if (ts.isPropertyAssignment(p)) {
        r = impureReason(p.initializer, allowed)
      } else if (ts.isSpreadAssignment(p)) {
        r = impureReason(p.expression, allowed)
      } else {
        r = `holds a ${ts.SyntaxKind[p.kind]}`
      }
      if (r) return r
    }
    return undefined
  }
  return `is a ${ts.SyntaxKind[expr.kind]}, not a parameter read`
}

const excerpt = (n: ts.Node): string =>
  n.getText().replace(/\s+/g, ' ').slice(0, 60)

/**
 * Checks that `fnName` in `source` has the D-06 shape its schedule `row` claims. Returns the
 * violations (an empty array is a pass), each naming the offending statement.
 */
export function checkShimShape(
  source: string,
  fnName: string,
  row: ShimRow
): string[] {
  const sf = parse('shim.ts', source)
  const fn = findFunction(sf, fnName)
  if (!fn) return [`${fnName}: no exported function of that name in the file`]
  const label = `${fnName} (${row.shape})`
  const inputs = row.inputs ?? []
  if (row.shape === 'shim' && inputs.length > 0) {
    return [`${label}: a shim row names no inputs, got [${inputs.join(', ')}]`]
  }

  const params: string[] = []
  for (const p of fn.parameters) bindingNames(p.name, params)

  // Body as statements: an expression-bodied arrow is a single return of that expression.
  let statements: readonly ts.Node[]
  const body = (fn as { body?: ts.ConciseBody }).body
  if (!body) return [`${label}: has no body`]
  if (ts.isBlock(body)) statements = body.statements
  else statements = [body]

  const calls: ts.CallExpression[] = []
  const countCalls = (node: ts.Node): void => {
    if (isRequestRustInvokeCall(node)) calls.push(node)
    ts.forEachChild(node, countCalls)
  }
  for (const st of statements) countCalls(st)
  if (calls.length !== 1) {
    return [
      `${label}: holds ${calls.length} requestRustInvoke calls, expected exactly one`
    ]
  }

  const lead = statements.slice(0, -1)
  const last = statements[statements.length - 1]
  const problems: string[] = []

  const declared: string[] = []
  if (row.shape === 'shim') {
    for (const st of lead) {
      problems.push(`${label}: extra statement before the call: ${excerpt(st)}`)
    }
  } else {
    // The resolver rule (const names equal the row's inputs) lands with the schedule test (86-05 Task 2).
    return [`${label}: the resolver rule is not implemented yet`]
  }

  let returned: ts.Expression | undefined
  if (last && ts.isReturnStatement(last)) returned = last.expression
  else if (last && !ts.isBlock(body) && ts.isExpression(last)) returned = last
  if (!returned) {
    problems.push(
      `${label}: the last statement must return the call, found: ${last ? excerpt(last) : 'nothing'}`
    )
    return problems
  }

  const call = unwrap(returned)
  if (!isRequestRustInvokeCall(call)) {
    problems.push(
      `${label}: the returned value must be the requestRustInvoke call, found: ${excerpt(returned)}`
    )
    return problems
  }
  if (!isRustInfoConstant(call.arguments[0])) {
    problems.push(
      `${label}: the first argument must be a RUST_INFO_* constant, found: ${call.arguments[0] ? excerpt(call.arguments[0]) : 'none'}`
    )
  }

  const allowed = new Set([...params, ...declared])
  const callee = call.expression
  const calleeRoot = ts.isPropertyAccessExpression(callee)
    ? callee.expression
    : callee
  if (ts.isIdentifier(calleeRoot) && !params.includes(calleeRoot.text)) {
    problems.push(
      `${label}: the call goes through '${calleeRoot.text}', which is not a parameter`
    )
  }
  for (const arg of call.arguments.slice(1)) {
    const why = impureReason(arg, allowed)
    if (why) problems.push(`${label}: argument ${excerpt(arg)} ${why}`)
  }
  return problems
}
