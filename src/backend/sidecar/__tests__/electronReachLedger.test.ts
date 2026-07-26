/**
 * Measured electron-reach ledger (Phase 34.2 Plan 11 — REQ-34.2-03, closing
 * verification gap #3 / code-review finding WR-02).
 *
 * `gameDetailsImportGate.test.ts`'s Gates 1/3/4 (and this slice's two module
 * docstrings, before this plan) asserted a property that does not hold: that
 * the game-details/settings/overrides slice reaches NO electron-importing
 * module TRANSITIVELY. Those gates are depth-1 regexes over each file's own
 * comment-stripped text — they can only see a file's own imports, never an
 * edge two hops away. `dispatch.ts` -> `../dialog/dialog` -> `electron` is a
 * real, two-hop edge those gates structurally cannot detect.
 *
 * **A non-empty reach set here is EXPECTED, not a defect.** `electronStub.ts`
 * installs a `Module._load` interception (`installElectronHook`) that
 * rewrites every `require('electron')` inside the sidecar process to the
 * stub module BEFORE any backend module is imported — that is the real,
 * load-bearing mechanism that makes transitive electron reach safe at
 * runtime. This file does not (and must not try to) make that reach zero;
 * it measures it, commits the measurement, and fails loudly if it GROWS.
 *
 * **This is deliberately a growth-only (subset) tripwire, not a strict-
 * equality pin.** Phase 35 (the Electron cutover) is expected to shrink this
 * set over time as modules are decoupled from `electron` one at a time — a
 * strict-equality assertion would go red on every one of those legitimate
 * improvements. The committed `BASELINE_ELECTRON_REACHING_MODULES` array
 * below IS the Phase 35 cutover work-list: every path in it is a module that
 * genuinely still reaches `electron` (directly or transitively) from this
 * slice's four gated entry points, and is therefore hook-rescued rather than
 * genuinely electron-free.
 *
 * A resolver that silently stops traversing (a broken alias, a swallowed
 * exception, an over-eager `node_modules` filter) would make the growth
 * tripwire pass VACUOUSLY against an empty set — the same failure mode
 * WR-01/WR-04 record elsewhere in this slice. The anti-degradation test and
 * the graph-size test below exist specifically to rule that out.
 */

import * as ts from 'typescript'
import { readFileSync } from 'fs'
import { dirname, join, relative, resolve } from 'path'

const REPO_ROOT = resolve(join(__dirname, '../../../..'))

const ENTRY_POINTS = [
  join(REPO_ROOT, 'src/backend/gamedetails/dispatch.ts'),
  join(REPO_ROOT, 'src/backend/gamedetails/overrides.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/gameDetailsFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/enrichmentFlowRegistration.ts'),
  // Phase 34.3 Plan 07 (REQ-34.3-10, D-10): this slice's three entry points.
  // logger/uploader.ts (reached via loggerFlowRegistration.ts) imports `app`
  // from 'electron' at its own line 1 -- the new edge this extension exists
  // to capture.
  join(REPO_ROOT, 'src/backend/sidecar/shellFilesFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/clipboardFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/loggerFlowRegistration.ts')
]

// Regenerated at plan-execution time (2026-07-26, Phase 34.3 Plan 07), not
// pasted from planning-time prose. Sorted, repo-relative. See SUMMARY for the
// (accepted, explained) 192-vs-194 total-file-count discrepancy against the
// planning-time note -- the electron-importing set itself is IDENTICAL, which
// is the property this file enforces.
//
// Phase 34.3 Plan 07 (REQ-34.3-10, D-10) extended ENTRY_POINTS with this
// slice's three registration modules and re-ran computeElectronReach() (via a
// temporary one-off measurement print statement, removed after capture -- see
// 34.3-07-SUMMARY.md for the exact before/after measurement). The ONLY new
// module the measured set gained is src/backend/logger/uploader.ts below --
// exactly the edge D-10's own purpose section names (logger/uploader.ts:1
// imports `app` from 'electron', reached transitively via
// loggerFlowRegistration.ts). No other path appeared or disappeared; the
// prior 34.2 baseline's 29 entries are unchanged.
const BASELINE_ELECTRON_REACHING_MODULES: string[] = [
  'src/backend/constants/paths.ts',
  'src/backend/dialog/dialog.ts',
  'src/backend/ipc.ts',
  'src/backend/launcher.ts',
  // Phase 34.3 Plan 07 (D-10): new edge, pulled in via
  // loggerFlowRegistration.ts -> logger/uploader.ts -> `import { app } from
  // 'electron'` (uploader.ts:1). Entry point:
  // src/backend/sidecar/loggerFlowRegistration.ts.
  'src/backend/logger/uploader.ts',
  'src/backend/main_window.ts',
  'src/backend/online_monitor.ts',
  'src/backend/shortcuts/nonesteamgame/nonesteamgame.ts',
  'src/backend/shortcuts/nonesteamgame/steamhelper.ts',
  'src/backend/shortcuts/shortcuts/shortcuts.ts',
  'src/backend/storeManagers/gog/presence.ts',
  'src/backend/storeManagers/gog/user.ts',
  'src/backend/storeManagers/legendary/eos_overlay/eos_overlay.ts',
  'src/backend/storeManagers/legendary/user.ts',
  'src/backend/storeManagers/nile/library.ts',
  'src/backend/storeManagers/steam/bottle.ts',
  'src/backend/storeManagers/steam/constants.ts',
  'src/backend/storeManagers/steam/games.ts',
  'src/backend/storeManagers/steam/library.ts',
  'src/backend/storeManagers/steam/tokenStore.ts',
  'src/backend/storeManagers/storeManagerCommon/games.ts',
  'src/backend/storeManagers/zoom/constants.ts',
  'src/backend/storeSearch/cheapshark.ts',
  'src/backend/utils.ts',
  'src/backend/utils/inet/downloader/index.ts',
  'src/backend/utils/systeminfo/gpu/linux.ts',
  'src/backend/utils/systeminfo/heroicVersion.ts',
  'src/backend/utils/uninstaller.ts',
  'src/common/types.ts',
  'src/common/types/ipc.ts'
]

interface ElectronReachResult {
  /** Absolute, resolved paths of every first-party .ts file reached from the entry points. */
  visitedFiles: Set<string>
  /** Repo-relative paths of files that themselves directly `import ... from 'electron'`. */
  electronImportingFiles: Set<string>
}

function loadCompilerOptions(): ts.CompilerOptions {
  const configPath = ts.findConfigFile(
    REPO_ROOT,
    ts.sys.fileExists,
    'tsconfig.json'
  )
  if (!configPath) {
    throw new Error(
      `electronReachLedger: could not find tsconfig.json starting from ${REPO_ROOT}`
    )
  }
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(
      `electronReachLedger: failed to read ${configPath}: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n')}`
    )
  }
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath)
  )
  return parsed.options
}

/**
 * Collects every module specifier a source file references via
 * `import ... from '...'`, `export ... from '...'`, dynamic `import('...')`,
 * or `require('...')` -- regardless of whether the import is type-only,
 * since a `import type { X } from 'electron'` (e.g. `common/types/ipc.ts`)
 * still marks the importing file as electron-reaching for this ledger's
 * purpose: it is still a real source-level dependency edge, and the whole
 * point of this file is to see edges the depth-1 gates cannot.
 */
function collectModuleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const specifiers: string[] = []

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text)
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      // Dynamic `import('...')` -- TS parses the callee as a bare
      // ImportKeyword token rather than an Identifier, so this cannot use
      // `ts.isIdentifier` like the `require(...)` branch below.
      specifiers.push(node.arguments[0].text)
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require' &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text)
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

function toRepoRelative(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath).split('\\').join('/')
}

/**
 * BFS over the real transitive import graph starting at `entryPoints`,
 * resolved via `ts.resolveModuleName` against the repo's own `tsconfig.json`
 * (so `backend/*` / `common/*` baseUrl-relative specifiers resolve exactly
 * as `tsc` and this repo's own `jest.config.js` (`modulePaths:
 * [compilerOptions.baseUrl]`) resolve them). The bare specifier `'electron'`
 * is a TERMINAL marker: it is never itself resolved or walked, only recorded
 * against the file that imported it. External-library and `node_modules`
 * results are never followed -- this ledger is a first-party-only graph.
 * Visited files are memoised so the walk terminates on the graph's cycles.
 */
function computeElectronReach(
  entryPoints: string[],
  options: ts.CompilerOptions
): ElectronReachResult {
  const visited = new Set<string>()
  const electronImportingFiles = new Set<string>()
  const queue: string[] = entryPoints.map((entry) => resolve(entry))

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined) break
    if (visited.has(current)) continue
    visited.add(current)

    let content: string
    try {
      content = readFileSync(current, 'utf-8')
    } catch (error) {
      throw new Error(
        `electronReachLedger: could not read ${current} while walking the import graph from its importer(s): ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }

    const sourceFile = ts.createSourceFile(
      current,
      content,
      ts.ScriptTarget.ES2017,
      true
    )

    for (const specifier of collectModuleSpecifiers(sourceFile)) {
      if (specifier === 'electron') {
        electronImportingFiles.add(toRepoRelative(current))
        continue
      }

      const { resolvedModule } = ts.resolveModuleName(
        specifier,
        current,
        options,
        ts.sys
      )
      if (!resolvedModule) continue
      if (resolvedModule.isExternalLibraryImport) continue

      const resolvedPath = resolvedModule.resolvedFileName
      if (resolvedPath.includes('node_modules')) continue
      if (resolvedPath.endsWith('.d.ts')) continue
      if (!/\.(ts|tsx)$/.test(resolvedPath)) continue

      const normalized = resolve(resolvedPath)
      if (!visited.has(normalized)) {
        queue.push(normalized)
      }
    }
  }

  return { visitedFiles: visited, electronImportingFiles }
}

describe('electronReachLedger (Phase 34.2 Plan 11 — REQ-34.2-03, gap #3 / WR-02)', () => {
  let reachResult: ElectronReachResult

  beforeAll(() => {
    const options = loadCompilerOptions()
    reachResult = computeElectronReach(ENTRY_POINTS, options)
  }, 30000)

  it('growth tripwire: every electron-importing module measured today is present in the committed baseline', () => {
    const measured = [...reachResult.electronImportingFiles].sort()
    const newModules = measured.filter(
      (mod) => !BASELINE_ELECTRON_REACHING_MODULES.includes(mod)
    )
    if (newModules.length > 0) {
      throw new Error(
        `A NEW electron-importing module has entered the sidecar's reach graph and is ` +
          `NOT in the committed baseline: ${newModules.join(', ')}. This is not ` +
          `automatically a bug -- electronStub.ts's Module._load hook safely rescues ` +
          `transitive electron reach at runtime -- but the baseline must be updated ` +
          `deliberately, after review, never silently. If this addition was reviewed and ` +
          `accepted, add the new path(s) to BASELINE_ELECTRON_REACHING_MODULES above with ` +
          `a comment explaining why.`
      )
    }
    expect(newModules).toEqual([])
  }, 30000)

  it('anti-degradation: the measured set is non-empty and contains every known load-bearing electron-reaching edge', () => {
    const measured = reachResult.electronImportingFiles
    expect(measured.size).toBeGreaterThan(0)

    const requiredModules = [
      'src/backend/dialog/dialog.ts',
      'src/backend/ipc.ts',
      'src/backend/launcher.ts',
      'src/backend/storeSearch/cheapshark.ts',
      'src/backend/constants/paths.ts',
      'src/backend/utils.ts',
      'src/common/types.ts',
      // Phase 34.3 Plan 07 (D-10): the new edge itself is anti-vacuity-protected --
      // logger/uploader.ts, reached via loggerFlowRegistration.ts.
      'src/backend/logger/uploader.ts'
    ]
    for (const requiredModule of requiredModules) {
      expect(measured.has(requiredModule)).toBe(true)
    }
  }, 30000)

  it('reachability sanity: the walk actually traverses the graph rather than stopping at depth 1', () => {
    // Phase 34.3 Plan 07 (D-10): three new entry points grew visitedFiles.size
    // to a measured 202. Raised the floor from 100 to 150 -- comfortably below
    // the measured size, so the guard stays meaningful (never lowered, per the
    // plan's explicit instruction).
    expect(reachResult.visitedFiles.size).toBeGreaterThan(150)
  }, 30000)

  it('the gap-#3 edge is pinned as a known, documented fact: dispatch.ts reaches dialog.ts, which imports electron directly', () => {
    const dispatchPath = resolve(
      REPO_ROOT,
      'src/backend/gamedetails/dispatch.ts'
    )
    const dialogPath = resolve(REPO_ROOT, 'src/backend/dialog/dialog.ts')

    // dispatch.ts is one of the four entry points, so it is always visited;
    // the real assertion is that the walk reached dialog.ts FROM it.
    expect(reachResult.visitedFiles.has(dispatchPath)).toBe(true)
    expect(reachResult.visitedFiles.has(dialogPath)).toBe(true)
    expect(
      reachResult.electronImportingFiles.has('src/backend/dialog/dialog.ts')
    ).toBe(true)
  }, 30000)
})
