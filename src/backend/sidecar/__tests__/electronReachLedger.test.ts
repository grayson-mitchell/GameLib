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
  join(REPO_ROOT, 'src/backend/sidecar/loggerFlowRegistration.ts'),
  // Phase 34.4 Plan 08 (REQ-34.4-10, D-10): this slice's ported surface.
  // humbleFlowRegistration.ts is a brand-new registration module (plans
  // 34.4-04/05) that was never added as an entry point by those plans --
  // they explicitly deferred that edit to this plan. steamAuthFlowRegistration.ts
  // and settingsFlowRegistration.ts are EXTENDED by this slice (plans
  // 34.4-01/02/03) but, per the corrected reading recorded in this plan's
  // <interfaces> section, were NOT already entry points -- 34.4-RESEARCH.md's
  // claim that settingsFlowRegistration.ts was "already one of ENTRY_POINTS
  // (added in Phase 34.2)" does not hold against the actual seven-entry list
  // read at plan time. Adding all three is what makes the committed baseline
  // below a trustworthy Phase 35 cutover work-list rather than a partial one.
  join(REPO_ROOT, 'src/backend/sidecar/humbleFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/steamAuthFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/settingsFlowRegistration.ts'),
  // Phase 34.4.1 Plan 06 (REQ-34.4.1-06/09/11, D-08): this phase's two new
  // sidecar registration modules -- the embedded-browser login seam
  // (humbleLoginFlowRegistration.ts, plan 34.4.1-02) and the OAuth wiring
  // (oauthLoginFlowRegistration.ts, plan 34.4.1-09). This plan runs LAST
  // (wave 5), specifically so this regeneration sees the phase's COMPLETE
  // diff -- a ledger measured before the last code plan lands is a ledger
  // that has to be measured twice.
  join(REPO_ROOT, 'src/backend/sidecar/humbleLoginFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/oauthLoginFlowRegistration.ts'),
  // Phase 34.5 Plan 13 (REQ-34.5-10, 34.3 D-10 / 34.4 D-10 standing obligation): this
  // slice's four registration modules. See SUMMARY for the full before/after measurement --
  // the plan-time prediction that `save_sync.ts` would enter the measured baseline via
  // `syncGOGSaves` did NOT hold: direct verification (deferred item 4, 34.5-12) shows
  // `syncGOGSaves`'s own handler chain never calls `getDefaultGogSavePaths`; the sole caller
  // of that function is the separate `getDefaultSavePath` channel, which is not one of this
  // slice's 38 and is not reachable from any of the four modules below. `save_sync.ts` is
  // imported ONLY by `main.ts` in this repo (grep-verified) -- an Electron-only file outside
  // this ledger's entry-point graph -- so it correctly does NOT appear in the measured set.
  join(REPO_ROOT, 'src/backend/sidecar/runnerAuthFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/wineToolsFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/shortcutsFlowRegistration.ts'),
  join(REPO_ROOT, 'src/backend/sidecar/runnerMiscFlowRegistration.ts'),
  // Phase 34.6 Plan 05 (REQ-34.6-04/07/13, 2026-08-23): this plan's
  // frontendReady/changeTrayColor registration module. Never previously an
  // entry point. See the BASELINE_ELECTRON_REACHING_MODULES header comment
  // below for the measured before/after.
  join(REPO_ROOT, 'src/backend/sidecar/appShellFlowRegistration.ts')
]

// Regenerated at plan-execution time (2026-07-26, Phase 34.3 Plan 07), not
// pasted from planning-time prose. Sorted, repo-relative.
//
// IN-04(a) (gap cycle 1, closed 2026-08-23): this note used to cite an
// "(accepted, explained) 192-vs-194 total-file-count discrepancy" with no date
// attached, which read as a live figure. It never was one -- both numbers were
// one-off 2026-07-26 readings of `visitedFiles.size`, and the walk had already
// moved off BOTH of them (to 193) by the time the review that raised this
// finding ran. Every count in this header now carries the date and phase that
// measured it; none of them is current by construction. Latest reading:
// `visitedFiles.size` 239 / `electronImportingFiles.size` 35, measured
// 2026-08-23. The property this file enforces has never been a total-file
// count -- it is that the electron-importing SET does not grow, which is why
// the size-drift the old note described was accepted rather than chased.
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
//
// Phase 34.4 Plan 08 (REQ-34.4-10/15, D-10) extended ENTRY_POINTS with
// humbleFlowRegistration.ts, steamAuthFlowRegistration.ts and
// settingsFlowRegistration.ts and re-ran computeElectronReach() via the same
// temporary-print-statement procedure (before: 30 electron-importing
// modules / visitedFiles.size 202; after: 34 modules / visitedFiles.size
// 217). The Steam and settings additions contributed ZERO new electron
// reach, as predicted (the four Steam modules and settingsFlowRegistration's
// libraryManagerMap import zero electron). The Humble half gained FOUR new
// modules, not the three this plan's own <interfaces> section (and
// RESEARCH.md) predicted -- the measurement disagreed with the prediction,
// and per the plan's explicit rule the measurement wins:
//   - src/backend/humble/user.ts        (predicted)
//   - src/backend/humble/adapter.ts     (predicted)
//   - src/backend/humble/expirationAlerts.ts (predicted, two-hop)
//   - src/backend/humble/userAgent.ts   (NOT predicted by the plan or
//     RESEARCH.md -- imports `app` from 'electron' at userAgent.ts:1, and is
//     reached two-hop via humbleFlowRegistration.ts -> humble/user.ts:16
//     (`import { standardBrowserUserAgent } from './userAgent'`), and again
//     via humbleFlowRegistration.ts -> humble/library.ts:12 -> ./adapter ->
//     adapter.ts:13's identical import. Neither RESEARCH.md's canonical_refs
//     nor 34.4-CONTEXT.md's D-10 section named this module -- both
//     enumerated only the two DIRECT electron imports in user.ts/adapter.ts
//     and the one transitive edge through library.ts, missing this second,
//     independently-electron-importing transitive dependency of both.
// See 34.4-08-SUMMARY.md for the full before/after captured output.
//
// Phase 34.4.1 Plan 06 (REQ-34.4.1-06/09/11, D-08) extended ENTRY_POINTS with
// humbleLoginFlowRegistration.ts (plan 34.4.1-02, the embedded-browser login
// seam) and oauthLoginFlowRegistration.ts (plan 34.4.1-09, the OAuth wiring)
// and re-ran computeElectronReach() via the same temporary-print-statement
// procedure (before: 34 electron-importing modules / visitedFiles.size 219;
// after: 34 modules / visitedFiles.size 222). The measurement AGREED with the
// prediction this plan's own <context> section made: neither registration
// module, nor anything they transitively pull in (loginWindowSeam.ts,
// oauthLoginCapture.ts, common/types/oauthLogin.ts, humble/user.ts,
// humble/adapter.ts), imports 'electron' directly -- humble/user.ts and
// humble/adapter.ts were already baselined by 34.4 Plan 08 above, and the
// three OAuth-runner modules (frontend/screens/WebView/useTauriOAuthLogin.ts
// and friends) are outside the sidecar's own entry-point graph. The set of
// electron-importing modules is therefore UNCHANGED at 34; only
// visitedFiles.size grew (+3), reflecting the three new first-party files now
// walked. See 34.4.1-06-SUMMARY.md for the full before/after captured output.
//
// Phase 34.5 Plan 13 (REQ-34.5-10, D-10 standing obligation) extended
// ENTRY_POINTS with this slice's four registration modules
// (runnerAuthFlowRegistration.ts, wineToolsFlowRegistration.ts,
// shortcutsFlowRegistration.ts, runnerMiscFlowRegistration.ts) and re-ran
// computeElectronReach() via the same temporary-print-statement procedure
// (before: 34 electron-importing modules / visitedFiles.size 222; after: 34
// modules / visitedFiles.size 226). The measured set of electron-importing
// modules is UNCHANGED at 34 -- only visitedFiles.size grew (+4, exactly the
// four new entry-point files themselves; everything they transitively pull
// in -- storeManagers/legendary/user.ts, storeManagers/gog/user.ts,
// shortcuts/shortcuts/shortcuts.ts, shortcuts/nonesteamgame/nonesteamgame.ts,
// tools/index.ts, wine/manager/utils.ts, etc. -- was already walked via prior
// slices' entry points, most load-bearingly storeManagers/index.ts's own
// eager cross-runner construction reached via steamAuthFlowRegistration.ts's
// load-bearing first import).
//
// THE MEASUREMENT DISAGREED WITH THIS PLAN'S OWN PREDICTION, and per the
// plan's explicit rule the measurement wins: <interfaces> predicted
// `save_sync.ts` would be a CONFIRMED NEW entry (direct `import { app } from
// 'electron'` at save_sync.ts:12). It did not appear. Direct verification
// (this plan's own re-check of deferred item 4 from 34.5-12,
// `deferred-items.md`) shows `save_sync.ts` is imported from exactly one
// first-party file in this repo: `src/backend/main.ts` (grep-verified,
// `grep -rln save_sync src/`) -- an Electron-only file that is not, and has
// never been, one of this ledger's entry points. `syncGOGSaves`'s own
// handler chain (`libraryManagerMap['gog'].getGame(appName).syncSaves(arg,
// '', gogSaves)`, in runnerMiscFlowRegistration.ts) never calls
// `getDefaultGogSavePaths`; the sole caller of that function is the separate
// `getDefaultSavePath` channel (save_sync.ts:17-27), which is not one of this
// slice's 38 channels and remains genuinely unported. CONTEXT.md's D-09 and
// 34.5-RESEARCH.md's Pitfall 1 both asserted the `syncGOGSaves` reach claim;
// both are wrong on this specific point and the correction is recorded here
// rather than absorbed silently -- this is a planning-time gap, not a defect
// in this measurement. See 34.5-13-SUMMARY.md for the full before/after
// captured output and the corrected claim.
// Phase 34.4.1 Plan 12 (REQ-34.4.1-02/REQ-34.4.1-GAP-02, gap-cycle closure for
// F-1/S-10, 34.3 D-10 standing rule) extended the measured set by exactly one
// module: src/backend/humble/secretStore.ts. This plan moved the
// encryptionAvailable/encryptCookie/decryptCookie bodies (which used to live
// inline in humble/user.ts:1's `import { safeStorage, session } from
// 'electron'`) into a new dedicated module, secretStore.ts, which now carries
// its OWN direct `import { safeStorage } from 'electron'`. humble/user.ts is
// unchanged in the baseline (it still imports `session` from 'electron'
// directly at its own line 1) -- this is a NEW edge, not a moved one, since
// user.ts's electron-importing status does not depend on secretStore.ts's.
// Re-ran computeElectronReach() via the standing temporary-print-statement
// procedure at execution time (before: 34 electron-importing modules; after:
// 35 modules -- the ONE new addition below). No other module entered or left
// the set.
//
// Phase 34.5 gap cycle 6 Plan 43 (REQ-34.5-10, 34.3 D-10 / 34.4 D-10
// standing obligation): getInstallInfo (F-34.5-G6-10) was moved verbatim
// into gamedetails/dispatch.ts (already ENTRY_POINTS[0]) and registered in
// gameDetailsFlowRegistration.ts (already ENTRY_POINTS[2]) -- neither file
// gained a new import statement to a module outside the existing 'common/
// types' edge both already had. The planning-time prediction was that both
// readings would be IDENTICAL; per the plan's own rule that prediction is
// not evidence and was not transcribed -- computeElectronReach() was run
// TWICE via a temporary one-off measurement script (removed after capture):
// once with dispatch.ts/gameDetailsFlowRegistration.ts's content swapped
// for their pre-Task-1 (HEAD~1) versions (via `git show`, working tree
// untouched) and once against the current post-Task-1 disk state.
//   BEFORE (pre-Task-1): electronImportingFiles.size 35, visitedFiles.size 228
//   AFTER  (post-Task-1): electronImportingFiles.size 35, visitedFiles.size 228
// MEASURED, UNCHANGED -- the two electronImportingFiles sets are set-equal
// (verified by sorted-array deep-equality, not just size comparison) and
// visitedFiles.size delta is exactly 0. The prediction happened to hold this
// time, but only the measurement -- not the prediction -- is recorded as the
// baseline's justification. No new entry below; the `> 224` floor in the
// 'reachability sanity' test is unchanged (228 is still comfortably above
// it) and is not raised, per that test's own never-lower/only-raise-when-
// no-longer-meaningful instruction.
//
// Phase 34.6 Plan 05 (REQ-34.6-04/07/13, 2026-08-23) extended ENTRY_POINTS
// with appShellFlowRegistration.ts (this plan's frontendReady/changeTrayColor
// registration module; never previously an entry point) and re-ran
// computeElectronReach() via the standing temporary-print-statement
// procedure -- MEASURED both directions, not predicted:
//   BEFORE (without appShellFlowRegistration.ts): electronImportingFiles.size
//     35, visitedFiles.size 239
//   AFTER  (with appShellFlowRegistration.ts):     electronImportingFiles.size
//     35, visitedFiles.size 244
// MEASURED, UNCHANGED -- the two electronImportingFiles sets are set-equal
// (identical sorted 35-entry arrays, not just size comparison). No new module
// entered the electron-reaching set: appShellFlowRegistration.ts's own new
// imports (appshell/themes.ts, appshell/releases.ts, appshell/language.ts,
// dialog/dialog.ts, utils.ts, utils/aborthandler/aborthandler.ts, config.ts,
// constants/key_value_stores.ts, logger/index.ts,
// common/types/sidecarTransport.ts, sendChannelObservable.ts, sidecarRpc.ts,
// electronStub.ts) were either already electron-free or already visited via
// other entry points in this same file's graph (`dialog/dialog.ts` was
// already baselined above, reached via gamedetails/dispatch.ts). No new entry
// below. visitedFiles.size grew by +5 (239 -> 244), reflecting exactly the
// five newly-visited first-party files this module alone pulls in that no
// prior entry point reached: appShellFlowRegistration.ts itself,
// appshell/themes.ts, appshell/releases.ts, appshell/language.ts, and
// sendChannelObservable.ts. The `> 224` floor in the 'reachability sanity'
// test is unchanged (244 is even more comfortably above it than the prior
// 228 reading was) and is not raised, per that test's own
// never-lower/only-raise-when-no-longer-meaningful instruction.
const BASELINE_ELECTRON_REACHING_MODULES: string[] = [
  'src/backend/constants/paths.ts',
  'src/backend/dialog/dialog.ts',
  // Phase 34.4.1 Plan 12 (D-10 standing rule): humbleFlowRegistration.ts ->
  // humble/user.ts (direct) -> humble/user.ts's
  // `import { getHumbleSecretStore, type HumbleSecretKey } from
  // './secretStore'` -> secretStore.ts:1 `import { safeStorage } from
  // 'electron'`. This is the Electron-implementation half of the Humble
  // secret-store seam (F-1's fix prerequisite) -- it must run under Electron,
  // so unlike loginWindowSeam.ts it is not exempt from a direct import.
  'src/backend/humble/secretStore.ts',
  // Phase 34.4 Plan 08 (D-10): humbleFlowRegistration.ts -> humble/library.ts
  // (direct) -> humble/library.ts:12
  // (`import { getGamekeys, getOrderDetail, revealKey as adapterRevealKey } from './adapter'`)
  // -> adapter.ts:2 `import { net } from 'electron'`.
  'src/backend/humble/adapter.ts',
  // Phase 34.4 Plan 08 (D-10): two-hop --
  // humbleFlowRegistration.ts -> humble/library.ts:22
  // (`import { detectAndNotifyExpirationTransitions } from './expirationAlerts'`)
  // -> expirationAlerts.ts:1 `import { Notification } from 'electron'`. A
  // depth-1 regex over humbleFlowRegistration.ts's own text cannot see this
  // edge -- it only appears one hop further, inside library.ts.
  'src/backend/humble/expirationAlerts.ts',
  // Phase 34.4 Plan 08 (D-10): humbleFlowRegistration.ts -> humble/user.ts
  // (direct) -- humble/user.ts:1 `import { safeStorage, session } from
  // 'electron'`.
  'src/backend/humble/user.ts',
  // Phase 34.4 Plan 08 (D-10): NOT predicted by the plan's <interfaces>
  // section or RESEARCH.md -- discovered only by running the traversal.
  // userAgent.ts:1 `import { app } from 'electron'`. Reached two-hop via
  // humbleFlowRegistration.ts -> humble/user.ts:16
  // (`import { standardBrowserUserAgent } from './userAgent'`), and
  // independently three-hop via
  // humbleFlowRegistration.ts -> humble/library.ts:12 -> ./adapter ->
  // adapter.ts:13's identical import of './userAgent'.
  'src/backend/humble/userAgent.ts',
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

  // IN-02 (Phase 34.2 gap cycle 1): this was `while (queue.length > 0)` with a
  // `const current = queue.shift(); if (current === undefined) break` inside --
  // a branch that could never be taken, because the loop condition already
  // guaranteed a non-empty queue. Unreachable code inside a file whose stated
  // purpose is proving this walk does not silently short-circuit.
  //
  // Rewritten so the undefined check IS the loop condition: the same guarantee,
  // with no dead branch and no non-null assertion.
  for (
    let current = queue.shift();
    current !== undefined;
    current = queue.shift()
  ) {
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
      'src/backend/logger/uploader.ts',
      // Phase 34.4 Plan 08 (D-10): the four new Humble edges, each
      // anti-vacuity-protected so a future refactor that quietly drops one
      // fails this test instead of silently shrinking the measured set.
      'src/backend/humble/user.ts',
      'src/backend/humble/adapter.ts',
      'src/backend/humble/expirationAlerts.ts',
      'src/backend/humble/userAgent.ts',
      // Phase 34.4.1 Plan 06 (D-08): no new edge was added here -- the
      // measurement confirmed humbleLoginFlowRegistration.ts and
      // oauthLoginFlowRegistration.ts contribute ZERO new electron-importing
      // modules (see the BASELINE_ELECTRON_REACHING_MODULES header comment
      // above for the full before/after).
      //
      // Phase 34.5 Plan 13 (REQ-34.5-10, D-10): the measurement found ZERO
      // brand-new electron-importing modules (this phase's own prediction of
      // a new `save_sync.ts` entry did NOT hold -- see the header comment
      // above for the correction), so there is no new SET member to
      // anti-vacuity-protect here. What this plan DOES add is independent
      // anchoring: these four already-baselined paths are now reached
      // DIRECTLY by this slice's own entry points (previously only reached
      // transitively via steamAuthFlowRegistration.ts's load-bearing
      // storeManagers/index.ts import and humbleFlowRegistration.ts), so a
      // future refactor that broke ONLY those Steam/Humble edges would no
      // longer silently stop covering these paths -- this phase's own
      // modules independently require them.
      'src/backend/shortcuts/shortcuts/shortcuts.ts', // direct: shortcutsFlowRegistration.ts
      'src/backend/shortcuts/nonesteamgame/nonesteamgame.ts', // direct: shortcutsFlowRegistration.ts
      'src/backend/storeManagers/legendary/user.ts', // direct: runnerAuthFlowRegistration.ts
      'src/backend/storeManagers/gog/user.ts' // direct: runnerAuthFlowRegistration.ts
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
    //
    // Phase 34.4 Plan 08 (D-10): three more new entry points grew
    // visitedFiles.size further, to a measured 217. Raised the floor from
    // 150 to 200 -- comfortably below the measured size, never lowered, per
    // the same instruction.
    //
    // Phase 34.4.1 Plan 06 (D-08): two more new entry points
    // (humbleLoginFlowRegistration.ts, oauthLoginFlowRegistration.ts) grew
    // visitedFiles.size further, to a measured 222. Raised the floor from
    // 200 to 220 -- comfortably below the measured size, never lowered, per
    // the same instruction.
    //
    // Phase 34.5 Plan 13 (REQ-34.5-10, D-10): four more new entry points
    // (runnerAuthFlowRegistration.ts, wineToolsFlowRegistration.ts,
    // shortcutsFlowRegistration.ts, runnerMiscFlowRegistration.ts) grew
    // visitedFiles.size further, to a measured 226. Raised the floor from
    // 220 to 224 -- comfortably below the measured size, never lowered, per
    // the same instruction.
    //
    // Phase 34.5 gap cycle 6 Plan 43 (REQ-34.5-10): no new entry point was
    // added -- this plan only ported getInstallInfo into two files already
    // in ENTRY_POINTS. Measured BEFORE/AFTER (see the BASELINE_ELECTRON_
    // REACHING_MODULES header comment above for the full two-run
    // measurement): visitedFiles.size 228 both times -- UNCHANGED, and
    // measured, not transcribed. 228 is comfortably above the existing 224
    // floor, so the floor is NOT raised, per this test's own
    // never-lower/only-raise-when-no-longer-meaningful instruction.
    expect(reachResult.visitedFiles.size).toBeGreaterThan(224)
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
