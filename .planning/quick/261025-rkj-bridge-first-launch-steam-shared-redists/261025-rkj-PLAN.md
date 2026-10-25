---
phase: quick-261025-rkj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/bridge/sharedRedists.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228983-vcredist-2010.vdf
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228986-vcredist-2015.vdf
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228989-vcredist-2022.vdf
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228990-directx-jun2010.vdf
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/229004-dotnet-4.5.2.vdf
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/229007-dotnet-4.8.vdf
  - src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/229033-physx-9.14.0702.vdf
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts
  - src/backend/knownFixes.ts
  - src/common/types.ts
  - src/backend/__tests__/knownFixesLayered.test.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md
  - .planning/todos/completed/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md
autonomous: true
requirements:
  - TODO-2026-10-24-bridge-runtime-components-item-1
  - TODO-2026-10-24-bridge-runtime-components-item-3

must_haves:
  truths:
    - "On a bridge launch, every 228980 depot the game's appinfo declares (`depotfromapp: 228980`) is considered; VC++ and DirectX depots, classified from their own downloaded installscript.vdf, are downloaded into one shared cache and their Run Process entries run in the GameLibSteamBridge-<appId> bottle"
    - ".NET, PhysX, XNA, OpenAL and any depot whose kind cannot be established are skipped with a log line unless a bundled/local known-fixes profile lists them in `steamSharedRedists`; an opted-in id is still run only if the game itself declares it"
    - "A remote known-fixes profile can never opt a title into a shared depot (`steamSharedRedists` is stripped from the remote layer)"
    - "While a component downloads or runs, the Play button shows the existing `redist` status with the component label as context (e.g. `Installing Redistributables (DirectX Jun2010)`)"
    - "A successful entry writes its HasRunKey value (lowercased entry name, REG_DWORD 1, /reg:32) and a bottle ledger entry; the ledger settles only when `failed` is empty and every applicable entry is done, and later launches then make zero CM calls and zero wine spawns for this step"
    - "A CM, key, manifest, script-download or file-download failure for any declared depot, an offline client, or an installer timeout never settles the ledger, so the next launch retries; a policy skip (kind 'other', not opted in) does not block settling, and a later opt-in change re-evaluates"
    - "After an installer times out, no further entries run in that launch and no further `redist` status is sent; the entry gets a timed-out-at marker, not a done mark"
    - "A timeout, non-success exit, offline client, CM error or any throw never fails the launch: it logs a warning, marks nothing done, and the game still launches"
  artifacts:
    - path: "src/backend/storeManagers/steam/bridge/sharedRedists.ts"
      provides: "Pure KV1 installscript tokenizer, classifier, Requirement_OS evaluation, argv builders, exit-code policy, opt-in normaliser, declared-depot filter"
      exports: ["parseKv1", "parseInstallScript", "classifySharedRedist", "entryAppliesToBottle", "toBottleWindowsPath", "buildRedistProcessCommandParts", "buildHasRunKeyAddParts", "buildHasRunKeyQueryParts", "parseRegQueryDword", "isRedistSuccessExit", "normaliseSharedRedistOptIn", "declaredSharedRedistDepotIds", "sharedRedistLedgerKey", "STEAM_COMMON_REDIST_APP_ID", "INSTALLSCRIPT_FLAG"]
    - path: "src/backend/storeManagers/steam/depot.ts"
      provides: "downloadSharedRedistDepots: game appinfo -> declared 228980 depots -> installscript-only download + classify -> full download of runnable depots into the shared cache"
      contains: "export async function downloadSharedRedistDepots"
    - path: "src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts"
      provides: "installSteamBridgeSharedRedists: ledger fast path, HasRunKey query, timed wine runs, reg add marks, redist status; never rejects"
      exports: ["installSteamBridgeSharedRedists"]
    - path: "src/backend/knownFixes.ts"
      provides: "steamSharedRedists in TRUSTED_ONLY_KNOWN_FIX_KEYS"
      contains: "steamSharedRedists"
    - path: ".planning/todos/completed/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md"
      provides: "Closed todo with the closure note and the 229033/284100 corrections"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts fireBridgeWineLaunch"
      to: "installSteamBridgeSharedRedists"
      via: "lazy import, awaited after applySteamBridgeKnownFixes and before applyBridgeBottleDllOverrides, with .catch returning void"
      pattern: "installSteamBridgeSharedRedists\\("
    - from: "src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts"
      to: "downloadSharedRedistDepots"
      via: "lazy import of ../depot"
      pattern: "downloadSharedRedistDepots\\("
    - from: "src/backend/storeManagers/steam/depot.ts downloadSharedRedistDepots"
      to: "fetchDepotPlanEntry with ownerAppId '228980'"
      via: "descriptor { id, manifest: gid string, size, ownerAppId: '228980' }, plan.appId '228980'"
      pattern: "ownerAppId: STEAM_COMMON_REDIST_APP_ID"
    - from: "src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts"
      to: "runWineCommand"
      via: "wait:false + unref'd Promise.race timer, skipPrefixCheckIKnowWhatImDoing:true"
      pattern: "wait: false"
---

<objective>
Close items 1 and 3 of the todo `2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md`
(item 2 was done by quick 261025-mfz). On a bridge launch, install the Steamworks Common
Redistributables (app 228980) that the game's appinfo declares into its `GameLibSteamBridge-<appId>`
bottle by running each depot's own installscript.vdf, the way Steam's first-launch "Installing ..."
step does, under the existing `redist` Play-button status. Then move the todo to `completed/`.

Purpose: 10 of 16 measured bridge titles declare 228980 depots that `depot/select.ts:179` skips
today, so their bottles lack the VC++/DirectX runtimes Steam would have installed.

Output: a pure installscript module, a 228980 download entry point in `depot.ts`, a never-rejecting
bottle runner wired into `fireBridgeWineLaunch`, a trusted-only `steamSharedRedists` known-fixes key,
tests for all of it, and the closed todo.

**Closing rule (stated explicitly, per orchestrator):** the todo is moved to `completed/` once the
code and automated tests in this plan are green. The live check (a real 1363080 or 219990 bridge
launch installing VC++/DirectX, then a second launch showing no redist step) is a **human UAT item
recorded in the SUMMARY** and does **not** block closing the todo. Assumption A1 (the authenticated
client gets 228980 keys like the anonymous probe did) is only confirmed by that UAT; if it fails,
the code path skips and logs, so the launch is unaffected.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261025-rkj-bridge-first-launch-steam-shared-redists/261025-rkj-CONTEXT.md
@.planning/quick/261025-rkj-bridge-first-launch-steam-shared-redists/261025-rkj-RESEARCH.md
@.planning/quick/261025-mfz-steam-bridge-known-fixes-registry-key-wi/261025-mfz-SUMMARY.md
@.planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md

Load `Skill("gamelib-conventions")` before writing any `<verify>` step or the todo. Tests here spawn
no binaries, so fake-HOME isolation does not apply (no `createFakeHomeProfile()` needed); do not add
any `env` literal to a spawn.

Verbatim installscript bodies (scratchpad, NOT durable — copy them into the fixture files in Task 1
before anything else):
`/private/tmp/claude-501/-Users-graysonmitchell-Projects-GameLib/71bf01b5-7590-4bca-949c-cba23c17cd81/scratchpad/s/vdfs.txt`
Sections start at `===== <depotId> <path>` lines: 228983 (line 2), 228986 (33), 228989 (66),
228990 (240), 229007 (278), 229033 (308), 229004 (328). Each body runs from the `"installscript"` /
`"InstallScript"` line through the closing brace of its `"kvsignatures"` block; the interleaved
`   file ...` listing lines are NOT part of the body. Keep tabs and `\\` escapes exactly.

<interfaces>
<!-- Extracted from the codebase. Use directly; no exploration needed. -->

src/backend/storeManagers/steam/depot.ts (private unless marked export):
- `function getDepotClient(): SteamUserDepotClient` (L388) — throws if no client.
- `async function withPlanBuildRetry<T>(signal: AbortSignal | undefined, step: (client) => Promise<T>, label?: string): Promise<T>` (L446)
- `async function fetchAppInfo(client, numericAppId: number): Promise<SteamAppInfo>` (L541) — `client.getProductInfo([id], [], true)`, bounded.
- `async function loadContentManifestParser(): Promise<ContentManifestModule>` (L591)
- `async function fetchDepotPlanEntry(client, descriptor: DepotDescriptor, parser): Promise<DepotPlanEntry>` (L662) — key and manifest requested with `Number(descriptor.ownerAppId)`; returns `{ depotId, gid, key, files }` with decrypted filenames and `flags`.
- `export function resolveContainedPath(root: string, filename: string): string` (L1209) — converts `\` to `/`, throws PathTraversalError on escape.
- `export async function downloadDepotFiles(plan: DepotPlan, opts: DownloadDepotFilesOpts): Promise<DepotDownloadResult>` (L2319) — writes to `resolve(opts.targetSteamappsDir, 'common', opts.installdir)`; result `{ outcome: 'completed'|'cancelled', failures: DepotDownloadFailure[], allFilesVerifiedThisRun, allModesApplied }`.
- `async function getContentServerHosts(client, numericAppId: number): Promise<{ hosts, weightedLoads, hostMeta }>` (L3373)
- `new CdnAuthTokenCache(client, numericAppId)` — usage pattern in `downloadSteamDepots` L3640-3680.
- `export interface DepotPlan { appId: string; depots: DepotPlanEntry[]; totalBytes: number; name: string; buildid?: string; skippedDepots: string[] }`
- `DepotPlanEntry { depotId: string; gid: string; key: Buffer; files: DepotPlanFile[]; ownerAppId?: string; appinfoRank?: number }`
- `export interface DepotPlanFile { filename: string; size: number; sha_content; chunks; flags?: number; linktarget?: string }`
- `SteamUser.ensureConnected(): Promise<boolean>` (`../user`, L237) — false when logged out/offline.

src/backend/storeManagers/steam/depot/select.ts:
- `export interface DepotDescriptor { id: string; manifest: string /* 64-bit, never Number */; size: number; dlcappid?: string; ownerAppId?: string; ... }`

src/backend/storeManagers/steam/bridgeKnownFixes.ts (pattern source, do not import FORBIDDEN_CHARS — it is not exported):
- `const FORBIDDEN_CHARS = /["\r\n\0]/`
- registry run pattern L196-235: `Promise.race([runWineCommand({ commandParts, gameSettings, wait: false, protonVerb: 'run', skipPrefixCheckIKnowWhatImDoing: true }), timeout])`, timer `.unref()`, `clearTimeout` in `finally`.
- status: `sendGameStatusUpdate({ appName: appId, runner: 'steam', status: 'redist', context: 'FIXES' })` from `backend/utils`.
- `getBottleDir(bottleName)` from `./bottle` (`src/backend/storeManagers/steam/bottle.ts`).

src/backend/launcher.ts L1453: `runWineCommand({ gameSettings, commandParts, wait, protonVerb, startFolder, skipPrefixCheckIKnowWhatImDoing, ... }): Promise<{ stderr: string; stdout: string; code?: number }>`

src/backend/knownFixes.ts:
- L103 `export const TRUSTED_ONLY_KNOWN_FIX_KEYS = ['registry'] as const`
- L109 `export function readKnownFixesLayered(appName: string, runner: Runner): KnowFixesInfo | null` — local > bundled > remote; trusted-only keys deleted from the remote copy with a warning.

src/common/types.ts L1122 `export interface KnowFixesInfo { title; registry?: KnownFixRegistryEntry[]; evidence?; notes?; winetricks?; runInPrefix?; envVariables?; wikiLink? }`

src/backend/storeManagers/steam/constants.ts L5 `export const steamSupportPath = join(app.getPath('userData'), 'steam_store')`

src/backend/storeManagers/steam/games.ts `fireBridgeWineLaunch` L3190: lazy imports at L3216-3221; `const fixedSettings = await applySteamBridgeKnownFixes(...).catch(...)` L3248-3258; `const launchSettings = await applyBridgeBottleDllOverrides(this.appId, fixedSettings).catch(...)` L3263; monitor starts after (its `'launching'` supersedes `redist`).

src/backend/storeManagers/steam/__tests__/games.test.ts: `jest.mock('../bridgeKnownFixes', ...)` at L384; file-scope passthrough `beforeEach` at L1672; ordering test pattern using `mock.invocationCallOrder` at L1910-1933; rejecting-applier test at L1953.

src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts L1-80: the minimal mock preamble proven to load the real depot.ts (backend/logger factory, backend/utils, `../user` automock, `../depot/select` partial, `../depot/crypto`, `../depot/fileAttributes`, `steam-user/components/content_manifest.js`, `../depot/decompress`, `../../../ipc`, `i18next`). Copy it.

src/backend/__tests__/knownFixesLayered.test.ts: `put(dir, appId, obj)` helper; `bundledFixesPath` is jest.mock'd to a tmp dir (mfz deviation 1 — never let a test write under the real `public/fixes`).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure installscript module (tokenizer, classifier, argv builders) with verbatim fixtures</name>
  <files>src/backend/storeManagers/steam/bridge/sharedRedists.ts, src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts, src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228983-vcredist-2010.vdf, src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228986-vcredist-2015.vdf, src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228989-vcredist-2022.vdf, src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/228990-directx-jun2010.vdf, src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/229004-dotnet-4.5.2.vdf, src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/229007-dotnet-4.8.vdf, src/backend/storeManagers/steam/bridge/__tests__/fixtures/sharedRedists/229033-physx-9.14.0702.vdf</files>
  <behavior>
    - parseKv1 on the 229007 (.NET 4.8) fixture returns TWO sibling entries keyed "4.8" in file order (duplicate keys preserved), and decodes `\\` to `\` and `\"` to `"` (PhysX `command 1` comes back with real quotes and single backslashes).
    - parseInstallScript finds the `Run Process` block case-insensitively under `installscript`/`InstallScript`, ignores the `kvsignatures` block, and returns entries with `hasRunKey`, ordered `processes` (`process 1`/`command 1`, `process 2`/`command 2`...), `minimumHasRunValue` (default 1), and `requirementOs` (`Is64BitWindows`/`is64bitwindows`, `OSType`), all key lookups case-insensitive. Malformed text or no Run Process returns null.
    - classifySharedRedist: 228983 (2010), 228986 (2015), 228989 (2022) -> kind `vcredist`, labels `vcredist 2010` / `vcredist 2015` / `vcredist 2022`; 228990 -> `directx`, label `DirectX Jun2010`. 229004, 229007 (duplicate keys), 229033 (bare `msiexec`), a HasRunKey outside `...\CommonRedist\`, a process containing a `..` segment, a missing script (null entries) and a non-matching path -> kind `other`. Label for other kinds is `<Family> <Version>` from the path when it matches `_CommonRedist\<Family>\<Version>\installscript.vdf`, else null.
    - entryAppliesToBottle: no requirement -> true; `Is64BitWindows 1` -> true (bottles are win64, measured); `Is64BitWindows 0` -> false; `OSType "Windows XP"` -> false; `OSType` equal (case-insensitive) to `BOTTLE_WINDOWS_VERSION` ('Windows 10', research A6) -> true.
    - toBottleWindowsPath('/Users/x/Library/Application Support/gamelib/steam_store/sharedRedist/steamapps/common/Steamworks Shared') -> 'Z:\Users\x\Library\Application Support\gamelib\steam_store\sharedRedist\steamapps\common\Steamworks Shared'; a relative path throws.
    - buildRedistProcessCommandParts: 2010 x86 -> ['<Z path>\_CommonRedist\vcredist\2010\vcredist_x86.exe', '/quiet', '/norestart']; 2022 x64 (.cmd, no command) -> ['cmd', '/c', '<Z path>\_CommonRedist\vcredist\2022\Microsoft Visual C++ 2022 x64.cmd']; DirectX -> [..DXSETUP.exe, '/silent']; for an auto kind a non-switch arg token (anything not matching ^/[A-Za-z0-9:]+$) returns null; CR/LF/NUL anywhere returns null; for kind `other` the PhysX entry yields ['msiexec', '/i', '<Z path>\_CommonRedist\PhysX\9.14.0702\PhysX-9.14.0702-SystemSoftware.msi', '/quiet', '/norestart'] via a quote-aware Windows splitter, while any `%INSTALLDIR%` token that resolves outside `<Z path>\_CommonRedist\` returns null.
    - buildHasRunKeyAddParts(key, 'x64 14.51.36247.0') -> ['reg','add',key,'/v','x64 14.51.36247.0','/t','REG_DWORD','/d','1','/reg:32','/f'] (name lowercased); buildHasRunKeyQueryParts -> ['reg','query',key,'/v',lowercased name,'/reg:32']; both throw on `"`/CR/LF/NUL in key or name. parseRegQueryDword parses `    x64    REG_DWORD    0x1` to 1 and returns null when absent.
    - isRedistSuccessExit: 0 -> true for every kind; 3010 and 1638 -> true only for `vcredist`; 1, undefined -> false.
    - normaliseSharedRedistOptIn(['229007', 229004, 'abc', '229007', null]) -> ['229007'] (numeric strings only, deduped; non-array -> []).
    - declaredSharedRedistDepotIds({ depots: { '284101': {...}, '228990': { depotfromapp: '228980', sharedinstall: '1' }, '229004': { depotfromapp: 228980 }, '1007x': {...}, '230000': { depotfromapp: '1007' }, branches: {...} } }) -> ['228990', '229004'] (String() comparison, numeric ids only, appinfo order; other shared apps such as 1007 excluded).
  </behavior>
  <action>
First copy the seven installscript bodies verbatim from the scratchpad dump into the fixture files listed (one body per file, kvsignatures kept — it is public data and exercises the "ignore kvsignatures" path). Do this first: the scratchpad is not durable.

Create `bridge/sharedRedists.ts` as a pure module: no fs, no logger, no launcher, no electron imports (so depot.ts and the runner can both import it without cycles). Export `STEAM_COMMON_REDIST_APP_ID = '228980'`, `INSTALLSCRIPT_FLAG = 256` (EDepotFileFlag InstallScript), `BOTTLE_WINDOWS_VERSION = 'Windows 10'`, the types `SharedRedistKind = 'vcredist' | 'directx' | 'other'`, `KvNode { key: string; value: string | KvNode[] }`, `InstallScriptProcess { process: string; command?: string }`, `InstallScriptEntry { name: string; hasRunKey?: string; minimumHasRunValue: number; processes: InstallScriptProcess[]; requirementOs: { is64BitWindows?: string; osType?: string } | null }`, and the functions named in the behavior block.

Tokenizer (`parseKv1`): a small ordered KV1 tokenizer that returns `KvNode[]`, keeps duplicate keys, supports quoted and bare tokens, `//` line comments, and decodes only `\\` -> `\` and `\"` -> `"` inside quoted strings. Throws on unbalanced braces or an unterminated string; `parseInstallScript` catches and returns null. Do NOT use `@node-steam/vdf`: measured, it merges the duplicate `"4.8"` entries and leaves `\\` undecoded (RESEARCH Q5.1). This is the documented justified exception to "don't hand-roll".

Classifier (`classifySharedRedist(scriptPath, entries)`), per locked decision "classification from verified data, not an id table": normalise `/` to `\`, match case-insensitively. `vcredist` requires ALL of: path matches `^_CommonRedist\\vcredist\\[^\\]+\\installscript\.vdf$`; at least one entry; no duplicate entry names (case-insensitive); every entry has a HasRunKey starting `HKEY_LOCAL_MACHINE\Software\Valve\Steam\Apps\CommonRedist\vcredist\`; every process starts `%INSTALLDIR%\_CommonRedist\vcredist\`, ends `.exe` or `.cmd`, and has no `..` segment. `directx` is the same with `DirectX` and each process must end `DXSETUP.exe`. Everything else is `other`. Do NOT add a depot-id-to-name table anywhere (locked decision).

`buildRedistProcessCommandParts(proc, kind, installDirWin)`: expand `%INSTALLDIR%` (case-insensitive) to `installDirWin` (no trailing backslash). Containment: the expanded process (or, for `msiexec`, every expanded token that contained `%INSTALLDIR%`) must start with `installDirWin + '\_CommonRedist\'` case-insensitively and have no `..` segment, else null. `.cmd` -> `['cmd', '/c', path, ...args]` (RESEARCH Q5.4); `.exe` -> `[path, ...args]`. Auto kinds split `command N` on whitespace and accept only switch tokens; kind `other` additionally accepts a bare `msiexec` process (case-insensitive) and splits with a quote-aware Windows splitter (double quotes group, quotes removed). Reject CR/LF/NUL in any value. Argv arrays only, never a shell string (T-rkj-02).

`isRedistSuccessExit`: Steam accepts only 0; treating 3010 (reboot required) and 1638 (newer version present) as done for `vcredist` only is a deliberate, recorded deviation from Steam (RESEARCH Q5.6, A4) so direct 2005-2013 exes are not re-run every launch. Put that reason in a comment.

`sharedRedistLedgerKey(hasRunKey | undefined, name)`: `${(hasRunKey ?? '').toLowerCase()}|${name.toLowerCase()}`.

Write the test file first, read fixtures with `readFileSync(join(__dirname, 'fixtures/sharedRedists', ...), 'utf8')`, run it red, then implement to green.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts && npx prettier --check src/backend/storeManagers/steam/bridge/sharedRedists.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts && npx eslint src/backend/storeManagers/steam/bridge/sharedRedists.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts</automated>
    Formatter note: the seven `.vdf` fixtures report `{ "ignored": false, "inferredParser": null }` (probed 2026-10-25), so prettier has no parser for them and `--check` would error rather than prove anything; they are verbatim Valve data and are deliberately omitted from the check. Re-probe one with `npx prettier --file-info` to confirm before omitting.
  </verify>
  <done>All behavior cases pass against the verbatim fixtures; the module imports nothing with side effects; no depot-id name table exists; prettier and eslint clean on both .ts files.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: 228980 download entry point in depot.ts plus the trusted-only `steamSharedRedists` known-fixes key</name>
  <files>src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts, src/backend/knownFixes.ts, src/common/types.ts, src/backend/__tests__/knownFixesLayered.test.ts</files>
  <behavior>
    - Result shape is `{ status: 'offline' | 'none' | 'ok'; depots: SharedRedistDepot[]; failed: string[]; skipped: string[] }`. `failed` = declared depot ids that could not be evaluated or downloaded (retry next launch); `skipped` = policy skips (classified kind 'other' and not opted in, or kind not establishable from the data, e.g. zero or two flag-256 files / unparsable script). Every declared id lands in exactly one of `depots`, `failed`, `skipped`.
    - ensureConnected() false -> resolves { status: 'offline', depots: [], failed: [], skipped: [] }, getClient never called, no throw.
    - Game appinfo with no `depotfromapp: '228980'` depots -> { status: 'none', depots: [], failed: [], skipped: [] } and 228980 appinfo is never fetched; depots from other shared apps (1007) are never touched.
    - A throw from the game or 228980 appinfo fetch propagates (the runner catches it and does not settle).
    - getDepotDecryptionKey errors for 228990 -> 228990 is in `failed`, not `skipped`, and other declared depots still proceed; a second call with the key now succeeding returns 228990 in `depots` (retry works, nothing cached the failure).
    - The installscript-only download reports a failure (or outcome 'cancelled') -> that depot is in `failed`; a full download with failures -> `failed` and the index is not written.
    - A 228980 appinfo with no public GID for a declared depot -> `failed`.
    - For declared 228990 (DirectX fixture) and 229004 (.NET fixture): getDepotDecryptionKey and getRawManifest are called with appId 228980 (owner), the GID string taken from 228980 appinfo `depots[id].manifests.public.gid` (or the bare-string form); the injected downloader is first called with a plan whose `appId` is '228980', installdir 'Steamworks Shared', and whose single file is the flag-256 installscript; 228990 classifies `directx` and gets a second full-file download; 229004 classifies `other`, is not fully downloaded, and is listed in `skipped` (not `failed`).
    - Same input with optInDepotIds ['229004'] -> 229004 is fully downloaded and returned with kind 'other'; optInDepotIds ['229007'] for a game that does not declare 229007 -> 229007 is never fetched (opt-in only widens declared depots, orchestrator decision).
    - A depot whose manifest has zero or two flag-256 files is in `skipped` (kind not establishable, locked decision: skip and log) and the others still proceed.
    - Cache index: when `<cacheSteamappsDir>/gamelib-shared-redist-index.json` records the same GID for the depot and its installscript exists on disk, neither download is called for it; a changed GID re-downloads. The index is written only after a full download with outcome 'completed' and zero failures.
    - onComponent(label) is called with 'DirectX Jun2010' before 228990's full download.
    - readKnownFixesLayered strips `steamSharedRedists` from the remote layer with a warning and keeps it from the bundled and local layers.
  </behavior>
  <action>
Known-fixes key (per CONTEXT decision ".NET/other opt-in via a bundled/local profile only", decision 6 trust rule): append `'steamSharedRedists'` to `TRUSTED_ONLY_KNOWN_FIX_KEYS` in `src/backend/knownFixes.ts` and update its comment; add `steamSharedRedists?: string[]` to `KnowFixesInfo` in `src/common/types.ts` with a doc comment ("228980 depot ids this title opts into beyond the automatic VC++/DirectX set; honoured only from bundled/local sources and only for depots the game itself declares"). Extend `knownFixesLayered.test.ts` with the strip/keep cases, reusing its tmp-redirected `bundledFixesPath` mock.

In `depot.ts`, add exported `downloadSharedRedistDepots(gameAppId: string, opts: DownloadSharedRedistOpts): Promise<{ status: 'offline' | 'none' | 'ok'; depots: SharedRedistDepot[] }>` next to `prescreenBridgeDepots`, importing the pure helpers from `./bridge/sharedRedists`. Types: `DownloadSharedRedistOpts { cacheSteamappsDir: string; optInDepotIds: readonly string[]; signal?: AbortSignal; onComponent?: (label: string) => void; downloadFiles?: typeof downloadDepotFiles }`, result `SharedRedistDownloadResult { status: 'offline' | 'none' | 'ok'; depots: SharedRedistDepot[]; failed: string[]; skipped: string[] }` (replace the inline return type above with it) (the `downloadFiles` seam defaults to `downloadDepotFiles`; it is the caller-supplied-for-testability pattern this module already uses for `hosts`/`stallTracker`, needed because an intra-module call cannot be jest-mocked) and `SharedRedistDepot { depotId: string; gid: string; kind: SharedRedistKind; label: string; installDirHost: string; entries: InstallScriptEntry[] }`.

Flow: assertNumericAppId; `SteamUser.ensureConnected()` false -> log + offline. `getDepotClient()`; game appinfo via `withPlanBuildRetry(signal, c => fetchAppInfo(c, Number(gameAppId)), ...)`; `declaredSharedRedistDepotIds`; none -> 'none'. Fetch 228980 appinfo the same way; installdir = its `config.installdir` or 'Steamworks Shared'. Candidate ids = declared ids (opt-in never adds an undeclared id). `loadContentManifestParser()`, `getContentServerHosts(client, 228980)`, `new CdnAuthTokenCache(client, 228980)` once. Per depot, inside its own try/catch: any throw, a missing GID, a script or full download with failures or a non-'completed' outcome pushes the id to `failed` (logWarning) and continues; the policy skips below push to `skipped` (logInfo). Never fold a failure into `skipped` — the runner settles on `failed` being empty, so a misfiled failure would stop retries permanently. GID kept as a STRING (T-21-04, never Number/@node-steam/vdf); `fetchDepotPlanEntry(client, { id, manifest: gid, size: 0, ownerAppId: STEAM_COMMON_REDIST_APP_ID }, parser)` wrapped in withPlanBuildRetry; exactly one file with `(flags & INSTALLSCRIPT_FLAG) !== 0` else `skipped`; installRoot = `resolve(cacheSteamappsDir, 'common', installdir)`; script path via `resolveContainedPath(installRoot, file.filename)`. Use the cache index shortcut described in behavior; otherwise download a plan `{ appId: STEAM_COMMON_REDIST_APP_ID, depots: [{ ...entry, ownerAppId: '228980', files: [scriptFile] }], totalBytes, name: 'Steamworks Common Redistributables', skippedDepots: [] }` — plan.appId MUST stay '228980' (CDN host/token scoping, and so `sendProgressUpdate` never drives the game's install UI; RESEARCH Q1). Read the script as utf8, `parseInstallScript`, `classifySharedRedist`. Push to `skipped` (logInfo with depot id and path) unless kind is vcredist/directx or the id is in optInDepotIds. For a runnable depot call `onComponent(label ?? 'depot <id>')`, then full download of all files through a module-level single-flight `Map<depotId, Promise<...>>` (deleted in finally) so two concurrent launches never write the same files; non-'completed' outcome or any failure -> `failed`; otherwise update the index and push to `depots`. Do NOT call `selectDepots`, `buildDepotPlan`, `downloadSteamDepots` or `finalizeToSteam`: no ACF is wanted for 228980 and the ownership/depotfromapp gate is exactly what excludes these depots (RESEARCH Q1 rules).

New test file `depot.sharedRedist.test.ts`: copy the mock preamble from `depot.prescreen.test.ts` L1-80 (plus its remaining jest.mock lines for `../../../ipc` and `i18next`), make `decryptFilename` identity, give the fake client `getProductInfo` keyed by app id, `getDepotDecryptionKey`, `getRawManifest`, and `getContentServers`; the injected `downloadFiles` mock writes the fixture text (read from Task 1's fixtures) to the resolved path under a per-test `mkdtempSync` dir and returns `{ outcome: 'completed', failures: [], allFilesVerifiedThisRun: true, allModesApplied: true }`. No real network, no real wine.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts src/backend/__tests__/knownFixesLayered.test.ts src/backend/__tests__/knownFixes.test.ts src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts src/backend/knownFixes.ts src/common/types.ts src/backend/__tests__/knownFixesLayered.test.ts && npx eslint src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depot.sharedRedist.test.ts src/backend/knownFixes.ts src/common/types.ts src/backend/__tests__/knownFixesLayered.test.ts</automated>
  </verify>
  <done>downloadSharedRedistDepots returns only VC++/DirectX (plus trusted opt-ins that the game declares), keyed and fetched under app 228980, cached by GID; every declared id is in exactly one of depots/failed/skipped, key-fetch and download failures land in `failed`, policy skips in `skipped`; existing depot tests still pass; `steamSharedRedists` is trusted-only and typed; codecheck, prettier and eslint clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Bottle runner wired into the bridge launch, then close the todo</name>
  <files>src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts, src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md, .planning/todos/completed/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md</files>
  <behavior>
    - Settled ledger whose stored optIn equals the current profile opt-in -> downloadSharedRedistDepots and runWineCommand are never called.
    - Settled ledger with 229004 in `settled.skipped`, then the profile opts into 229004 -> re-evaluated (download called with optInDepotIds ['229004']).
    - Download returns 'offline' -> no wine call, ledger not settled, resolves void; the next call calls download again.
    - Download returns `failed: ['228990']` (e.g. key fetch threw) with `depots: []` -> ledger NOT settled; a second call calls download again.
    - Download returns `failed: ['228990']` from a script-download failure while another depot installs fine -> that depot's entries recorded done, ledger NOT settled.
    - Download returns `failed: []`, `skipped: ['229004']`, DirectX done -> ledger settled with `skipped: ['229004']` and the current optIn recorded.
    - Download rejects -> ledger not settled, warning, resolves void.
    - DirectX depot, registry query reports `REG_DWORD 0x1` -> installer not run, ledger records the entry.
    - DirectX depot, query absent -> sends status `redist` with context 'DirectX Jun2010', runs ['Z:\...\DXSETUP.exe','/silent'] with wait:false and skipPrefixCheckIKnowWhatImDoing:true, code 0 -> runs the `reg add ... /reg:32 /f` argv, ledger records it and is settled.
    - vcredist 2010: x86 and x64 entries both run (win64 bottle); code 3010 counts as done; code 1 does not mark done, leaves the ledger unsettled, logs a warning, and the next entry still runs.
    - An installer that never settles hits the 5-minute timer (jest fake timers) -> not marked done, `timedOut[key]` set to an ISO timestamp in the ledger, warning logged, the timer is unref'd and cleared, NO further entries run in this launch (later depots/entries get no runWineCommand call and no further `redist` status), and the ledger is not settled. A later successful run of that entry clears its `timedOut` marker.
    - An entry whose Requirement_OS does not apply (OSType Windows XP) is skipped without a wine call.
    - Any throw (download rejects, ledger unreadable JSON, runWineCommand throws) -> resolves void with a warning; never rejects.
    - games.ts: installSteamBridgeSharedRedists is called with (appId, bridge settings) after applySteamBridgeKnownFixes and before applyBridgeBottleDllOverrides, startBottleProcessMonitor and the game's runWineCommand; a rejecting installer still launches the game (result true), logs a warning, and does not send steamBridgeSetupRequired.
  </behavior>
  <action>
Create `bridge/sharedRedistInstall.ts` exporting `installSteamBridgeSharedRedists(appId: string, bottleSettings: GameSettings): Promise<void>`, which never rejects (same contract as `applySteamBridgeKnownFixes`; orchestrator decision: failure warns and the launch continues). Lazy-import `backend/launcher` (runWineCommand) and `../depot` (downloadSharedRedistDepots) inside the function, mirroring the applier's cycle avoidance. Use `sendGameStatusUpdate` from `backend/utils`, `logInfo`/`logWarning` with `LogPrefix.Steam`, `readKnownFixesLayered` from `backend/knownFixes`, `getBottleDir` from `../bottle`, `steamSupportPath` from `../constants`.

Flow (research discretion recommendations, accepted by the orchestrator): bottleDir = `getBottleDir(bottleSettings.wineCrossoverBottle)`; ledger at `<bottleDir>/gamelib-shared-redists.json` shaped `{ version: 1, done: Record<ledgerKey, gid>, timedOut: Record<ledgerKey, isoString>, settled?: { optIn: string[]; depotIds: string[]; skipped: string[]; at: string } }` (unreadable or wrong shape -> treat as empty and log). optIn = `normaliseSharedRedistOptIn(readKnownFixesLayered(appId, 'steam')?.steamSharedRedists)`. Settled with equal sorted optIn -> logInfo and return. Accepted limit (checker warning 3, measured): no local copy of a game's declared 228980 depots exists without a CM call — `steam_metadata` (`electronStores.ts` `SteamMetadataCacheEntry`) holds art/platform flags only, and GameLib's `finalizeToSteam` writes no `SharedDepots` to the ACF — so the settled fast path deliberately does not re-check the declared list; a game that later declares a new 228980 depot is not re-evaluated until the opt-in list changes or the bottle (and with it the ledger) is deleted. Write this in a comment. Otherwise call `downloadSharedRedistDepots(appId, { cacheSteamappsDir: join(steamSupportPath, 'sharedRedist', 'steamapps'), optInDepotIds: optIn, onComponent: label => sendGameStatusUpdate({ appName: appId, runner: 'steam', status: 'redist', context: label }) })` — one shared cache serves every bottle (DirectX is 103 MB). 'offline' -> log, return. installDirWin = `toBottleWindowsPath(depot.installDirHost)` (every bridge bottle maps `z:` to `/`, measured).

For each depot, each entry in file order: skip if `!entryAppliesToBottle`; skip if the ledger key is done; if hasRunKey, run `buildHasRunKeyQueryParts` (15 s timer) and treat `parseRegQueryDword(stdout) >= minimumHasRunValue` as already done (records the ledger, no installer; this is also how a trusted `registry` fix pre-written by `applySteamBridgeKnownFixes` suppresses a component, which is why this step runs after it). Otherwise send the `redist` status with the depot label, then run each process pair in order via `buildRedistProcessCommandParts` (null -> warn, entry failed) and `runWineCommand({ commandParts, gameSettings: bottleSettings, wait: false, protonVerb: 'run', skipPrefixCheckIKnowWhatImDoing: true })` raced against a 5-minute timer (`REDIST_PROCESS_TIMEOUT_MS = 300_000`, research A2) that is `.unref?.()`'d and cleared in `finally` — sidecar exit contract half 1; half 2 holds because this work only runs inside a user-initiated launch, never at boot. Do NOT use `wait: true` (`wineserver --wait` can block forever, RESEARCH Q5.2). A timed-out child cannot be killed through runWineCommand: log it, set `timedOut[key] = new Date().toISOString()` (not done), write the ledger, and stop processing every remaining entry and depot for this launch with no further `redist` status, so installers never stack in the bottle; the launch then proceeds. The `wait: false` child is not tied to the sidecar event loop beyond the unref'd timer: once the race settles the timer is cleared and nothing here holds a reference, and the spawn's own handle lifetime is runWineCommand's existing behaviour, unchanged by this plan. Success per `isRedistSuccessExit(kind, code)`. When all processes of an entry succeed: if hasRunKey, run `buildHasRunKeyAddParts` (15 s timer; a failed mark is warned but the ledger still records the entry, since the installer itself succeeded); write the ledger after every entry. logInfo each installed component by label and entry name so a DXSETUP native-DLL regression can be traced (RESEARCH Q5.7). Settle rule (checker blocker 1): set `settled = { optIn, depotIds, skipped, at }` only when status is 'none' or 'ok', `failed` is empty, no entry failed or timed out, and every applicable entry of every returned depot is done. Status 'offline', a rejected download, any `failed` id, a failed entry or a timeout leaves `settled` unset (and clears a stale one if present), so the next launch retries. A policy skip does not block settling; recording `skipped` and `optIn` means a later opt-in change re-evaluates. Status 'none' settles so a title that declares nothing costs zero CM calls next launch. Add a module-level single-flight `Map<appId, Promise<void>>`. Wrap everything in try/catch -> logWarning.

Wire in `games.ts` `fireBridgeWineLaunch`: add the lazy import next to the others and, immediately after the `fixedSettings` assignment and before `applyBridgeBottleDllOverrides`, `await installSteamBridgeSharedRedists(this.appId, bridgeBottleSettings).catch(...)` with a logWarning that returns void — belt-and-braces like the applier, so nothing reaches the outer catch whose `reportLaunchFailure` calls `markBridgeFailedThisSession`. Comment it with quick 261025-rkj, the first-launch rationale, and why it sits after known fixes and before the monitor (`'launching'` supersedes `redist`). In `games.test.ts` add `jest.mock('../bridge/sharedRedistInstall', () => ({ installSteamBridgeSharedRedists: jest.fn() }))`, a file-scope `beforeEach` resolving undefined next to the L1672 passthrough, and three tests named with `quick 261025-rkj` (ordering via `invocationCallOrder`, args, rejection never fails the launch) modelled on L1910-1975.

`sharedRedistInstall.test.ts`: mock `backend/launcher`, `../../depot`, `backend/utils`, `backend/logger`, `backend/knownFixes`, `../../bottle` (getBottleDir -> a per-test `mkdtempSync` dir) and `../../constants`; build depots from Task 1's fixtures via `parseInstallScript`. No real wine, no network.

Then close the todo: `git mv` it from `.planning/todos/pending/` to `.planning/todos/completed/` (same filename; `head` one existing completed file and match its frontmatter convention). Append a `## Closed (2026-10-25, quick 261025-rkj)` section stating: items 1 and 3 done (bridge launch installs declared VC++/DirectX from 228980 via each depot's installscript, `redist` status shows the component; .NET/other only via the trusted `steamSharedRedists` key and only for declared depots); item 2 was done by 261025-mfz; correction: depot 229033 is PhysX 9.14.0702, not VC++, and is not auto-installed (verified from its installscript path, RESEARCH Q2); correction: 284100 does declare shared depots, 228990 (DirectX) and 229004 (.NET 4.5.2), so with this change 284100 gets DirectX automatically and .NET stays on Wine Mono; the live check is a human UAT item recorded in the SUMMARY and did not block closing; the 284100 shim crash remains tracked in `2026-10-24-x64-shim-lacks-old-sdk-csteamworks-exports-and-interface-versions.md`. Grep `.planning/todos/pending` and `src` for the old pending path and update any reference. Finally run `graphify update .` (CLAUDE.md: after modifying code).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedists.test.ts src/backend/__tests__/steamBridgeKnownFixes.test.ts && npx jest src/backend/storeManagers/steam/__tests__/games.test.ts && pnpm codecheck && pnpm planning-gates && test ! -e .planning/todos/pending/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md && grep -q '261025-rkj' .planning/todos/completed/2026-10-24-bridge-bottles-lack-windows-runtime-components-games-need.md && npx prettier --check src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx eslint src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts src/backend/storeManagers/steam/bridge/__tests__/sharedRedistInstall.test.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
    Formatter note: the todo under `.planning/` is prettier-ignored (`.planning` is in `.prettierignore`), so it is deliberately left out of the `--check`; hand-match the file's existing ~100-column wrap.
  </verify>
  <done>The bridge launch runs the step after known fixes and before DLL overrides/monitor; all runner behaviors pass with mocked wine, including: key-fetch failure not settled and retried, script-download failure not settled, policy skip settles, opt-in change re-evaluates a skipped depot, offline not settled, timeout records timedOut and stops the remaining entries; games.test.ts green including the three new tests; the todo lives in `completed/` with the closure note and both corrections; planning-gates, codecheck, prettier and eslint clean; graphify updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CM/CDN -> sidecar | Manifests and chunk bytes for app 228980; installscript text is untrusted input |
| known-fixes layers -> runner | Remote layer is untrusted; bundled/local are trusted (decision 6) |
| sidecar -> CrossOver bottle | Argv built from installscript values executes inside the bottle |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rkj-01 | Elevation | remote known-fixes `steamSharedRedists` | mitigate | Key appended to `TRUSTED_ONLY_KNOWN_FIX_KEYS` (stripped from remote with a warning); opt-in only widens depots the game itself declares; tested in knownFixesLayered.test.ts and depot.sharedRedist.test.ts |
| T-rkj-02 | Tampering | `process N` / `command N` values | mitigate | `buildRedistProcessCommandParts` requires `%INSTALLDIR%\_CommonRedist\` containment, rejects `..`, CR/LF/NUL, auto kinds accept switch-only args, argv array never a shell string |
| T-rkj-03 | Tampering | `reg add`/`reg query` key and value name | mitigate | HasRunKey must start with `HKEY_LOCAL_MACHINE\Software\Valve\Steam\Apps\CommonRedist\` for auto kinds; builders throw on `"`/CR/LF/NUL (same set as bridgeKnownFixes FORBIDDEN_CHARS) |
| T-rkj-04 | Tampering | manifest filenames written to the cache | mitigate | Existing `resolveContainedPath` (PathTraversalError) and per-file sha1 verification in `downloadDepotFiles`; `kvsignatures` is not verifiable by GameLib, trust comes from the CM-authenticated manifest + sha1 |
| T-rkj-05 | Tampering | steamclient DLLs from other shared apps (1007) | mitigate | Filter is exactly `String(depotfromapp) === '228980'`; tested |
| T-rkj-06 | Denial of service | hung installer / wineserver | mitigate | `wait:false` + 5-min unref'd timer per process, 15 s for reg; timeout never marks done, records `timedOut`, and stops the remaining entries for that launch so installers never stack; launch never fails (never-reject contract + `.catch` at call site) |
| T-rkj-09 | Denial of service | timed-out installer child | accept | runWineCommand exposes no kill, so a timed-out installer keeps running in the bottle (possibly alongside the game) until it exits on its own; bounded to one per launch by the stop-after-timeout rule; the child is not held by the sidecar event loop beyond the cleared unref'd timer. SUMMARY must carry this as a note |
| T-rkj-10 | Repudiation | stale settled ledger | accept | No local declared-depot data exists without a CM call (steam_metadata has no depots, finalizeToSteam writes no SharedDepots), so a newly declared 228980 depot is not picked up after settling; deleting the bottle or changing the opt-in resets it |
| T-rkj-07 | Denial of service | sidecar exit contract | mitigate | Every timer `.unref?.()`'d and cleared; work only inside a user-initiated launch, nothing at boot |
| T-rkj-08 | Tampering | DXSETUP native d3dx9/xact DLLs change Wine builtin behaviour | accept | Locked decision makes DirectX automatic; component logged per install; a trusted `registry` fix can pre-write the HasRunKey to opt a title out |
| T-rkj-SC | Tampering | package installs | accept | No new npm/pip/cargo dependency is added by this plan; no install task |
</threat_model>

<verification>
- `npx jest` over the four new/extended test files plus depot.test.ts, depot.prescreen.test.ts, knownFixes*.test.ts, steamBridgeKnownFixes.test.ts and games.test.ts: green.
- `pnpm codecheck` clean; `pnpm planning-gates` green; eslint clean on touched .ts files; `npx prettier --check` clean on every written .ts path (the .vdf fixtures and the `.planning` todo are omitted with the reasons stated in their verify blocks).
- `grep -rn "depotIdToName\|228983.*vcredist" src/backend/storeManagers/steam/bridge/sharedRedists.ts` finds no id-to-name table (classification is path/installscript based).
- Source audit: GOAL (todo items 1 and 3) -> Tasks 1-3; CONTEXT decisions (VC++/DirectX auto; .NET/other trusted opt-in only; verified classification, skip+log unknown; installscript/HasRunKey precedent; GOG shape; first launch; shared cache; HasRunKey idempotence) -> Tasks 1-3; RESEARCH (no selectDepots, ownerAppId 228980, string GIDs, KV1 tokenizer, wait:false + unref timer, cmd /c, Z: paths, 3010/1638 vcredist, call-site order, cache index, single-flight, ledger) -> Tasks 1-3; orchestrator decisions (opt-in only for declared depots, 229033 PhysX correction, 284100 correction, never throws, no real network/wine in tests, explicit closing rule) -> Tasks 2-3 and the objective. No deferred items exist.
</verification>

<success_criteria>
- A bridge launch of a title declaring 228980 VC++/DirectX depots downloads them once into `<steamSupportPath>/sharedRedist/steamapps/common/Steamworks Shared` and runs their installscript entries in the title's own bottle, showing `Installing Redistributables (<component>)`.
- .NET/PhysX/XNA/OpenAL/unknown depots are skipped and logged unless a bundled/local profile opts in.
- Second launch after success: zero CM calls and zero wine spawns for this step (settled ledger).
- No failure mode in this step can fail or mark-failed the bridge launch.
- Todo moved to `completed/` with the closure note and the 229033 and 284100 corrections.
- SUMMARY records the human UAT item: "Bridge-launch 1363080 or 219990 on this Mac; expect the redist status with vcredist/DirectX labels, `msvcp140.dll` in the bottle's system32 and syswow64, HasRunKey values under `HKLM\Software\Wow6432Node\Valve\Steam\Apps\CommonRedist`, and on a second launch no redist step." The live gate is not a blocker for closing the todo.
- SUMMARY carries two notes: (a) accepted risk T-rkj-09, a timed-out installer child cannot be killed and keeps running in the bottle; (b) accepted limit T-rkj-10, a settled ledger does not notice newly declared 228980 depots (bottle delete resets it).
</success_criteria>

<output>
Create `.planning/quick/261025-rkj-bridge-first-launch-steam-shared-redists/261025-rkj-SUMMARY.md` when done, including the human UAT item above, the T-rkj-09 (unkillable timed-out child) and T-rkj-10 (settled-ledger staleness) notes, and any deviations (notably whether assumption A1 could be exercised).
</output>
