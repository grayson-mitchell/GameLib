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
| **Re-confirmed after 17-11 merge, FINAL pre-UAT-resume gate (2026-07-11)** | `npm test` — 48 suites / 938 tests passed, 0 failed (6.1s); `npm run codecheck` (tsc --noEmit) exit 0, no errors. Re-run against the fully merged tree including 17-11 (GAP 3 install button/status desync fix, commit `f1f89acb`) — 4 additional tests vs. the prior re-confirmation (938 vs 934) from 17-11's new selector coverage. This is the automated gate the human UAT resumes against for Task 2. |

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
| 17-07-01 | 07 | 4 | ALL | — | full-suite gate | suite | `npm test && npm run codecheck` | ✅ | ✅ green — 48 suites / 938 tests pass, 0 failed; `tsc --noEmit` exit 0 (re-confirmed 2026-07-11 post-17-11 merge) |

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

> Live human UAT started 2026-07-11; session 2 after 17-08/09/10/11; **session 3 after 17-12/17-13 landed** (PFX86 path fix + untick-Run-Steam copy). Recording per-step results; Approval remains pending until all 7 steps + scope fences pass or gaps are routed. Rows below reflect the LATEST session-3 result.

| Step | Requirement | Result | Notes |
|------|-------------|--------|-------|
| 1 — Provision + all entry points | MACSTEAM-02/04 | ✅ pass | Guided setup fires; dedicated `GameLibSteam` bottle created (CrossOver 26.2); real SteamSetup.exe window opens; Steam installs and logs in inside the bottle |
| 2 — Login | MACSTEAM-03 | ✅ pass (session 3) | Bottle recognized ready after 17-12 self-heal; login persists (`isLoggedIn: true`); no re-prompt |
| 3 — Install | MACSTEAM-04/05 | ⚠️ partial (session 3) | Game **installs successfully** (ACF `StateFlags=4`, Windows platform, path under bottle `drive_c`) and the "Installation Finished" notification fires. BUT (a) the install progress tracker is **stuck at 0%** the whole time (GAP-17-BOTTLE-PROGRESS), and (b) after completion the game-page button stays **"Steam installing"** + the library tile keeps spinning until you navigate away and back (GAP-17-BOTTLE-INSTALL-DONE-DESYNC) |
| 4 — Launch | MACSTEAM-04 | ✅ pass (session 3) | Re-entering the game page shows Play; the game launches and runs via the bottled Steam client |
| 5 — Indicator | MACSTEAM-06 | ⏳ pending | Not yet reported this session |
| 6 — D-11 guard | MACSTEAM-01 | ⏳ pending | Not yet exercised |
| 7 — Scope fences | MACSTEAM-01/04 | ⏳ pending | Not yet exercised |

**Resolved by 17-12/17-13 (session 3 confirmed):** GAP-17-PFX86-PATH (install now completes — self-heal recognized the win32 bottle) and GAP-17-STEAMWEBHELPER-HANG (untick-Run-Steam copy shipped).

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

**Approval:** GAPS FOUND (2026-07-11 session 4) — resolved so far: GAP-17-PFX86-PATH (17-12), GAP-17-STEAMWEBHELPER-HANG (17-13), GAP-17-BOTTLE-PROGRESS + GAP-17-BOTTLE-INSTALL-DONE-DESYNC (17-14, code-level; steps 1/2/4 pass). NEW BLOCKER: GAP-17-CEF-RENDER — the bottled Steam client's install dialog renders as a grey bar with unresponsive buttons (`webhelper.txt`: "Invalid browser dimensions: 0 x 0"; win32 bottle). This is a runtime CEF-rendering bug in bottled Steam (not GameLib React), so it needs `/gsd:debug 17` (hardware hypothesis-testing of `-cef-disable-gpu` / focus-timing / win64) rather than a blind gap-plan. Steps 5-7 (indicator, D-11, scope fences) remain untested behind this blocker.
