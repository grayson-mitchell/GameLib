---
phase: quick-261027-cux
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/cancelDelete.ts
  - src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
  - src/frontend/helpers/library.ts
  - src/frontend/helpers/__tests__/handleStopInstallation.test.ts
  - public/locales/en/gamelib.json
  - .planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md
  - .planning/todos/pending/2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.md
autonomous: true
requirements: [QUICK-261027-cux]

must_haves:
  truths:
    - "Cancelling a Steam native download with Delete Files removes <steamapps>/common/<installdir>, appmanifest_<appid>.acf and appmanifest_<appid>.acf.tmp from the steamapps dir the run actually wrote to"
    - "After a Steam Delete Files, the library entry has steamResumePending false and no steamResumeTargetSteamappsDir/steamResumeInstalldir, so the next Install click starts fresh instead of resuming"
    - "The delete runs only after the aborted native run has settled (isNativeInstallInFlight false), so markSteamInstallIncomplete can never re-set the flag afterwards"
    - "The delete never touches a library root, common/ itself, an empty/undefined/unsafe installdir, a steamapps dir that is not a known Steam library or GameLib bottle root, a dir shared with another appId's manifest, or a game whose ACF has StateFlags bit 4 or whose entry has no resume pending"
    - "Cancelling a Steam download shows the same three buttons as other runners: [Delete Files] [Keep Downloading] [Stop & Keep Files], and Delete Files sends cancelDownload(true)"
    - "Stop & Keep Files for Steam still keeps files and resume behaviour unchanged"
  artifacts:
    - path: "src/backend/storeManagers/steam/cancelDelete.ts"
      provides: "deleteCancelledSteamInstall(appId, opts?) — guarded, settle-aware Steam partial-install delete"
      exports: ["deleteCancelledSteamInstall"]
    - path: "src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts"
      provides: "Containment, refusal, flag-clear and settle-ordering tests against a real temp dir"
    - path: "src/backend/downloadmanager/downloadqueue.ts"
      provides: "Steam branch in cancelCurrentDownload's removeDownloaded path"
      contains: "deleteCancelledSteamInstall"
    - path: "src/frontend/helpers/library.ts"
      provides: "handleStopInstallation shows Delete Files for every runner"
  key_links:
    - from: "src/backend/downloadmanager/downloadqueue.ts"
      to: "src/backend/storeManagers/steam/cancelDelete.ts"
      via: "runner === 'steam' branch inside if (removeDownloaded)"
      pattern: "deleteCancelledSteamInstall\\("
    - from: "src/backend/storeManagers/steam/cancelDelete.ts"
      to: "clearSteamResumeBreadcrumb"
      via: "called only after every rmSync succeeded"
      pattern: "clearSteamResumeBreadcrumb\\("
    - from: "src/frontend/helpers/library.ts"
      to: "window.api.cancelDownload(true)"
      via: "deleteFiles button, no longer runner-gated"
      pattern: "cancelDownload\\(true\\)"
---

<objective>
Make "Delete Files" work for cancelled Steam native downloads and put the button back in the cancel dialog.

Purpose: `cancelCurrentDownload({removeDownloaded: true})` deletes files only when `GameInfo.folder_name` is truthy, and Steam never sets it. For Steam the delete keeps every file and leaves `steamResumePending` set, so the next Install click resumes the install the user just "deleted". Quick 261026-t7b hid the button because of this (todo `2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.md`).

Output: a new guarded module `steam/cancelDelete.ts`, a Steam branch in downloadqueue, the restored button, tests, and the todo closed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.md
@.planning/quick/261026-t7b-redesign-cancel-download-dialog-with-sta/261026-t7b-SUMMARY.md

Load `Skill("gamelib-conventions")` before running any verify block (formatter-check rule and sidecar timer rule).

## DIRTY TREE: read before any commit

Quick 261027-aue is unfinished and has uncommitted hunks in `src/backend/storeManagers/steam/games.ts`,
`src/backend/storeManagers/steam/__tests__/games.test.ts`, `public/locales/en/gamelib.json`,
`src/backend/storeManagers/steam/bridge/*`, `src/frontend/screens/Game/GamePage/components/SteamBridgeSetup.tsx`,
`.planning/notes/...`, `.planning/todos/pending/2026-10-25-unclaimed-world-...md`, plus untracked
`.planning/debug/unclaimed-world-wmv-mf.md`, `.planning/quick/261027-aue-*/`, `.planning/spikes/044-*/ack_watch.exe`.

- This plan does NOT edit `games.ts`. All new logic lives in the new module `cancelDelete.ts`.
- Always stage by explicit path. Never run `git add -A`, `git add .`, `git add -u` or `git commit -a`.
- The ONLY dirty file this plan edits is `public/locales/en/gamelib.json` (Task 3). Stage only this plan's
  one-line hunk with the index-blob procedure in Task 3. Never stage the 261027-aue `bridge.setup.*` and
  `bridge.waiting.*` hunks.
- Before each commit, check that `git diff --cached --stat` lists only this task's files.

## Findings that shape the design (verified in source while planning)

The native installer has NO separate staging or downloading tree. `downloadSteamDepots` (depot.ts ~4248) writes
files directly into `<targetSteamappsDir>/common/<installdir>/`. Its `finalize()` writes `appmanifest_<appId>.acf`
on every outcome, including cancel (a 1026 manifest). It writes that manifest atomically through
`appmanifest_<appId>.acf.tmp` (depot/manifest.ts:211). So the exact native layout to remove is:
1. `<targetSteamappsDir>/common/<installdir>` (recursive)
2. `<targetSteamappsDir>/appmanifest_<appId>.acf.tmp`
3. `<targetSteamappsDir>/appmanifest_<appId>.acf`

Do NOT touch `steamapps/downloading/`, `steamapps/temp/` or `depotcache/`. Those belong to the Steam client, and
GameLib's writer never uses them. Also leave the shared-redist cache (`Steamworks Shared` / `_CommonRedist`, depot.ts
~1084-1240) alone, because other games share it.

The install record is the 260821-rb5 breadcrumb. `markSteamNativeInstallStarted` (library.ts ~603) persists
`install.steamResumeTargetSteamappsDir` and `install.steamResumeInstalldir`, which are the values the run actually
resolved, bottle overrides included. It does this synchronously before the depot download starts.
`markSteamInstallIncomplete` (library.ts:561) keeps both fields and sets `steamResumePending: true` and
`is_installed: false`. `clearSteamResumeBreadcrumb` (library.ts:635) deletes both fields, sets
`steamResumePending: false` and persists. Use the breadcrumb as the only source for delete targets. Never
re-derive them from PICS or guess them.

Settle ordering: `runNativeDepotDownload` (games.ts ~2115) calls `markSteamInstallIncomplete` inside the run on the
cancelled branch. Its `finally` then deletes the appId from `nativeInstallsInFlight`. So once
`isNativeInstallInFlight(appId)` is false, the late `markSteamInstallIncomplete` has already happened and cannot
re-set the flag after we clear it. `cancelCurrentDownload` is synchronous and does not wait for the abort, so the
new module has to wait for the settle itself.

Valid steamapps roots: the native install writes to one of `getSteamLibraries()` + `/steamapps`. The bottle install
writes to `getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle)` (games.ts installBottleNative). The
bridge install writes to `getBottleSteamappsDir(bridgeBottleName)`, which `getBridgeBottleSteamappsRoot(appId)`
resolves.

<interfaces>
From src/backend/storeManagers/steam/state.ts:
  export const library: Map<string, GameInfo>

From src/common/types.ts (GameInfo.install, ~line 430-455):
  steamResumePending?: boolean
  steamResumeTargetSteamappsDir?: string
  steamResumeInstalldir?: string

From src/backend/storeManagers/steam/library.ts:
  export function clearSteamResumeBreadcrumb(appId: string): void
  export function findOtherManifestsWithInstalldir(steamappsDir: string, installdirSegment: string, selfAppId: string): string[]
  export function getBridgeBottleSteamappsRoot(appId: string): string
  (removeSteamInstallCopy ~2248 is the reference guard idiom: NUMERIC_APP_ID, resolve+relative+isAbsolute containment
   against common/, findOtherManifestsWithInstalldir shared-dir check, rmSync from 'node:fs')

From src/backend/storeManagers/steam/games.ts:
  export function isNativeInstallInFlight(appId: string): boolean

From src/backend/storeManagers/steam/bottle.ts:
  export function getBottleSteamappsDir(bottleName: string): string
  export function getSteamBottleSettings(): { wineCrossoverBottle: string, ... }

From src/backend/storeManagers/steam/installLocation.ts:
  export class UnsafeInstalldirError extends Error {}
  export function sanitizeInstalldir(candidate: string | undefined, appId: string, steamappsDir: string): string
    // returns a FALLBACK name for blank input (so pre-check blank yourself); throws UnsafeInstalldirError on
    // denylist (separators, '..', leading/trailing dot, control chars, colon, quote) or traversal

From src/backend/utils.ts:
  export async function getSteamLibraries(): Promise<string[]>

From src/backend/downloadmanager/downloadqueue.ts (current, ~line 335):
  function cancelCurrentDownload({ removeDownloaded = false }) — synchronous; calls stopCurrentDownload() then
  removeFromQueue(appName, true); then `if (removeDownloaded) { ... if (folder_name) removeFolder(path, folder_name) }`
  Already imports getSteamInstallSize from 'backend/storeManagers/steam/games'.

From src/frontend/helpers/library.ts (~104-160): handleStopInstallation(appName, path, t, progress, runner,
  showDialogModal, gameTitle); builds keepDownloading/stopKeepFiles/deleteFiles; currently `isSteam` picks
  messageSteam + two buttons.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Guarded, settle-aware Steam partial-install delete (new module + tests)</name>
  <files>src/backend/storeManagers/steam/cancelDelete.ts, src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts</files>
  <behavior>
    Tests run against a REAL temp dir (fs.mkdtempSync under os.tmpdir(), removed in afterEach). The dir holds
    `lib/steamapps/common/Cool Game/a.bin`, `lib/steamapps/appmanifest_123.acf` (StateFlags "1026",
    installdir "Cool Game") and `lib/steamapps/appmanifest_123.acf.tmp`. Mocks: 'backend/utils' getSteamLibraries
    resolves [<tmp>/lib]; '../games' isNativeInstallInFlight; '../library' clearSteamResumeBreadcrumb (jest.fn) +
    findOtherManifestsWithInstalldir (default []) + getBridgeBottleSteamappsRoot; '../bottle' getBottleSteamappsDir +
    getSteamBottleSettings (point at nonexistent tmp subpaths); 'backend/logger' (factory form); and whatever
    '../installLocation' pulls in transitively ('../user', '../withTimeout'), so the REAL sanitizeInstalldir runs.
    The real '../state' library Map is seeded per test with install { steamResumePending: true,
    steamResumeTargetSteamappsDir: <tmp>/lib/steamapps, steamResumeInstalldir: 'Cool Game' }. Remember
    resetMocks: true in src/backend/jest.config.js, so re-establish mock implementations in beforeEach.
    - Happy path: status 'deleted'; common/Cool Game, the .acf and the .acf.tmp are gone; lib/steamapps and
      lib/steamapps/common still exist; clearSteamResumeBreadcrumb called once with '123'.
    - Settle ordering: isNativeInstallInFlight returns true for the first 3 calls and then false; result 'deleted';
      clearSteamResumeBreadcrumb's invocationCallOrder is after the last isNativeInstallInFlight call that
      returned true. Use small opts { pollMs: 1 } so no fake timers are needed.
    - Settle timeout: isNativeInstallInFlight always true, opts { pollMs: 1, timeoutMs: 20 }. Result 'refused';
      every file still exists; clearSteamResumeBreadcrumb not called.
    - Refusals (each leaves all files present and does not call clearSteamResumeBreadcrumb): non-numeric appId
      ('../1'); no library entry; steamResumePending false; breadcrumb installdir '', '   ' or undefined;
      installdir '..', 'a/b' or '.hidden'; breadcrumb targetSteamappsDir outside every allowed root (e.g.
      <tmp>/elsewhere/steamapps with the same tree built there); ACF StateFlags "4" (fully installed) even with
      steamResumePending true.
    - Shared installdir: findOtherManifestsWithInstalldir returns ['456']. common/Cool Game survives; the 123 .acf
      and .acf.tmp are removed; status 'deleted'; flag cleared.
    - Missing pieces are fine: with no .acf and no .acf.tmp on disk, only common/<installdir> is removed and the
      result is still 'deleted'.
    - Never throws: getSteamLibraries rejecting still lets the bottle/bridge roots be checked, and the function
      resolves (refused when nothing matches).
  </behavior>
  <action>
    Write the test file first (RED: the module does not exist yet), then create `src/backend/storeManagers/steam/cancelDelete.ts` (GREEN). It is its own file, like removeAllCopies.ts/installFormIpc.ts, so the dirty games.ts is never touched. Export `async function deleteCancelledSteamInstall(appId: string, opts?: { pollMs?: number; timeoutMs?: number }): Promise<{ status: 'deleted' | 'refused'; reason?: string }>`. Defaults are pollMs 100 and timeoutMs 60000; export the defaults as named constants. The function NEVER throws: wrap the body in try/catch, and on any exception logWarning and return refused. Steps, in order:
    (1) Check NUMERIC_APP_ID (/^\d+$/, kept as a local copy per this directory's convention) BEFORE any path is built.
    (2) Wait for settle. While isNativeInstallInFlight(appId) is true and elapsed < timeoutMs, await a setTimeout(pollMs) promise and call `.unref?.()` on the timer (sidecar exit contract half 1; the wait is bounded, which satisfies half 2). On timeout, return refused 'native install still settling' and leave the flag set (the safe outcome: files kept, resume still offered).
    (3) Async prep (the last await): build the allowed-roots set of resolve()d steamapps dirs. Include each getSteamLibraries() entry + 'steamapps', getBottleSteamappsDir(getSteamBottleSettings().wineCrossoverBottle), and getBridgeBottleSteamappsRoot(appId). Compute each inside its own try so one failing source does not drop the others.
    (4) From here on, run SYNCHRONOUSLY with no await, so no new install can start between the checks and the rmSync calls:
    (a) if isNativeInstallInFlight(appId), refuse ('install restarted');
    (b) entry = library.get(appId); refuse if the entry is missing or `install.steamResumePending !== true` (this leaves a completed install alone, because a successful run clears the breadcrumb and the flag);
    (c) read targetSteamappsDir = install.steamResumeTargetSteamappsDir and installdir = install.steamResumeInstalldir; refuse unless both are non-empty strings after trim;
    (d) refuse unless resolve(targetSteamappsDir) is in the allowed-roots set;
    (e) call sanitizeInstalldir(installdir, appId, targetSteamappsDir) in a try; refuse on throw, and refuse if the returned value !== installdir (guards fallback substitution). Then commonRoot = resolve(targetSteamappsDir, 'common'), installRoot = resolve(commonRoot, installdir), rel = relative(commonRoot, installRoot). Refuse unless rel is non-empty, contains no path.sep, does not start with '..', is not absolute, and installRoot !== commonRoot and installRoot !== resolve(targetSteamappsDir);
    (f) manifestPath = join(targetSteamappsDir, `appmanifest_${appId}.acf`). If it exists, parse it with @node-steam/vdf parse (graceful-fs readFileSync, like acfInstalldir.ts). If Number(AppState.StateFlags) & 4, refuse ('manifest reports installed'). An unparseable ACF is not a refusal; it is residue;
    (g) conflicting = findOtherManifestsWithInstalldir(targetSteamappsDir, installdir, appId);
    (h) in a try: if conflicting is empty, rmSync(installRoot, { recursive: true, force: true }); otherwise logWarning and keep the directory. Then rmSync(`${manifestPath}.tmp`, { force: true }) and rmSync(manifestPath, { force: true }). rmSync comes from 'node:fs', as in library.ts. On any rm error, logWarning and return refused 'delete failed' WITHOUT clearing the flag, so resume stays available over partial residue;
    (i) clearSteamResumeBreadcrumb(appId), logInfo naming the appId and installRoot, and return deleted.
    Every refusal is logged with logWarning (LogPrefix.Steam) and names the reason. Do not delete steamapps/downloading, temp, depotcache or the shared-redist cache (see the planning findings). Write a module doc comment that records the native layout finding and the settle-ordering argument. Implements the todo's fix direction.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts && npx eslint src/backend/storeManagers/steam/cancelDelete.ts src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts && npx prettier --check src/backend/storeManagers/steam/cancelDelete.ts src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts && pnpm codecheck</automated>
    Before committing: `git diff --cached --name-only` must list exactly the two files above.
  </verify>
  <done>All cancelDelete tests pass. The happy path deletes exactly common/&lt;installdir&gt;, the .acf and the .acf.tmp, then clears the breadcrumb. Every refusal case keeps every file and the flag. The clear happens strictly after settle. Task committed with only these two files staged (`feat(quick-261027-cux): ...`).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Route Steam through the delete in cancelCurrentDownload</name>
  <files>src/backend/downloadmanager/downloadqueue.ts, src/backend/downloadmanager/__tests__/downloadqueue.test.ts</files>
  <behavior>
    - cancelCurrentDownload({ removeDownloaded: true }) with a steam queue head calls deleteCancelledSteamInstall('<appId>') exactly once and never calls removeFolder.
    - cancelCurrentDownload({ removeDownloaded: false }) with a steam head never calls deleteCancelledSteamInstall.
    - A non-steam head with removeDownloaded true still takes the existing folder_name/removeFolder path, and deleteCancelledSteamInstall is not called.
  </behavior>
  <action>
    In downloadqueue.ts, import deleteCancelledSteamInstall from 'backend/storeManagers/steam/cancelDelete'. Inside cancelCurrentDownload's `if (removeDownloaded)` block, branch on runner. For 'steam', call `void deleteCancelledSteamInstall(appName)`. It is fire-and-forget because cancelCurrentDownload is synchronous; the callee never throws, waits for the aborted run to settle itself, and logs every outcome. Do not consult folder_name for Steam. Every other runner keeps the existing folder_name/removeFolder code unchanged. Add a short comment explaining that Steam never sets folder_name and why the delete waits for settle inside the callee (link the todo slug). DLC entries are unchanged.
    In downloadqueue.test.ts, add `jest.mock('backend/storeManagers/steam/cancelDelete', () => ({ deleteCancelledSteamInstall: jest.fn(() => Promise.resolve({ status: 'deleted' })) }))` next to the existing steam/games mock (~line 146). Then add a describe block covering the three behaviours, using the file's existing makeQueueElement/__store pattern and the jest.resetModules + dynamic import re-binding pattern from the 'debug/steam-cancel-abort-thread-a' block (~line 546). Make sure the non-steam case's libraryManagerMap mock returns a folder_name; check how the existing 'backend/storeManagers' mock (~line 84) shapes getGame().getGameInfo().
  </action>
  <verify>
    <automated>npx jest src/backend/downloadmanager/__tests__/downloadqueue.test.ts src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts && npx eslint src/backend/downloadmanager/downloadqueue.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts && npx prettier --check src/backend/downloadmanager/downloadqueue.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts && pnpm codecheck</automated>
  </verify>
  <done>The Steam Delete Files path reaches deleteCancelledSteamInstall, the non-Steam path is unchanged, and the whole downloadqueue suite is green. Committed with only these two files staged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Restore Delete Files for Steam, drop messageSteam, close the todo</name>
  <files>src/frontend/helpers/library.ts, src/frontend/helpers/__tests__/handleStopInstallation.test.ts, public/locales/en/gamelib.json, .planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md, .planning/todos/pending/2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.md</files>
  <behavior>
    - Replace the test 'steam: no delete button, never cancels with removal' with 'steam: same three verb buttons as other runners'. open('steam') yields texts ['Delete Files','Keep Downloading','Stop & Keep Files'] and variants ['danger', undefined, 'primary']. The message uses the general text (it contains 'delete them'). buttons[0].onClick() calls cancelDownload(true) and removeItem('app1').
    - The existing non-steam tests stay unchanged and green.
  </behavior>
  <action>
    In handleStopInstallation (library.ts ~104-160), remove the `isSteam` branch and its stale comment. Every runner now gets the general 'gamelib:downloadManager.cancelDialog.message' text and [deleteFiles, keepDownloading, stopKeepFiles]. Keep the `runner` parameter: the three call sites pass it, and it sits before used params so after-used lint does not flag it. If eslint does flag it, rename it to `_runner` rather than changing the call sites.
    Remove the now-unused `"messageSteam": ...` line from `public/locales/en/gamelib.json` (downloadManager.cancelDialog, ~line 75; it exists in the en catalogue only). This file is DIRTY with 261027-aue hunks around line 468. Stage ONLY this one-line removal with the index-blob procedure: write `git show HEAD:public/locales/en/gamelib.json` to a scratchpad file; delete the single line containing `"messageSteam":` from that copy with a small script (assert exactly one line matched); then `git update-index --cacheinfo 100644,$(git hash-object -w <copy>),public/locales/en/gamelib.json`; then confirm with `git diff --cached public/locales/en/gamelib.json` that the diff shows exactly one removed line and no added lines. The working tree keeps the aue hunks plus this removal. Never `git add` this file.
    In `.planning/todos/pending/2026-10-26-localise-cancel-download-dialog-keys.md`, drop `messageSteam` from the key list on line 18 (that file is clean, so stage it normally).
    Close the todo the way quick 261027-ch9 did (commit b78a7ee37). `git mv` it to `.planning/todos/completed/`, then append a `## Closed 2026-10-27 (quick 261027-cux)` section saying what shipped: the cancelDelete.ts guard list, the native-layout finding that there is no staging tree (removed: common/&lt;installdir&gt; + .acf + .acf.tmp), the settle-before-delete ordering, the downloadqueue Steam branch, and the restored button. Run `graphify update .` after the code changes (graphify-out is gitignored; do not stage it). Run `pnpm planning-gates`.
  </action>
  <verify>
    <automated>npx jest src/frontend/helpers/__tests__/handleStopInstallation.test.ts src/frontend/screens/Game/GamePage/components/__tests__/MainButton.installClickRouting.test.tsx meta/__tests__/gamelibCatalogParity.test.ts && pnpm codecheck && npx eslint src/frontend/helpers/library.ts src/frontend/helpers/__tests__/handleStopInstallation.test.ts && npx prettier --check src/frontend/helpers/library.ts src/frontend/helpers/__tests__/handleStopInstallation.test.ts && node -e "JSON.parse(require('fs').readFileSync('public/locales/en/gamelib.json','utf8'))" && ! grep -rn "messageSteam" src public/locales/en/gamelib.json && pnpm planning-gates && test -f .planning/todos/completed/2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.md && test ! -f .planning/todos/pending/2026-10-26-steam-cancel-delete-files-is-a-backend-no-op.md</automated>
    No prettier check for public/locales/en/gamelib.json or the .planning todo files: `npx prettier --file-info` reports them as ignored ({ "ignored": true }), so a --check there would be vacuous (gamelib-conventions formatter rule). Keep the 4-space JSON indentation by hand.
    Before committing, run `git diff --cached --stat` and confirm it lists only library.ts, handleStopInstallation.test.ts, en/gamelib.json (1 deletion), the localise todo and the rename of the closed todo. `git diff -- public/locales/en/gamelib.json` must still show the 261027-aue bridge.setup/bridge.waiting hunks unstaged.
  </verify>
  <done>The Steam cancel dialog shows Delete Files and sends cancelDownload(true). messageSteam is gone from code and from the en catalogue. The 261027-aue hunks are still unstaged in the working tree. The todo is in completed/ with a Closed section, and planning-gates is green. Committed (`feat(quick-261027-cux): ...; close todo`).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| persisted library store -> filesystem delete | breadcrumb fields come from steamLibraryStore on disk and are writable by anyone who can write the user's config dir |
| on-disk ACF -> delete decision | appmanifest is attacker-writable by anyone who can write steamapps/ (T-pym-01) |
| renderer -> cancelDownload(true) | user-initiated destructive action |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-cux-01 | Tampering (data loss) | cancelDelete.ts target derivation | mitigate | numeric appId guard; breadcrumb steamappsDir must resolve to a known Steam library / GameLib bottle root; installdir non-blank, passes sanitizeInstalldir unchanged, single segment under common/, never common/ or steamapps itself; tested per case |
| T-cux-02 | Tampering (data loss) | shared install dir | mitigate | findOtherManifestsWithInstalldir: if another appId's manifest claims the dir, only this appId's ACF is removed |
| T-cux-03 | Tampering (data loss) | fully installed game | mitigate | refuse unless steamResumePending is true, and refuse when the ACF has StateFlags bit 4 |
| T-cux-04 | Tampering (race) | delete vs in-flight writer / late markSteamInstallIncomplete | mitigate | bounded wait until isNativeInstallInFlight is false, then a synchronous re-check and the rm calls with no await between; flag cleared only after all rm calls succeed |
| T-cux-05 | Denial of service | settle wait in sidecar | mitigate | bounded by timeoutMs (60s); timer unref'd per the sidecar exit contract; timeout keeps the files and the flag |
| T-cux-06 | Repudiation | silent refusal | accept | every refusal is logged with its reason; the UI keeps the resumable state, which is the safe outcome |
| T-cux-07 | Tampering | git index (dirty tree) | mitigate | gamelib.json staged with the index-blob procedure (HEAD minus one line); explicit-path staging only; cached-diff check before each commit |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__/cancelDelete.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts src/frontend/helpers/__tests__/handleStopInstallation.test.ts` passes.
- `pnpm codecheck` and `pnpm planning-gates` are green.
- `git diff --stat HEAD -- src/backend/storeManagers/steam/games.ts` matches its pre-task state, which means this plan never touched games.ts.
- `git log -3 --stat` shows no 261027-aue file and no bridge.setup/bridge.waiting hunk in any of this plan's commits.
</verification>

<success_criteria>
Steam Delete Files removes the native partial install (common/&lt;installdir&gt;, .acf, .acf.tmp) from the steamapps dir the run actually wrote to. It clears steamResumePending and the breadcrumb after the aborted run has settled, so the next Install starts fresh. Every unsafe or ambiguous case refuses and keeps the files. The dialog shows Delete Files for Steam again. The todo is closed. 261027-aue's uncommitted work is untouched.
</success_criteria>

<output>
Create `.planning/quick/261027-cux-steam-cancel-delete-files-steam-aware-pa/261027-cux-SUMMARY.md` when done
</output>
