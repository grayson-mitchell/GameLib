---
phase: 17
slug: steam-on-macos-via-crossover-wine-windows-only-steam-games-i
status: automated-pass
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-10
automated_verified: 2026-07-11
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.7.0 via ts-jest, two projects (`src/backend`, `src/frontend`) |
| **Config file** | `jest.config.js` (repo root) |
| **Quick run command** | `npm test -- --testPathPattern=steam` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30-90 seconds (quick), full suite ~2-4 min |
| **Actual full-suite runtime (17-07 Task 1)** | 15.2s (`npm test`) — 45 suites / 908 tests passed, 0 failed; `npm run codecheck` (tsc --noEmit) exit 0, no errors |
| **Re-confirmed after gap-closure (2026-07-11)** | `npm test` — 48 suites / 934 tests passed, 0 failed (6.0s); `npm run codecheck` exit 0. Re-run after 17-08/09/10 + debug fixes (`ac35a8ce`, `432f0870`) to keep "suite green before sign-off" honest. |
| **Re-confirmed after 17-11 merge, pre-UAT-resume gate (2026-07-11)** | `npm test` — 48 suites / 938 tests passed, 0 failed (6.1s); `npm run codecheck` (tsc --noEmit) exit 0, no errors. Re-run against the fully merged tree including 17-11 (GAP 3 install button/status desync fix, commit `f1f89acb`) — 4 additional tests vs. the prior re-confirmation (938 vs 934) from 17-11's new selector coverage. |
| **Re-confirmed after 17-15 (GAP-17-CEF-RENDER) merge — FINAL pre-UAT-resume gate (2026-07-11)** | `npm test` — 49 suites / 962 tests passed, 0 failed (4.5s); `npm run codecheck` (tsc --noEmit) exit 0, no errors. Re-run against the fully merged tree including 17-12/17-13/17-14 (session-3 gap closures) and **17-15** (win10_64 bottle template + win32 detect/delete/recreate, commits `72d1ca74`/`4a47469d`, merge `b37a8f96`) — 24 additional tests vs. the prior re-confirmation (962 vs 938) from 17-14/17-15 coverage (bottle win64 recreate + auth-preservation, hasStatus reconcile, progress percent). This is the automated gate the human UAT resumes against for Task 2. |
| **Re-confirmed after 17-16 (GAP A/B/C static gap closure) merge (2026-07-13)** | `npm test` — 50 suites / 1042 tests passed, 0 failed; `npm run codecheck` (tsc --noEmit) exit 0. Re-run against the fully merged tree including **17-16** (GAP-17-PROVISIONED-FLAG-STUCK readiness-reconcile, GAP-17-CEF-RECREATE-RUNNING WINEPREFIX-scoped `wineserver -k` pre-delete, GAP-17 focus/leak-safe raise loop; merge `c98460c6`). The Steam **bottle** suite (`--testPathPattern="steam.*bottle"`) is 71/71 and exits 0 with **no worker force-exit** (GAP C fixed). NOTE: the full `npm test` still emits one "worker failed to exit gracefully" warning from the **pre-existing** `library.ts` `pollInstallOnce`→`readAcfState` timer leak (deferred from 17-11, tracked in `deferred-items.md`) — exit code is still 0; out of scope for this phase's sign-off. This is the automated gate the human UAT resumes against for Task 2 steps 5-7. |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern=steam` (or `=InstallGameModal` for the frontend routing task) + `npm run codecheck`
- **After every plan wave:** Run `npm test` (full suite) + `npm run codecheck`
- **Before `/gsd:verify-work`:** Full suite must be green (17-07 Task 1 gate)
- **Max feedback latency:** ~90 seconds (quick command)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-02 | 01 | 0 | MACSTEAM-02 | T-17-01 | cxbottle argv is discrete-word, name is a constant | manual (spike) | `bash -n spike/steam-bottle/probe-cxbottle.sh` | ✅ (new) | ✅ green |
| 17-02-01 | 02 | 1 | MACSTEAM-02 | T-17-SC | constants distinct from shared bottle; HTTPS-only URL | unit | `npm run codecheck` | ✅ existing | ✅ green |
| 17-02-02 | 02 | 1 | MACSTEAM-05 | T-17-01 | sanitizeBottleName rejects path traversal | unit | `npm test -- --testPathPattern=steam/bottle` | ✅ (new bottle.test.ts) | ✅ green |
| 17-03-01 | 03 | 2 | MACSTEAM-05 | T-17-05 | bottle ACF scan distinct from native; corrupt-file skip | unit | `npm test -- --testPathPattern=steam/library` | ✅ existing (extend) | ✅ green |
| 17-03-02 | 03 | 2 | MACSTEAM-05 | T-17-03 | bottle install labelled Windows; gated on provisioned | unit | `npm test -- --testPathPattern=steam/library` | ✅ existing (extend) | ✅ green |
| 17-04-01 | 04 | 2 | MACSTEAM-02 | T-17-02 | HTTPS-only SteamSetup; non-silent; provisioned only on cxbottle.conf | unit | `npm test -- --testPathPattern=steam/bottle` | ✅ (extend bottle.test.ts) | ✅ green |
| 17-04-02 | 04 | 2 | MACSTEAM-04 | T-17-04 | appId numeric-guard before command; provisioned pre-flight | unit | `npm test -- --testPathPattern=steam/bottle` | ✅ (extend) | ✅ green |
| 17-04-03 | 04 | 2 | MACSTEAM-03 | T-17-06 | no bottled-credential inspection (D-04 opaque) | unit | `npm run codecheck` | ✅ existing | ✅ green |
| 17-05-01 | 05 | 3 | MACSTEAM-01 | T-17-08 | confirmed-not-native requires platformsCaptured (D-11) | unit | `npm test -- --testPathPattern=steam/games` | ✅ existing (extend) | ✅ green |
| 17-05-02 | 05 | 3 | MACSTEAM-04 | T-17-04 | bottle routing vs native path; scope-fence regression guard | unit | `npm test -- --testPathPattern=steam/games` | ✅ existing (extend) | ✅ green |
| 17-05-03 | 05 | 3 | MACSTEAM-01 | T-17-07 | runWineCommandOnGame refuses steam | unit | `npm run codecheck` | ✅ existing | ✅ green |
| 17-06-01 | 06 | 3 | MACSTEAM-04 | T-17-09/08 | guided flow fires from backend signal for ALL entry points; frontend does NOT gate on raw is_mac_native (D-11 backend-owned) | unit (frontend) | `npm test -- --testPathPattern=SteamBottleSetup` | ✅ (new test file, 5/5 pass) | ✅ green |
| 17-06-02 | 06 | 3 | MACSTEAM-02/03 | T-17-01 | provision via IPC; name re-sanitized backend-side | unit + visual | `npm run codecheck` | ✅ (new component) | ✅ green (unit); visual = manual-only (see below) |
| 17-06-03 | 06 | 3 | MACSTEAM-06 | — | indicator gated on confirmed-not-native | unit + visual | `npm run codecheck` | ✅ existing | ✅ green (unit); visual = manual-only (see below) |
| 17-07-01 | 07 | 4 | ALL | — | full-suite gate | suite | `npm test && npm run codecheck` | ✅ | ✅ green — 49 suites / 962 tests pass, 0 failed; `tsc --noEmit` exit 0 (re-confirmed 2026-07-11 post-17-15 GAP-17-CEF-RENDER merge) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Automated gate result (17-07 Task 1, 2026-07-10):** `npm test` → 45 suites, 908 tests, 0 failures, 15.2s. `npm run codecheck` (`tsc --noEmit`) → exit 0, no type errors. All MACSTEAM-01..06 rows above that have an automated test are green; MACSTEAM-02/03/04/05/06's real-runtime surface (bottle creation, login persistence, install/launch through the bottle, visual indicator) remains manual-only per the table below and is deferred to Task 2's human UAT.

**Automated gate re-confirmation (17-07 Task 1, FINAL post-17-11 merge, 2026-07-11):** `npm test` → 48 suites, 938 tests, 0 failures, 6.1s. `npm run codecheck` (`tsc --noEmit`) → exit 0, no type errors. Re-run against the fully merged tree including gap-closure plans 17-08 (bottle real-readiness gate), 17-09 (D-08/D-11 platform-capture reconciliation), 17-10 (setup banner styling), and 17-11 (install button/status desync fix, commit `f1f89acb`). All MACSTEAM-01..06 rows remain green on the automated surface; the full suite is green before the human resumes UAT at Task 2.

---

## Wave 0 Requirements

- [x] `spike/steam-bottle/probe-cxbottle.sh` + `FINDINGS.md` — resolve Assumption A1 (cxbottle create mechanism) before 17-04 provisioning (plan 17-01)
- [x] `src/backend/storeManagers/steam/__tests__/bottle.test.ts` — new test file for the bottle foundation (created in 17-02)
- [x] `src/frontend/state/__tests__/SteamBottleSetup.test.ts` — new test file for the guided-setup store + the global `steamBottleSetupRequired` listener wiring (created in 17-06). NOTE: `InstallGameModal.ts` is no longer patched — the guided flow is driven by the backend signal + global listener (single point of truth), so the earlier InstallGameModal.test.ts gap is superseded.
- [x] Bottle-path ACF fixtures added to `src/backend/storeManagers/steam/__tests__/library.test.ts` (17-03)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| cxbottle bottle creation | MACSTEAM-02 | Requires a real CrossOver install; not mockable | 17-01 spike probe on real CrossOver |
| Guided provisioning + SteamSetup click-through | MACSTEAM-02 | Real installer window under Wine | 17-07 UAT step 1 |
| One-time bottled-Steam login persistence | MACSTEAM-03 | Real Steam client state inside the bottle; opaque by design (D-04) | 17-07 UAT step 2 |
| Install/launch through the bottled Steam client | MACSTEAM-04 | Real bottled Steam + real depot | 17-07 UAT steps 3-4 |
| Bottle-scoped badge = Windows install | MACSTEAM-05 | Requires a real bottle ACF | 17-07 UAT step 3 (Install Info platform/path) |
| D-08 "runs via Windows Steam bottle" indicator | MACSTEAM-06 | Visual/GUI (codebase convention: "Runtime visual UAT pending") | 17-07 UAT step 5 |
| Guided flow fires from ALL entry points (game-details button, library grid, install modal) | MACSTEAM-04 | Requires the running app; the three entry points differ in code path | 17-07 UAT step 1 (drive from game page AND grid) |
| Scope fences (native-Mac steam://, GOG/Epic shared bottle, Linux Proton) | MACSTEAM-01/04 | Requires the running app on each platform | 17-07 UAT step 7 |

---

## UAT Findings & Candidate Gaps (17-07 Task 2 — in progress)

> Live human UAT started 2026-07-11; session 2 after 17-08/09/10/11; session 3 after 17-12/17-13 landed; **session 5 after 17-15 (win10_64) landed** — the win32 bottle was manually deleted (see GAP-17-CEF-RECREATE-RUNNING) and a fresh **win64** bottle provisioned. Approval remains pending until all 7 steps + scope fences pass or gaps are routed. Rows below reflect the LATEST session-5 (win64) result.

| Step | Requirement | Result | Notes |
|------|-------------|--------|-------|
| 1 — Provision + all entry points | MACSTEAM-02/04 | ✅ pass (session 5) | Guided setup fires; fresh win64 `GameLibSteam` bottle provisions; SteamSetup.exe window opens and clicks through |
| 2 — Login | MACSTEAM-03 | ✅ pass (session 5) | Login inside the bottle persists (`isLoggedIn: true`); no re-prompt |
| 3 — Install dialog renders | MACSTEAM-02/05 | ✅ pass (session 5) | **GAP-17-CEF-RENDER FIXED by 17-15** — on the win64 bottle the Steam install dialog composites correctly (no grey `0×0` bar); Install button responsive; games install (Avernum 4/206020 + Avernum 6/206060, ACF `StateFlags=4` under `Program Files (x86)/Steam/steamapps`) |
| 4 — Launch / install recognition | MACSTEAM-04 | ✅ pass (session 5, post-fix) | Was a BLOCKER (button stuck on "Install"); **FIXED via `/gsd:debug` — GamePage now subscribes to `steam.library`** (GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED). Human-verified 2026-07-12: the button flips Install→Play and the game launches from GameLib |
| 5 — Indicator | MACSTEAM-06 | ⏳ blocked | Behind step 4 |
| 6 — D-11 guard | MACSTEAM-01 | ⏳ pending | Not yet exercised |
| 7 — Scope fences | MACSTEAM-01/04 | ⏳ pending | Not yet exercised |

**Also observed (session 5, MINOR UX):** window focus does not always move to the bottled Steam window when the guided flow raises it (`raiseInstallerWindow` best-effort loop, `bottle.ts:~320`) — non-blocking but confusing; the user must click the Steam window manually.

**GAP-17-LAUNCH-FOCUS — ✅ RESOLVED, human-verified 2026-07-12:** when launching a bottled game (Play), focus did not switch to the game — it opened behind GameLib. Root cause: `dispatchToBottledSteam` only fired `raiseInstallerWindow` for `verb === 'install'`; the `'launch'` path raised nothing, so macOS focus-stealing prevention left the game window in the background. **Fix:** added `raiseBottledGameWindow('launch')` — polls for the frontmost visible `.exe` process that is NOT a Steam client/helper (`steam.exe`/`steamwebhelper.exe`/`SteamSetup.exe`/`GameOverlayUI.exe`) = the launched game, and raises it via System Events `set frontmost` (same focus-steal-defeating trick as the installer raiser); shared poll/raise/`app.hide`-fallback loop refactored into `raiseFrontmostBottledProcess`. codecheck clean, bottle suite 62/62. Confirmed on real CrossOver: the game takes focus on Play. Commit: `fix(17): raise the launched game window on bottled launch…`.

**Resolved / confirmed by 17-15 (session 5):** GAP-17-CEF-RENDER — the win10_64 template fixes the grey-bar install dialog (steps 1-3 now pass on a real win64 bottle). The win32→win64 **auto**-recreate sub-behavior is separately broken (GAP-17-CEF-RECREATE-RUNNING) — the win64 bottle here was created after a manual delete.

### GAP-17-BOTTLE-PROGRESS — bottle install progress bar stuck at 0% (MAJOR, MACSTEAM-05) — candidate gap for `/gsd:plan-phase 17 --gaps`

**Observed (2026-07-11 session 3, real CrossOver):** During a bottle install the game-page/library progress tracker sits at 0% for the entire download even though the bottled Steam client is actively downloading and the install completes normally.

**Root cause (from code + live ACF inspection):** The frontend progress bar (`GameStatus.tsx` → `getProgress(progress)`) reads `progress` from `hasProgress(app_name, runner)` in `src/frontend/hooks/hasStatus.ts:11` — a DownloadManager-backed store. Bottle installs are driven by the Steam client + the ACF poller (`library.ts` `startInstallPolling({source:'bottle'})` / `pollInstallOnce`), **not** the DownloadManager, so `hasProgress` is never populated → 0%. The `'downloading'` branch of `pollInstallOnce` (library.ts ~610-616) emits `gameStatusUpdate {status:'installing'}` with **no percent**. The ACF already carries the data: `appmanifest_206040.acf` shows `BytesDownloaded/BytesToDownload` and `BytesStaged/BytesToStage`.

**Fix direction:** Have the bottle poller derive percent from ACF bytes (`BytesDownloaded/BytesToDownload`, fall back to `BytesStaged/BytesToStage`) in `readAcfState`/`pollInstallOnce` and surface it so the frontend progress bar moves — either emit a progress payload the steam path consumes (feed `hasProgress` for the bottled appId) or carry `percent` on the `gameStatusUpdate` and have `GameStatus`/`hasStatus` use it for steam-bottle installs. Add a unit test asserting a mid-download ACF yields a non-zero percent.

**Files likely touched:** `src/backend/storeManagers/steam/library.ts` (poller percent), `src/frontend/hooks/hasStatus.ts` + `src/frontend/screens/Game/GamePage/components/GameStatus.tsx` (consume steam progress), respective `__tests__`.

### GAP-17-BOTTLE-INSTALL-DONE-DESYNC — button/tile stay "Steam installing" after a bottle install completes (MAJOR, MACSTEAM-04) — candidate gap

**Observed (2026-07-11 session 3):** After the bottle install finishes (ACF `StateFlags=4`, "Installation Finished" notification fires, poll stops), the game-page primary button stays **"Steam installing"** and the library-grid tile keeps spinning. Navigating away and back into the game page then correctly shows **Play** — so the persisted state is right; only the LIVE reconciliation is missing (a focus/nav round-trip is required, violating step 3's "progress/completion surface without a focus round-trip").

**Root cause (from code):** `pollInstallOnce`'s `'installed'` branch (library.ts ~617-644) DOES send `pushGameToLibrary(updated)` + `gameStatusUpdate {status:'done'}` + notify (the notification proves it ran). But the game-page button `is.installing` (MainButton.tsx:161) derives from `libraryStatus.find(appName)` in `hasStatus.ts` (line 54-57: `status && status !== 'done'`), and the fall-through to the installed/Play branch requires `is_installed` to be live-true (line 82). The live `pushGameToLibrary` isn't refreshing the GamePage `GameContext`'s `gameInfo.is_installed` (stale until re-navigation re-fetches), and/or the `'done'` event isn't clearing the `libraryStatus` `installing` entry for the steam path. Net: the button never flips to Play without a nav round-trip.

**Fix direction:** On bottle-install completion, ensure the live `status:'done'` + `pushGameToLibrary` reconcile the game page WITHOUT re-navigation — clear the `installing` `libraryStatus` entry for the steam appId AND refresh the GamePage context's `is_installed`/`gameInfo` from the pushed payload (mirror how the native DownloadManager completion flips the button). Trace `GlobalState.handleGameStatus` (state/GlobalState.tsx:937) and `GameContext`/`GamePage/index.tsx` derivation. Add a store/selector unit test for the done-transition.

**Files likely touched:** `src/frontend/state/GlobalState.tsx` (handleGameStatus done handling), `src/frontend/screens/Game/GameContext.tsx` + `GamePage/index.tsx` (live is_installed refresh), possibly `src/frontend/hooks/hasStatus.ts`, respective `__tests__`.

**Status:** ✅ Fixed by 17-14 (progress percent + hasStatus live is_installed) — but see GAP-17-CEF-RENDER below, which blocks re-testing this on a fresh install.

### GAP-17-CEF-RENDER — bottled Steam install dialog renders as a grey bar with dead buttons (BLOCKER for a NEW install) — root cause CONFIRMED: 32-bit bottle (wrong `win10` template)

**Observed (2026-07-11 session 4, real CrossOver 26.2 on macOS):** Starting a NEW game install, the bottled Steam client's install dialog opens but the right ~half is covered by a grey bar; the two shortcut checkboxes toggle, but the Install button (and a second, grey, unreadable button) are unresponsive — the install cannot be confirmed.

**Root cause (from the bottle's own Steam logs — this is Steam's CEF renderer, NOT GameLib React):**
- `…/GameLibSteam/drive_c/Program Files/Steam/logs/webhelper.txt` repeats **`Invalid browser dimensions: 0 x 0`** on the `MessageDisplay-'store.stea'` surface (= the install dialog), and shows the surface going `WasHidden 1 … 0 x 0` — CEF composited the dialog at 0×0 while hidden → grey bar + dead input.
- Bottle is **`WineArch = win32`** running `steam_client_win32` (bootstrap_log). The 32-bit Steam CEF UI is the fragile path under Wine/CrossOver.
- NOT caused by 17-14 (that only touched GameLib's progress %/status hook; cannot affect Steam's own CEF UI).

**CONFIRMED root cause (2026-07-11, decisive): the bottle is created 32-bit because GameLib uses the wrong CrossOver template.**
- `provisionBottle()` runs `cxbottle --create --bottle <name> --template win10`. In CrossOver, **`win10` is the 32-bit template** and **`win10_64` is the 64-bit one** (both exist in `.../share/crossover/bottle_templates`: `win10`, `win10_64`, `win11_64`, `win8_64`, `win7_64`, …). The 17-01 spike locked `win10` on "does a bottle get created?" alone — it never checked the resulting `WineArch`, so the 32-bit default slipped through.
- Steam has dropped 32-bit; the modern 64-bit Steam client + its CEF UI (steamwebhelper) is what renders the install dialog, and it does not composite correctly in a `win32` prefix → the `0 x 0` browser dimensions / grey bar.

**Fix (high-confidence code change, no more hardware hypothesis needed):**
1. Change the create template `win10` → **`win10_64`** in `provisionBottle()` (and the 17-01 spike/FINDINGS "LOCKED CLI" note).
2. **Re-provision the existing win32 bottle** — a win32 prefix cannot be converted in place. `provisionBottle()` should detect an existing bottle whose `cxbottle.conf` reports `WineArch = win32` and recreate it as `win10_64` (delete + `--create --template win10_64`), or the user deletes the `GameLibSteam` bottle so provisioning recreates it 64-bit. Either way the user re-runs SteamSetup + logs in once in the new bottle.
3. 17-12's both-root Steam resolver stays as-is (belt-and-suspenders); on win64, Steam installs to `Program Files (x86)` — the "normal" case the resolver already handles.

**Revised route:** this is now a clean **`/gsd:plan-phase 17 --gaps`** code fix (template + re-provision), NOT a `/gsd:debug` hardware-hypothesis session. Files likely touched: `src/backend/storeManagers/steam/bottle.ts` (template arg + win32-detect/recreate), `spike/steam-bottle/FINDINGS.md` (update LOCKED CLI), tests.

**Status:** ✅ Fixed by 17-15 (2026-07-11, merge `b37a8f96`) — code-level. `provisionBottle()` now creates bottles with the `win10_64` template; a new `bottleWineArch()` detector runs BEFORE the `isBottleReady` short-circuit and, when it finds an existing `WineArch = win32` bottle, deletes (`cxbottle --delete --force`) and recreates it as win64 while preserving GameLib's Steam account auth (`refreshToken`/`isLoggedIn`/`userData` untouched; only bottle `provisioned` state resets). Unit coverage: win10_64 template regression guard, win32 recreate with auth-preservation assertions, win64 idempotent short-circuit (bottle suite 62/62). **Requires a fresh real-CrossOver UAT re-test** (this is what Task 2 session 5 verifies): the existing win32 `GameLibSteam` bottle must be recreated win64 on next `provisionBottle()`, SteamSetup re-run + login once, and the install dialog must composite correctly (no more grey `0 x 0` bar).

### GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED — bottle-installed game never flips to Play (BLOCKER, MACSTEAM-04/05) — ✅ RESOLVED via `/gsd:debug` (human-verified 2026-07-12)

**Follow-on (GAP-17-BOTTLE-PLAY-REVERT) — ✅ RESOLVED, human-verified 2026-07-12:** once the button correctly flipped to Play, *clicking* Play reverted it back to Install. Root cause: `SteamLibraryManager.refresh()` was **not bottle-aware**. The bottled launch uses `runWineCommand({wait:false})` (resolves in seconds) → `launcher.ts` fires `status:'done'` → `GlobalState.handleGameStatus` treats it as game-exited → `refreshLibrary({library:'steam'})` → `refresh()`, which rebuilt the library from `buildInstalledMap()` (native ACF scan) **only**, never `buildBottleInstalledMap()` — forcing a bottle-only install to `is_installed:false`, persisting it, and clobbering the reconcile. The now-correct GamePage faithfully surfaced the corruption. **Fix:** `refresh()` now builds a bottle map (gated `isMac && isBottleProvisioned()`, native-wins/bottle-fallback, correct `installPlatformForSource(source)`), mirroring `refreshInstallState()`; plus `refreshInstallState()`/both poll paths now persist to `steamLibraryStore` immediately (GAP-17-BOTTLE-STORE-DIVERGENCE — also prevents install-state loss across restart). 4 new regression tests; steam suites 272/272 + hasStatus 25/25. Commit: `fix(17): make steam refresh() bottle-aware…`.

**Resolution (original Install→Play flip):** `src/frontend/screens/Game/GamePage/index.tsx` never subscribed to `steam.library` — it didn't destructure `steam` from `ContextProvider`, and its `gameInfo`-refresh effect deps were `[status, gog.library, epic.library, isMoving]`, omitting `steam.library` (unlike gog/epic). The backend was fully correct — focus-triggered `refreshInstallState()`, the bottle install poller's `'done'` completion, the `library` Map singleton, and `pushGameToLibrary`→`GlobalState` all updated `context.steam.library`. But GamePage held `gameInfo` in local state seeded once from `location.state` at mount and never watched that context slice, so it never refetched; and since React Router keeps the same route component mounted across re-navigation, "away and back" never remounted it either — hence the stubborn stale state. **Fix:** destructure `steam` + add `steam.library` to the refresh effect deps (mirrors the existing gog/epic pattern). No backend change. Static: tsc/eslint clean, `hasStatus.reconcile` 6/6, `steam/library` 79/79. Debug session: `.planning/debug/resolved/bottle-install-not-recognized.md`. **Below is the original diagnosis (kept for history).**



**Observed (2026-07-11 session 5, real CrossOver 26.2 / win64 bottle):** A confirmed-not-native game installs successfully through the bottled Steam client (runs fine when launched **directly from Steam**), but GameLib never recognizes the install — the game-page button stays on **"Install"**, never becomes **Play**, and the game cannot be launched from GameLib. This persists across focus/nav round-trips (unlike session-3's transient desync).

**Verified NOT the cause (static + live-filesystem checks from the orchestrator):**
- Bottle is win64; Steam at `drive_c/Program Files (x86)/Steam`; `resolveBottleSteamRoot()` correctly resolves it (steam.exe probe hits x86 first).
- Both ACFs present with `StateFlags = 4` (`appmanifest_206020.acf` Avernum 4, `appmanifest_206060.acf` Avernum 6) under the resolved `steamapps/`.
- A faithful replica of `buildBottleInstalledMap()` against the real bottle returns **both** appIds.
- Both games are in the loaded library cache (`is_installed: false`) and are confirmed-not-native (`is_mac_native:false, platformsCaptured:true`) — so they route to the bottle and are eligible for reconciliation.
- `refreshInstallState()`'s gate `isMac && isBottleProvisioned()` is satisfied (`isBottleProvisioned()` is a live cxbottle.conf check → true), and `getSteamLibraries()` can't throw (falls back to `['/usr/share/steam']`), so the native map build doesn't abort the reconcile.
- Frontend `hasStatus`/`deriveInstallStatusKind` correctly returns `'installed'` when the `is_installed` prop is true, and 17-14 added the live `gameInfo`→`newGameInfo` sync.

**Therefore the break is in the LIVE reconcile→frontend chain, which has never actually executed on real hardware until now** (17-14 shipped after session 3; sessions 4-5 were blocked by CEF-RENDER). Prime suspects, in order:
1. The `mainWindow.on('focus')` → `refreshInstallState()` trigger (`main.ts:233`) isn't firing / isn't reconciling in this flow (compounded by the focus-not-moving UX issue).
2. `refreshInstallState()` runs but its in-memory `library` Map isn't the same populated instance (empty/unhydrated at reconcile time), so `library.entries()` skips the games.
3. `pushGameToLibrary` reaches the frontend but the GamePage's `gameInfo` prop / `GameContext` doesn't re-fetch, so `hasStatus` never sees `is_installed:true` (17-14's GlobalState/GameContext wiring not effective on the steam-bottle path).

**Why `/gsd:debug` (not a blind gap plan):** the backend scan is provably correct in isolation, so this is a live wiring/timing bug that needs the running app's backend logs + frontend devtools to pin which of (1)/(2)/(3) it is. A debug session should instrument `refreshInstallState` entry + `library.size` + the `pushGameToLibrary` receipt on the GamePage.

**Files likely in scope:** `src/backend/main.ts` (focus trigger), `src/backend/storeManagers/steam/library.ts` (`refreshInstallState`, live `library` hydration + the bottle poll `pollInstallOnce` 'done' path), `src/frontend/state/GlobalState.tsx` (`handleGameStatus`/`pushGameToLibrary`), `src/frontend/screens/Game/GameContext.tsx` + `GamePage/index.tsx` (live `gameInfo` refresh).

### GAP-17-PROVISIONED-FLAG-STUCK — `provisioned` config flag never becomes true after a real click-through install (MAJOR, MACSTEAM-02) — candidate gap for `/gsd:plan-phase 17 --gaps`

**Observed (2026-07-11 session 5):** `steam_store/config.json` shows `"provisioned": false` even though the bottle is fully set up (cxbottle.conf present, `Program Files (x86)/Steam/steam.exe` exists, `isLoggedIn: true`, games installed).

**Root cause (static, certain):** `provisionBottle()` step 8 (`bottle.ts:~588`) computes `fullyProvisioned = isBottleProvisioned(bottleName) && existsSync(steamExePath)` and writes it to the store **immediately after** launching `SteamSetup.exe` with `wait:false` (fire-and-forget, D-02 non-silent). At that instant Steam is not yet installed, so `existsSync(steamExePath)` is false → `provisioned` is persisted `false` and **never re-evaluated** once the user completes SteamSetup. The frontend guided-setup reads this flag (`SteamBottleSetup.tsx:107 if (status.provisioned)`; IPC `getSteamBottleStatus` returns it), so a stale `false` can keep the setup/consent surface returning instead of reflecting a ready bottle.

**Fix direction:** stop deriving `provisioned` from a race against a `wait:false` installer. Either (a) set `provisioned:true` lazily the first time `isBottleReady()` observes steam.exe (e.g. in `getSteamBottleStatus`/a readiness recheck), or (b) detect SteamSetup.exe process-exit (the `INSTALLER_PROCESS_NAMES` machinery) then re-evaluate and persist. Add a unit test asserting `provisioned` is NOT written `false` while steam.exe is absent right after a `wait:false` launch.

**Files likely touched:** `src/backend/storeManagers/steam/bottle.ts` (step 8 timing / readiness recheck), tests. *(Note: this flag does NOT gate the badge reconcile — that path uses the live `isBottleProvisioned()` conf check — so it is not the cause of GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED, but it should be fixed alongside it.)*

### GAP-17-CEF-RECREATE-RUNNING — win32→win64 auto-recreate aborts while the bottled Steam client is running (MAJOR, MACSTEAM-02) — candidate gap for `/gsd:plan-phase 17 --gaps`

**Observed (2026-07-11 session 5, real CrossOver 26.2 on macOS — reproduced from the orchestrator):** After 17-15 shipped the win32-detect/delete/recreate path, the stale `GameLibSteam` bottle was still `WineArch = win32` on disk. Running the exact command `provisionBottle()` uses — `cxbottle --bottle GameLibSteam --delete --force` — aborts:

```
There are still applications running in the GameLibSteam bottle. Aborting the current operation.
cxbottle exit=1
```

The live process was `steam.exe steam://install/206040` (the bottled Steam client + steamwebhelper, still up from the grey-bar CEF dialog). So 17-15's recreate branch cannot delete the win32 bottle in the very scenario it targets — the user hits the CEF grey-bar *because* Steam is running, and that same running Steam blocks the delete. The `rmSync(getBottleDir)` fallback then runs against a live prefix (open file handles) and is unreliable, leaving a half-deleted bottle.

**Root cause:** `provisionBottle()`'s recreate branch (`bottle.ts` ~410-440) issues `cxbottle --delete` without first stopping the bottle's wine processes. `cxbottle --delete` refuses when any app is running in the prefix.

**Fix direction:** Before the `cxbottle --delete` in the win32-recreate branch, stop the bottle's wine processes — run CrossOver's `wineserver -k` with `WINEPREFIX=getBottleDir(bottleName)` (and `CX_ROOT` set), verified working here (exit 0, all `steam.exe`/`winewrapper.exe` procs gone), then delete. Keep the `rmSync` fallback as a last resort but only after the kill. Add a unit test asserting the kill step runs before `--delete` in the recreate path.

**Workaround applied this session (unblocks the win10_64 UAT):** orchestrator ran `WINEPREFIX=<bottle> CX_ROOT=<cxroot> wineserver -k` (exit 0) then `cxbottle --bottle GameLibSteam --delete --force` (exit 0) — win32 bottle removed cleanly; GOG/Epic bottles untouched. Next Install now provisions a fresh `win10_64` bottle for the core CEF-render re-test (UAT steps 1-7).

**Files likely touched:** `src/backend/storeManagers/steam/bottle.ts` (process-kill before `--delete` in the win32-recreate branch), `src/backend/storeManagers/steam/__tests__/bottle.test.ts`.

### GAP-17-PFX86-PATH — bottle readiness checks the wrong Program Files directory (BLOCKER, MACSTEAM-04/05) — ✅ RESOLVED by 17-12 (session 3 confirmed)

**Observed (2026-07-11, real CrossOver 26.2 on macOS):** After the guided setup runs SteamSetup.exe, Steam installs and logs in successfully **inside** the `GameLibSteam` bottle, but GameLib never recognizes it — the game card stays un-installed and every Install click re-launches SteamSetup.exe. `steamBottleConfigStore.provisioned` is stuck `false`.

**Root cause (definitive, from live filesystem + config inspection):**
- The CrossOver `win10` template created a **32-bit prefix** (`cxbottle.conf` → `"WineArch" = "win32"`). A win32 prefix has **no `Program Files (x86)`** directory — 32-bit apps install to `C:\Program Files`.
- Steam is really installed at `…/Bottles/GameLibSteam/drive_c/Program Files/Steam/steam.exe` ✅ (verified on disk).
- But `getBottleSteamExePath()` / `getBottleSteamappsDir()` in `src/backend/storeManagers/steam/bottle.ts` **hardcode `Program Files (x86)`**, which is empty in this bottle. So `existsSync(getBottleSteamExePath())` → `false` → `isBottleReady()` → `false` forever.
- Consequence chain: `provisionBottle()` step 8 sets `provisioned = isBottleProvisioned && existsSync(x86 steam.exe)` = `false`; every routing gate (`isBottleReady`) fails; `dispatchToBottledSteam` short-circuits with "Steam bottle is not ready yet"; the guided flow keeps re-provisioning → SteamSetup re-opens.

**Resolution (17-12):** `resolveBottleSteamRoot()` probes both `Program Files (x86)/Steam` and `Program Files/Steam`; `getBottleSteamExePath`/`getBottleSteamappsDir`/`isBottleReady`/`provisionBottle` route through it. Session-3 UAT confirmed the already-installed win32 bottle self-healed to ready and install completed.

### GAP-17-PFX86-PATH — bottle readiness checks the wrong Program Files directory (BLOCKER, MACSTEAM-04/05) — candidate gap for `/gsd:plan-phase 17 --gaps`

**Observed (2026-07-11, real CrossOver 26.2 on macOS):** After the guided setup runs SteamSetup.exe, Steam installs and logs in successfully **inside** the `GameLibSteam` bottle, but GameLib never recognizes it — the game card stays un-installed and every Install click re-launches SteamSetup.exe. `steamBottleConfigStore.provisioned` is stuck `false`.

**Root cause (definitive, from live filesystem + config inspection):**
- The CrossOver `win10` template created a **32-bit prefix** (`cxbottle.conf` → `"WineArch" = "win32"`). A win32 prefix has **no `Program Files (x86)`** directory — 32-bit apps install to `C:\Program Files`.
- Steam is really installed at `…/Bottles/GameLibSteam/drive_c/Program Files/Steam/steam.exe` ✅ (verified on disk).
- But `getBottleSteamExePath()` / `getBottleSteamappsDir()` in `src/backend/storeManagers/steam/bottle.ts` **hardcode `Program Files (x86)`**, which is empty in this bottle. So `existsSync(getBottleSteamExePath())` → `false` → `isBottleReady()` → `false` forever.
- Consequence chain: `provisionBottle()` step 8 sets `provisioned = isBottleProvisioned && existsSync(x86 steam.exe)` = `false`; every routing gate (`isBottleReady`) fails; `dispatchToBottledSteam` short-circuits with "Steam bottle is not ready yet"; the guided flow keeps re-provisioning → SteamSetup re-opens.

**Fix direction:** Resolve the bottled Steam install location by probing **both** candidates and using whichever exists — `drive_c/Program Files (x86)/Steam` (win64 prefix, Steam being 32-bit) **and** `drive_c/Program Files/Steam` (win32 prefix). Apply to `getBottleSteamExePath()` **and** `getBottleSteamappsDir()` (the ACF/steamapps reader in `library.ts` shares the same assumption and would mislocate installed-game manifests even after readiness is fixed). Prefer a single shared resolver so exe-path and steamapps-path stay consistent. Add unit fixtures for both prefix layouts.

**Files likely touched:** `src/backend/storeManagers/steam/bottle.ts` (path resolver + `isBottleReady`/`provisionBottle`), `src/backend/storeManagers/steam/library.ts` (bottle steamapps ACF scan), respective `__tests__`.

### GAP-17-STEAMWEBHELPER-HANG — "Run Steam" left ticked hangs the bottled client with no recovery hint (MAJOR, Pitfall 4) — ✅ RESOLVED by 17-13

**Observed:** On SteamSetup.exe's final screen the "Run Steam" checkbox is ticked by default; leaving it ticked launched the bottled Steam client immediately, whose steamwebhelper self-update hung (Pitfall 4 / A3) and had to be Force Quit. No recovery hint appeared. Unticking "Run Steam" avoided the hang (GameLib drives launch itself via `tellBottledSteamTo*`).

**Fix direction:** In the guided-setup consent/instructions copy, explicitly tell the user to **untick "Run Steam"** on SteamSetup's final page (GameLib launches Steam itself once the bottle is ready). Optionally detect the steamwebhelper hang and surface the Pitfall 4 recovery hint — this would satisfy UAT step 7's "recovery hint shown" expectation.

**Files likely touched:** `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` + i18n `gamepage` keys (instruction copy); optionally `src/backend/storeManagers/steam/bottle.ts` (hang detection).

### GAP-17-INSTALL-UX — continuous install-time feedback + auto-chain (superseded — addressed by 17-08/09/10/11)

**Observed:** During the Steam-client provisioning phase the surface is a single static banner line ("Setting up Steam…"), and after the bottled `steam.exe` appears the user must click **Install a second time** for the game download to begin. The game card never shows the "Installing" status/button-text transition the native install flow provides, so there is no real progress feedback for the Steam-client phase and a confusing manual re-click.

**Decided design (user-approved 2026-07-11 — "auto-start game install"):**
1. Drive banner text from real Steam-client state: `Installing Steam client…` (SteamSetup.exe running) → `Steam client installed` when the bottled `steam.exe` appears (optionally tightened by detecting `SteamSetup.exe` **process exit** via the existing `INSTALLER_PROCESS_NAMES` machinery rather than only file-existence).
2. The moment `isBottleReady()` flips true, **auto-invoke the game install** (`tellBottledSteamToInstall` + `startInstallPolling({source:'bottle'})`) instead of requiring a second manual click. Bottled Steam surfaces its own login prompt inline if needed (login stays opaque per D-04 — we do not detect/await it).
3. Game card then shows the standard `'installing'` status + button-text change with ACF-driven progress, and the setup banner self-dismisses.

**Constraints noted:** SteamSetup runs `wait:false` (no direct completion event — infer via `steam.exe`/process-exit); bottled login is opaque by design (D-04), so the chain fires the install and lets Steam handle login rather than gating on a login-complete signal.

**Files likely touched:** `src/frontend/screens/Game/GamePage/components/SteamBottleSetup.tsx` (text + auto-trigger), `src/backend/storeManagers/steam/bottle.ts` (optional SteamSetup process-exit signal), `src/backend/storeManagers/steam/games.ts` (install auto-chain wiring), i18n `gamepage` keys.

---

## Out-of-Scope (documented, not gaps)

- **GAME-05 "Playing" badge parity for bottled games** — the native running-game poller reads the native Steam `registry.vdf`; a bottled client writes its RunningAppID to a Windows-side registry inside the prefix (RESEARCH.md Open Question 3, PATTERNS.md "No Analog Found"). Explicitly deferred: Phase 17 scope is "install and launch" only (ROADMAP + CONTEXT do not mention GAME-05). Tracked as a known limitation / follow-up, not an under-delivery.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every row in the Per-Task Verification Map has a concrete automated command)
- [x] Wave 0 covers all MISSING references (bottle.test.ts, SteamBottleSetup.test.ts, library bottle fixtures) — all three now exist and pass
- [x] No watch-mode flags
- [x] Feedback latency < 90s (full suite ran in 6.1s on the FINAL re-confirmation)
- [x] `nyquist_compliant: true` set in frontmatter (17-07 Task 1)

**Automated half status:** COMPLETE (2026-07-10, re-confirmed FINAL 2026-07-11 post-17-11 merge) — full suite green (48/48 suites, 938/938 tests), `npm run codecheck` exit 0. Re-run against the fully merged tree including gap-closure plans 17-08, 17-09, 17-10, and 17-11 (install button/status desync fix). All six MACSTEAM requirements have at least one automated test covering their code-level behavior; the real-hardware runtime surface (bottle creation, bottled login, install/launch through the bottle, visual indicator, scope-fence regressions on real CrossOver) is enumerated in Manual-Only Verifications above and awaits Task 2's human UAT resumption (steps 2-7; step 1 already passed per the UAT Findings table above).

**Approval:** GAPS FOUND (2026-07-11 session 5, real CrossOver win64 bottle). **GAP-17-CEF-RENDER is FIXED by 17-15** — the win10_64 template makes the Steam install dialog composite correctly; UAT steps 1-3 now pass and games install to disk. **New BLOCKER: GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED** — a bottle-installed game (verified `StateFlags=4` on disk, runs directly from Steam) never flips to Play in GameLib; the button stays "Install" even after focus/nav, so the game can't be launched from GameLib (step 4 FAIL). Backend scan proven correct in isolation → live reconcile/frontend wiring bug → route to **`/gsd:debug 17`**. Additional gaps for **`/gsd:plan-phase 17 --gaps`**: GAP-17-PROVISIONED-FLAG-STUCK (config `provisioned` stuck false; static fix), GAP-17-CEF-RECREATE-RUNNING (win32→win64 auto-recreate delete aborts while Steam runs; static fix), and the minor focus-not-moving-to-Steam-window UX. Steps 5-7 (indicator, D-11, scope fences) remain untested behind the step-4 blocker.

**Update (2026-07-12):** GAP-17-BOTTLE-INSTALL-NOT-RECOGNIZED is **RESOLVED** via `/gsd:debug` (GamePage subscribes to `steam.library`) and **human-verified** — step 4 now passes (button flips Install→Play, game launches from GameLib). Remaining before sign-off: (a) UAT steps 5-7 (indicator, D-11 guard, scope fences) — now unblocked, need a run; (b) static gaps GAP-17-PROVISIONED-FLAG-STUCK, GAP-17-CEF-RECREATE-RUNNING, and the focus-not-moving-to-Steam-window UX → `/gsd:plan-phase 17 --gaps`.

**Phase 17 status:** NOT yet signed off — 17-07 Task 2 (human-verify gate) remains OPEN pending UAT steps 5-7 + the three static gap closures. The step-4 blocker is cleared.
