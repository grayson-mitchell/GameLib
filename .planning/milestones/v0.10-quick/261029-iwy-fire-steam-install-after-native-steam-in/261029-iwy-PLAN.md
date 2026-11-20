---
phase: quick-261029-iwy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/backend/storeManagers/steam/runningSteamSync.ts
  - src/backend/storeManagers/steam/__tests__/runningSteamSync.test.ts
  - src/common/types.ts
  - src/backend/storeManagers/steam/library.ts
  - src/backend/storeManagers/steam/games.ts
  - src/backend/storeManagers/steam/__tests__/library.test.ts
  - src/frontend/hooks/constants.ts
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
  - src/frontend/screens/Game/GameContext.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamSyncing.test.tsx
  - src/frontend/screens/Library/components/GameCard/constants.ts
  - src/frontend/screens/Library/components/GameCard/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts
  - src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx
  - src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts
  - src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx
  - src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx
  - public/locales/en/gamepage.json
autonomous: false
requirements: [QUICK-261029-iwy]

must_haves:
  truths:
    - "On macOS, a native depot install that finishes while Mac Steam is running fires `open -g steam://install/<appId>` exactly once and Steam adopts the install with no restart"
    - "While Steam adopts, the library GameCard, the game page status line and the Downloads hero all read 'Syncing Steam', and Play is disabled"
    - "A Steam repair pass (StateFlags 1026 with live BytesDownloaded/BytesToDownload) renders as Syncing Steam (with a percent when BytesToDownload > 0), never as 'Restart Steam to finish'"
    - "GameLib's own StateFlags 4 ACF never counts as sync-complete; only an ACF that differs from the post-write baseline AND has bit 4 AND buildid != '0' does"
    - "If Steam does not adopt within the bounded window, GameLib falls back to today's behaviour (the 'Restart Steam to finish' toast/hint)"
    - "With Mac Steam not running, and on Windows/Linux/bottle/bridge routes, behaviour is byte-for-byte unchanged"
  artifacts:
    - path: "src/backend/storeManagers/steam/runningSteamSync.ts"
      provides: "Pure sync-complete classifier + injectable async sync driver"
      exports: ["classifySteamSyncTick", "syncRunningMacSteam", "STEAM_SYNC_IDLE_TIMEOUT_MS", "STEAM_SYNC_MAX_MS"]
    - path: "src/backend/storeManagers/steam/__tests__/runningSteamSync.test.ts"
      provides: "Predicate + driver tests (placeholder, own-4, Steam-4, 1026 repair, timeout, abort)"
    - path: "src/common/types.ts"
      provides: "'steam-syncing' Status member"
      contains: "'steam-syncing'"
  key_links:
    - from: "src/backend/storeManagers/steam/games.ts (runNativeDepotDownload)"
      to: "syncRunningMacSteam"
      via: "awaited after lease.release(), before the native isNativeHandoff startInstallPolling"
      pattern: "syncRunningMacSteam\\("
    - from: "src/backend/storeManagers/steam/runningSteamSync.ts"
      to: "spawnOpenDetached in macSteamOffline.ts"
      via: "default deps fireUrl"
      pattern: "spawnOpenDetached"
    - from: "src/backend/storeManagers/steam/library.ts pollInstallOnce 'installed' branch"
      to: "poll.steamAdopted"
      via: "suppresses the 'Restart Steam to finish installing' notify"
      pattern: "steamAdopted"
    - from: "frontend status consumers"
      to: "'steam-syncing'"
      via: "status === 'steam-syncing' mirrors every 'drm-setup' site"
      pattern: "steam-syncing"
---

<objective>
After a native Mac depot install finishes while native Mac Steam is running, fire
`open -g steam://install/<appId>` so the running Steam adopts the files (spikes 047–049), surface a
new `'steam-syncing'` status ("Syncing Steam") everywhere `'drm-setup'` is surfaced, keep Play
disabled until Steam has rewritten the ACF itself, and fall back to today's "Restart Steam to
finish" path on a bounded timeout. Steam not running → unchanged adopt-at-startup behaviour.

Purpose: today a GameLib install done with Steam running is invisible to Steam until a restart
(spike 047: 16+ min ignored). The URL makes it adopt in ~2 s (WazHack) to ~28 s (Civ V 7.7 GB).
Output: new `runningSteamSync.ts` module + tests, backend wiring, frontend status surfaces.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/spikes/047-running-steam-adoption/README.md
@.planning/spikes/048-running-steam-adoption-large/README.md
@.planning/spikes/049-adoption-corrupt-file/README.md

Load `Skill("gamelib-conventions")` before writing any spawn or timer code and before running a
`<verify>` block (prettier rule, fake-HOME rule, sidecar exit contract).

HARD CONSTRAINTS (from the caller):
- Do NOT modify or stage `src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts` or
  `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts` (user's uncommitted edits may be
  present). Importing `isMacSteamRunning` from drmLaunchSetup.ts is fine.
- Commits stage explicit paths only (the paths in files_modified). Never `git add -A` / `git add .`.
- Native Mac Steam route only. Windows/Linux, the bottle route (`tellBottledSteamToInstall`,
  bottle.ts:1157) and the bridge route (`pollerSource: 'bridge'`) must not change.

<interfaces>
Proven ACF sequence after firing the URL (spikes 047–049):
GameLib ACF (StateFlags 4 + real buildid, OR 1026) → Steam overwrites with placeholder
(StateFlags 2 or 18, buildid "0", SizeOnDisk "0") → manifest fetch (~0.7 s/depot) → content-hash
scan (~1.5 s/GB) → [if bad files: StateFlags 1026 with live BytesDownloaded/BytesToDownload] →
Steam's own ACF, StateFlags 4, real buildid. content_log.txt
`AppID <id> scheduler finished : removed from schedule` is optional — NOT used here; the ACF is
the signal.

Existing helpers to reuse (do not hand-roll):
- `isMacSteamRunning(timeoutMs?)` — src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts:175
  (pgrep -x steam_osx via createFakeHomeProfile; resolves boolean, may reject).
- `spawnOpenDetached(url: string): void` — src/backend/storeManagers/steam/macSteamOffline.ts:129
  (`/usr/bin/open -g <url>`, detached, unref'd, real user session env by design, already accepted
  by fakeHomeIsolation.test.ts). Reusing it means this task adds NO new spawn site.
- `isFullyInstalledStateFlags(flags)` — library.ts:1591, `(flags & 4) !== 0`. The new module must
  not import library.ts (heavy graph); replicate the one-line bitmask with a comment pointing at
  library.ts:1591.
- `parse` from `@node-steam/vdf` — how library.ts readAcfState parses ACFs (`parsed.AppState`,
  string fields `StateFlags`, `buildid`, `BytesDownloaded`, `BytesToDownload`).
- `sendGameStatusUpdate` from 'backend/utils' (games.ts:41) and `isMac` (games.ts:45).
- library.ts `PollOptions` (line 106) and the `activePolls` entry type (~line 2014);
  `pollInstallOnce` 'installed' branch restart notify at ~2915–2930 gated on
  `poll?.isNativeHandoff === true && !installerOwnsCompletion && !poll.notifiedWaiting`.
- games.ts `runNativeDepotDownload` (~2738): acquires lease, `try { return await
  this.runNativeDepotDownloadLeased(args, opts, controller, runStart) } finally { lease.release() }`,
  outer finally deletes nativeInstallsInFlight + `deleteAbortController`. The native poll start
  is at ~3026–3037 inside runNativeDepotDownloadLeased; `targetSteamappsDir` is in scope there
  (~2941), so the manifest path is `join(targetSteamappsDir, \`appmanifest_${appId}.acf\`)`.
- Frontend 'drm-setup' sites to mirror: common/types.ts:372; frontend/hooks/constants.ts:86;
  state/GlobalState.tsx:305 (sleep kind) and :1546 (status push list);
  DownloadHero/heroModel.ts:91/107 + index.tsx:76; GameCard/constants.ts:35 + index.tsx:292;
  GamePage/index.tsx:198/407; frontend/types.ts:414 (`is.preparingDrm`); GameContext.tsx:17;
  MainButton.tsx:50/94; GameStatus.tsx:98; ConsoleMode LaunchOverlay/index.tsx:157,
  ConsoleCard/index.tsx:28. Locale keys live in public/locales/en/gamepage.json under
  `label.drmSetup` (~283) and `status.drmSetup` (~370).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Sync-complete classifier and sync driver (runningSteamSync.ts, TDD)</name>
  <files>src/backend/storeManagers/steam/runningSteamSync.ts, src/backend/storeManagers/steam/__tests__/runningSteamSync.test.ts</files>
  <behavior>
    classifySteamSyncTick({ baseline, current, nowMs, startedAtMs, lastChangeAtMs }) where baseline/current are `AcfSnapshot | null` = `{ mtimeMs: number; content: string }`:
    - current identical to baseline (same content and mtimeMs), GameLib's own StateFlags 4 + real buildid → `{ kind: 'syncing' }` (own 4 is NOT complete)
    - current differs, placeholder StateFlags 2 / 18, buildid "0" → syncing
    - current differs, StateFlags 4 but buildid "0" → syncing
    - current differs, StateFlags 4 (and e.g. 6 — bitmask) with buildid "9044149" → `{ kind: 'adopted' }`
    - current differs only by mtimeMs but content equal and bit 4 + real buildid → adopted (Steam rewrote the same bytes)
    - current differs, StateFlags 1026, BytesDownloaded 30, BytesToDownload 120 → `{ kind: 'syncing', percent: 25 }` (rounded, clamped 0–100); BytesToDownload 0 → syncing with no percent
    - current null (ACF briefly absent during Steam's rewrite) → syncing, until timeouts
    - nowMs - lastChangeAtMs >= STEAM_SYNC_IDLE_TIMEOUT_MS (120000) and not adopted → `{ kind: 'timeout' }`
    - nowMs - startedAtMs >= STEAM_SYNC_MAX_MS (30 min) → timeout even while the ACF keeps changing
    - unparseable content → syncing (never throws)
    syncRunningMacSteam(appId, manifestPath, deps) driver with fake deps (readSnapshot, fireUrl, emit, now, sleep, signal):
    - baseline null → returns 'skipped' and never calls fireUrl
    - fires `steam://install/<appId>` exactly once, AFTER reading the baseline
    - emits status 'steam-syncing' immediately after firing, and again per tick with context `"<n>%"` when a percent exists (else '')
    - resets the idle clock whenever the snapshot changes vs the previous tick (so a long repair whose bytes keep moving does not time out)
    - returns 'adopted' on the adopted tick; 'timeout' on timeout; 'aborted' when signal aborts mid-loop
  </behavior>
  <action>
    Write the test file first (RED), mirroring the plain-jest style of neighbouring
    `src/backend/storeManagers/steam/__tests__/*.test.ts`; build ACF fixture strings with a tiny
    local helper producing a valid `"AppState" { "appid" ... "StateFlags" ... "buildid" ... }` VDF.
    No real fs, no real spawn, no real timers: the driver is tested purely through injected deps
    (fake clock advancing in `sleep`), so no child process is spawned by the test and the
    fake-HOME rule is not triggered.

    Then implement `src/backend/storeManagers/steam/runningSteamSync.ts` (GREEN):
    - Export `AcfSnapshot`, `SteamSyncTick` (`{kind:'adopted'} | {kind:'syncing'; percent?: number} | {kind:'timeout'}`),
      constants `STEAM_SYNC_TICK_MS = 1000`, `STEAM_SYNC_IDLE_TIMEOUT_MS = 120_000`,
      `STEAM_SYNC_MAX_MS = 30 * 60_000` (generous: Civ V 7.7 GB took ~28 s; a repair re-download
      keeps resetting the idle clock; the hard cap guarantees Play is never disabled forever).
    - `classifySteamSyncTick` exactly per the behavior block. Adopted predicate = current !== null
      AND (current.content !== baseline.content OR current.mtimeMs !== baseline.mtimeMs) AND
      `(StateFlags & 4) !== 0` AND buildid is a non-empty string !== "0". The baseline
      differs-check plus Steam's buildid-"0" placeholder is what makes GameLib's own pre-written 4
      unable to satisfy it (critical design constraint). Percent only when `(StateFlags & 1024)`
      or simply BytesToDownload > 0 — use BytesToDownload > 0 and finite.
    - `syncRunningMacSteam(appId, manifestPath, deps?: Partial<SteamSyncDeps>): Promise<'adopted'|'timeout'|'aborted'|'skipped'>`.
      Default deps: `readSnapshot` = `statSync(path).mtimeMs` + `readFileSync(path,'utf-8')`,
      returning null on any error; `fireUrl` = `spawnOpenDetached` imported from `./macSteamOffline`;
      `emit` = `sendGameStatusUpdate({ appName, runner: 'steam', status: 'steam-syncing', context })`
      (needs the Status member from Task 2 — add `'steam-syncing'` to `Status` in
      src/common/types.ts in THIS task if needed for the typecheck; Task 2 lists it too);
      `now` = Date.now; `sleep` = a setTimeout promise whose timer is `unref()`ed (sidecar exit
      contract: no handle may hold the loop past stdin EOF; the loop is bounded by STEAM_SYNC_MAX_MS
      so it is not unbounded in-flight work). Log fire / adopted / timeout with `logInfo` /
      `logWarning` and `LogPrefix.Steam`, including elapsed ms.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/backend/storeManagers/steam/__tests__/runningSteamSync.test.ts && npx tsc --noEmit && npx prettier --check src/backend/storeManagers/steam/runningSteamSync.ts src/backend/storeManagers/steam/__tests__/runningSteamSync.test.ts</automated>
  </verify>
  <done>All behavior cases pass; GameLib's own unchanged 4 classifies as syncing; Steam's rewritten 4 with real buildid classifies as adopted; 1026 with bytes yields a percent; idle and max timeouts return 'timeout'; tsc and prettier clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the sync into the native Mac install finish and suppress the restart toast on adoption</name>
  <files>src/common/types.ts, src/backend/storeManagers/steam/library.ts, src/backend/storeManagers/steam/games.ts, src/backend/storeManagers/steam/__tests__/library.test.ts</files>
  <behavior>
    - library.test.ts: a native isNativeHandoff poll started with `steamAdopted: true` that reads an installed ACF sends 'done', fires "Installation Finished", and does NOT fire 'Restart Steam to finish installing'
    - library.test.ts: the same poll without steamAdopted still fires the restart notify (existing behaviour locked)
    - library.test.ts: an already-registered poll upgraded by a second startInstallPolling call carrying steamAdopted adopts it (same pattern as the 260822-dkf isNativeHandoff upgrade)
  </behavior>
  <action>
    1. src/common/types.ts: add `| 'steam-syncing'` to `Status` next to `'drm-setup'` (if not
       already added in Task 1). Fix any exhaustive switch the compiler flags (e.g.
       GlobalState.tsx classifySleepAssertionKind is frontend — Task 3 owns it; if tsc fails there
       before Task 3, add the `case 'steam-syncing':` to the `'system'` group now and leave the
       file for Task 3's remaining edits).
    2. library.ts: add `steamAdopted?: boolean` to `PollOptions` and `steamAdopted: boolean` to the
       activePolls entry (default false; docstring: true only when runningSteamSync observed Steam
       rewrite the ACF, quick 261029-iwy). Thread it in startInstallPolling's creation path and its
       existing upgrade-an-already-registered-poll path. In pollInstallOnce: add
       `&& !poll.steamAdopted` to the 'installed' branch restart-notify condition, and AND
       `poll?.steamAdopted !== true` into `isWaitingForSteamRestart` in the 'downloading' branch.
       Nothing else in library.ts changes; bottle/bridge/OFF-path logic stays identical.
    3. games.ts runNativeDepotDownloadLeased (~3026–3037): ONLY for the branch with no
       `opts.pollerSource` AND `isMac`, do not call startInstallPolling there; instead hand the
       caller a deferred handoff `{ manifestPath: join(targetSteamappsDir, \`appmanifest_${this.appId}.acf\`), skippedDepots: outcome.skippedDepots ?? [] }`
       through a private mechanism (an out-parameter object passed from runNativeDepotDownload, or
       a private wrapper return type) — the shared `InstallResult` type must not gain a field.
       Non-mac and pollerSource branches stay byte-for-byte as they are.
    4. games.ts runNativeDepotDownload: restructure the lease block so the leased result is
       captured, `lease.release()` runs (so Mac Steam's go-offline wrap is restored before Steam is
       asked to fetch manifests), and THEN, still inside the outer try (so nativeInstallsInFlight
       and the abort controller are still registered and a concurrent installer joins the whole
       thing), if a deferred handoff exists and result.status === 'done':
       `const running = await isMacSteamRunning().catch(() => false)` via dynamic
       `await import('./bridge/drm/drmLaunchSetup')` (same lazy-import style as
       `./bridge/sharedRedistInstall` at games.ts ~2430; do NOT edit drmLaunchSetup.ts). If running,
       `const outcome = await syncRunningMacSteam(this.appId, handoff.manifestPath, { signal: controller.signal })`.
       Then always start the poll exactly as today:
       `startInstallPolling(this.appId, { isNativeHandoff: true, skippedDepots: handoff.skippedDepots, ...(outcome === 'adopted' ? { steamAdopted: true } : {}) })`.
       So: not running / 'skipped' / 'timeout' / 'aborted' → today's behaviour (restart hint);
       'adopted' → the poll reads Steam's own 4 and emits 'done' + Installation Finished with no
       restart toast. The download queue keeps this install's slot during the sync, which is what
       lets the Downloads hero show the phase (same mechanism as the bridge tail, quick 261029-exu).
       Add a comment block citing spikes 047–049 and quick 261029-iwy.
    Write the library.test.ts cases first using the file's existing mocks for notify /
    sendFrontendMessage / readAcfState fixtures.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/backend/storeManagers/steam/__tests__/library.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/storeManagers/steam/__tests__/runningSteamSync.test.ts src/backend/__tests__/fakeHomeIsolation.test.ts && npx tsc --noEmit && npx prettier --check src/common/types.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts && ! git diff --cached --name-only | grep -E 'bridge/drm/(drmLaunchSetup|stageDrmBottle)\.ts'</automated>
    <note>Before committing, stage only this task's four paths explicitly (git add -- src/common/types.ts src/backend/storeManagers/steam/library.ts src/backend/storeManagers/steam/games.ts src/backend/storeManagers/steam/__tests__/library.test.ts); the negated grep above must find neither drm file in the index</note>
  </verify>
  <done>New and existing library/games tests pass; fakeHomeIsolation gate green (no new spawn site); tsc and prettier clean; this task's diff touches neither drmLaunchSetup.ts nor stageDrmBottle.ts; non-mac and bottle/bridge poll starts unchanged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: "Syncing Steam" in GameCard, game page, Downloads hero and Console mode; Play disabled</name>
  <files>src/frontend/hooks/constants.ts, src/frontend/state/GlobalState.tsx, src/frontend/types.ts, src/frontend/screens/Game/GameContext.tsx, src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/Game/GamePage/components/MainButton.tsx, src/frontend/screens/Game/GamePage/components/GameStatus.tsx, src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamSyncing.test.tsx, src/frontend/screens/Library/components/GameCard/constants.ts, src/frontend/screens/Library/components/GameCard/index.tsx, src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts, src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx, src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts, src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx, src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx, public/locales/en/gamepage.json</files>
  <behavior>
    - heroModel.test.ts: heroPhase({status:'steam-syncing', context:''}) → {kind:'steam-syncing', context:''}; with context '42%' → context '42%'; existing redist/drm-setup/finishing cases unchanged
    - MainButton.steamSyncing.test.tsx (same no-jsdom pattern + shared faithful i18n mock as MainButton.bridgeFinishing.test.tsx): with is.syncingSteam true and the game installed, the Play button is disabled and its label is the catalog "Syncing Steam" value
  </behavior>
  <action>
    Mirror every 'drm-setup' site with 'steam-syncing' (user-visible text "Syncing Steam"; the
    `context` carries an optional percent like "42%"):
    - public/locales/en/gamepage.json: add `label.steamSyncing` = "Syncing Steam" next to
      `label.drmSetup`, and `status.steamSyncing` = "Syncing Steam" plus
      `status.steamSyncingProgress` = "Syncing Steam ({{progress}})" next to `status.drmSetup`
      (keep alphabetical-ish placement used by siblings). This file is prettier-ignored (measured
      `{ "ignored": true }`) — no prettier check for it.
    - hooks/constants.ts statusMap: `'steam-syncing'` → statusContext ?
      `t('gamepage:status.steamSyncingProgress', 'Syncing Steam ({{progress}})', { progress })` :
      `t('gamepage:status.steamSyncing', 'Syncing Steam')`.
    - GlobalState.tsx: `case 'steam-syncing':` in the `'system'` group of
      classifySleepAssertionKind (if not already done in Task 2) and add `'steam-syncing'` to the
      status push list at ~1546.
    - heroModel.ts: add `{ kind: 'steam-syncing'; context: string }` to HeroPhase and map it in
      heroPhase. DownloadHero/index.tsx phaseLabel: same two-key label as constants.ts (phase keeps
      the indeterminate bar — the percent is in the label text).
    - GameCard/constants.ts: `isSyncingSteam = status === 'steam-syncing'` added to `haveStatus`
      like isPreparingDrm; GameCard/index.tsx: add `'steam-syncing'` to the Play-disabled list.
    - frontend/types.ts `is.syncingSteam: boolean`; GameContext.tsx default `syncingSteam: false`;
      GamePage/index.tsx `isSyncingSteam = status === 'steam-syncing'` and pass `syncingSteam`.
    - MainButton.tsx: `is.syncingSteam` in disabledPlayButtons and getPlayLabel returns
      `t('label.steamSyncing', 'Syncing Steam')` right after the preparingDrm branch.
      GameStatus.tsx: a spinner line exactly like the preparingDrm block using the status label.
    - ConsoleMode LaunchOverlay `case 'steam-syncing':` label and ConsoleCard busy-status set entry.
    Note: during sync the backend never emits 'steam-waiting-for-restart', so a 1026 repair pass
    can only render as Syncing Steam; do not touch the existing restart-hint branches.
    Run labelSuiteI18nCensus / statusLabel tests to confirm the new keys resolve in the catalog.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm jest src/frontend/screens/DownloadManager/components/DownloadHero src/frontend/screens/Game/GamePage/components/__tests__ src/frontend/hooks/__tests__ && npx tsc --noEmit && npx prettier --check src/frontend/hooks/constants.ts src/frontend/state/GlobalState.tsx src/frontend/types.ts src/frontend/screens/Game/GameContext.tsx src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Game/GamePage/components/MainButton.tsx src/frontend/screens/Game/GamePage/components/GameStatus.tsx src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamSyncing.test.tsx src/frontend/screens/Library/components/GameCard/constants.ts src/frontend/screens/Library/components/GameCard/index.tsx src/frontend/screens/DownloadManager/components/DownloadHero/heroModel.ts src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx src/frontend/screens/DownloadManager/components/DownloadHero/__tests__/heroModel.test.ts src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx src/frontend/screens/ConsoleMode/components/ConsoleCard/index.tsx && pnpm codecheck</automated>
  </verify>
  <done>Every 'drm-setup' frontend site has a 'steam-syncing' twin; heroModel and MainButton tests pass; i18n census green; tsc/codecheck and scoped prettier clean (gamepage.json noted as prettier-ignored, not checked).</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 4: Live check — WazHack (264160) with Mac Steam running</name>
  <action>Pause for the operator to run the live check below; Claude does not drive the live UI.</action>
  <what-built>Running-Steam adoption after a native Mac install, with a "Syncing Steam" state and the restart-hint fallback.</what-built>
  <how-to-verify>
    Memory: `tauri dev` does NOT rebuild the sidecar. Quit any running dev instance, then start
    fresh with `pnpm tauri:dev` (its `tauri:dev:run` runs `pnpm build:sidecar`) and confirm
    `build/main/sidecar.js` mtime is newer than this task's commits before testing.
    1. Mac Steam running and signed in; WazHack (264160) Uninstalled in Steam and in GameLib.
    2. In GameLib, install WazHack via the native route. Keep the Downloads view open.
    3. Expected: after the depot download, the Downloads hero, the library tile and the game page
       read "Syncing Steam"; Play is disabled. Steam shows only an install toast (no dialog, no
       restart; same steam_osx PID: `pgrep -x steam_osx` before/after).
    4. Within a few seconds: "Installation Finished", Play enabled, NO "Restart Steam to finish"
       toast; Steam's library lists WazHack as installed. In
       `~/Library/Application Support/Steam/steamapps/appmanifest_264160.acf` StateFlags is 4 with
       a non-zero buildid, and the sidecar log shows the fire + adopted lines with elapsed ms.
    5. Optional repair arm (spike 049 shape): uninstall in GameLib, start the native install with
       Steam QUIT, and after the download completes but before relaunching Steam, overwrite one
       game file in place with same-size garbage (`dd if=/dev/urandom of=<file> bs=<size> count=1 conv=notrunc`);
       launch Steam, then trigger the sync by reinstalling/repairing in GameLib with Steam running.
       Expected: while the ACF shows StateFlags 1026 with BytesDownloaded moving, the tile reads
       "Syncing Steam (NN%)" — never "Restart Steam to finish" — then Installation Finished.
       Skip this arm if GameLib offers no repair entry point for an already-installed native game.
    6. Control: quit Mac Steam, uninstall and reinstall WazHack in GameLib — behaviour is the old
       one (Restart Steam to finish hint), no `open` fired (log).
  </how-to-verify>
  <resume-signal>Type "approved" or describe what differed (which step, what was shown)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| GameLib sidecar → LaunchServices / Mac Steam | GameLib fires a steam:// URL into the user's running Steam |
| Steam-written ACF → GameLib | GameLib parses a file another process rewrites concurrently |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iwy-01 | Tampering | steam:// URL construction | mitigate | appId comes from the install's own numeric `this.appId`; URL is `steam://install/${appId}` only, passed as a single argv element to `/usr/bin/open -g` via existing spawnOpenDetached (no shell) |
| T-iwy-02 | Spoofing | sync-complete predicate | mitigate | complete requires baseline-differs AND bit 4 AND buildid != "0", so GameLib's own pre-written 4 cannot mark adoption (unit-tested) |
| T-iwy-03 | Denial of Service | sync loop | mitigate | idle timeout 120 s + hard cap 30 min, abort signal honoured, unref'd timers; fallback is today's restart hint, so Play is never disabled forever |
| T-iwy-04 | Tampering | ACF parse | mitigate | read/parse errors return null/syncing, never throw (same discipline as readAcfState T-2-01) |
| T-iwy-05 | Information Disclosure | child env | accept | spawnOpenDetached deliberately inherits the real session (LaunchServices resolves steam:// per user); existing, gate-accepted site; no new spawn added |
</threat_model>

<verification>
- `pnpm jest` on runningSteamSync, library, games, fakeHomeIsolation, DownloadHero, GamePage components, hooks suites all green.
- `pnpm codecheck` green.
- `git diff --name-only` for this task's commits contains only files_modified paths; drmLaunchSetup.ts and stageDrmBottle.ts untouched by this task.
- Live checkpoint approved.
</verification>

<success_criteria>
- Native Mac install + running Mac Steam → URL fired once, "Syncing Steam" shown with Play disabled, then Installation Finished with no restart toast.
- 1026 repair during sync shows Syncing Steam (with %), never the restart hint.
- Timeout falls back to the existing restart hint.
- Steam not running, Windows/Linux, bottle and bridge routes unchanged.
</success_criteria>

<output>
Create `.planning/quick/261029-iwy-fire-steam-install-after-native-steam-in/261029-iwy-SUMMARY.md` when done
</output>
