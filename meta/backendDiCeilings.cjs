'use strict'
/**
 * Phase 66 (66-02, D-06/D-13/D-14/D-16): shrink-only ratchet for backend
 * module-level state, child_process imports and jest.mock calls.
 *
 * Three exact per-file counts, taken with the TypeScript compiler API
 * (`ts.createSourceFile`, no type-check, no program):
 *   - moduleState: non-test src/backend files. Each top-level let/var name
 *     (destructuring per name, `export let` included), and each top-level
 *     const bound to `new X` (X not in IMMUTABLE_NEW) or to an object/array
 *     literal that the same file later mutates. Rewriting `let m` as
 *     `const m = new Map()` therefore does not lower the count (D-06). Each
 *     non-readonly `static` class field counts too (C-WR-2): a static holder
 *     is module-level state wearing a class.
 *   - childProcess: non-test src/backend files. Each import/export-from,
 *     require() call and dynamic import() of child_process / node:child_process
 *     (type-only imports do not count).
 *   - jestMock: every .ts/.tsx under src/. Each `jest.mock(...)` call;
 *     comments never count.
 *
 * 66.3 TARGETS (C-WR-2): when static fields joined the census the baseline ROSE by 17
 * (234 -> 251); that is the ratchet recording existing state, not new growth. The static
 * holders, all to be replaced by injected slices in 66.3: SteamUser (steam/user.ts, 11:
 * boundStores, client, connectingPromise, leaseCount, idleTimer, guidedInstallTargets,
 * shuttingDown, sessionGeneration, abandonPendingLogon, wrapTail, logonFailure) and
 * SteamUser.bindStores; bottle.ts `bindBottleStores`; humble/humbleStores.ts
 * `bindHumbleStores`; tools/dxmt.ts `bindDxmtStores`; humble/user.ts activeWatch;
 * config.ts GlobalConfig.globalInstance; game_config.ts GameConfig.instances.
 * `bindSteamGridDbSecretDeps` is a top-level let and was already counted.
 *
 * Known residual, documented not hidden: `const reg = createRegistry()` (a
 * call returning a container) is NOT counted syntactically. A fixture test
 * pins that; the 66.3 zero flip and code review cover it.
 *
 * Baselines live in sharded files meta/backendDiCeilings/*.json (any name),
 * so parallel plans each own a shard. A path may appear in only one shard per
 * section. Shard format (every section optional, keys are repo-root-relative
 * POSIX paths):
 *   { "moduleState": {p: n}, "childProcess": {p: n}, "jestMock": {p: n},
 *     "sanctioned": { p: { kind, moduleState, childProcess, reason,
 *                          deletedBy? } } }
 * Sanctioned `kind` is runner | logger-sink | boot-entry | rust-overlap
 * (D-13). rust-overlap needs `deletedBy: "Phase N"` (D-14). A sanctioned entry
 * is an EXACT pair of counts, not an exemption: growth and shrink both fail
 * (65 CR-01 was an allowlist that exempted a file at any size).
 *
 * Contract (D-16): a file above its entry fails (grew); below fails (shrank:
 * lower it in this commit); an entry for a vanished file fails (stale); a zero
 * entry fails; a nonzero file in no shard fails (new violation). There is NO
 * update flag: numbers move by hand in the commit that removes the sites.
 * File-count floors make "scanned nothing" fail rather than pass.
 *
 * `--shard <name>` restricts evaluation to the paths listed in
 * meta/backendDiCeilings/<name>.json (floors still enforced) so a parallel
 * plan can verify only what it owns; the unrestricted run is the wave-end gate.
 */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const REPO_ROOT = path.join(__dirname, '..')
const DEFAULT_BASELINE_DIR = path.join(__dirname, 'backendDiCeilings')
const SKIP_DIRS = new Set([
  '__tests__',
  '__mocks__',
  'testUtils',
  'node_modules'
])
// Floors: about half of the files measured on 2026-11-10 (475 scanned
// non-test backend files; 1,911 .ts/.tsx files under src/).
const DEFAULT_MIN_BACKEND_FILES = 240
const DEFAULT_MIN_SRC_FILES = 955

const SECTIONS = ['moduleState', 'childProcess', 'jestMock']
const SHARD_KEYS = new Set([...SECTIONS, 'sanctioned'])
const KINDS = new Set(['runner', 'logger-sink', 'boot-entry', 'rust-overlap'])
const DELETED_BY = /^Phase \d+(\.\d+)?$/
const IMMUTABLE_NEW = new Set([
  'RegExp',
  'URL',
  'URLSearchParams',
  'TextDecoder',
  'TextEncoder',
  'Error',
  'Date'
])
const MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'set',
  'add',
  'delete',
  'clear',
  'sort',
  'reverse',
  'fill',
  'copyWithin'
])
const CP_MODULES = new Set(['child_process', 'node:child_process'])

const parse = (text, fileName) =>
  ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true)

function namesOf(name) {
  if (ts.isIdentifier(name)) return [name.text]
  const out = []
  for (const el of name.elements) {
    if (ts.isOmittedExpression(el)) continue
    out.push(...namesOf(el.name))
  }
  return out
}

function unwrap(expr) {
  let e = expr
  while (
    ts.isAsExpression(e) ||
    ts.isSatisfiesExpression(e) ||
    ts.isNonNullExpression(e) ||
    ts.isParenthesizedExpression(e) ||
    ts.isTypeAssertionExpression(e)
  )
    e = e.expression
  return e
}

/** Identifier at the root of a property/element access chain, or null. */
function rootId(expr) {
  let e = unwrap(expr)
  while (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e))
    e = unwrap(e.expression)
  return ts.isIdentifier(e) ? e.text : null
}

const isAccess = (e) =>
  ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)

/** Names (from `ids`) that the file mutates through a property/element path. */
function mutatedIds(sf, ids) {
  const hit = new Set()
  const mark = (expr) => {
    const r = rootId(expr)
    if (r !== null && ids.has(r)) hit.add(r)
  }
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      isAccess(unwrap(node.left))
    )
      mark(node.left)
    else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken) &&
      isAccess(unwrap(node.operand))
    )
      mark(node.operand)
    else if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression)
      if (ts.isPropertyAccessExpression(callee)) {
        if (MUTATORS.has(callee.name.text)) mark(callee.expression)
        if (
          callee.name.text === 'assign' &&
          ts.isIdentifier(callee.expression) &&
          callee.expression.text === 'Object' &&
          node.arguments.length > 0
        )
          mark(node.arguments[0])
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return hit
}

function countModuleState(sourceText, fileName = 'x.ts') {
  const sf = parse(sourceText, fileName)
  let n = 0
  const candidates = new Set()
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    if (st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword))
      continue
    const isConst = (st.declarationList.flags & ts.NodeFlags.Const) !== 0
    for (const decl of st.declarationList.declarations) {
      if (!isConst) {
        n += namesOf(decl.name).length
        continue
      }
      if (!decl.initializer) continue
      const init = unwrap(decl.initializer)
      if (ts.isNewExpression(init)) {
        const callee = init.expression.getText(sf)
        if (!IMMUTABLE_NEW.has(callee) && !callee.startsWith('Intl.')) n += 1
      } else if (
        (ts.isObjectLiteralExpression(init) ||
          ts.isArrayLiteralExpression(init)) &&
        ts.isIdentifier(decl.name)
      )
        candidates.add(decl.name.text)
    }
  }
  if (candidates.size > 0) n += mutatedIds(sf, candidates).size
  return n + countStaticFields(sf)
}

/**
 * Non-readonly `static` class fields (C-WR-2). A `class X { static bound }` holder is ambient
 * module-level state exactly like a top-level `let`: the 66.1 store/dep holders
 * (SteamUser.bindStores, bindBottleStores, ...) lived here and were invisible to the census,
 * so the ceilings fell while the state moved. Methods, accessors, static blocks and
 * `static readonly` fields do not count (a readonly field cannot be re-bound).
 */
function countStaticFields(sf) {
  let n = 0
  const visit = (node) => {
    if (
      ts.isPropertyDeclaration(node) &&
      node.parent &&
      ts.isClassLike(node.parent)
    ) {
      const mods = node.modifiers ?? []
      const has = (k) => mods.some((m) => m.kind === k)
      if (
        has(ts.SyntaxKind.StaticKeyword) &&
        !has(ts.SyntaxKind.ReadonlyKeyword) &&
        !has(ts.SyntaxKind.DeclareKeyword)
      )
        n += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return n
}

function countChildProcessImports(sourceText, fileName = 'x.ts') {
  const sf = parse(sourceText, fileName)
  let n = 0
  const isCp = (spec) =>
    spec && ts.isStringLiteralLike(spec) && CP_MODULES.has(spec.text)
  const allTypeNamed = (bindings, elementsKey) =>
    bindings &&
    elementsKey(bindings) &&
    elementsKey(bindings).length > 0 &&
    elementsKey(bindings).every((e) => e.isTypeOnly)
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && isCp(node.moduleSpecifier)) {
      const c = node.importClause
      const typeOnly =
        c &&
        (c.isTypeOnly ||
          (!c.name &&
            c.namedBindings &&
            ts.isNamedImports(c.namedBindings) &&
            allTypeNamed(c.namedBindings, (b) => b.elements)))
      if (!typeOnly) n += 1
    } else if (ts.isExportDeclaration(node) && isCp(node.moduleSpecifier)) {
      const typeOnly =
        node.isTypeOnly ||
        (node.exportClause &&
          ts.isNamedExports(node.exportClause) &&
          allTypeNamed(node.exportClause, (b) => b.elements))
      if (!typeOnly) n += 1
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      isCp(node.moduleReference.expression) &&
      !node.isTypeOnly
    ) {
      n += 1
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require'
      const isDynamic = callee.kind === ts.SyntaxKind.ImportKeyword
      if ((isRequire || isDynamic) && isCp(node.arguments[0])) n += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return n
}

function countJestMock(sourceText, fileName = 'x.ts') {
  const sf = parse(sourceText, fileName)
  let n = 0
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'jest' &&
      node.expression.name.text === 'mock'
    )
      n += 1
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return n
}

const toPosix = (p) => p.split(path.sep).join('/')

function walkTs(dir, skipDirs, out) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walkTs(full, skipDirs, out)
      continue
    }
    if (!entry.isFile()) continue
    if (!/\.tsx?$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

function census(root = REPO_ROOT) {
  const result = {
    moduleState: {},
    childProcess: {},
    jestMock: {},
    backendFiles: 0,
    srcFiles: 0
  }
  const rel = (f) => toPosix(path.relative(root, f))
  const backendDir = path.join(root, 'src', 'backend')
  const isTest = (f) => /\.(test\.tsx?|d\.ts)$/.test(f)
  for (const f of walkTs(backendDir, SKIP_DIRS, []).sort()) {
    if (isTest(f)) continue
    result.backendFiles += 1
    const text = fs.readFileSync(f, 'utf8')
    const ms = countModuleState(text, f)
    const cp = countChildProcessImports(text, f)
    if (ms > 0) result.moduleState[rel(f)] = ms
    if (cp > 0) result.childProcess[rel(f)] = cp
  }
  const srcFiles = walkTs(
    path.join(root, 'src'),
    new Set(['node_modules']),
    []
  ).sort()
  for (const f of srcFiles) {
    result.srcFiles += 1
    const text = fs.readFileSync(f, 'utf8')
    if (!text.includes('jest')) continue
    const n = countJestMock(text, f)
    if (n > 0) result.jestMock[rel(f)] = n
  }
  return result
}

const isPlainObject = (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Reads every *.json in dir. A path in two shards for one section is a
 * failure. Returns { merged, failures }.
 */
function loadShards(dir = DEFAULT_BASELINE_DIR) {
  const merged = {
    moduleState: {},
    childProcess: {},
    jestMock: {},
    sanctioned: {}
  }
  const failures = []
  const names = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .sort()
    : []
  for (const name of names) {
    let data
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    } catch (e) {
      failures.push(`cannot read shard ${name}: ${e.message}`)
      continue
    }
    if (!isPlainObject(data)) {
      failures.push(`shard ${name}: top level must be an object`)
      continue
    }
    for (const key of Object.keys(data)) {
      if (!SHARD_KEYS.has(key)) {
        failures.push(`shard ${name}: unknown key "${key}"`)
        continue
      }
      if (!isPlainObject(data[key])) {
        failures.push(`shard ${name}: "${key}" must be an object`)
        continue
      }
      for (const file of Object.keys(data[key])) {
        const value = data[key][file]
        if (key !== 'sanctioned' && !(Number.isInteger(value) && value > 0)) {
          failures.push(
            `shard ${name}: ${key} ${file} must be a positive integer (a zero entry is removed, not kept)`
          )
          continue
        }
        if (key === 'sanctioned' && !isPlainObject(value)) {
          failures.push(`shard ${name}: sanctioned ${file} must be an object`)
          continue
        }
        if (Object.prototype.hasOwnProperty.call(merged[key], file)) {
          failures.push(
            `duplicate: ${file} appears in two shards for ${key} (second: ${name})`
          )
          continue
        }
        merged[key][file] = value
      }
    }
  }
  return { merged, failures }
}

/**
 * Pure. Returns failure strings (empty = pass).
 * @param {{moduleState?:object, childProcess?:object, jestMock?:object, sanctioned?:object}} merged
 * @param {{moduleState:object, childProcess:object, jestMock:object}} current
 */
function evaluate(merged, current) {
  const failures = []
  const sanctioned = merged.sanctioned || {}
  const sanctionedPaths = new Set(Object.keys(sanctioned))

  for (const file of [...sanctionedPaths].sort()) {
    const e = sanctioned[file]
    let valid = true
    if (!KINDS.has(e.kind)) {
      failures.push(`sanctioned ${file}: unknown kind "${e.kind}"`)
      valid = false
    }
    if (typeof e.reason !== 'string' || e.reason.length < 20) {
      failures.push(
        `sanctioned ${file}: reason must be a string of at least 20 characters`
      )
      valid = false
    }
    if (e.kind === 'rust-overlap' && !DELETED_BY.test(e.deletedBy || '')) {
      failures.push(
        `sanctioned ${file}: rust-overlap needs deletedBy "Phase N" (D-14)`
      )
      valid = false
    }
    for (const k of ['moduleState', 'childProcess']) {
      if (!Number.isInteger(e[k]) || e[k] < 0) {
        failures.push(`sanctioned ${file}: ${k} must be a non-negative integer`)
        valid = false
      }
    }
    for (const k of ['moduleState', 'childProcess']) {
      if (merged[k] && merged[k][file] !== undefined)
        failures.push(
          `sanctioned ${file} also appears in ${k}; a path is sanctioned or baselined, not both`
        )
    }
    if (!valid) continue
    if (e.moduleState === 0 && e.childProcess === 0) {
      failures.push(
        `sanctioned ${file}: both counts are 0, remove the entry in this commit`
      )
      continue
    }
    const curMs = current.moduleState[file] || 0
    const curCp = current.childProcess[file] || 0
    if (curMs === 0 && curCp === 0) {
      failures.push(
        `stale sanctioned entry: ${file} (no sites left; remove the entry in this commit)`
      )
      continue
    }
    for (const [k, cur] of [
      ['moduleState', curMs],
      ['childProcess', curCp]
    ]) {
      if (cur > e[k])
        failures.push(
          `grew: ${file} ${cur} > baseline ${e[k]} (sanctioned ${k})`
        )
      else if (cur < e[k])
        failures.push(
          `shrank: lower ${file} to ${cur} in this commit (sanctioned ${k} baseline says ${e[k]})`
        )
    }
  }

  for (const section of SECTIONS) {
    const baseline = merged[section] || {}
    const cur = current[section] || {}
    const skip = section === 'jestMock' ? new Set() : sanctionedPaths
    for (const file of Object.keys(cur).sort()) {
      if (skip.has(file)) continue
      const n = cur[file]
      const b = baseline[file]
      if (b === undefined)
        failures.push(
          `new violation: ${file} has ${n} (${section}) and no baseline entry; remove it instead`
        )
      else if (n > b)
        failures.push(`grew: ${file} ${n} > baseline ${b} (${section})`)
      else if (n < b)
        failures.push(
          `shrank: lower ${file} to ${n} in this commit (${section} baseline says ${b})`
        )
    }
    for (const file of Object.keys(baseline).sort()) {
      if (skip.has(file)) continue
      if (baseline[file] === 0)
        failures.push(`zero entry: remove ${file} (${section}) in this commit`)
      else if (cur[file] === undefined)
        failures.push(
          `stale baseline entry: ${file} (${section}) (no sites left; remove the entry in this commit)`
        )
    }
  }
  return failures
}

/** Paths listed in any section of one shard's data. */
function restrictTo(paths, merged, current) {
  const pick = (obj) => {
    const out = {}
    for (const k of Object.keys(obj || {})) if (paths.has(k)) out[k] = obj[k]
    return out
  }
  const m = {}
  const c = {}
  for (const s of SECTIONS) {
    m[s] = pick(merged[s])
    c[s] = pick(current[s])
  }
  m.sanctioned = pick(merged.sanctioned)
  return { merged: m, current: c }
}

function parseArgs(argv) {
  const out = {
    root: undefined,
    baselineDir: undefined,
    shard: undefined,
    minBackendFiles: DEFAULT_MIN_BACKEND_FILES,
    minSrcFiles: DEFAULT_MIN_SRC_FILES
  }
  const flags = {
    '--root': 'root',
    '--baseline-dir': 'baselineDir',
    '--shard': 'shard',
    '--min-backend-files': 'minBackendFiles',
    '--min-src-files': 'minSrcFiles'
  }
  for (let i = 0; i < argv.length; i++) {
    const key = flags[argv[i]]
    if (!key) throw new Error(`unknown argument: ${argv[i]}`)
    const v = argv[i + 1]
    if (v === undefined || v === '' || v.startsWith('--'))
      throw new Error(`${argv[i]} needs a value`)
    i += 1
    if (key === 'minBackendFiles' || key === 'minSrcFiles') {
      const num = Number(v)
      if (!Number.isInteger(num) || num < 1)
        throw new Error(
          `invalid ${argv[i - 1]}: ${v} (need a positive integer)`
        )
      out[key] = num
    } else out[key] = v
  }
  return out
}

function sum(obj) {
  return Object.values(obj).reduce((a, b) => a + b, 0)
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`FAIL: ${e.message}`)
    process.exit(1)
  }
  const root = args.root ? path.resolve(args.root) : REPO_ROOT
  const dir = args.baselineDir
    ? path.resolve(args.baselineDir)
    : DEFAULT_BASELINE_DIR
  const current = census(root)
  const failures = []
  if (current.backendFiles < args.minBackendFiles)
    failures.push(
      `scanned only ${current.backendFiles} backend files, below the floor of ${args.minBackendFiles}; the scan is broken`
    )
  if (current.srcFiles < args.minSrcFiles)
    failures.push(
      `scanned only ${current.srcFiles} src files, below the floor of ${args.minSrcFiles}; the scan is broken`
    )
  const loaded = loadShards(dir)
  failures.push(...loaded.failures)
  let merged = loaded.merged
  let cur = current
  if (args.shard !== undefined) {
    const shardFile = path.join(dir, `${args.shard}.json`)
    if (!fs.existsSync(shardFile)) {
      failures.push(`unknown shard: ${args.shard} (no ${shardFile})`)
    } else {
      const data = JSON.parse(fs.readFileSync(shardFile, 'utf8'))
      const paths = new Set()
      for (const k of Object.keys(data))
        for (const p of Object.keys(data[k] || {})) paths.add(p)
      ;({ merged, current: cur } = restrictTo(paths, merged, current))
    }
  }
  failures.push(...evaluate(merged, cur))
  if (failures.length > 0) {
    for (const f of failures) console.error(`FAIL: ${f}`)
    process.exit(1)
  }
  const files = (o) => Object.keys(o).length
  console.log(
    `backend-di-ceilings: PASS moduleState=${sum(cur.moduleState)} (${files(cur.moduleState)} files) childProcess=${sum(cur.childProcess)} (${files(cur.childProcess)} files) jestMock=${sum(cur.jestMock)} (${files(cur.jestMock)} files) sanctioned=${Object.keys(merged.sanctioned).length}`
  )
}

module.exports = {
  census,
  countModuleState,
  countChildProcessImports,
  countJestMock,
  evaluate,
  loadShards,
  parseArgs,
  restrictTo
}

if (require.main === module) main()
