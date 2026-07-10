---
status: testing
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
source:
  - 17-03-SUMMARY.md
  - 17-04-SUMMARY.md
  - 17-05-SUMMARY.md
  - 17-06-SUMMARY.md
remediation:
  - 17-08-SUMMARY.md  # GAP 1 (blocker) — provisioning stuck-loop fix
  - 17-10-SUMMARY.md  # GAP 1 cosmetic — banner/toast styling
  - 17-09-SUMMARY.md  # GAP 2 (major) — synchronous platform capture at install/launch
started: 2026-07-11T00:00:00Z
updated: 2026-07-11T01:00:00Z
retest_round: 2  # both diagnosed gaps remediated in code; re-testing tests 2-8 on macOS + CrossOver
---

## Current Test

number: 2
name: Guided bottle provisioning + SteamSetup click-through (MACSTEAM-02)
expected: |
  On macOS with CrossOver installed, hit Install/Play on a Windows-only Steam game
  (one with no native Mac build). A consent dialog explains a Windows Steam bottle is
  needed. Accepting kicks off a background task that provisions the dedicated
  `GameLibSteam` CrossOver bottle and opens the real (non-silent) SteamSetup.exe
  installer window for you to click through. (Re-test after 17-08/17-10 fix: no
  "could not download steam" failure, no stuck "steam installing" loop, banner is
  properly styled.)
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Fully quit GameLib, then relaunch from scratch. App boots without errors and the library loads — Steam games appear alongside Epic/GOG/Amazon. No crash, no blank library, no stuck startup spinner.
result: pass

### 2. Guided bottle provisioning + SteamSetup click-through (MACSTEAM-02)
expected: On macOS with CrossOver installed, hit Install/Play on a Windows-only Steam game (one with no native Mac build). A consent dialog explains a Windows Steam bottle is needed. Accepting kicks off a background task that provisions the dedicated `GameLibSteam` CrossOver bottle and opens the real (non-silent) SteamSetup.exe installer window for you to click through.
result: issue
reported: "First install attempt: banner 'could not download steam' with try-again/stop options; banner was cosmetically broken (no background, just text over the window). Chose Stop, reloaded the app, clicked Install again -> no SteamSetup window at all, just a quick 'installing the game' message and the button changed to 'steam installing'; after a few minutes it reverts and pressing Install again reproduces the same result (stuck loop)."
severity: blocker
remediation: "Fixed by 17-08 (provisioning now mkdir's the redist dir before downloading SteamSetup.exe; install/launch/uninstall route on real bottle readiness via isBottleReady() instead of cxbottle.conf existence, so a half-provisioned bottle self-heals instead of entering the stuck loop) + 17-10 (styled .steamBottleSetupToast banner)."
retest_round_2:
  original_blocker: resolved  # wizard fires; steam setup starts; SteamSetup.exe installer DOES open; no 'could not download steam'; no stuck loop; banner styled
  clarification: "User confirmed the real SteamSetup.exe installer window DID open — it just opened BEHIND the GameLib window (z-order/focus), so it looked like nothing happened. GAP 1 functionally resolved."
  new_issues:
    - "GAP 3 (state desync, major): after confirming Steam setup in the wizard, the main Install button does NOT update (still reads 'Install') and the game-page status message still says 'The Game is not installed' — even though the RIGHT-side toast correctly shows Steam is being set up. If you press 'Done' in the toast you can re-open the wizard and re-run 'set up steam' (same result). If you do NOT press 'Done', clicking Install does nothing — a quick flash of 'queued' then reverts to 'game not installed'."
    - "GAP 4 (cosmetic): in the WineSelector wizard, move the 'use shared wine prefix' option to the bottom."
    - "GAP 5 (UX, minor): the SteamSetup.exe installer window opens BEHIND the GameLib window, so the user thinks nothing happened. Fix: after runWineCommand launches the installer (bottle.ts:~328), minimize/hide the GameLib main window (precedent: launcher.ts:176 mainWindow?.hide() on game launch) so the installer is frontmost; optionally a toast hint. Cannot force the foreign CrossOver window always-on-top from Electron."

### 3. Guided flow fires from all entry points (MACSTEAM-04)
expected: The same guided setup can be triggered from every Install/Play surface — the game-details page button, the library grid tile, and the install modal. All three reach the same consent-then-provision flow (not just one).
result: remediated
reported: "All entry points follow the same broken pattern — the button goes straight to 'steam installing'. There is no consent dialog and no WineSelector engine/version choice; it should at least give the option for which version of Wine before provisioning."
severity: major
remediation: "Fixed by 17-09: install()/launch()/uninstall() now await ensurePlatformsCaptured() (a synchronous appdetails platform check) BEFORE the isBottleEligible() gate, so a Windows-only macOS game whose platform data wasn't yet captured no longer falls through to native steam://install — it routes into the guided consent + WineSelector flow. Also reconciled the D-08 indicator gate with the D-11 routing gate via steamPlatformsCaptured. 243/243 steam tests pass. Needs human re-test on macOS + CrossOver."

### 4. One-time bottled Steam login persists (MACSTEAM-03)
expected: After SteamSetup completes, the bottled Windows Steam client opens and you log in once. The login persists — relaunching a bottled game later does NOT force you to log in to Steam again each time.
result: ready-for-retest
blocked_by: prior-phase
reason: "Cannot reach — bottle provisioning / SteamSetup never completes (tests 2 & 3). No bottled Steam client exists to log into."
unblocked: "Tests 2 & 3 remediated (17-08/17-10/17-09) — provisioning should now complete; retest login persistence on macOS + CrossOver."

### 5. Install a Windows-only game through the bottle (MACSTEAM-04)
expected: Triggering Install on a Windows-only Steam game downloads/installs it through the bottled Windows Steam client (not via native `steam://` and not by wine-running a bare exe). Install progresses and completes.
result: ready-for-retest
blocked_by: prior-phase
reason: "Cannot reach — no provisioned bottle / bottled Steam client (tests 2 & 3)."
unblocked: "Tests 2 & 3 remediated (17-08/17-10/17-09) — retest install through the bottle on macOS + CrossOver."

### 6. Launch a bottled game (MACSTEAM-04)
expected: Pressing Play on the installed bottled game launches it through the bottled Windows Steam client and the game runs.
result: ready-for-retest
blocked_by: prior-phase
reason: "Cannot reach — nothing installed in a bottle (tests 2 & 3)."
unblocked: "Tests 2 & 3 remediated (17-08/17-10/17-09) — retest launch of a bottled game on macOS + CrossOver."

### 7. Install badge shows Windows + bottle path (MACSTEAM-05)
expected: For the installed bottled game, the Install Info shows platform "Windows" (not macOS) and the install path points into the GameLibSteam bottle's steamapps root — not a host-OS Steam library.
result: ready-for-retest
blocked_by: prior-phase
reason: "Cannot reach — no bottle install exists to inspect (tests 2 & 3)."
unblocked: "Tests 2 & 3 remediated (17-08/17-10/17-09) — retest the Windows + bottle-path install badge on macOS + CrossOver."

### 8. "Runs via Windows Steam bottle" indicator (MACSTEAM-06)
expected: The game page for a confirmed-Windows-only Steam game shows a "Runs via Windows Steam bottle" indicator row. A native-Mac Steam game does NOT show this row.
result: ready-for-retest
blocked_by: prior-phase
reason: "Deferred — pending fix of the provisioning flow; can retest the indicator row alongside a working install. (Indicator is display-gated on confirmed-not-native, testable independently, but grouped here to retest after fix.)"
unblocked: "Remediated by 17-09 — the 'Runs via Windows Steam bottle' indicator is now gated on steamPlatformsCaptured===true && is_mac_native===false, matching the backend routing gate. Retest that it shows for a confirmed Windows-only game and NOT for a native-Mac game."

### 9. Deferred setup doesn't stick an 'installing' badge (17-05)
expected: If you decline or dismiss the bottle-setup consent dialog (defer it), the game does NOT get stuck showing a persistent 'installing' badge — its status returns to not-installed / installable.
result: pass
note: "Badge reverts to installable after a failed/deferred setup (observed reverting after a few minutes). 17-05 clear-stuck-badge behavior confirmed working."

### 10. Scope-fence non-regressions (MACSTEAM-01/04)
expected: The macOS-bottle path does NOT leak into unrelated flows — (a) a native-Mac Steam game still launches via native `steam://` with no bottle prompt; (b) GOG/Epic games still use their existing/shared Wine bottle, not GameLibSteam; (c) on Linux, Steam still delegates to Proton unchanged.
result: skipped
reason: "User deferred — retest later (native-Mac steam://, GOG/Epic shared bottle, Linux Proton)."

## Summary

total: 10
passed: 2
issues: 1              # test 2 retest — original blocker resolved; NEW issues GAP 3/4/5 surfaced
remediated: 2          # GAP 1 (test 2) + GAP 2 (test 3) confirmed resolved on retest round 2
ready_for_retest: 4    # tests 4-7 — depend on setup COMPLETING (blocked by GAP 3 until button/status sync)
pending: 1             # test 8 indicator — retestable independently once a confirmed Windows-only game is loaded
blocked: 0
skipped: 1             # test 10 — deferred by user

open_gaps:             # new issues from retest round 2 — feed into a gap-closure wave
  - "GAP 3 (major): install button/status desync with in-progress bottle setup"
  - "GAP 4 (cosmetic): WineSelector 'use shared wine prefix' ordering"
  - "GAP 5 (minor/UX): SteamSetup installer opens behind the GameLib window"

note: "Retest round 2 (macOS + CrossOver): guided wizard fires, Steam setup starts, and the real SteamSetup.exe installer DOES open — GAP 1 blocker + GAP 2 both resolved. (Installer opened behind the GameLib window = new GAP 5, a z-order issue, not a launch failure.) Remaining new issues: GAP 3 (major) button/status desync, GAP 4 (cosmetic) wizard option order, GAP 5 (minor) installer z-order. Tests 4-7 (login/install/launch/badge) blocked on GAP 3 until setup completion is observable in the UI."

## Gaps

- truth: "Guided setup provisions the GameLibSteam CrossOver bottle and runs the SteamSetup.exe click-through when installing a Windows-only Steam game on macOS"
  status: remediated
  remediated_by: [17-08, 17-10]
  remediation: "17-08: provisioning mkdir's steam_store/redist before the SteamSetup download (fixes the ENOENT that broke the download), and isBottleReady() now gates on a real bottled steam.exe rather than cxbottle.conf existence, so install/launch/uninstall route on real readiness and a half-provisioned bottle self-heals instead of entering the install->revert stuck loop. 17-10: styled .steamBottleSetupToast / .steamBottleSetupMessage (fixes the unstyled banner). Awaiting human re-test on macOS + CrossOver."
  reason: "User reported: first install attempt failed with a 'could not download steam' banner (also cosmetically broken — no background, plain text over the window, try-again/stop options). After Stop + app reload, retrying install shows NO SteamSetup window — just a brief 'installing the game' message, the button reads 'steam installing', then reverts after a few minutes; retrying reproduces the same stuck loop identically."
  severity: blocker
  test: 2
  artifacts:
    - .planning/debug/steam-bottle-provision-stuck-loop.md
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/games.ts
  missing:
    - "mkdir -p of steam_store/redist before SteamSetup download (ENOENT trigger)"
    - "provisioned gate keyed on real bottled steam.exe, not cxbottle.conf existence"
    - "re-entrant / self-healing provisioning when bottle is half-created (conf exists, steam.exe missing)"
    - "CSS for .steamBottleSetupToast / .steamBottleSetupMessage (unstyled banner)"
  root_cause: "provisionBottle() writes cxbottle.conf (bottle.ts:200-206) BEFORE downloading+installing Steam; isBottleProvisioned() gates only on existsSync(cxbottle.conf) (bottle.ts:121-127). The redist download dir is never mkdir'd (bottle.ts:235) -> ENOENT -> download fails -> half-provisioned bottle. Retry sees isBottleProvisioned()==true, skips guided setup, dispatches steam://install to a nonexistent bottled steam.exe -> 'steam installing' badge that reverts (stuck loop). SteamSetup URL itself is live/correct (agent verified HTTP 200). Banner unstyled (zero matching CSS). Confidence HIGH."
  sub_issues:
    - "SteamSetup download fails ('could not download steam') — bottle provisioning cannot complete"
    - "After first failure + reload, provisioning never re-runs SteamSetup; enters an install->revert loop with a persistent 'steam installing' button state"
    - "Cosmetic: the error banner renders with no background — plain text overlaid on the window"

- truth: "Guided setup surfaces a consent dialog and a WineSelector engine/version choice before provisioning the bottle, from every Install/Play entry point"
  status: remediated
  remediated_by: [17-09]
  remediation: "17-09: install()/launch()/uninstall() now await ensurePlatformsCaptured() — a synchronous appdetails platform check — BEFORE the isBottleEligible() gate, so a Windows-only macOS game whose platformsCaptured wasn't yet set no longer falls through to native steam://install; it emits steamBottleSetupRequired and routes into the guided consent + WineSelector flow. Also reconciled the D-08 indicator gate (is_mac_native===false) with the routing gate via steamPlatformsCaptured so UI promise and routing agree. 243/243 steam tests pass, tsc clean. Awaiting human re-test on macOS + CrossOver."
  reason: "User reported: all entry points behave identically — the button jumps straight to 'steam installing' with NO consent dialog and NO WineSelector engine choice. Expected at least a prompt for which Wine/engine version to use before provisioning. Suggests the guided-setup UI (17-06 consent + WineSelector reuse) is not firing; the button flips straight to the (broken) install state."
  severity: major
  test: 3
  artifacts:
    - .planning/debug/steam-bottle-guided-setup-never-fires.md
    - src/backend/storeManagers/steam/games.ts
  missing:
    - "reliable platformsCaptured before install/launch can be triggered (or synchronous appdetails platform check on the install entry)"
    - "decouple isBottleEligible() D-11 gate from the throttled fire-and-forget appdetails fetch race"
    - "reconcile D-08 indicator gate (is_mac_native===false) with routing gate (platformsCaptured===true) so UI promise and routing agree"
  root_cause: "Backend never emits steamBottleSetupRequired because isBottleEligible() requires meta.platformsCaptured===true (games.ts:446-450), which is only set by the throttled fire-and-forget appdetails fetch (games.ts:292-300). When that hasn't completed/failed (cold-cache ETIMEDOUT history), the gate is false and install()/launch() fall through to native steam://install (games.ts:400-418) -> ordinary 'steam installing' badge, no signal, no consent Dialog/WineSelector. Frontend wiring verified intact end-to-end (emit->preload->GlobalState listener->store-><SteamBottleSetup/>). The 5/5 unit test only exercised the store in isolation. Confidence HIGH on mechanism; MEDIUM on why platformsCaptured is false (systematic fetch failure vs timing race)."
  cross_link: "Connected to Issue 1 via leftover cxbottle.conf: a prior partial provision makes isBottleProvisioned() true, which ALSO skips the consent emit and dispatches into a broken bottle — same 'no dialog + stuck installing' symptom. Rule out at runtime."

- truth: "Once the user confirms Steam setup in the wizard, the game-page Install button and status message reflect the in-progress setup (e.g. 'Setting up Steam…' / disabled), staying in sync with the setup toast — and clicking Install while setup is in progress does not dead-end"
  status: failed
  reason: "User reported (retest round 2, macOS + CrossOver): after confirming Steam install in the wizard, the main Install button does NOT update (still reads 'Install') and the game-page message still says 'The Game is not installed' — even though the RIGHT-side toast correctly shows Steam is being set up. Pressing 'Done' in the toast lets you re-open the wizard and re-run 'set up steam' (same result each time). If you do NOT press 'Done', clicking Install does nothing: a quick flash of 'queued' then it reverts to 'game not installed'."
  severity: major
  test: 2
  label: "GAP 3 — install button / status desync with in-progress bottle setup"
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis
  notes: "Regression surfaced only after GAP 1/GAP 2 fixes made the guided flow reachable. Likely the game-page install status is not subscribed to the steamBottleStatus / setup-in-progress state that the toast reads; and the Install click path is re-queued/no-op'd while a setup task is active. Blocks tests 4-7 (can't observe setup completion → can't reach login/install/launch/badge)."

- truth: "The WineSelector wizard presents engine/version options in a sensible order for bottle setup"
  status: failed
  reason: "User reported (retest round 2): cosmetic — the 'use shared wine prefix' option should be moved to the bottom of the WineSelector wizard."
  severity: cosmetic
  test: 2
  label: "GAP 4 — WineSelector 'use shared wine prefix' ordering"
  artifacts: []  # Filled by diagnosis
  missing: []    # Filled by diagnosis

- truth: "When the SteamSetup.exe installer launches, it is visible to the user (frontmost), not hidden behind the GameLib window"
  status: failed
  reason: "User reported (retest round 2): the real SteamSetup.exe installer window opened BEHIND the GameLib window, so it appeared nothing happened. Confirmed the installer does open — this is a z-order/focus issue, not a launch failure."
  severity: minor
  test: 2
  label: "GAP 5 — SteamSetup installer opens behind GameLib window"
  artifacts:
    - src/backend/storeManagers/steam/bottle.ts  # after runWineCommand (~line 328)
    - src/backend/launcher.ts  # precedent: line 176 mainWindow?.hide() on launch
    - src/backend/main_window.ts  # getMainWindow() accessor
  missing:
    - "minimize/hide the GameLib main window (getMainWindow()?.minimize()) right after runWineCommand dispatches SteamSetup.exe, so the installer is frontmost"
    - "optional: toast hint that GameLib minimized to reveal the installer"
  notes: "Cannot force a foreign CrossOver/wine window always-on-top from Electron; the robust lever is to have GameLib step out of the way (precedent: launcher.ts:176)."
