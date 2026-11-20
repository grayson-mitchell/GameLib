---
phase: quick-261029-mbl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types.ts
  - src/backend/knownFixes.ts
  - src/backend/knownFixLaunch.ts
  - src/backend/__tests__/knownFixes.test.ts
  - src/backend/__tests__/knownFixesGamelibStatus.test.ts
  - src/backend/__tests__/knownFixLaunch.test.ts
  - src/backend/storeManagers/runnerLaunchArgv.ts
  - src/backend/storeManagers/__tests__/runnerLaunchArgv.test.ts
  - src/backend/storeManagers/gog/games.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/zoom/games.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  - .planning/notes/per-game-compat-fixes-architecture.md
  - .planning/todos/completed/2026-10-29-known-fix-launchargs-exeoverride-keys.md
autonomous: true
requirements: [TODO-2026-10-29-known-fix-launchargs-exeoverride-keys]

must_haves:
  truths:
    - "A tier-1 fixes file (local, bundled OR remote) carrying `launchArgs: string[]` keeps the key; any other shape is dropped with a logWarning"
    - "A tier-1 fixes file carrying `exeOverride` keeps it only if it is a non-empty relative string with no drive letter, no absolute form (posix or win32), no NUL and no `..` segment; otherwise it is dropped with a logWarning"
    - "At launch, an exeOverride is used only if it resolves (realpath) inside the realpath'd install folder and is an existing regular file; otherwise a warning is logged and the default exe is used"
    - "A tier-1 file whose only fix keys are launchArgs and/or exeOverride makes the GameLib row show (they are fixes, not routing keys)"
    - "GOG, Amazon (nile), Epic (legendary), Zoom and the Steam bridge (non-DRM) launches append known-fix launchArgs; the exe precedence is per-launch altExe > user targetExe > known-fix exeOverride > default"
    - "A remote launchArgs entry can never be parsed as a runner CLI option (legendary/nile: after `--`; gogdl: `--`-prefixed entries dropped)"
  artifacts:
    - path: "src/backend/knownFixLaunch.ts"
      provides: "resolveKnownFixExeOverride (containment) + readKnownFixLaunchOverrides"
      exports: ["resolveKnownFixExeOverride", "readKnownFixLaunchOverrides"]
    - path: "src/backend/knownFixes.ts"
      provides: "launchArgs + exeOverride in TIER1_KNOWN_FIX_KEYS, per-key guards, isValidExeOverrideShape"
      contains: "'exeOverride'"
    - path: "src/backend/__tests__/knownFixLaunch.test.ts"
      provides: "containment tests on real temp dirs incl. symlink escape"
  key_links:
    - from: "src/backend/storeManagers/{gog,nile,legendary,zoom}/games.ts"
      to: "readKnownFixLaunchOverrides"
      via: "import from backend/knownFixLaunch"
      pattern: "readKnownFixLaunchOverrides\\("
    - from: "src/backend/storeManagers/steam/games.ts fireBridgeWineLaunch"
      to: "steamBridgeLaunchCommandParts"
      via: "non-DRM runWineCommand commandParts"
      pattern: "steamBridgeLaunchCommandParts\\("
---

<objective>
Add `launchArgs` and `exeOverride` as TIER-1 known-fix keys (todo
`.planning/todos/pending/2026-10-29-known-fix-launchargs-exeoverride-keys.md`), wire them into
every launch path where GameLib builds the command line, and close the todo.

Locked operator decision (2026-10-29, not revisited): BOTH keys are tier 1, added to
`TIER1_KNOWN_FIX_KEYS`, so they may arrive from the remote fixes repo. They are fixes, not routing
keys, so they count for the GameLib row.
- `launchArgs: string[]`: appended to the game's launch arguments (protonfixes `append_argument`).
- `exeOverride: string`: install-dir-relative path launched instead of the default exe
  (protonfixes `replace_command`). Same trust as `runInPrefix`. Shape is checked in the validator;
  containment and existence are checked at launch against the real install path.

Output: two new tier-1 keys, a unit-tested containment helper, wiring in 5 launch paths, updated
architecture notes, closed todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-10-29-known-fix-launchargs-exeoverride-keys.md
@.planning/notes/per-game-compat-fixes-architecture.md
@src/backend/knownFixes.ts
@src/backend/storeManagers/runnerLaunchArgv.ts

Load `Skill("gamelib-conventions")` before writing verify output or touching the todo (formatter
check rule, todo frontmatter rule). No task spawns a child process; if one is added to a test it
must use `createFakeHomeProfile()`.

<interfaces>
<!-- Extracted from the codebase. Use directly; no exploration needed. -->

src/common/types.ts (~L1153), current tail of KnowFixesInfo:
  macArch?: '32'
  drm?: 'ceg'
  (add `launchArgs?: string[]` and `exeOverride?: string` here, each with a one-line doc comment
  citing quick 261029-mbl and the protonfixes helper it mirrors)

src/backend/knownFixes.ts:
  export const TIER1_KNOWN_FIX_KEYS = ['title','notes','winetricks','runInPrefix','envVariables',
    'wikiLink','launchNotice','macArch','drm'] as const
  const TIER1_ROUTING_KEYS = ['macArch','drm'] as const        // do NOT add the new keys here
  export function isRoutingOnlyTier1Fix(fix: KnowFixesInfo): boolean   // unchanged
  export function filterTier1KnownFixes(appName, layerLabel, parsed: unknown): KnowFixesInfo | null
    // per-key guards live inside `if (allowed.includes(key))`: `if (key === 'macArch' && value !== '32') { logWarning(...); continue }`
  export function readKnownFixes(appName: string, runner: Runner): KnowFixesInfo | null
  // module MUST NOT import electron (sidecar imports it directly). Imports: path, graceful-fs, fs, logger.

src/backend/storeManagers/runnerLaunchArgv.ts:
  interface LaunchArgvInputs { args: string[]; launchArgumentArgs?: string; launcherArgs?: string }
  export function legendaryLaunchArgumentFields(i): { extraArguments: string; gameArguments?: string[] }
    // gameArguments is emitted after a `--` by commandToArgsArray; present only when args.length
  export function nileLaunchCommandParts(i & { exeOverrideFlag: string[]; wineFlag: string[]; id: string }): string[]
    // ['launch', ...exeOverrideFlag, ...wineFlag, ...split(launchArgumentArgs), ...split(launcherArgs), id, ...(args.length ? ['--', ...args] : [])]

Launch sites (verified 2026-10-29):
  gog/games.ts ~L591-596   exeOverrideFlag: altExe -> ['--override-exe', exe]; else targetExe -> [...]
  gog/games.ts ~L657-671   commandParts = ['launch', install_path, ...exeOverrideFlag, appId, ...wineFlag,
                           '--platform', p, ...split(launchArgumentsArgs), ...split(gameSettings.launcherArgs), ...args]
  nile/games.ts ~L338-343  same exeOverrideFlag shape; ~L406 nileLaunchCommandParts({...})
  legendary/games.ts ~L1009-1024  legendaryLaunchArgumentFields({...}); then
                           `if altExe command['--override-exe']=...; else if (gameSettings.targetExe) command['--override-exe']=Path.parse(gameSettings.targetExe)`
  zoom/games.ts ~L640-644  commandParts = [...split(launchArgumentsArgs), ...split(launcherArgs), ...args] (shared by native + wine)
  zoom/games.ts ~L704      wine branch only: `const executable = gameSettings.targetExe || gameInfo.install.executable`
                           (native branch ~L665 uses install.executable and does NOT honour targetExe)
  steam/games.ts fireBridgeWineLaunch ~L4239; installRoot = this.resolveBridgeGameInstallRoot(exePath, bottle) (may be undefined);
                           ~L4524 runWineCommand({ commandParts: drm ? [...drmCommandPrefix, helperWinPath, drm.gameWinPath] : [exePath], ... })
  storeManagerCommon/games.ts (sideload): NOT wired. storeMap.sideload is undefined (common/utils.ts:7),
                           so no `<appName>-<store>.json` can ever match a sideloaded game.

heroic-gogdl `launch` subparser (args.py, fetched 2026-10-29): options `--platform`/`--os`, `--prefer-task`,
  `--no-wine`, `--wine`, `--wine-prefix`, `--wrapper`, `--override-exe`; NO short options; allow_abbrev
  left at default True; top-level `parse_known_args()`. gogdl forwards a literal `--` to the game.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Tier-1 keys, validator guards and the exeOverride containment helper</name>
  <files>src/common/types.ts, src/backend/knownFixes.ts, src/backend/knownFixLaunch.ts, src/backend/__tests__/knownFixes.test.ts, src/backend/__tests__/knownFixesGamelibStatus.test.ts, src/backend/__tests__/knownFixLaunch.test.ts</files>
  <behavior>
    filterTier1KnownFixes (add a `describe('filterTier1KnownFixes launchArgs/exeOverride (quick 261029-mbl)')` in knownFixes.test.ts, calling the exported function directly; logWarning is already mocked there):
    - `launchArgs: ['-dx11', '--windowed']` kept as-is; `launchArgs: []` kept (no-op).
    - `launchArgs: '-dx11'`, `[1]`, `['-a', null]`, `{}` each dropped, logWarning called once naming 'launchArgs'.
    - `exeOverride: 'bin/game.exe'` and `'bin\\game.exe'` kept.
    - `exeOverride` of `'/abs/game.exe'`, `'C:\\game.exe'`, `'C:game.exe'`, `'\\\\server\\share\\g.exe'`, `'\\game.exe'`, `'../game.exe'`, `'bin/../../game.exe'`, `'bin\\..\\..\\g.exe'`, `''`, `'a\u0000b'`, `5`, `['x']` each dropped with a logWarning naming 'exeOverride'.
    - `TIER1_KNOWN_FIX_KEYS` contains both keys; `isRoutingOnlyTier1Fix({ title: 't', launchArgs: ['-x'] } as KnowFixesInfo)` is false.
    knownFixesGamelibStatus.test.ts: a bundled tier-1 file `{ "launchArgs": ["-x"] }` -> `{ origin: 'bundled' }`; a bundled file `{ "macArch": "32", "exeOverride": "g.exe" }` -> `{ origin: 'bundled' }` (not routing-only).
    knownFixLaunch.test.ts (new; real temp dirs from `mkdtempSync(join(tmpdir(), 'gamelib-exeoverride-'))`, removed in afterEach; mock `backend/logger`/`../logger` as the sibling tests do; no child process):
    - relative file inside install -> returns `resolve(installPath, override)` (lexical path under the caller's installPath, not the realpath).
    - backslash form `'bin\\game.exe'` resolves to the same file on posix.
    - absolute path -> undefined + warning; `..` escape (`'../outside.exe'`, `'bin/../../outside.exe'`) -> undefined + warning, even when the target file exists.
    - symlink escape: `install/link.exe` -> `<outside>/real.exe` (symlinkSync), and `install/linkdir` -> `<outside>` dir with override `'linkdir/real.exe'` -> undefined + warning.
    - symlinked install root (install path itself is a symlink to the real folder) with an in-folder exe -> accepted (same library-aware policy as quick 261029-m0u).
    - missing file -> undefined + warning; override naming a directory -> undefined + warning; missing installPath -> undefined + warning, never throws.
    - readKnownFixLaunchOverrides with installPath undefined and a fix carrying exeOverride -> `{ launchArgs, exeOverride: undefined }` with a warning (mock `readKnownFixes` via jest.mock('../knownFixes', ...) partial, keeping the real isValidExeOverrideShape).
  </behavior>
  <action>
    Write the tests above first (RED), then implement (GREEN).

    types.ts: add `launchArgs?: string[]` and `exeOverride?: string` to `KnowFixesInfo` with doc comments (tier 1, quick 261029-mbl, protonfixes append_argument / replace_command; exeOverride is install-dir-relative and contained at launch).

    knownFixes.ts:
    - Append `'launchArgs'` and `'exeOverride'` to `TIER1_KNOWN_FIX_KEYS` (per locked operator decision). Do NOT add them to `TIER1_ROUTING_KEYS`: they are fixes and count for the GameLib row, so `isRoutingOnlyTier1Fix` and `readGamelibFixStatus` need no change. Leave the TIER1_KNOWN_FIX_KEYS docstring for Task 3.
    - Export `isValidExeOverrideShape(value: unknown): value is string`: true only for a string that is non-empty after trim, contains no `\u0000`, is not `path.posix.isAbsolute` nor `path.win32.isAbsolute`, does not match `/^[A-Za-z]:/` (covers drive-relative `C:game.exe`), and has no segment equal to `..` when split on `/[\\/]/`. Import `posix`/`win32` from 'path' (no electron).
    - In `filterTier1KnownFixes`, beside the macArch/drm guards: `launchArgs` must be `Array.isArray` with every entry `typeof === 'string'`, else logWarning `Known fixes for '<app>' (<layer> layer): 'launchArgs' must be an array of strings, ignoring <JSON>.` and `continue`. `exeOverride` must pass `isValidExeOverrideShape`, else logWarning `... 'exeOverride' must be a relative path inside the install folder, ignoring <JSON>.` and `continue`. Same message style as the existing guards.

    knownFixLaunch.ts (new; MUST NOT import electron or anything reaching it, same rule as knownFixes.ts; header docstring says so and cites quick 261029-mbl):
    - `export function resolveKnownFixExeOverride(installPath: string, exeOverride: string, label: string): string | undefined`. Steps: re-check `isValidExeOverrideShape` (defence in depth); normalise `\` to `/` (Windows accepts `/`; protonfixes paths are often backslashed); `realInstall = realpathSync(installPath)`; `lexical = resolve(installPath, normalised)`; reject if `relative(resolve(installPath), lexical)` starts with `..`, is absolute, or is `''`; `statSync(lexical)` must exist and `isFile()`; `realTarget = realpathSync(lexical)` and reject unless `relative(realInstall, realTarget)` is non-empty, not `..`-prefixed and not absolute (so an in-folder symlink cannot escape, while a symlinked install root is fine). Wrap fs calls in try/catch; every rejection logs one logWarning `<label>: known-fix exeOverride '<value>' <reason>, using the default executable.` (use LogPrefix.Backend) and returns undefined. Return `lexical` on success (lexical under the caller's path, same "scan real, return lexical" policy as quick 261029-m0u). Use the containment idiom from knownFixes.ts `readFixesFileWithin` (resolve+relative, never join).
    - `export interface KnownFixLaunchOverrides { launchArgs: string[]; exeOverride?: string }` and `export function readKnownFixLaunchOverrides(appName: string, runner: Runner, installPath: string | undefined): KnownFixLaunchOverrides`: calls `readKnownFixes(appName, runner)` once; `launchArgs` = fix.launchArgs ?? []; exeOverride resolved through `resolveKnownFixExeOverride` only when present; when installPath is undefined log a warning and drop it. When anything applies, logInfo one line: `<label>: known-fix launchArgs <JSON>, exeOverride <path|none>`. Never throws.
  </action>
  <verify>
    <automated>npx jest src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesGamelibStatus.test.ts src/backend/__tests__/knownFixLaunch.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixesFetcher.test.ts && npx tsc --noEmit && npx prettier --check src/common/types.ts src/backend/knownFixes.ts src/backend/knownFixLaunch.ts src/backend/__tests__/knownFixes.test.ts src/backend/__tests__/knownFixesGamelibStatus.test.ts src/backend/__tests__/knownFixLaunch.test.ts</automated>
    (All six paths are prettier-visible: `npx prettier --file-info src/backend/knownFixes.ts` reports `"ignored": false, "inferredParser": "typescript"`; re-probe any new path with --file-info before relying on the check.)
  </verify>
  <done>Both keys in TIER1_KNOWN_FIX_KEYS with shape guards; containment helper rejects absolute, `..`, symlink-escape, missing and directory targets and accepts a symlinked install root; all listed suites green; tsc clean; prettier clean on the six paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire launchArgs and exeOverride into the GOG, Amazon, Epic and Zoom launchers</name>
  <files>src/backend/storeManagers/runnerLaunchArgv.ts, src/backend/storeManagers/__tests__/runnerLaunchArgv.test.ts, src/backend/storeManagers/gog/games.ts, src/backend/storeManagers/nile/games.ts, src/backend/storeManagers/legendary/games.ts, src/backend/storeManagers/zoom/games.ts</files>
  <behavior>
    runnerLaunchArgv.test.ts (extend):
    - legendary: `knownFixLaunchArgs: ['--wrapper', 'calc', '-dx11']`, args `['-foo']`, launcherArgs '-user' -> extraArguments is '-user' only; argv after the `--` is `['--', '--wrapper', 'calc', '-dx11', '-foo']` (known-fix first, then passthrough); with args `[]` and knownFixLaunchArgs non-empty, `--` is still emitted; with both empty, no `--` (existing tests still pass unchanged).
    - nile: same shape: `[..., '-userarg', 'amzn1.game', '--', '--wrapper', 'calc', '-foo']`; both empty -> no `--`.
  </behavior>
  <action>
    Ordering and safety decision (record verbatim in SUMMARY): known-fix launchArgs are remote-reachable data, so they must never be parseable as a runner option. Therefore:
    - legendary + nile: known-fix args go after the `--` end-of-options marker, before passthrough `args` (the channel measured safe in runnerLaunchArgv.ts's header). In the game's argv they land after the user's launcherArgs.
    - gogdl: it forwards a literal `--` to the game, so it cannot use the marker. Known-fix args go immediately before the user's launcherArgs (so a user flag later on the line wins), and any entry starting with `--` is dropped with a logWarning, because gogdl's launch options are all `--` long options with allow_abbrev on (an abbreviation like `--wrap` would match `--wrapper`) and it defines no short options.
    - zoom: argv goes straight to the exe (no runner parser): known-fix args immediately before the user's launcherArgs.

    runnerLaunchArgv.ts: add optional `knownFixLaunchArgs?: string[]` to `LaunchArgvInputs` with a doc comment explaining the above. legendaryLaunchArgumentFields: `gameArguments` = `[...(knownFixLaunchArgs ?? []), ...args]`, emitted only when non-empty; extraArguments unchanged. nileLaunchCommandParts: tail becomes `...(tail.length ? ['--', ...tail] : [])` with the same tail. Update the header comment's "passthrough" paragraph to mention known-fix args.

    Exe precedence everywhere: per-launch `launchArguments.type === 'altExe'` > user `gameSettings.targetExe` > known-fix `exeOverride` > default. A known-fix exeOverride is honoured exactly where the user's targetExe is honoured today, and nowhere else (it is a default for targetExe). When the user's targetExe shadows a known-fix exeOverride, logInfo that the user setting wins.

    In each launcher call `readKnownFixLaunchOverrides(<id>, '<runner>', gameInfo.install.install_path)` once, near where the exe override flag is built (import from 'backend/knownFixLaunch'):
    - gog/games.ts: add `else if (knownFix.exeOverride) exeOverrideFlag = ['--override-exe', knownFix.exeOverride]` after the targetExe branch; in commandParts insert the filtered known-fix args (drop `--`-prefixed with warning) right before `...shlex.split(gameSettings.launcherArgs ?? '')`.
    - nile/games.ts: same exeOverrideFlag branch; pass `knownFixLaunchArgs: knownFix.launchArgs` to nileLaunchCommandParts.
    - legendary/games.ts: pass `knownFixLaunchArgs` to legendaryLaunchArgumentFields; add `else if (knownFix.exeOverride) command['--override-exe'] = Path.parse(knownFix.exeOverride)` after the targetExe branch (absolute path, as the helper returns one).
    - zoom/games.ts: insert `...knownFix.launchArgs` before `...shlex.split(gameSettings.launcherArgs ?? '')` in the shared commandParts; in the wine branch only, `const executable = gameSettings.targetExe || knownFix.exeOverride || gameInfo.install.executable` (the native branch does not honour targetExe, so it does not honour exeOverride either).
    Both keys apply to native and Wine launches alike, like tier-1 envVariables; a Windows-only exeOverride on a native install fails the existence check and falls back to the default exe.
    Do NOT wire storeManagerCommon/games.ts (sideload): storeMap.sideload is undefined, so no tier-1 file can match. Record this in SUMMARY.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/__tests__/runnerLaunchArgv.test.ts src/backend/storeManagers/gog src/backend/storeManagers/nile src/backend/storeManagers/legendary src/backend/storeManagers/zoom --passWithNoTests && npx tsc --noEmit && pnpm lint && npx prettier --check src/backend/storeManagers/runnerLaunchArgv.ts src/backend/storeManagers/__tests__/runnerLaunchArgv.test.ts src/backend/storeManagers/gog/games.ts src/backend/storeManagers/nile/games.ts src/backend/storeManagers/legendary/games.ts src/backend/storeManagers/zoom/games.ts</automated>
    (Probe one path first with `npx prettier --file-info src/backend/storeManagers/gog/games.ts`; expected `"ignored": false`.)
  </verify>
  <done>Each of the four launchers reads overrides once; altExe > targetExe > exeOverride > default holds; legendary/nile known-fix args sit after `--`; gogdl drops `--`-prefixed known-fix args; runnerLaunchArgv tests green; tsc, lint and prettier clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Steam bridge wiring, docs, and close the todo</name>
  <files>src/backend/storeManagers/steam/bridgeKnownFixes.ts, src/backend/storeManagers/steam/games.ts, src/backend/__tests__/steamBridgeKnownFixes.test.ts, src/backend/knownFixes.ts, .planning/notes/per-game-compat-fixes-architecture.md, .planning/todos/completed/2026-10-29-known-fix-launchargs-exeoverride-keys.md</files>
  <behavior>
    steamBridgeKnownFixes.test.ts (new describe, real readKnownFixes with fix files under the suite's existing tmp fixes dirs; real temp install dir for the exe):
    - no fixes file -> `steamBridgeLaunchCommandParts('70', exe, root)` returns `[exe]`.
    - `launchArgs: ['-dx11']` -> `[exe, '-dx11']`.
    - `exeOverride: 'bin/alt.exe'` existing inside root -> `[resolve(root,'bin/alt.exe'), ...]`.
    - exeOverride escaping root, or installRoot undefined -> `[exe, ...launchArgs]` (default exe kept).
  </behavior>
  <action>
    bridgeKnownFixes.ts: export `steamBridgeLaunchCommandParts(appId: string, exePath: string, installRoot: string | undefined): string[]` returning `[knownFix.exeOverride ?? exePath, ...knownFix.launchArgs]` via `readKnownFixLaunchOverrides(appId, 'steam', installRoot)`. Never throws (wrap in try/catch, fall back to `[exePath]` with a logWarning). Add a short paragraph to the module docstring (quick 261029-mbl).

    steam/games.ts fireBridgeWineLaunch: in the `runWineCommand` call, replace the non-DRM `[exePath]` with `steamBridgeLaunchCommandParts(this.appId, exePath, installRoot)` (import it from the already lazily-imported './bridgeKnownFixes' alongside applySteamBridgeKnownFixes). Leave the DRM branch (`[...drmCommandPrefix, helperWinPath, drm.gameWinPath]`) unchanged, and leave launchCwd, the process monitor and the GameMaker check on the original exePath (an override is inside the install root, so the monitor's installPath still matches).

    Record these gaps in the SUMMARY (do not fake them): (1) Steam DRM mode: the game is started by the helper from a Windows path; whether it forwards extra argv is unverified, so neither key is applied there. (2) `steam://rungameid` launches (Mac/Windows native Steam, bottled Steam): the Steam client owns the command line; nothing applies. (3) The bridge shim is placed beside the PICS launch exe at install; an exeOverride in a different directory may run without the shim beside it. (4) The Steam bridge has no user launcherArgs setting, so no ordering question arises there.

    knownFixes.ts: extend the TIER1_KNOWN_FIX_KEYS docstring: `launchArgs` and `exeOverride` are tier 1 by operator decision (quick 261029-mbl); neither runs new code. `exeOverride` is shape-checked here and realpath-contained to the install folder at launch (`knownFixLaunch.ts`), so it carries the same trust as `runInPrefix`. Unlike `macArch`/`drm` they are fixes, not routing keys, and count for the GameLib row. Also add one line to the module header's tier-1 bullet.

    per-game-compat-fixes-architecture.md (prettier-ignored; hand-match the surrounding wrap at ~100 cols):
    - Decision 1 tier-1 bullet: add `launchArgs`, `exeOverride` to the key list ("plus `launchNotice` (UI text only), and `launchArgs`/`exeOverride` (quick 261029-mbl)"); keep the "Heroic format, unchanged" claim honest by noting these two are GameLib additions Heroic ignores.
    - Decision 3 table: add rows `launchArgs` (acts on: game argv, appended; Tier 1, implemented by quick 261029-mbl; protonfixes append_argument) and `exeOverride` (acts on: which exe launches, install-dir-relative, realpath-contained, must exist; Tier 1, implemented by quick 261029-mbl; protonfixes replace_command). Update the `launchNotice` row's "the rest of this table is tier 2" so it stays true (name the tier-1 rows).
    - Decision 6 "What tier 1 cannot do" stays as written; append one sentence that `exeOverride` can only pick an existing file inside the install folder, so it stays within `runInPrefix`'s trust.
    - protonfixes table: `replace_command` -> "`exeOverride` (built, quick 261029-mbl)", `append_argument` -> "`launchArgs` (built, quick 261029-mbl)".
    - "Proposed tier-2 (format) additions" item 2: mark done: "built by quick 261029-mbl as **tier 1** (operator decision 2026-10-29)", keep the 88-file count.
    - Follow-ups: point the launchargs todo at `.planning/todos/completed/`.

    Close the todo: `git mv .planning/todos/pending/2026-10-29-known-fix-launchargs-exeoverride-keys.md .planning/todos/completed/` and append a `## Resolution` section in the style of commit 4dcec6110 (date, quick id, code commit hash(es), what was built, ordering decision, test names, the Steam gaps). Leave its frontmatter keys intact (completed/ is gate-exempt; do not remove them).

    Then run `graphify update .`.
  </action>
  <verify>
    <automated>npx jest src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx tsc --noEmit && pnpm planning-gates && test -f .planning/todos/completed/2026-10-29-known-fix-launchargs-exeoverride-keys.md && test ! -f .planning/todos/pending/2026-10-29-known-fix-launchargs-exeoverride-keys.md && grep -c "261029-mbl" .planning/notes/per-game-compat-fixes-architecture.md && npx prettier --check src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/storeManagers/steam/games.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts src/backend/knownFixes.ts</automated>
    The two `.planning/` files are prettier-ignored (`npx prettier --file-info .planning/notes/per-game-compat-fixes-architecture.md` reports `"ignored": true, "inferredParser": null`, measured 2026-10-29), so they are deliberately left out of the prettier check; a check there would be vacuous.
  </verify>
  <done>Non-DRM bridge launches carry known-fix exe/args; Steam gaps recorded; notes updated in all six places; TIER1 docstring updated; todo moved to completed with a Resolution; graphify updated; all checks green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| remote fixes repo -> launcher | tier-1 JSON (now incl. launchArgs/exeOverride) is downloaded and applied at launch |
| known-fix argv -> runner CLI (legendary/nile/gogdl) | argparse runners could read a launchArgs entry as their own option |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mbl-01 | Elevation | exeOverride path traversal to an arbitrary binary | mitigate | validator shape check (no absolute, drive letter, `..`, NUL) + launch-time realpath containment + isFile in resolveKnownFixExeOverride; tests cover symlink escape |
| T-mbl-02 | Elevation | launchArgs `--wrapper`/`--override-exe` injected into runner CLI | mitigate | legendary/nile: known-fix args after `--`; gogdl: `--`-prefixed entries dropped (no short options, allow_abbrev on) |
| T-mbl-03 | Tampering | launchArgs non-string / object payload | mitigate | filterTier1KnownFixes array-of-strings guard, whole key dropped with warning |
| T-mbl-04 | Elevation | remote exeOverride picks a different in-folder exe | accept | same trust as runInPrefix (decision 6, operator decision 2026-10-29) |
| T-mbl-05 | Tampering | TOCTOU between containment check and launch | accept | attacker would need local write access to the install folder, which already grants code execution |
</threat_model>

<verification>
- `npx jest` on all suites listed in the three tasks green; `npx tsc --noEmit`, `pnpm lint`, `pnpm planning-gates` green.
- `grep -n "'launchArgs'\|'exeOverride'" src/backend/knownFixes.ts` shows both in TIER1_KNOWN_FIX_KEYS and not in TIER1_ROUTING_KEYS.
- `grep -rn "readKnownFixLaunchOverrides(" src/backend/storeManagers` hits gog, nile, legendary, zoom; `steamBridgeLaunchCommandParts(` hits steam/games.ts.
</verification>

<success_criteria>
Both keys are accepted at every tier-1 layer with shape guards; exeOverride is contained to the install folder at launch; GOG/Amazon/Epic/Zoom/Steam-bridge launches honour both keys with the stated precedence and ordering; runner-option injection is impossible; notes and docstring updated; todo closed with a resolution naming the Steam gaps.
</success_criteria>

<output>
Create `.planning/quick/261029-mbl-add-launchargs-and-exeoverride-tier-1-kn/261029-mbl-SUMMARY.md` when done, including: the ordering/safety decision per runner, the exe precedence, the sideload non-wiring reason, and the four Steam gaps.
</output>
