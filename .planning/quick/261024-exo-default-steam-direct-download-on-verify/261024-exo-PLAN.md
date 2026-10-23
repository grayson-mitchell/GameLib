---
phase: quick-261024-exo
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/config.ts
  - src/backend/storeManagers/steam/nativeInstallSetting.ts
  - src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx
  - src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts
  - src/backend/sidecar/__tests__/steamNativeInstallDefault.test.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
autonomous: true
requirements:
  - TODO-2026-10-22-steam-direct-download-default-on-and-verify-arch-after-delegated-install

must_haves:
  truths:
    - "On a fresh profile, 'Download Steam games directly in GameLib' reads ON in both the backend (isSteamNativeInstallEnabled) and the Settings toggle"
    - "A profile whose config.json holds an explicit enableSteamNativeInstall:false still reads OFF, before and after a simulated restart"
    - "A steam://install (or bottled-Steam dispatch) poll keeps polling well past 60s while no appmanifest has appeared yet"
    - "A delegated poll stops (and clears the queue badge with status 'done') when the manifest disappears after having appeared, and still stops at the existing MAX_TICKS ceiling"
    - "On macOS, a delegated steam://install poll that sees the manifest reach FullyInstalled runs verifyMacArchGroundTruth, and an i386 verdict raises the promptI386Recovery dialog"
    - "If the delegated poll is no longer running when the install completes, focus reconciliation (refreshInstallState) runs the same arch check for a native false->true flip"
  artifacts:
    - path: "src/backend/config.ts"
      provides: "factory default enableSteamNativeInstall: true"
      contains: "enableSteamNativeInstall: true"
    - path: "src/backend/storeManagers/steam/library.ts"
      provides: "delegated-poll lifecycle (long no-manifest window, manifest-gone stop) + refreshInstallState arch catch-up"
      contains: "DELEGATED_NO_MANIFEST_TICKS"
    - path: "src/backend/sidecar/__tests__/steamNativeInstallDefault.test.ts"
      provides: "real-config default/unset/explicit-false persistence pins"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts install()"
      to: "startInstallPolling"
      via: "delegatedToSteamClient: true on both OFF-path call sites"
      pattern: "delegatedToSteamClient: true"
    - from: "pollInstallOnce 'installed' branch / refreshInstallState"
      to: "verifyMacArchGroundTruth"
      via: "fire-and-forget void call, native source only"
      pattern: "void verifyMacArchGroundTruth"
---

<objective>
Action the pending todo `.planning/todos/pending/2026-10-22-steam-direct-download-default-on-and-verify-arch-after-delegated-install.md`:
(1) default "Download Steam games directly in GameLib" (`enableSteamNativeInstall`) to ON;
(2) make a Steam-client-delegated install (`steam://install/{appId}`) get the same Apple-silicon
`verifyMacArchGroundTruth` / i386-recovery offer once its appmanifest reaches FullyInstalled;
(3) replace the 20-tick (60s) no-manifest grace window for delegated polls with a bounded wait that
outlives a real Steam startup + download.

Purpose: on a fresh Apple-silicon Mac, HOARD (63000) was delegated to Mac Steam, which installed
the i386 native build; GameLib's poller gave up after 60s, so the broken copy was never flagged.

Output: code + tests in the files listed in frontmatter; no new settings keys, no new modules.

Out of scope (deferred, mention in SUMMARY): the "stale nonAvailableGames entry" noise
(`Library: 1 owned Steam game(s) silently excluded ... by a stale nonAvailableGames entry: 63000`)
from the end of the todo; and running the arch check for a delegated install that completes while
GameLib is not running (on next launch `refresh()` sets is_installed directly, so no flip is seen —
a boot-time Mach-O sweep would be new boot work under the sidecar exit contract and needs its own
decision).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-10-22-steam-direct-download-default-on-and-verify-arch-after-delegated-install.md

Load `Skill("gamelib-conventions")` before Task 2 (sidecar exit contract: timers unref'd, no
unbounded in-flight work) and before writing any `<verify>` evidence (scoped prettier check).

<interfaces>
Findings from planning (line numbers at HEAD b2f3387ef; re-locate by grep, they drift):

Setting default today:
- src/backend/config.ts ~L394, inside getFactoryDefaults(): `enableSteamNativeInstall: false,`
- getSettings() (~L291) merges `{ ...this.getFactoryDefaults(), ...defaultSettings(on disk), ... }`,
  so a key ABSENT from config.json takes the factory default.
- load(): a profile with no config.json runs resetToDefaults() -> flush(), which writes EVERY factory
  default to disk. setSetting() also flush()es the whole config. Consequence: every profile created
  since the key existed already has an explicit `enableSteamNativeInstall: false` on disk,
  indistinguishable from a user-chosen false.
- src/backend/storeManagers/steam/nativeInstallSetting.ts: `return GlobalConfig.get().getSettings().enableSteamNativeInstall ?? false` (the ONLY backend read seam; docstring says "Defaults to false (opt-in, safety valve) when unset").
- src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx: `useSetting('enableSteamNativeInstall', false)` — the fallback is used when the renderer's settings mirror (configStore 'settings') lacks the key (the "two-store hazard").
- Model harness for a real-config test: src/backend/sidecar/__tests__/dismissedSignInNoticesSetting.test.ts (launch() via jest.isolateModules over a disposable per-file profile; writeProfileWithoutKey(); getFactoryDefaults/getSettings/requestAppSettings/setSetting/mirrorSettings).

Poller today (src/backend/storeManagers/steam/library.ts):
- `type PollOptions = { intervalMs?; source?: AcfSource; isNativeHandoff?; skippedDepots? }` (~L89)
- activePolls entry fields: timer, ticks, seenDownloading, notifiedWaiting, stalledTicks, isNativeHandoff, skippedDepots, notifiedDepotSkipped (~L1850-1905)
- `const GRACE_TICKS = 20` (~L1907), `const MAX_TICKS = 7200` (≈6h ceiling)
- pollInstallOnce(appId, source) (~L2431): 'downloading' sets poll.seenDownloading; 'installed' updates library, notifies, calls stopInstallPolling(appId), then `if (isMac && source === 'native') void verifyMacArchGroundTruth(appId, result.installPath!, source)` (~L2698); 'absent' is a no-op.
- startInstallPolling(appId, number | PollOptions) (~L2732): setInterval callback -> MAX_TICKS cap -> pollInstallOnce -> grace branch `!entry.seenDownloading && entry.ticks >= GRACE_TICKS && !isNativeInstallInFlight(appId)` logs "stopped after grace window", sends gameStatusUpdate {appName, runner:'steam', status:'done'}, stops. Timer is `timer.unref?.()`-ed. An existing entry is idempotent except the isNativeHandoff upgrade branch.
- verifyMacArchGroundTruth(appId, installPath, source) (~L1702): self-gates on source==='native', isMac, and cached mac_arch==='32' / mac_arch_verified===true; on an i386 verdict persists '32' then `void promptI386Recovery(appId)` (dialog.showMessageBox).
- SteamLibraryManager.refreshInstallState() (~L1379): focus-driven (D-01) diff of buildInstalledMap()/bottle/bridge maps; for each changed entry computes `source: AcfSource` and `installedData.installPath`, sets library, persists, pushGameToLibrary.

Delegation call sites (src/backend/storeManagers/steam/games.ts install()):
- ~L1308 bottled Steam dispatch: `startInstallPolling(this.appId, { source: 'bottle' })`
- ~L1338 steam://install: `startInstallPolling(this.appId)` after `shell.openExternal(url)`
- games.test.ts ~L2713 asserts `expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID)`; ~L4304 asserts `expect.objectContaining({ source: 'bottle' })`.

Existing tests to keep green: library.test.ts `describe('startInstallPolling() idempotency and stopInstallPolling()')` (~L4986) — CR-01 test (bare poll emits 'done' after 21 ticks), Test A / Test B (260822-dkf). These use bare/non-delegated polls and must keep passing UNCHANGED. verifyMacArchGroundTruth fixtures: library.test.ts ~L6353 (envMock.isMac, readdirSync -> MacOS dir, execFileSync 'lipo' -> 'i386\n', steamMetadataStore.get/set mocks, dialog.showMessageBox mocked to {response:1}, flushAsync()).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Default enableSteamNativeInstall to ON, respecting a persisted false</name>
  <files>src/backend/config.ts, src/backend/storeManagers/steam/nativeInstallSetting.ts, src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx, src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts, src/backend/sidecar/__tests__/steamNativeInstallDefault.test.ts</files>
  <behavior>
    - nativeInstallSetting.test.ts: unset (`{}`) now returns true; explicit true -> true; explicit false -> false (the existing "default OFF" case is rewritten, not deleted).
    - steamNativeInstallDefault.test.ts (new, cloned from the dismissedSignInNoticesSetting.test.ts harness): (a) getFactoryDefaults().enableSteamNativeInstall === true; (b) a fresh profile (no config.json) reads true from getSettings() and requestAppSettings(); (c) a profile written WITHOUT the key reads true; (d) a profile whose config.json defaultSettings holds enableSteamNativeInstall:false reads false, and still reads false after a second launch(); (e) setSetting(false) on a default profile survives a simulated restart as false in both config.json and the settings mirror.
  </behavior>
  <action>
Decision (state it verbatim in the SUMMARY): the factory default becomes true. Unset/absent key -> ON (fresh profiles, and pre-key profiles that were never flushed). A persisted false is ALWAYS respected — because load()/resetToDefaults() and every setSetting() flush the whole config, profiles created while the factory default was false carry an explicit false that cannot be told apart from a user's choice, so they stay OFF until the user flips the toggle once. No migration, no new marker key (a migration would override real user choices — violates the todo's constraint).

1. src/backend/config.ts getFactoryDefaults(): change `enableSteamNativeInstall: false` to `true`. Touch nothing else in that object.
2. nativeInstallSetting.ts: change the `?? false` fallback to `?? true` and rewrite the module docstring's "Defaults to false (opt-in, safety valve) when unset" to say it defaults to ON per quick 261024-exo, an explicit false is respected, and the steam://install path remains the OFF safety valve. Keep the module exporting ONLY isSteamNativeInstallEnabled (an existing D-03 test pins the export list).
3. EnableSteamNativeInstall.tsx: change the useSetting fallback from false to true so the renderer agrees with the backend when the settings mirror lacks the key (two-store hazard). Leave the label/help i18n strings unchanged.
4. Update nativeInstallSetting.test.ts per behavior; write steamNativeInstallDefault.test.ts by copying the dismissedSignInNoticesSetting.test.ts harness (same mocks, same launch()/writeProfile helpers, same per-file profile + beforeEach cleanup); add a writeProfileWithExplicitFalse helper writing `{ version: 'v0', defaultSettings: { language: 'en', enableSteamNativeInstall: false } }`. The harness spawns no child process, so createFakeHomeProfile() is not required — do not add an env literal.
5. Run the sidecar settings/install suites that mock this key explicitly (settingsFlows, installFlows) to confirm they are unaffected; if any steam/__tests__ suite relied on the unset->false default via a real GlobalConfig, fix that fixture by setting the value explicitly (never by reverting the default).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts src/backend/sidecar/__tests__/steamNativeInstallDefault.test.ts src/backend/sidecar/__tests__/settingsFlows.test.ts src/backend/sidecar/__tests__/installFlows.test.ts src/backend/sidecar/__tests__/dismissedSignInNoticesSetting.test.ts && npx prettier --check src/backend/config.ts src/backend/storeManagers/steam/nativeInstallSetting.ts src/frontend/screens/Settings/components/EnableSteamNativeInstall.tsx src/backend/storeManagers/steam/__tests__/nativeInstallSetting.test.ts src/backend/sidecar/__tests__/steamNativeInstallDefault.test.ts</automated>
  </verify>
  <done>Factory default is true; unset reads true on both backend and renderer fallback; explicit false persists across restart; all listed suites green; prettier clean on the five paths (all five report ignored:false — checked at planning time for the four existing ones; check the new test file with --file-info before relying on it).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Delegated-install poller waits for the real install, with a bounded cancel story</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/library.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts</files>
  <behavior>
    New tests in library.test.ts, inside the existing `startInstallPolling() idempotency and stopInstallPolling()` describe (reuse its beforeEach/afterEach, fake timers, interval 10, isNativeInstallInFlight spy pattern set to false):
    - D1: `startInstallPolling('730', { intervalMs: 10, delegatedToSteamClient: true })` with existsSync always false -> after 21 ticks NO gameStatusUpdate 'done' and ticks keep happening (existsSync call count keeps growing, same proof style as Test A); after DELEGATED_NO_MANIFEST_TICKS + 1 ticks it DOES emit 'done' and stops.
    - D2: delegated poll sees a 'downloading' manifest (StateFlags 1026, readFileSync fixture like the existing downloading tests) for a few ticks, then existsSync flips false -> after MANIFEST_GONE_TICKS consecutive absent ticks emits 'done' and stops; a single absent tick between downloading ticks does NOT stop it (counter resets).
    - D3: delegated poll that goes absent -> downloading -> installed stops via the normal 'installed' branch (pushGameToLibrary + 'done'), never via the gone/no-manifest branches.
    - Existing CR-01, Test A, Test B stay unchanged and green (non-delegated polls keep the 20-tick grace).
    - games.test.ts: steam://install path asserts `toHaveBeenCalledWith(APP_ID, { delegatedToSteamClient: true })`; the bottled-dispatch assertion becomes `expect.objectContaining({ source: 'bottle', delegatedToSteamClient: true })`.
  </behavior>
  <action>
Implements todo item 3. All new behaviour is gated on a new per-poll provenance flag so the native-handoff and resumeInterruptedSteamInstall polls (and their 260822-dkf / CR-01 pins) are untouched.

1. library.ts PollOptions: add optional `delegatedToSteamClient?: boolean` with a docstring: true only when Steam (native steam://install, or the bottled Steam client's tellBottledSteamToInstall dispatch) owns the download, so GameLib must wait for Steam to start/self-update/log in and for the user to confirm Steam's dialog before any appmanifest exists.
2. activePolls entry: add `delegatedToSteamClient: boolean` and `absentTicksSinceSeen: number` (docstrings in the existing style). Parse the flag in startInstallPolling's options destructure (bare-number form -> false). Include it in the "starting install polling" log line. The idempotent existing-entry branch: if a call with delegatedToSteamClient:true hits an existing entry, set the flag true (never downgrade), mirroring the isNativeHandoff upgrade — log it.
3. Constants next to GRACE_TICKS: `DELEGATED_NO_MANIFEST_TICKS = 600` (≈30 min at 3 000 ms: covers a fresh-Mac Steam self-update + login + the user's time on Steam's install dialog) and `MANIFEST_GONE_TICKS = 10` (≈30 s of consecutive absence after a manifest was seen = Steam-side cancel/uninstall; tolerant of Steam briefly rewriting the acf). MAX_TICKS (≈6 h) stays the absolute ceiling for every poll.
4. pollInstallOnce: in the 'downloading' branch reset `poll.absentTicksSinceSeen = 0`; in the 'absent' branch, if `poll?.seenDownloading` increment it. No other change to pollInstallOnce in this task.
5. startInstallPolling setInterval callback, after the `!activePolls.has(appId)` return: when `entry.delegatedToSteamClient` is true, replace the GRACE_TICKS branch with: (a) `!entry.seenDownloading && entry.ticks >= DELEGATED_NO_MANIFEST_TICKS` -> logWarning naming the window ("no manifest after N ticks; Steam install dialog likely cancelled or Steam never started"), send gameStatusUpdate {appName, runner:'steam', status:'done'}, stopInstallPolling; (b) `entry.seenDownloading && entry.absentTicksSinceSeen >= MANIFEST_GONE_TICKS` -> logWarning ("manifest disappeared after appearing; install cancelled or removed in Steam"), same 'done' + stop. When false, keep the existing GRACE_TICKS / 260822-dkf branches byte-for-byte. Update startInstallPolling's JSDoc "Stops automatically when" list with the two delegated rules.
   Exit-contract check (gamelib-conventions, sidecar section): the interval is already `timer.unref?.()`-ed and each tick's work is a bounded local ACF read; no new handle, socket or network call is introduced. A longer-lived poll therefore cannot hold the event loop past stdin EOF; app quit tears it down with the process. Note this in a comment near the constants.
6. games.ts install(): steam://install call site -> `startInstallPolling(this.appId, { delegatedToSteamClient: true })`; bottled dispatch call site -> `startInstallPolling(this.appId, { source: 'bottle', delegatedToSteamClient: true })`. Update the adjacent comments (WR-01's "~60s of false installing state" note stays accurate for a failed dispatch since no poller is started). Do NOT add the flag to the native depot handoff calls (~L2191/2197) or resumeInterruptedSteamInstall.
7. Update games.test.ts assertions per behavior; write D1-D3 in library.test.ts.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts</automated>
  </verify>
  <done>Delegated polls no longer give up at 60s; they stop on installed, on 30 min with no manifest ever, on 10 consecutive absent ticks after a manifest was seen, or at MAX_TICKS; non-delegated polls behave exactly as before (CR-01, Test A, Test B unchanged and green); both OFF-path call sites pass delegatedToSteamClient:true.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Apple-silicon arch check after a delegated install completes (poll path + focus catch-up)</name>
  <files>src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    - E1 (poll path, end-to-end): envMock.isMac=true; `startInstallPolling(APP_ID, { intervalMs: 10, delegatedToSteamClient: true })`; ACF fixture goes absent -> downloading (1026) -> installed (StateFlags 4, installdir pointing at an install path whose `<Name>.app/Contents/MacOS` dir holds one binary); execFileSync 'lipo' -> 'i386\n'; steamMetadataStore.get returns an entry with no mac_arch_verified. After advancing timers + flushAsync: steamMetadataStore.set called with mac_arch '32' and dialog.showMessageBox called once (promptI386Recovery offered). Leave the dialog mocked to cancel ({response:1}).
    - E2 (gating): same as E1 with envMock.isMac=false -> no execFileSync, no dialog. Same with source 'bottle' delegated poll -> no execFileSync, no dialog.
    - E3 (focus catch-up): no active poll; library entry is_installed:false; buildInstalledMap fixture now reports the appId installed natively; envMock.isMac=true + i386 fixture -> refreshInstallState() flips the badge AND the dialog is offered once.
    - E4 (no double prompt): same as E3 but with an active install poll registered for that appId (startInstallPolling with a long interval) -> refreshInstallState() flips the badge but does NOT call execFileSync/dialog (the poll owns the check).
  </behavior>
  <action>
Implements todo item 2. The pollInstallOnce 'installed' branch already calls verifyMacArchGroundTruth for source 'native' on macOS (MAC32-03, ~L2698) — the HOARD miss was the poller dying before the manifest appeared (fixed by Task 2), not a missing call. This task (a) pins that the delegated steam://install poll reaches that call end-to-end, and (b) adds the bounded catch-up for a delegated install that completes after its poll stopped (no-manifest window or MAX_TICKS expired while the app stayed open).

1. Do NOT change the gating of the existing pollInstallOnce call (same gating as today: isMac && source === 'native'; verifyMacArchGroundTruth self-gates again on source/isMac/cached verdict). If E1 reveals the delegated path cannot reach it (e.g. installPath undefined from readAcfState), fix the root cause in readAcfState's installed branch rather than loosening the gate.
2. SteamLibraryManager.refreshInstallState(): inside the `gameInfo.is_installed !== isNowInstalled` block, AFTER library.set / steamLibraryStore.set / sendFrontendMessage (so the badge flip is never delayed), add: when `isNowInstalled && source === 'native' && isMac && !activePolls.has(appIdStr)` -> `void verifyMacArchGroundTruth(appIdStr, installedData.installPath, 'native')`. The activePolls guard prevents a double prompt when a live poll will run the same check on its next tick. Comment it as quick 261024-exo, explaining it is the arch-check backstop for a delegated install whose poll already stopped, that it is fire-and-forget like MAC32-03, and that verifyMacArchGroundTruth's cached-verdict early return makes repeat focus events cheap.
3. Write E1-E4 in library.test.ts. Reuse the verifyMacArchGroundTruth describe's fixture style (envMock, readdirSync MacOS listing, existsSync, execFileSync lipo, steamMetadataStore mocks, dialog mock, flushAsync) and the refreshInstallState describe's manager/buildInstalledMap fixture style (~L1731). Reset envMock.isMac to false and stop any started polls in afterEach.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/__tests__/library.test.ts</automated>
  </verify>
  <done>E1-E4 green; a delegated native install on macOS that reaches FullyInstalled gets the Mach-O ground-truth check and the i386 recovery offer whether the poll or focus reconciliation observes completion, with no double prompt; tsc (pnpm codecheck) clean; prettier clean on both paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam client -> appmanifest_*.acf on disk | Steam (an external process) writes the ACF GameLib polls; content is parsed, not trusted |
| installed game files -> lipo/file Mach-O probe | verifyMacArchGroundTruth runs execFileSync over a binary inside the install dir |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-exo-01 | Denial of Service | startInstallPolling delegated window | mitigate | DELEGATED_NO_MANIFEST_TICKS / MANIFEST_GONE_TICKS / MAX_TICKS bounds; interval stays `unref?.()`-ed; per-tick work is a local ACF read (sidecar exit contract half 1 and 2) |
| T-exo-02 | Tampering | ACF parse in readAcfState | accept | Unchanged code path; corrupt manifests already skipped without throwing (T-2-01) |
| T-exo-03 | Elevation of Privilege | Mach-O probe path from refreshInstallState | mitigate | Reuses verifyMacArchGroundTruth/locateMachOBinary unchanged (existing traversal guards pinned by tests at ~L6333/6347); execFileSync with argv, no shell |
| T-exo-04 | Repudiation/UX | Settings default flip | accept | Explicit persisted false is respected; no migration rewrites a user's choice |
</threat_model>

<verification>
- `npx jest src/backend/storeManagers/steam/__tests__ src/backend/sidecar/__tests__/steamNativeInstallDefault.test.ts src/backend/sidecar/__tests__/settingsFlows.test.ts src/backend/sidecar/__tests__/installFlows.test.ts` green.
- `pnpm codecheck` clean.
- `npx prettier --check` over all nine files in files_modified clean.
- `pnpm lint` (scoped) clean if the executor's environment runs it in reasonable time.
</verification>

<success_criteria>
- Fresh profile: toggle shows ON and installs use GameLib's depot download (existing D-13 branch).
- Explicit false on disk: stays OFF across restart.
- Delegated steam://install on macOS: poll survives Steam startup + download; on FullyInstalled the i386 check and recovery offer run; poll stops on cancel signals and the ceiling.
- Deferred items (nonAvailableGames noise; arch check for installs completed while GameLib was closed) recorded in the SUMMARY.
</success_criteria>

<output>
Create `.planning/quick/261024-exo-default-steam-direct-download-on-verify/261024-exo-SUMMARY.md` when done.
</output>
