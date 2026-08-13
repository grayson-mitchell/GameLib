---
status: diagnosed
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
source: [30-01-SUMMARY.md, 30-02-SUMMARY.md, 30-03-SUMMARY.md, 30-04-SUMMARY.md, 30-REVIEW-FIX.md]
started: 2026-07-22T21:57:57Z
updated: 2026-08-13T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running GameLib/Tauri/sidecar process. Start `npm run tauri:dev` from scratch. Rust shell launches, sidecar signals READY, window paints a real UI (not blank), no `is not a constructor` error, no boot crash.
result: pass

### 2. Steam Library Populates Under Tauri
expected: With the session already signed in to Steam (tile shows Logout), the library screen lists the account's owned Steam titles. No `UNPORTED_CHANNEL_MARKER` warnings for `checkSteamInstalled` / `steamStartQR` / `listSteamLibraryTargets`.
result: pass

### 3. Steam Logout Honest Dialog (G-30-01 regression)
expected: Under Tauri, clicking Logout on the Steam tile shows a "sign-out isn't available in this build" dialog — no page reload, no latched "Logging out..." button, tile still reads Logout. Under Electron (`npm start`), Logout still genuinely signs out and reloads.
result: pass

### 4. Install Button Opens Native Folder Picker
expected: With `enableSteamNativeInstall: true`, clicking Install on a Steam title opens the real macOS native folder picker (tauri-plugin-dialog `dialog_open`). Picking a folder returns that path; cancelling closes it cleanly with no error toast and no hang.
result: issue
reported: "nothing happens when click on install other than the spinner appearing"
severity: major

### 5. Install Starts and Button State Transitions
expected: After choosing an install folder, the depot download starts and the library button transitions queued → installing → done via the `gameStatusUpdate` push. The install does NOT abort at ~60 seconds (CR-03 timeout fix) — a long download keeps running past a minute.
result: pass
verified_by: "Phase 33 plan 33-05 — gate D-13, outcome PASS, verified_by human (live hardware, `npm run tauri:dev`, sidecar rebuilt from current tree), verified_on 2026-07-24"
note: |
  PROVEN BY A LATER PHASE'S GATE — not re-run in this file. Phase 30 recorded this as blocked
  behind test 4; that blocker (G-30-02, the install-spinner hang) was PARKED to Phase 33 and Phase
  33 closed it on real hardware.

  Evidence (33-05-SUMMARY.md): clicking Install on Baldur's Gate II: Enhanced Edition (appId
  257350) reaches a terminal state — badge never hangs — and the install actually starts and
  completes:
    (11:37:52) [DownloadManager]: Baldur's Gate II: Enhanced Edition was added to the download queue.
  33-VALIDATION.md:70-77 made this a load-bearing manual gate (REQ-33-10 / D-13) precisely because
  "jest was provably green while the live build hung TWICE (30-05, 30-07)". 33-05-SUMMARY.md:87:
  "G-30-02 (parked since Phase 30) is resolved and hardware-proven."

  The "does NOT abort at ~60 seconds (CR-03 timeout fix)" clause was separately confirmed live
  earlier — see 30-HUMAN-UAT.md retest cycle 1, test 6 (result: pass, no 60s `sidecar invoke timed
  out` observed).

  CAVEAT: 33-05's evidence is the badge resolving plus the download-queue log line; it does not
  name the `gameStatusUpdate` push mechanism explicitly. The observable outcome this test asks for
  was witnessed; the transport carrying it was inferred.

### 6. Uninstall Reverts Button State
expected: Clicking Uninstall on an installed Steam title removes it and the library button transitions back to Install.
result: tracked
tracked_by: "30-VERIFICATION.md human_verification — 'Uninstall reverts button state (30-UAT test 6)'. Tracked THERE, not here, so this open question is counted once rather than three times."
reason: |
  ORIGINAL (2026-07-22): "Cannot access — no game can be installed while Test 4 blocks the install
  flow."

  THAT BLOCKER IS GONE. Phase 33's D-13 live gate (33-05, human-verified 2026-07-24) proved install
  reaches a terminal state and completes, so a game CAN now be installed to uninstall.

  Still genuinely unproven: uninstall is not mentioned in ANY Phase 33 artifact — the D-13 gate
  exercised install only. This is one of the two surviving open questions for Phase 30, and the
  canonical record for the "Install → Uninstall E2E" item that 30-HUMAN-UAT.md and
  30-VERIFICATION.md each restate.

### 7. Update Check Reports Real Results
expected: The update check runs across runners without one failing runner killing the whole check (WR-05), and triggering an update on a game reports the actual outcome — a failed update surfaces as a failure, not a false "success" (WR-04).
result: tracked
tracked_by: "30-VERIFICATION.md human_verification — 'Update check reports real results — WR-04 / WR-05 (30-UAT test 7)'. Tracked THERE, not here, so this open question is counted once."
reason: |
  ORIGINAL (2026-07-22): "No installed game available to exercise the update path (install flow
  blocked by Test 4)."

  That premise is void — install works as of Phase 33's D-13 gate, so an installed game is
  obtainable. Testable now; never observed. This is the second of Phase 30's two surviving open
  questions.

  NOTE: the `WR-04`/`WR-05` identifiers in Phase 34 artifacts are DIFFERENT findings (packaging
  CSP / `withGlobalTauri`). They are not evidence for this test.

### 8. openDialog File-Picker Call Sites (WR-02 / WR-01)
expected: Any UI that browses for a FILE rather than a folder (e.g. adding a game / choosing an executable or path in Settings) opens a native picker honoring the requested mode — a file picker where a file is asked for, not always a folder picker. Previously this path rejected outright under Tauri.
result: issue
reported: "settings cant be reached"
severity: major

### 9. Electron Build Unregressed
expected: `npm start` (Electron) still boots, lists the Steam library, installs/uninstalls, and checks updates exactly as before Phase 30 — the additive/reversible invariant holds.
result: issue
reported: "still boots, but trying to sync steam, and failing. gog games are still listed."
severity: major

## Summary

total: 9
passed: 4
issues: 3
tracked: 2
pending: 0
skipped: 0
blocked: 0

<!--
Counts corrected 2026-08-13. This block previously declared `skipped` and `blocked` TWICE with
contradictory values (skipped 1 then 0; blocked 2 then 0), so a reader taking the last value got
0/0 while the body still showed two blocked tests and one skipped.

Now: passed 4 (test 5 closed on Phase 33's D-13 live gate), issues 3 (tests 4, 8, 9 — all diagnosed
in Gaps below), tracked 2 (tests 6 and 7 — the phase's two surviving open questions, carried
canonically in 30-VERIFICATION.md's human_verification block so each is counted ONCE across this
phase's three files rather than restated in all of them). 4+3+2 = 9.
-->


## Gaps

- truth: "Clicking Install on a Steam title completes (or cleanly fails) so the button leaves the spinner state — the test's folder-picker premise was wrong (Steam install is a D-04 direct bypass with no picker by design)"
  status: failed
  reason: "User reported: nothing happens when click on install other than the spinner appearing"
  severity: major
  test: 4
  root_cause: "Phase 30 regression. The sidecar install bypass (installFlowRegistration.ts) emits a terminal gameStatusUpdate('done') ONLY on a thrown error or when deferredToSetup/wasAborted — NEVER for a *returned* {status:'error'}. SteamGame.install → runNativeDepotDownload → ensureSteamClientReady RETURNS {status:'error'} (does not throw) when it can't proceed headless (native macOS Steam client absent — this env runs Steam via CrossOver bottle). So the 'installing' badge is never cleared → spinner forever. Electron clears this via downloadmanager/utils.ts installQueueElement, which the bypass deliberately did not port. Secondary: the Steam Game-Page Install button (GamePage/index.tsx:673-684) never calls dialog_open/showOpenDialog — no picker is expected here, so the UAT expectation was itself wrong."
  artifacts:
    - path: "src/backend/sidecar/installFlowRegistration.ts"
      issue: "install handler never pushes a terminal gameStatusUpdate for a RETURNED {status:'error'} (only on thrown/deferred) → badge stuck 'installing'"
    - path: "src/backend/storeManagers/steam/games.ts"
      issue: "runNativeDepotDownload (~1157-1265) returns (not throws) {status:'error'} on not-ready/failure"
    - path: "src/backend/storeManagers/steam/clientSetup.ts"
      issue: "ensureSteamClientReady (92-132) returns {status:'error'} for needs-install/needs-launch; may fire steamClientSetupRequired whose consent dialog is not surfaced under Tauri (secondary, unconfirmed)"
    - path: "src/frontend/screens/Game/GamePage/index.tsx"
      issue: "lines 673-684 — D-04 direct-install bypass confirms no folder picker is expected in the Steam install flow (UAT premise correction)"
  missing:
    - "In the sidecar install handler, treat a returned {status:'error'} (and needs-install/needs-launch deferral) the same way Electron's installQueueElement does — emit terminal gameStatusUpdate('done') and surface the error so the badge always leaves 'installing'"
    - "Confirm via Tauri sidecar log which trigger fires (ensureSteamClientReady not-ready vs depot failure); ensure steamClientSetupRequired is wired under Tauri"
    - "Correct the UAT expectation: the Steam Game-Page Install button opens no folder picker by design"
  fix_plan: 30-05
  debug_session: .planning/debug/steam-install-spinner-hangs-tauri.md

- truth: "The Settings screen is reachable under Tauri, and its file/path pickers open a native picker honoring the requested mode (file vs folder)"
  status: failed
  reason: "User reported: settings cant be reached"
  severity: major
  test: 8
  root_cause: "Phase 30 scoping gap (genuine, not merely 'Phase 31 not done'). The Settings route mounts but never renders: both render gates at Settings/index.tsx:79 (if (!currentConfig || !contextValues) return <UpdateComponent/>) depend on window.api.requestAppSettings() — an INVOKE channel Phase 30 deliberately left unported. Under Tauri it rejects with UNPORTED_CHANNEL_MARKER; NEITHER call site (Settings/index.tsx:65-71 mount effect, and useSettingsContext.ts:31-38 for appName==='default') has a try/catch, so currentConfig stays null AND contextValues stays null → the component returns the loading spinner forever. Two independent paths hit the same channel, so patching one still blanks the route. 30-PORTED-CHANNELS.md:54 justified NOT porting it only by 'DownloadDialog never mounts for steam' — that overlooked the Settings screen and useSettingsContext, both of which call it at mount. Test 8's real subject (openDialog file-vs-folder mode, WR-02/WR-01) is blocked behind this and remains unverified."
  artifacts:
    - path: "src/frontend/screens/Settings/index.tsx"
      issue: "lines 65-81 — uncaught requestAppSettings() rejection leaves currentConfig null; line 79 gate short-circuits to <UpdateComponent/> forever"
    - path: "src/frontend/hooks/useSettingsContext.ts"
      issue: "lines 31-38,61-63 — same uncaught rejection leaves config {} → returns null contextValues (second half of the line-79 gate)"
    - path: "src/preload/api/settings.ts"
      issue: "line 3 — requestAppSettings is makeHandlerInvoker → marker-reject under Tauri"
    - path: ".planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-PORTED-CHANNELS.md"
      issue: "line 54 — not-ported decision missed the Settings/useSettingsContext call sites"
  missing:
    - "Port requestAppSettings (and requestGameSettings) to the sidecar (belongs to Phase 31's settings-config cluster; this UAT proves Settings is unreachable until it lands), OR"
    - "Harden both getSettings() call sites: wrap in try/catch and fall back to a usable default config / error state instead of leaving currentConfig/contextValues null forever"
    - "Note: the openDialog file-vs-folder-mode question (Test 8) stays unverifiable until Settings renders"
    - "Retest caveat: 30-06 ports only the READ side. Under Tauri, setSetting (write) remains an unported silent-noop send channel (Phase 31) — a changed setting will NOT persist. Do not treat non-persisting writes as a new defect during the Test 8 retest."
  fix_plan: 30-06
  debug_session: .planning/debug/settings-unreachable-tauri.md

- truth: "Under the Electron build (npm start), Steam library sync still succeeds exactly as before Phase 30 (additive/reversible invariant — no regression)"
  status: not-a-defect   # environmental, not a Phase 30 code regression — see root_cause
  reason: "User reported: still boots, but trying to sync steam, and failing. gog games are still listed."
  severity: major
  test: 9
  root_cause: "NOT a Phase 30 regression — the invariant HELD. git diff --stat f49797b1~1..HEAD over src/backend/storeManagers/steam/ is EMPTY: Phase 30 modified zero files on the Electron Steam sync path. The only Electron-loaded changes are the byte-equivalent extraction of checkGameUpdates (made MORE robust by WR-05's per-runner try/catch) and openDialog; every other changed file is a Tauri sidecar-only module the Electron build never loads. Actual failure surface: SteamLibraryManager.refresh() (steam/library.ts:588-599) gates on SteamUser.ensureConnected() and no-ops with 'Steam client not ready, skipping library refresh' when the persisted refresh token is unavailable. GOG lists fine (separate token path). Most probable cause: D-03 build-token divergence — UAT Tests 1-8 all ran under Tauri (Keychain token), so the Electron OSCrypt Steam token is likely absent/expired/invalid this session (possibly also wiped by earlier real-store test clobbering)."
  artifacts:
    - path: "src/backend/storeManagers/steam/library.ts"
      issue: "lines 588-599 — ensureConnected() gate where sync silently no-ops when unauthenticated (failure SURFACE, not a Phase 30 change)"
    - path: "src/backend/storeManagers/steam/user.ts / tokenStore.ts"
      issue: "Electron OSCrypt refresh-token load — the probable REAL fault (absent/expired/invalid token this session)"
  missing:
    - "No Phase 30 code fix warranted for the sync path — invariant held"
    - "Capture the runtime log at sync time to disambiguate: 'Steam client not ready...' => token/auth; 'Steam getUserOwnedApps failed' => CM/network; no Steam log => frontend not reaching backend"
    - "Re-sign-in under npm start (Electron) to refresh the OSCrypt Steam token, confirm sync recovers, then close as environmental token divergence — re-run Test 9 with logs before treating as a real bug"
  debug_session: .planning/debug/electron-steam-sync-fails-phase30.md
