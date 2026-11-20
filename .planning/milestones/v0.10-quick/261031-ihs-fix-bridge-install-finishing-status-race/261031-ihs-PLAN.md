---
phase: quick-261031-ihs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
autonomous: true
requirements: [QUICK-261031-ihs]

must_haves:
  truths:
    - "After a bridge install, the final status the UI sees for that appId is 'done', whichever comes first: the ACF poller's completion branch or installBridgeGame's tail"
    - "The bridge ACF poller still flips is_installed, persists steamLibraryStore and pushes the game to the library, even after the installer has finalized"
    - "Exactly one 'Installation Finished' toast per bridge install, from installBridgeGame"
    - "A second install of the same appId in one session shows 'Finishing install…' again when its manifest lands (the marker is reset when an install starts)"
    - "If the poller fires before the installer's tail, the window between the ACF flip and the tail still shows 'Finishing install…', not Play"
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "per-appId bridge-install-finalized marker plus the poller gate"
      contains: "markBridgeInstallFinalized"
    - path: "src/backend/storeManagers/steam/games.ts"
      provides: "marker cleared before the depot download, set right before every bridge 'done'"
      contains: "clearBridgeInstallFinalized"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts installBridgeGame / installBridgeGameLeased"
      to: "library.ts markBridgeInstallFinalized / clearBridgeInstallFinalized"
      via: "named import from './library'"
      pattern: "(mark|clear)BridgeInstallFinalized\\("
    - from: "library.ts pollInstallOnce 'installed' branch"
      to: "isBridgeInstallFinalized"
      via: "installerOwnsCompletion gate on the finishing gameStatusUpdate"
      pattern: "isBridgeInstallFinalized\\(appId\\)"
---

<objective>
Fix the race where a bridge install sticks on "Finishing install…" forever.

Observed live 2026-10-31 13:12:16, Schedule I: Free Sample (3205720), bridge route. installBridgeGame's tail (shared redists + DRM prefetch, both instant because cached) ran to its `finally` and sent `done` plus the one toast. After that, the ACF poller's 'installed' branch (library.ts, `installerOwnsCompletion = source === 'bridge'`) sent `installing` / `STEAM_BRIDGE_FINISHING_CONTEXT`. Nothing sends a status after that. Quick 261029-exu introduced the bug.

Why the poller's finishing message is still needed (so deleting it is not the fix): in the 261029-exu live test (Grim Dawn) the poller flipped at 11:10:32 and the tail's first sendFinishing() came about 24 s later (redists began 11:10:56). For that window the poller's message is the only thing keeping the game from showing Play. So keep it, and gate it with a per-appId "bridge install finalized" marker:
- installBridgeGame clears the marker before the depot download starts the poller.
- installBridgeGame sets the marker right before each of its `done` sends: the tail's `finally`, and the wrapper's `clearFinishing` (the error and throw paths).
- The poller skips only the finishing gameStatusUpdate when `installerOwnsCompletion && isBridgeInstallFinalized(appId)`. The library flip, the persist, pushGameToLibrary and the depot-skipped notice are unchanged.
- The poller never clears the marker. It calls stopInstallPolling after the installed branch anyway, so it cannot fire twice.

Every ordering:
1. Poller before the tail: the marker is unset, so the poller sends finishing. The tail then sends finishing and `done`. Final status: done.
2. Tail before the poller (the observed bug): the marker is set, so the poller sends no status. Final status: done.
3. Poller still in flight across the tail: the marker is read synchronously at the send site, after the poller's last await (`shouldHoldForSteamRestart`). That makes this the same as case 1 or case 2.
4. Error or throw after the download (CEG, shim failure): clearFinishing sets the marker and then sends `done`, so a late poller cannot re-assert finishing.
5. Reinstall in the same session: the marker is cleared at the start of installBridgeGameLeased, so the new install behaves like case 1 or case 2 again.

Output: the marker plus gate in library.ts, the call sites in games.ts, and unit tests for both orderings, the reinstall reset and the error path.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.claude/skills/gamelib-conventions/SKILL.md
@.planning/quick/261029-exu-bridge-install-tail-ux/261029-exu-SUMMARY.md

<interfaces>
library.ts (current):
- line ~2083: `export const STEAM_BRIDGE_FINISHING_CONTEXT = 'steam-bridge-finishing'`
- `pollInstallOnce(appId, source)` 'installed' branch, ~3150-3275: `await shouldHoldForSteamRestart(...)` (may return early), then library.set + `steamLibraryStore.set` + `sendFrontendMessage('pushGameToLibrary', updated)`, then `const installerOwnsCompletion = source === 'bridge'`, then a `sendFrontendMessage('gameStatusUpdate', installerOwnsCompletion ? {installing, context: STEAM_BRIDGE_FINISHING_CONTEXT} : {done})`, then the `notify` gated by `!installerOwnsCompletion`, then the depot-skipped notice, then `stopInstallPolling(appId)`.
- `startInstallPolling(appId, { intervalMs, source, isNativeHandoff })` at ~3344; `stopInstallPolling(appId)` at ~3655.

games.ts (current):
- imports from './library' at ~80-91 (already includes STEAM_BRIDGE_FINISHING_CONTEXT).
- `installBridgeGame` ~2121: after the lease is acquired it defines `clearFinishing = () => sendGameStatusUpdate({appName, runner:'steam', status:'done'})`, used on `result.status === 'error'` and in `catch`.
- `installBridgeGameLeased` ~2205: its first statement computes targetSteamappsDir and then calls `this.installDepotDownload(args, {..., pollerSource: 'bridge'})`, which starts the bridge poller (the only bridge poller start site in src/backend).
- Tail ~2410-2460: `sendFinishing()`, redists, `sendFinishing()`, DRM prefetch, then `finally { sendGameStatusUpdate({... status:'done'}); notify(...) }`.

Channels in tests: the poller uses `sendFrontendMessage('gameStatusUpdate', …)`. The installer uses `sendGameStatusUpdate` from 'backend/utils', which games.test.ts mocks (`jest.requireMock('backend/utils')`). games.test.ts imports the REAL library module (`import * as libraryModule from '../library'`), so the new marker functions are live there.

Existing tests to extend:
- library.test.ts ~5002: `describe('bridge source leaves completion to installBridgeGame (quick 261029-exu)')`. Its beforeEach mocks a StateFlags 4 ACF and calls `startInstallPolling('730', {source:'bridge', ...})`.
- games.test.ts ~5240-5300: the '56-20 Gap 3' and 'quick 261029-mbi' bridge install tail tests in the `SteamGame.install() — Phase 24 Plan 08 bridge routing` describe (~5088).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add a bridge-install-finalized marker to library.ts and gate the poller's finishing status on it</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    - Add these inside the existing 261029-exu describe (the beforeEach already starts a bridge poll with an installed ACF). Start each test by calling clearBridgeInstallFinalized('730') so module state cannot leak between tests.
    - Installer done before the poller: call markBridgeInstallFinalized('730'), then `await pollInstallOnce('730','bridge')`. Expect library.get('730').is_installed === true, pushGameToLibrary still sent, NO 'gameStatusUpdate' sendFrontendMessage call at all (neither finishing nor done), and notify not called.
    - Poller before the installer: marker unset, so pollInstallOnce sends the finishing gameStatusUpdate. The existing 'flips is_installed but reports finishing' test covers this; add an explicit clearBridgeInstallFinalized('730') to it.
    - Reinstall reset: call markBridgeInstallFinalized('730') and then clearBridgeInstallFinalized('730'). pollInstallOnce sends the finishing gameStatusUpdate again.
    - Scope: with '730' marked, a non-bridge source poll (for example a 'bottle' or default poll on a different setup, or simply a unit check on isBridgeInstallFinalized) is unaffected. At minimum, assert isBridgeInstallFinalized reflects mark and clear, and that marking '730' does not report '440' as finalized.
  </behavior>
  <action>
    Write the tests first and watch the "installer done before the poller" test fail (the import is undefined, or the finishing message is still sent). Then implement the following in library.ts, next to STEAM_BRIDGE_FINISHING_CONTEXT (~2083).

    Add a module-level `const bridgeInstallFinalized = new Set<string>()` and three exports:
    - `markBridgeInstallFinalized(appId: string): void`
    - `clearBridgeInstallFinalized(appId: string): void`
    - `isBridgeInstallFinalized(appId: string): boolean`

    Give them one short comment: installBridgeGame sets the marker just before its final 'done', and the bridge poller then must not re-assert finishing (quick 261031-ihs, Schedule I 2026-10-31).

    In pollInstallOnce's 'installed' branch, keep `installerOwnsCompletion` as it is. Change the single gameStatusUpdate send like this:
    - Non-bridge: unchanged, sends 'done'.
    - Bridge, marker unset: unchanged, sends installing plus STEAM_BRIDGE_FINISHING_CONTEXT.
    - Bridge, marker set: sends nothing. Do not send a second 'done', because the installer already sent it and a duplicate is noise.

    Read the marker at the send site itself, after every await in the branch, so an in-flight poll cannot use a stale value. Do not touch the library.set / steamLibraryStore.set / pushGameToLibrary block, the notify gate, the depot-skipped notice or stopInstallPolling. The poller must never clear the marker. Update the existing 261029-exu comment above `installerOwnsCompletion` by one sentence that names the marker.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/library.test.ts -t "261029-exu|261031-ihs" && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts</automated>
  </verify>
  <done>The new tests pass and the existing 261029-exu tests still pass. With the marker set, the bridge poller flips and persists is_installed but sends no gameStatusUpdate and no toast. Prettier is clean on both paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Clear the marker at bridge install start and set it before every bridge 'done' in games.ts</name>
  <files>src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    - Add these next to the 'quick 261029-mbi' test (~5260) in the bridge install describe, using the same setup (bridgeAllowlist.has → true, isBridgeBottleReady → true).
    - Successful install finalizes: after `await new SteamGame(APP_ID).install({})`, libraryModule.isBridgeInstallFinalized(APP_ID) is true, and the last sendGameStatusUpdate is {status:'done'}.
    - Marker unset during the tail (so an early poller still shows finishing): give installSteamBridgeSharedRedists a mockImplementation that records libraryModule.isBridgeInstallFinalized(APP_ID) and resolves. The recorded value is false.
    - Reinstall reset: call libraryModule.markBridgeInstallFinalized(APP_ID) before install(). The value recorded inside the redist mock is still false, which shows the start of the install cleared it. It is true again after install() resolves.
    - Error path: a shim-placement failure or CEG result that returns {status:'error'} through the wrapper leaves isBridgeInstallFinalized(APP_ID) true and the last sendGameStatusUpdate {status:'done'}. Reuse whichever existing error-path setup in this describe is simplest (search for "shim placement failed" or the CEG test).
    - Exactly one toast: notify for 'Installation Finished' is called once on success. If an existing test already covers this, assert it alongside rather than duplicating it.
    - Reset with libraryModule.clearBridgeInstallFinalized(APP_ID) in the describe's beforeEach so tests stay independent.
  </behavior>
  <action>
    Write the tests first and watch them fail. Then edit games.ts:
    - Add markBridgeInstallFinalized and clearBridgeInstallFinalized to the existing './library' named import (~80-91).
    - Call clearBridgeInstallFinalized(this.appId) as the first statement of installBridgeGameLeased, before installDepotDownload starts the 'bridge' poller, with a one-line comment: "a new install must show finishing again (quick 261031-ihs)".
    - In the tail's finally, call markBridgeInstallFinalized(this.appId) immediately before the sendGameStatusUpdate done.
    - In the wrapper's clearFinishing, call markBridgeInstallFinalized(this.appId) immediately before its sendGameStatusUpdate done. That covers the error-result and throw paths, where the poller may still be live.

    Do not change the notify call, the sendFinishing calls or markBridgeGameInstalled. Update the existing comment above sendFinishing ("the ACF poller leaves completion to this method …") to say the poller stays silent once this method has marked the install finalized.
  </action>
  <verify>
    <automated>npx jest src/backend/storeManagers/steam/__tests__/games.test.ts -t "bridge routing" && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts && npx tsc --noEmit -p . && npx prettier --check src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>The new games.test cases pass, all of games.test's bridge routing tests and the full library.test pass, tsc is clean, and prettier is clean on both paths. installBridgeGame clears the marker before the download and sets it before each of its 'done' sends.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | In-process sidecar state only. No new input, IPC channel or file. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ihs-01 | Denial of service (UI stuck state) | pollInstallOnce bridge branch | mitigate | The finalized marker gates the finishing re-assert. It is cleared at install start, so a reinstall cannot inherit a stale marker that would hide its finishing state. |
| T-ihs-02 | Tampering | bridgeInstallFinalized Set | accept | Module-private, holds appId strings only, bounded by the number of installs in a session. |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam src/frontend/hooks src/frontend/screens/DownloadManager src/frontend/screens/Game` passes (no regressions in the 261029-exu label, hero or MainButton tests).
- `npx tsc --noEmit -p .` is clean.
- Stage only the four files in files_modified, plus this quick's SUMMARY. Unrelated uncommitted user files exist (.planning/spikes/049…, public/locales/en/gamepage.json, .planning/phases/57…, and others); do not stage them.
- Run `graphify update .` after the code changes.
- Operator note for the SUMMARY: this ordering cannot be reproduced on demand live. Confirm it on the next bridge install (restart tauri dev first, because tauri dev does not rebuild the sidecar): when the tail beats the poller, the log shows "install polling complete … badge flipped" after "Installation Finished", and the UI ends on Play, not "Finishing install…".
</verification>

<success_criteria>
- Both orderings end on 'done': the library.test tail-first case sends no poller status after the marker is set, and the games.test success case sends a final 'done' after the redist step while the marker was unset during the tail.
- A reinstall in the same session resets the marker. Error and throw paths set it.
- One "Installation Finished" toast. The poller still flips and persists the badge.
</success_criteria>

<output>
Create `.planning/quick/261031-ihs-fix-bridge-install-finishing-status-race/261031-ihs-SUMMARY.md` when done.
</output>
