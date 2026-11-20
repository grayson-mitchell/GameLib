---
phase: quick-261026-lif
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/depot.ts
  - src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts
  - src/backend/storeManagers/steam/bridge/originalRestore.ts
  - src/backend/storeManagers/steam/bridge/__tests__/originalRestore.test.ts
  - src/backend/storeManagers/steam/bridge/shimGenerate.ts
  - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
  - src/backend/storeManagers/steam/electronStores.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - .planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-BACKFILL.md
autonomous: false
requirements:
  - TODO-2026-10-25-bridge-shims-placed-without-gamelib-orig-backup

must_haves:
  truths:
    - "A GameLib depot download restricted to named files fetches only those files, writes no appmanifest ACF, and never throws (it returns error or cancelled)"
    - "Repair on a bridge title writes `<shim>.gamelib-orig` next to every placed shim that has no backup. The bytes are sha1-verified against the depot manifest. The live shim is left in place"
    - "When a placed shim has a valid `.gamelib-orig`, placement reads interface versions from that backup, not from the persisted pool"
    - "Every fresh scan verdict records the original's size and sha1 per shim path"
    - "An `already-placed` relaunch whose `.gamelib-orig` is new or has a changed fingerprint discards the persisted verdict and rescans (the 284100 `{}` case)"
    - "SteamGame.repair() restores originals on bridge titles. On a non-bridge title it fails with a scoped message instead of the Phase 2 stub"
    - "The withhold-impossible warning points at GameLib's Verify and Repair, not Steam's Verify integrity"
    - "Each of the 11 bottles has a `.gamelib-orig` for every placed shim, or a recorded reason why not, written by the operator after a live run"
  artifacts:
    - path: "src/backend/storeManagers/steam/depot.ts"
      provides: "downloadSelectedDepotFiles: filtered buildDepotPlan + downloadDepotFiles, no finalize"
      exports: ["downloadSelectedDepotFiles"]
    - path: "src/backend/storeManagers/steam/bridge/originalRestore.ts"
      provides: "restoreBridgeSteamApiOriginals: per-shim restore to .gamelib-orig with a per-file outcome"
      exports: ["restoreBridgeSteamApiOriginals"]
    - path: "src/backend/storeManagers/steam/electronStores.ts"
      provides: "SteamBridgeScanVerdict.originalFingerprints"
      contains: "originalFingerprints"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "real SteamGame.repair() body + persistedOriginalFingerprints threading"
      contains: "restoreBridgeSteamApiOriginals"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts (repair)"
      to: "bridge/originalRestore.ts restoreBridgeSteamApiOriginals"
      via: "direct call with bottleDir + installRoot"
      pattern: "restoreBridgeSteamApiOriginals\\("
    - from: "bridge/originalRestore.ts"
      to: "depot.ts downloadSelectedDepotFiles"
      via: "default dependency"
      pattern: "downloadSelectedDepotFiles"
    - from: "games.ts launchBridgeGame"
      to: "placeShimForGame opts.persistedOriginalFingerprints"
      via: "readBridgeVerdict(appId).scan.originalFingerprints"
      pattern: "persistedOriginalFingerprints"
    - from: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      to: "repair IPC -> gamedetails/dispatch.ts repair -> SteamGame.repair"
      via: "Verify and Repair menu item shown for installed Steam titles"
      pattern: "handleRepair"
---

<objective>
Restore the game-original `steam_api*.dll` behind every placed bridge shim that lost it, using
GameLib's own depot download (Option A, locked). Give `SteamGame.repair()` a real body that performs
this restore. Make placement throw away a stale persisted verdict when an original appears or
changes. The plan ends with an operator checkpoint that runs the 11-bottle backfill and relaunch
re-verification on the real machine.

Purpose: 15 shims across 11 remaining bottles (1167950, 1284190, 1603180, 1691190, 1782460, 206060,
219990, 230070, 3410180, 411300, 648800) have no `.gamelib-orig`. For those titles, interface pins
come from a stale persisted pool (possibly `{}`), and the j4l withhold path has nothing to restore.
Output: a filtered depot downloader, a restore helper, fingerprint-based verdict invalidation, a real
`repair()` with a reachable menu item, and a per-bottle backfill record.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-CONTEXT.md
@.planning/todos/pending/2026-10-25-bridge-shims-placed-without-gamelib-orig-backup.md
@.claude/skills/gamelib-conventions/SKILL.md

Project rules that bind this plan:
- Tests are **jest** (`ts-jest`), colocated in `__tests__/`. The repo has no vitest. Run them with `npx jest <paths>`.
- No task here spawns a child process. If an executor finds it needs one in `src/` or `meta/`, it
  must use `createFakeHomeProfile()` (gamelib-conventions, fake-HOME rule), never a hand-rolled `env`.
- Sidecar exit contract: repair is user-initiated, never boot work. Add no timer, watcher or socket.
  Await every promise; leave nothing detached. `downloadDepotFiles` already owns and tears down its
  `DecompressPool`. Do not hold a pool or client handle beyond the call.
- Every `<verify>` runs `npx prettier --check` scoped to the exact paths written. All `src/` paths
  below were probed with `npx prettier --file-info` and report `"ignored": false`. The `.planning/`
  files are prettier-ignored, so they get no formatter check.
- Do not read graphify-out/GRAPH_REPORT.md or graph.json.

<interfaces>
<!-- Extracted from the codebase 2026-10-26. Use these directly. -->

depot.ts (src/backend/storeManagers/steam/depot.ts):
- `interface DownloadSteamDepotsOpts { targetSteamappsDir: string; installdir: string; os: string; language?: string; signal?: AbortSignal }` (L198, not exported. Export it or define a sibling type.)
- `export interface DepotPlanFile { filename: string; size: number; sha_content: string | Buffer; chunks: DepotPlanChunk[]; flags?: number; linktarget?: string }`. Filenames use Windows separators (`bin\\steam_api64.dll`).
- `export interface DepotPlan { appId; depots: DepotPlanEntry[]; totalBytes: number; name; buildid?; skippedDepots: string[] }`
- `export async function buildDepotPlan(appId, opts: DownloadSteamDepotsOpts): Promise<DepotPlan>` (L763). It throws on no CM connection or abort.
- `export const DIRECTORY_FLAG = 64`, `export const SYMLINK_FLAG = 512`
- `export function sha1File(path, onProgress?): Promise<string>` (hex)
- `export async function downloadDepotFiles(plan, { targetSteamappsDir, installdir, hosts, hostWeightedLoads?, cdnAuth?, hostMeta?, signal? }): Promise<{ outcome: 'completed'|'cancelled'; failures: DepotDownloadFailure[]; allFilesVerifiedThisRun; allModesApplied }>` (L2860). It writes to `<targetSteamappsDir>/common/<installdir>/<filename>`, reconciles on-disk state first, and sha1-verifies each downloaded file (L2375-L2394).
- `async function getContentServerHosts(client, numericAppId): Promise<{ hosts; weightedLoads; hostMeta }>` (L3914, internal). `function getDepotClient()` (L402, internal). `new CdnAuthTokenCache(client, Number(appId))`
- `downloadSteamDepots` (L4102) shows the whole sequence: buildDepotPlan -> getDepotClient -> getContentServerHosts -> CdnAuthTokenCache -> downloadDepotFiles -> finalize. The new function copies it **minus finalize**.
- `classifyDepotError(err)` (./depotErrors) returns `{ message, action, key }`
- Test seam precedent: `DownloadSharedRedistOpts.downloadFiles?: typeof downloadDepotFiles` (L1073).
- GUARD: `__tests__/depot.test.ts` L1757 fails if any line of depot.ts that mentions `skippedDepots` (after comment stripping) matches `/retry|repair|re-?check/i`. Do not use the word "repair" anywhere in new depot.ts code.

shimGenerate.ts (src/backend/storeManagers/steam/bridge/shimGenerate.ts):
- `const ORIGINAL_BACKUP_SUFFIX = '.gamelib-orig'` (L213). `export function isGameLibShimBytes(buf: Buffer): boolean` (L149)
- `function probeOriginalBackup(bottleDir, target): 'restorable' | 'no-backup' | 'refused'` (L571). It checks containment, uses lstat to refuse symlinks and non-regular files, and refuses shim bytes.
- `function backupOriginalBeforeOverwrite(bottleDir, target, appId)` (L220). `function restoreOriginalIfBackedUp(...)` (L520)
- `type WithholdInput` (L601) and `function withhold(input)` (L640) build the 'withheld' verdict.
- `withholdIfRestorable` warning at L628 ends with: `Use Steam's "Verify integrity of game files" to restore the original`
- `placeShimForGameInner(appId, gameExePath, opts?: { bottleName?; shimSourcePath?; shim64SourcePath?; persistedInterfaceVersions?: Record<string,string>; gameInstallRoot? })` (L683)
  - runtime-loaded branch: `runtimeDlls` (from `findRuntimeDlls`, entries `{ name, path, isGameLibShim }`). The `toCopy.length === 0` path returns `already-placed` at ~L796. The per-name loop picks `original = runtimeDlls.find(d => d.name === name && !d.isGameLibShim)`, then `dllVersions = original ? readVersionsOrEmpty(original.path) : Object.values(opts?.persistedInterfaceVersions ?? {})` (~L884). `verdictBase` is at ~L1021.
  - static branch: the identity guard returns `{ status: 'already-placed', shimPath }` at ~L1103. `targetIsGameLibShim` is computed at ~L1140. `dllVersions = targetIsGameLibShim ? persisted : targetExists ? readVersionsOrEmpty(shimPath) : []` (~L1160). Verdicts are built at ~L1255 (placed-miss) and ~L1274 (placed).
- `isContainedWithin(root, path)` comes from ./bridgeScan

electronStores.ts: `export interface SteamBridgeScanVerdict { status; arch; missingSymbols; interfaceVersions; stubbedInterfaces; shimExportSetVersion; scannedAt; drmWrapper?; managedScan? }` (L197). `writeBridgeScanVerdict` (bridgeVerdict.ts L146) stores the whole object, so a new optional field round-trips with no writer change.

games.ts (src/backend/storeManagers/steam/games.ts):
- `launchBridgeGame()` (L2878): `bridgeBottleSettings = getBridgeBottleSettings(this.appId)` with `.wineCrossoverBottle`. The gate is `isBridgeBottleReady(bottle) && existsSync(exePath)`. `persistedScan = readBridgeVerdict(this.appId)?.scan` (L2940). `placeShimForGame(this.appId, exePath, { bottleName, gameInstallRoot, ...persistedInterfaceVersions })` (L2947).
- `private resolveBridgeGameInstallRoot(exePath, bottleName): string | null` (L1907) returns `<bottle steamapps>/common/<installdir>`.
- `resolveBridgeLaunchExe(appId)` (./bridge/launchTarget). `getBottleDir(bottleName)` (./bottle)
- `async repair(): Promise<ExecResult>` stub at L3362. `ExecResult` is already imported (L11) as `{ stdout: string; stderr: string }`.
- `gamedetails/dispatch.ts` `repair()` (L161): a THROW from `getGame().repair()` produces the "Error Repairing" notify and is logged. A resolve produces "Finished repairing". Its comment at L155 cites the stub; update that comment.

GameSubMenu (src/frontend/screens/Game/GameSubMenu/index.tsx): the `Verify and Repair` button (~L594) is gated `!isSideloaded && !isSteam && !isThirdPartyManaged` and calls `handleRepair(appName)`. `isSteam = runner === 'steam'` (L109). The Steam buttons nearby use `disabled={is.playing}`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Filtered depot download + bridge original restore helper</name>
  <files>src/backend/storeManagers/steam/depot.ts, src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts, src/backend/storeManagers/steam/bridge/originalRestore.ts, src/backend/storeManagers/steam/bridge/__tests__/originalRestore.test.ts, src/backend/storeManagers/steam/bridge/shimGenerate.ts (export keyword only)</files>
  <behavior>
    depot.selectedFiles.test.ts (copy the mock preamble from depot.prescreen.test.ts / depot.sharedRedist.test.ts, which load the real depot.ts with a fake steam-user client and a mocked content_manifest parse):
    - Given a plan with three files (`bin\\Game.exe`, `bin\\steam_api64.dll`, `bin\\sub\\steam_api.dll`) and a predicate selecting `bin/steam_api64.dll`: the injected `downloadFiles` seam is called once. Its plan carries exactly that one file, and `totalBytes` equals that file's size.
    - Directory-flag (64) and symlink-flag (512) entries are never selected, even when their path matches.
    - No `appmanifest_*.acf` exists under `targetSteamappsDir` afterwards (no finalize).
    - Zero matching files: returns `{ status: 'done', files: [] }` and the seam is never called.
    - buildDepotPlan rejects (CM not connected): resolves `{ status: 'error', error }` and does not throw.
    - An aborted signal resolves `{ status: 'cancelled' }`.
    - The seam reports failures: resolves `status: 'error'` with the failures listed.
    originalRestore.test.ts (real fs under `mkdtempSync(join(tmpdir(), ...))`, injected `downloadSelected`, no network, no spawn):
    - A shim (bytes contain `GameLibSteamBridgeShim`) at `<root>/bin/steam_api64.dll` with no backup. The fake download writes original bytes into the staging tree. Result: `<root>/bin/steam_api64.dll.gamelib-orig` equals the original bytes. The live shim is unchanged. The staging dir is removed. The outcome is `restored`.
    - A valid backup already exists: outcome `already-backed-up`, and the download is never called.
    - The target is a non-shim original: outcome `original-in-place`, and nothing is written.
    - The depot has no file at that relative path: outcome `not-in-depot`.
    - The downloaded bytes carry shim markers: outcome `refused`, and no backup is written.
    - The backup path is a symlink: outcome `backup-refused`, and the symlink target is unchanged.
    - The download returns error: outcome `download-failed` carrying the error text. The staging dir is still removed.
    - Two shims (x86 + x64) produce exactly one download call selecting both paths.
  </behavior>
  <action>
In depot.ts, add and export `downloadSelectedDepotFiles(appId, opts)`. `opts` = the `DownloadSteamDepotsOpts` fields plus `select: (normalizedPath: string) => boolean` plus an optional test seam `downloadFiles?: typeof downloadDepotFiles` (the same precedent as `DownloadSharedRedistOpts`). Export `DownloadSteamDepotsOpts`, or declare an exported intersection type.

The function's steps:
1. Call `buildDepotPlan(appId, opts)`.
2. Filter each depot's `files`. Keep a file only when `!(flags & DIRECTORY_FLAG) && !(flags & SYMLINK_FLAG)` and `select(norm(filename))` is true. `norm` = replace backslashes with `/`, strip leading `/`, lowercase. Export `norm` as `normalizeDepotPath` so originalRestore uses the identical form.
3. Drop depots left with no files, and recompute `totalBytes`.
4. If no files remain, return `{ status: 'done', files: [] }`.
5. Otherwise run `getDepotClient()`, `getContentServerHosts`, `new CdnAuthTokenCache`, then `(opts.downloadFiles ?? downloadDepotFiles)(filteredPlan, {...})`, exactly as `downloadSteamDepots` does.
6. **Never** call `finalizeToSteam`. This is a partial fetch into a staging tree and must not write an ACF.

Return `{ status: 'done' | 'cancelled' | 'error'; files: Array<{ filename: string; size: number; sha1: string }>; error?: string; failures?: DepotDownloadFailure[] }`. `sha1` is the manifest `sha_content` as lowercase hex. Wrap the whole body in try/catch. On a throw, return `cancelled` if `opts.signal?.aborted`, else `{ status: 'error', error: classifyDepotError(err).message }`. Never rethrow. Do not use the word "repair" in depot.ts (L1757 guard).

Create `src/backend/storeManagers/steam/bridge/originalRestore.ts` and export `restoreBridgeSteamApiOriginals(input, deps?)`.
- `input = { appId: string; bottleDir: string; installRoot: string; installdir: string; signal?: AbortSignal }`
- `deps = { downloadSelected?: typeof downloadSelectedDepotFiles; findDlls?: typeof findRuntimeLoadedSteamApiDlls }`
- Returns `{ status: 'ok' | 'partial' | 'error'; outcomes: Array<{ path: string; outcome: 'restored' | 'already-backed-up' | 'original-in-place' | 'not-in-depot' | 'refused' | 'backup-refused' | 'download-failed'; detail?: string }> }`

Steps:
1. Validate the input. `appId` must be numeric, and `installRoot` must satisfy `isContainedWithin(bottleDir, installRoot)`. Otherwise return status `error` with an empty `outcomes`.
2. Enumerate with `findRuntimeLoadedSteamApiDlls(installRoot, [], { isShimBytes: isGameLibShimBytes })` from ./bridgeScan. It is the bounded, symlink-skipping walk placement already uses. Import `isGameLibShimBytes` from ./shimGenerate.
3. Classify each entry:
   - non-shim: `original-in-place`
   - shim with a backup that probes valid: `already-backed-up`
   - shim whose backup path exists but is a symlink, non-regular or shim bytes: `backup-refused`. Leave it alone.
   - shim with no backup: a candidate
   Reuse `probeOriginalBackup`: in this task, add `export` to it in shimGenerate.ts. That one-word change is the only shimGenerate.ts edit in Task 1, and it keeps a single definition.
4. Make one `downloadSelected` call for all candidates.
   - `os: 'windows'`
   - `installdir: input.installdir`
   - `targetSteamappsDir: join(bottleDir, '.gamelib-restore', appId, 'steamapps')`. This is staging inside the bottle, on the same volume, never the live install tree. Staging keeps the running game's dlls untouched and writes the original only as a backup, per the CONTEXT "as .gamelib-orig" option.
   - The select set is each candidate's `normalizeDepotPath(relative(installRoot, path))`.
5. Per candidate:
   - path absent from the returned `files`: `not-in-depot`
   - download failed: `download-failed` with the error
   - otherwise take the staged file at `resolveContainedPath(stagingInstallRoot, depotFilename)`. Reject it as `refused` if `sha1File` does not equal the manifest sha1, or if `isGameLibShimBytes` is true. Otherwise write it to `<shimPath>.gamelib-orig`. Re-check containment, and lstat the backup path immediately before the write: refuse a symlink. Log one `logInfo` per restored file with `LogPrefix.Steam`.
6. In `finally`, `rm` the staging dir `join(bottleDir, '.gamelib-restore', appId)` recursively with `force`, after asserting it is contained in bottleDir.
7. Status: `ok` when no outcome is `download-failed` or `refused`, `partial` when some were, `error` when the download as a whole errored. A `not-in-depot` or `backup-refused` outcome is a recorded reason, not a failure. Never throw.

These are the "Done-when" reasons. Keep the outcome names exactly as listed, because Task 3 and the backfill record print them.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts src/backend/storeManagers/steam/bridge/__tests__/originalRestore.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts src/backend/storeManagers/steam/__tests__/depot.prescreen.test.ts && npx tsc --noEmit && npx prettier --check src/backend/storeManagers/steam/depot.ts src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts src/backend/storeManagers/steam/bridge/originalRestore.ts src/backend/storeManagers/steam/bridge/__tests__/originalRestore.test.ts src/backend/storeManagers/steam/bridge/shimGenerate.ts</automated>
  </verify>
  <done>Both new test files pass. The existing depot.test.ts passes, including the L1757 skippedDepots census, and so does depot.prescreen.test.ts. tsc is clean. The function writes `.gamelib-orig` only from sha1-verified, non-shim staged bytes, and the staging dir never survives a call.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Original fingerprints in the verdict + stale-verdict invalidation in placement</name>
  <files>src/backend/storeManagers/steam/bridge/shimGenerate.ts, src/backend/storeManagers/steam/electronStores.ts, src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts</files>
  <behavior>
    Add these to shimGenerate.test.ts, following its existing fixture and mocks pattern: the real fs under tmpdir, `getBottleDir` mocked, shim fixtures carrying the marker. The test at ~L483 already covers the persisted-pool fallback; model on it.
    - Static branch, target is an older shim (not byte-identical to the build) and a valid `.gamelib-orig` holds version strings. Called with `persistedInterfaceVersions: {}`, the verdict's `interfaceVersions` come from the backup. `verdict.originalFingerprints[<shim path rel. to bottle>]` equals `{ size, sha1 }` of the backup.
    - Static branch, placing over a non-shim original: `originalFingerprints` records the original's size and sha1. After the call, the `.gamelib-orig` has that same sha1.
    - The 284100 case: the target is byte-identical to the built shim, a valid backup exists, and `persistedOriginalFingerprints` is absent. The result is NOT `already-placed`. It is `placed` or `placed-miss`, with a fresh verdict whose `interfaceVersions` came from the backup.
    - Byte-identical shim + backup + matching `persistedOriginalFingerprints`: `already-placed`, no verdict.
    - Byte-identical shim + backup whose sha1 differs from the persisted one: a rescan (not `already-placed`).
    - Byte-identical shim + no backup: `already-placed` (unchanged behaviour).
    - Runtime-loaded branch: every entry is a current shim, one has a valid backup, and no persisted fingerprint. The result is a rescan with a verdict carrying `originalFingerprints`, not `already-placed`. With a matching persisted fingerprint it stays `already-placed`.
    - A withheld result's verdict also carries `originalFingerprints`.
    - The withhold-impossible warning text contains `Verify and Repair` and no longer contains `Verify integrity of game files`.
  </behavior>
  <action>
In electronStores.ts, add an optional field to `SteamBridgeScanVerdict`: `originalFingerprints?: Record<string, { size: number; sha1: string }>`. The key is the shim target's path relative to the bridge bottle dir, with forward slashes. Doc comment: per quick 261026-lif (CONTEXT, "Stale verdict invalidation"), these are the size and sha1 of the game-original dll each interface-version read came from, or of its `.gamelib-orig`. Absent means it was never recorded.

In shimGenerate.ts:
(a) `probeOriginalBackup` is already exported (Task 1). Reuse it.
(b) Add a `fingerprintFile(path)` helper returning `{ size, sha1 } | null`. It uses createHash('sha1') over readFileSync: these dlls are small, and the module already reads them synchronously. Never throws. Also add `fingerprintKey(bottleDir, target)`, which is `relative(bottleDir, resolve(target))` with separators normalised to `/`.
(c) Version source: when a target is a GameLib shim and `probeOriginalBackup(bottleDir, target) === 'restorable'`, read versions from `target + ORIGINAL_BACKUP_SUFFIX` via `readVersionsOrEmpty`. Do this in preference to `opts.persistedInterfaceVersions`. Apply it in the static branch's `dllVersions` (~L1160) and in the runtime branch's per-name loop (~L884). If the loop finds no non-shim `original`, use the backup of the same-name shim entry before falling back to the persisted pool. The persisted pool remains the last resort only.
(d) Recording: compute `originalFingerprints` for every target whose original was readable: the non-shim target itself before it is overwritten, or its restorable backup. Add the result to every verdict this function builds:
   - the runtime `verdictBase`
   - the static placed and placed-miss verdicts
   - the `withhold()` verdict, via a new `originalFingerprints` field on `WithholdInput`
   Leave `no-steam-api` without it.
(e) Invalidation: add opt `persistedOriginalFingerprints?: Record<string, { size: number; sha1: string }>` to `placeShimForGameInner`'s opts. `placeShimForGame` derives its param type from it, so callers see the field automatically. Write a helper `backupFingerprintChanged(bottleDir, shimPaths, persisted)`. For each shim path whose backup probes `restorable`, compare the backup's fingerprint with `persisted?.[key]`. The result is changed when `persisted` is absent, the key is missing, or size or sha1 differ. Use it in both short-circuits:
   - static identity guard (~L1103): when changed, `logInfo` one line naming the path and the reason (`new .gamelib-orig` or `fingerprint changed`), plus "discarding the persisted verdict and rescanning (quick 261026-lif)". Then fall through instead of returning `already-placed`. The rest of the path then reads the backup (c), re-copies the identical shim, which is harmless, and returns a fresh verdict.
   - runtime `toCopy.length === 0` (~L796): same rule over `allShimPaths`. Fall through to the evaluation. The copy loop is a no-op on an empty `toCopy`.
   With no backup present, both short-circuits behave exactly as today.
(f) Reword the L628 warning tail to: `Use GameLib's "Verify and Repair" (game menu) to restore the original from the Steam depot`. Steam's "Verify integrity" does not apply here (CONTEXT: point at GameLib's repair; Option B, the Mac Steam console `download_depot`, is a manual fallback only). Update the header comment block (~L35-L41) so it says that backups can be restored by `restoreBridgeSteamApiOriginals`.

Keep every new fs touch inside the existing containment and lstat discipline. Never read a backup whose probe is not `restorable`.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeVerdict.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRoute.test.ts && npx tsc --noEmit && grep -q 'Verify and Repair' src/backend/storeManagers/steam/bridge/shimGenerate.ts && ! grep -v -E '^[[:space:]]*(//|\*)' src/backend/storeManagers/steam/bridge/shimGenerate.ts | grep -q 'Verify integrity of game files' && npx prettier --check src/backend/storeManagers/steam/bridge/shimGenerate.ts src/backend/storeManagers/steam/electronStores.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts</automated>
  </verify>
  <done>All the listed shimGenerate cases pass, including the 284100 already-placed-with-new-backup rescan. Existing shimGenerate, bridgeVerdict and bridgeRoute tests still pass. Fresh verdicts carry `originalFingerprints`. The hint names GameLib's Verify and Repair.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Real SteamGame.repair(), fingerprint threading at launch, Steam menu entry</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/frontend/screens/Game/GameSubMenu/index.tsx</files>
  <behavior>
    Add these to games.test.ts using its existing module mocks. `placeShimForGame` is already a jest.fn at ~L347. Add a `jest.mock('../bridge/originalRestore')`.
    - Bridge title: the exe resolves, the bottle is ready, the exe exists. `repair()` calls `restoreBridgeSteamApiOriginals` once with `{ appId, bottleDir: getBottleDir(bottle), installRoot, installdir: basename(installRoot) }`. It resolves an ExecResult whose stdout lists one `<relpath>: <outcome>` line per outcome.
    - The restore returns `partial` or `error`: `repair()` throws an Error whose message names the failed paths, so dispatch shows "Error Repairing".
    - Non-bridge title: no exe, or the bottle is not ready. `repair()` throws a scoped Error ("Repair restores bridge steam_api originals; appId N has no bridge install"). The restore is never called. The message no longer mentions "Phase 2".
    - `launchBridgeGame` passes `persistedOriginalFingerprints` from `readBridgeVerdict(appId).scan.originalFingerprints` into `placeShimForGame` when present, and omits the key when absent.
  </behavior>
  <action>
In games.ts, replace the `repair()` stub (L3362) with a real body (CONTEXT, Mechanism Option A: `SteamGame.repair()` gets a real body). Scope: bridge titles' steam_api originals only. A full-depot verify is explicitly out of scope, and the error message says so.

1. Resolve the bridge install with the same predicates `launchBridgeGame` uses: `resolveBridgeLaunchExe(this.appId)`, `getBridgeBottleSettings(this.appId).wineCrossoverBottle`, `isBridgeBottleReady(bottle)`, `existsSync(exe)`, and `this.resolveBridgeGameInstallRoot(exe, bottle)`. If any of them fails, throw the scoped Error.
2. Call `restoreBridgeSteamApiOriginals({ appId, bottleDir: resolve(getBottleDir(bottle)), installRoot, installdir: basename(installRoot) })`.
3. Log each outcome with `LogPrefix.Steam`.
4. When status is `ok`, return `{ stdout: <one line per outcome, paths relative to installRoot>, stderr: '' }`. Otherwise throw an Error listing the `download-failed` and `refused` paths and their details.

Repair does not re-place the shim or touch the persisted verdict. The next launch sees a new `.gamelib-orig` with no recorded fingerprint, and Task 2's invalidation rescans it. That relaunch is the re-verification the CONTEXT requires.

In `launchBridgeGame` (~L2947), thread `...(persistedScan?.originalFingerprints ? { persistedOriginalFingerprints: persistedScan.originalFingerprints } : {})` into the `placeShimForGame` opts. Update the adjacent comment so it notes that an `already-placed` result is no longer guaranteed when a backup is new or changed. Also update the stale "Phase 2 stub" comment in `src/backend/gamedetails/dispatch.ts` ~L155, but only if that file needs no other change. If you edit it, add it to the prettier check.

In GameSubMenu/index.tsx, show the existing `Verify and Repair` button for Steam too. The current gate is `!isSideloaded && !isSteam && !isThirdPartyManaged`. Change it to `!isSideloaded && !isThirdPartyManaged`, keeping the other runners exactly as they are. Add `disabled={isSteam && is.playing}`, matching the sibling Steam buttons. The reworded warning from Task 2 points users at this item. Do not add new i18n keys: reuse `submenu.verify`.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/launchDispatch.test.ts && npx tsc --noEmit && pnpm lint:src && ! grep -n 'SteamGame.repair not implemented' src/backend/storeManagers/steam/games.ts && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/frontend/screens/Game/GameSubMenu/index.tsx</automated>
  </verify>
  <done>repair() restores originals on bridge titles and throws scoped errors otherwise. Launch threads the persisted fingerprints. The Steam game menu exposes Verify and Repair. games.test.ts, launchDispatch.test.ts, tsc and lint all pass.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Operator live backfill of the 11 bridge bottles + relaunch re-verification</name>
  <files>.planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-BACKFILL.md</files>
  <action>Before pausing, Claude runs `pnpm build:sidecar` and writes BACKFILL.md with the "before" survey prefilled, as described in how-to-verify. Claude then pauses for the operator. After approval, it moves the todo and records the results. Claude does not fill in the repair outcome, relaunch verdict or bridge-verified columns itself.</action>
  <verify><automated>test -f .planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-BACKFILL.md && test "$(grep -c -E '^\| *(1167950|1284190|1603180|1691190|1782460|206060|219990|230070|3410180|411300|648800) *\|' .planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-BACKFILL.md)" -eq 11</automated> BACKFILL.md is under .planning/ and prettier-ignored, so this task has no formatter check.</verify>
  <done>BACKFILL.md has 11 rows. The operator has filled each one with a `.gamelib-orig` present, or a recorded reason, plus the relaunch verdict and the strict bridge-verified result. The todo has been moved to completed only after operator approval.</done>
  <what-built>A GameLib depot single-file restore, wired to Steam "Verify and Repair". It writes `.gamelib-orig` beside each placed shim. Placement then rescans the next time it sees a new or changed backup. None of this has run against a real Steam session yet. The executor must not claim the backfill is done from the tests alone.</what-built>
  <how-to-verify>
    Pre-step (Claude does this before pausing): run `pnpm build:sidecar` and confirm that `build/main/sidecar.js` has an mtime newer than the Task 3 commit. Tell the operator to fully restart the dev app afterwards: tauri dev does not rebuild or reload the sidecar.
    Then create `.planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-BACKFILL.md` with one row per appId: 1167950, 1284190, 1603180, 1691190, 1782460, 206060, 219990, 230070, 3410180, 411300, 648800. Columns are `appId | shim paths | repair outcomes | .gamelib-orig present | relaunch verdict | bridge verified | notes`. Prefill the "before" survey by running this for each appId: `find "$HOME/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-<appId>/drive_c" -iname 'steam_api*.dll*'`. For each steam_api dll it lists, also run `grep -c GameLibSteamBridgeShim <file>`.

    Operator steps, for each of the 11 titles:
    1. Make sure GameLib is signed in to Steam (Library loads owned games).
    2. Open the game page, open the menu, choose "Verify and Repair", and confirm. Note the notification: "Finished repairing" or "Error Repairing".
    3. Copy the `restoreBridgeSteamApiOriginals` / repair outcome lines for that appId from the GameLib log into the row: per shim `restored`, `already-backed-up`, `not-in-depot`, `backup-refused`, `refused` or `download-failed`.
    4. Re-run the find command. Confirm that each placed shim now has a `.gamelib-orig`, and that `grep -c GameLibSteamBridgeShim` on the backup prints 0.
    5. Launch the title. In the log, confirm the placement line `discarding the persisted verdict and rescanning (quick 261026-lif)` (or a plain `placed` line). Then record the new verdict status and pins: `steam_metadata.json` -> `<appId>.bridge.scan` status, `interfaceVersions`, and that `originalFingerprints` is present, plus the `iface.` lines in `gamelib_bridge.cfg`.
    6. Record "bridge verified" under the strict criterion (memory: HELLO plus a clean game Steam-init log; no game log means unverified; In-Game never counts). A title whose fresh scan withholds the shim is recorded as `withheld`. That is the correct outcome, not a regression.
    Any title that cannot be restored (for example `not-in-depot`, or a depot refused or blocked) gets its reason in `notes`. Recording a reason meets the Done-when.
  </how-to-verify>
  <resume-signal>Paste or confirm the filled BACKFILL.md table, or type "approved" once all 11 rows hold either `.gamelib-orig present = yes` or a recorded reason. On approval, Claude does three things. It runs `git mv` on the todo from `.planning/todos/pending/` to `.planning/todos/completed/`, keeping its `severity:`/`platform:`/`ready:` keys intact. It runs `pnpm planning-gates`. It records the per-bottle table in the SUMMARY. BACKFILL.md and the todo are under `.planning/` and prettier-ignored, so they get no formatter check.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam CDN / depot manifest -> bottle fs | Untrusted bytes and filenames are written to disk |
| bottle fs (user-writable) -> placement | A backup or shim on disk can be tampered with or symlinked |
| renderer -> repair IPC | The appName argument crosses into the backend |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lif-01 | Tampering | downloadSelectedDepotFiles / restore write | mitigate | Staged file sha1 must equal the manifest `sha_content`, and the bytes must not carry shim markers, before they are copied to `.gamelib-orig`. `downloadDepotFiles` also sha1-verifies. |
| T-lif-02 | Elevation (path traversal) | staging + backup paths | mitigate | `resolveContainedPath` for staged files. `isContainedWithin(bottleDir, …)` for installRoot, staging, backup and the rm target. lstat refuses a symlink or non-regular backup path immediately before the write. |
| T-lif-03 | Tampering | placement reading `.gamelib-orig` | mitigate | Read only when `probeOriginalBackup === 'restorable'` (contained, regular, non-symlink, not shim bytes). |
| T-lif-04 | Denial of service | stale or forged persisted fingerprint | accept | The worst case is one extra rescan per launch. The rescan is local and bounded (an existing walk depth limit). |
| T-lif-05 | Tampering | repair writing the live install | mitigate | The live dll is never overwritten. Only the `.gamelib-orig` backup is written, from the staging tree, so a running game is unaffected. |
| T-lif-06 | Spoofing | repair IPC appName | accept | The existing dispatch routes through `libraryManagerMap[runner].getGame(appName)`. `restoreBridgeSteamApiOriginals` re-validates a numeric appId. |
| T-lif-SC | Tampering | package installs | accept | No new dependencies are installed. |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/depot.selectedFiles.test.ts src/backend/storeManagers/steam/bridge/__tests__/originalRestore.test.ts src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/depot.test.ts` passes
- `npx tsc --noEmit` and `pnpm lint:src` are clean
- `npx prettier --check` over every `src/` path in files_modified passes
- Live: BACKFILL.md has 11 rows, each with a backup present or a recorded reason, plus the relaunch verdict and the strict bridge-verified result
</verification>

<success_criteria>
- `downloadSelectedDepotFiles` fetches only the selected files and never writes an ACF
- `restoreBridgeSteamApiOriginals` writes verified `.gamelib-orig` backups and reports one named outcome per shim
- Placement prefers the `.gamelib-orig` over the persisted pool, records `originalFingerprints`, and rescans on a new or changed backup, including the `already-placed` path
- `SteamGame.repair()` is real for bridge titles and scoped-errors otherwise. Steam's menu exposes it. The shimGenerate hint points at it.
- The operator-run backfill is recorded per bottle, and the source todo is moved to completed only after operator approval
</success_criteria>

<output>
Create `.planning/quick/261026-lif-restore-missing-gamelib-orig-bridge-orig/261026-lif-SUMMARY.md` when done. Include the per-bottle backfill table from BACKFILL.md.
</output>
