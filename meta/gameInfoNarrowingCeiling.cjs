'use strict'
/**
 * Phase 70 (70-02, D-15): shrink-only ratchet on GameInfo narrowing in shared
 * code. Counts, per non-test file under src/frontend, src/backend and src/common
 * (outside src/backend/storeManagers/, the named store-specific UI and the
 * src/common type/guard homes), these forms:
 *   - calls to isStoreGame/asStoreGame;
 *   - identifiers naming a *GameInfo member type;
 *   - GameInfoByRunner[...] indexed access (names a member without its identifier);
 *   - Extract<...GameInfo..., ...> (the same, via a conditional type);
 *   - isStore(<object>, '<literal>') calls. isStore also accepts plain runner
 *     strings, where it is an identity check and not a narrowing, so a first
 *     argument that is a string literal, or an identifier / property access named
 *     like runner or store (runner, game.runner, props.store), is NOT counted. This
 *     is a syntactic approximation: it cannot see types.
 *
 * Contract (same family as meta/steamLineCeiling.cjs):
 *   - Every file's count must match meta/gameInfoNarrowingBaseline.json
 *     EXACTLY. Growth fails; a shrink fails until the entry is lowered in the
 *     same commit.
 *   - A baseline entry for a file now at 0, or for a file that is not scanned,
 *     fails (stale). A file at 0 must be absent from the baseline.
 *   - Every entry needs a written reason (`reasons`), and every reason needs an
 *     entry: the end state is a short reviewed allowlist, not zero.
 *   - A scanned-file floor stops a broken scan reading as a pass.
 *   - There is NO update flag. Numbers move by hand, in the same commit.
 *   - Import/export specifiers and comments never count: an import alone is
 *     not a read.
 */
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const REPO_ROOT = path.join(__dirname, '..')
const DEFAULT_BASELINE = path.join(__dirname, 'gameInfoNarrowingBaseline.json')
const SCAN_DIRS = ['src/frontend', 'src/backend', 'src/common']
// 90 percent (rounded down) of the 783 files measured at 70-02.
const DEFAULT_MIN_FILES = 704
const CODE_EXT = new Set(['.ts', '.tsx'])
const SKIP_DIRS = new Set([
  '__tests__',
  '__mocks__',
  '__fixtures__',
  'node_modules'
])
const GUARDS = new Set(['isStoreGame', 'asStoreGame'])
const MEMBER_TYPES = new Set([
  'SteamGameInfo',
  'GogGameInfo',
  'LegendaryGameInfo',
  'NileGameInfo',
  'SideloadGameInfo'
])

/** Store-specific UI that legitimately names one store's shape. */
const STORE_SPECIFIC_EXEMPT = [
  ['src/frontend/screens/Game/ModifyInstallModal/GOG', 'GOG-only modal'],
  [
    'src/frontend/screens/Game/ModifyInstallModal/Legendary',
    'Legendary-only modal'
  ],
  [
    'src/frontend/screens/Library/components/InstallModal/SteamDialog',
    'Steam-only install dialog'
  ],
  [
    'src/frontend/screens/Library/components/InstallModal/SideloadDialog',
    'Sideload-only install dialog'
  ],
  [
    'src/frontend/screens/DownloadManager/components/SteamManagedItem',
    'Steam-only download item'
  ],
  ...[
    'src/frontend/helpers/steamInstallOptionsEntry.ts',
    'src/frontend/helpers/steamInstallSignIn.ts',
    'src/frontend/helpers/steamKeyValidation.ts',
    'src/frontend/helpers/steamUpdateConfirm.ts',
    'src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts',
    'src/frontend/state/SteamBottleSetup.ts',
    'src/frontend/state/SteamBridgeRouteNotice.ts',
    'src/frontend/state/SteamBridgeSetup.ts',
    'src/frontend/state/SteamClientSetup.ts',
    'src/frontend/state/SteamRequestNotice.ts',
    'src/frontend/state/SteamSetupDownloads.ts',
    'src/frontend/state/SteamSignOut.ts'
  ].map((p) => [p, 'Steam-only helper or state module'])
].map(([p, reason]) => ({ path: p, reason }))

const STORE_MANAGERS = 'src/backend/storeManagers'

/** src/common homes that define the GameInfo types and the narrowing guards themselves. */
const COMMON_EXEMPT = [
  { path: 'src/common/types', reason: 'the GameInfo type and schema homes' },
  { path: 'src/common/types.ts', reason: 'defines the GameInfo union' },
  {
    path: 'src/common/gameInfoNarrowing.ts',
    reason: 'defines isStoreGame/asStoreGame'
  },
  { path: 'src/common/storeCapabilities.ts', reason: 'defines isStore' }
]

const RUNNER_LIKE = /runner|store/i

/** isStore's first argument names an object (not a plain runner string). */
function isObjectSubject(arg) {
  if (ts.isStringLiteralLike(arg)) return false
  if (ts.isIdentifier(arg)) return !RUNNER_LIKE.test(arg.text)
  if (ts.isPropertyAccessExpression(arg))
    return !RUNNER_LIKE.test(arg.name.text)
  return true
}

/**
 * @param {string} text
 * @param {string} fileName
 * @returns {number}
 */
function countNarrowing(text, fileName) {
  const sf = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  )
  let n = 0
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      GUARDS.has(node.expression.text)
    )
      n++
    else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'isStore' &&
      node.arguments.length >= 2 &&
      ts.isStringLiteralLike(node.arguments[1]) &&
      isObjectSubject(node.arguments[0])
    )
      n++
    else if (ts.isIdentifier(node) && MEMBER_TYPES.has(node.text)) n++
    else if (
      ts.isIndexedAccessTypeNode(node) &&
      ts.isTypeReferenceNode(node.objectType) &&
      node.objectType.typeName.getText() === 'GameInfoByRunner'
    )
      n++
    else if (
      ts.isTypeReferenceNode(node) &&
      node.typeName.getText() === 'Extract' &&
      node.typeArguments &&
      node.typeArguments.length > 0 &&
      node.typeArguments[0].getText().includes('GameInfo')
    )
      n++
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return n
}

/** @param {string} rel POSIX repo-relative path */
function isExempt(rel) {
  if (rel === STORE_MANAGERS || rel.startsWith(`${STORE_MANAGERS}/`))
    return true
  return [...STORE_SPECIFIC_EXEMPT, ...COMMON_EXEMPT].some(
    (e) => rel === e.path || rel.startsWith(`${e.path}/`)
  )
}

/**
 * @param {string} [root] repo root
 * @returns {string[]} root-relative POSIX paths
 */
function collectFiles(root = REPO_ROOT) {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(full)
        continue
      }
      if (!entry.isFile()) continue
      if (!CODE_EXT.has(path.extname(entry.name))) continue
      if (/\.(test|spec)\./.test(entry.name)) continue
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (isExempt(rel)) continue
      out.push(rel)
    }
  }
  for (const d of SCAN_DIRS) {
    const full = path.join(root, ...d.split('/'))
    if (fs.existsSync(full)) walk(full)
  }
  return out
}

/**
 * Pure.
 * @param {{ counts: Record<string, number>, baseline: { files?: Record<string, number>, reasons?: Record<string, string> }, scannedFiles: number, minFiles: number }} input
 * @returns {{ ok: boolean, failures: { kind: string, message: string }[] }}
 */
function evaluate({ counts, baseline, scannedFiles, minFiles }) {
  const files = baseline.files || {}
  const reasons = baseline.reasons || {}
  const failures = []
  const add = (kind, message) => failures.push({ kind, message })
  if (scannedFiles < minFiles)
    add(
      'floor',
      `scanned only ${scannedFiles} files, below the floor of ${minFiles}; the scan is broken`
    )
  for (const file of Object.keys(counts).sort()) {
    const n = counts[file]
    if (n === 0) continue
    const allowed = files[file]
    if (allowed === undefined || n > allowed)
      add('grew', `${file} has ${n}, baseline ${allowed ?? 0}`)
    else if (n < allowed)
      add(
        'shrank',
        `lower ${file} to ${n} in this commit (baseline ${allowed})`
      )
  }
  for (const file of Object.keys(files).sort()) {
    if (!counts[file])
      add(
        'stale',
        `stale baseline entry: ${file} (at 0 or not scanned; remove it in this commit)`
      )
    if (typeof reasons[file] !== 'string' || reasons[file].trim() === '')
      add('unreviewed', `${file} has a baseline entry but no reason`)
  }
  for (const file of Object.keys(reasons).sort())
    if (files[file] === undefined)
      add('unreviewed', `${file} has a reason but no baseline entry`)
  return { ok: failures.length === 0, failures }
}

/**
 * @param {string} [root]
 * @returns {string[]} listed exemptions that no longer exist
 */
function staleExemptions(root = REPO_ROOT) {
  return [...STORE_SPECIFIC_EXEMPT, ...COMMON_EXEMPT]
    .filter((e) => !fs.existsSync(path.join(root, ...e.path.split('/'))))
    .map(
      (e) =>
        `stale store-specific exemption: ${e.path} (gone; remove it from STORE_SPECIFIC_EXEMPT / COMMON_EXEMPT in this commit)`
    )
}

/**
 * Pure. Parses `--root`, `--baseline` and `--min-files`; a missing or invalid
 * value is an error, never a silent default.
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const values = {}
  for (const flag of ['--root', '--baseline', '--min-files']) {
    const i = argv.indexOf(flag)
    if (i === -1) continue
    const v = argv[i + 1]
    if (v === undefined || v === '' || v.startsWith('--'))
      return { error: `${flag} needs a value` }
    values[flag] = v
  }
  let minFiles = DEFAULT_MIN_FILES
  if (values['--min-files'] !== undefined) {
    minFiles = Number(values['--min-files'])
    if (!Number.isInteger(minFiles) || minFiles < 1)
      return {
        error: `invalid --min-files: ${values['--min-files']} (need a positive integer)`
      }
  }
  return { root: values['--root'], baseline: values['--baseline'], minFiles }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if ('error' in args) {
    console.error(`FAIL: ${args.error}`)
    process.exit(1)
  }
  const root = args.root ? path.resolve(args.root) : REPO_ROOT
  const baselinePath = args.baseline || DEFAULT_BASELINE
  let baseline
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  } catch (e) {
    console.error(`cannot read baseline ${baselinePath}: ${e.message}`)
    process.exit(1)
  }
  const files = collectFiles(root)
  const counts = {}
  for (const rel of files)
    counts[rel] = countNarrowing(
      fs.readFileSync(path.join(root, rel), 'utf8'),
      rel
    )
  const stale = args.root ? [] : staleExemptions(root)
  const { failures } = evaluate({
    counts,
    baseline,
    scannedFiles: files.length,
    minFiles: args.minFiles
  })
  if (stale.length === 0 && failures.length === 0) {
    console.log(
      `PASS (${files.length} files scanned, ${Object.keys(baseline.files || {}).length} allowlisted)`
    )
    return
  }
  for (const s of stale) console.error(`FAIL: ${s}`)
  for (const f of failures) console.error(`FAIL [${f.kind}]: ${f.message}`)
  process.exit(1)
}

module.exports = {
  countNarrowing,
  collectFiles,
  evaluate,
  parseArgs,
  staleExemptions,
  STORE_SPECIFIC_EXEMPT,
  COMMON_EXEMPT
}

if (require.main === module) main()
