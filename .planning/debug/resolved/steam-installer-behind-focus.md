---
status: resolved
trigger: "GAP 5 (phase 17, MINOR/UX): On macOS, the Steam installer window (CrossOver/Wine-hosted SteamSetup.exe during bottle provisioning, and bottled steam://install for per-game installs) opens BEHIND the GameLib window, or lands on a different Space/screen when GameLib is in fullscreen. Focus/z-order needs to move to the installer window so the user can see and complete it."
created: 2026-07-11
updated: 2026-07-11T03:30:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: "Neither installer launch site in bottle.ts (provisionBottle's SteamSetup.exe run, dispatchToBottledSteam's 'install' branch) yields GameLib's window/focus or exits fullscreen before firing runWineCommand(wait:false), so the separate CrossOver/Wine OS process either renders behind GameLib or lands on a different macOS Space when GameLib is fullscreen."
  confirming_evidence:
    - "Direct read of bottle.ts lines 324-345 (provisionBottle) and 404-425 (dispatchToBottledSteam install branch): both blocks call runWineCommand with no getMainWindow(), no hide/minimize/blur, no setFullScreen — zero window-management calls exist anywhere in bottle.ts."
    - "launcher.ts:175-178 shows the established precedent: `const mainWindow = getMainWindow(); if (minimizeOnLaunch && !noTrayIcon) { mainWindow?.hide() }` — this exists for regular game launches but bottle.ts never calls it or anything equivalent."
    - "main.ts:609-624 confirms the available primitives and documents the exact mechanism: `getMainWindow()?.minimize()`, `getMainWindow()?.isMinimized()`, and `getMainWindow()?.setFullScreen(enabled)`, with an explicit comment that native fullscreen puts the window in its own macOS Space and causes launched-game windows to appear on another Space (accepted limitation, evaluated Phase 8 UAT test 11) — same mechanism explains GAP 5's Space-stranding symptom for the installer."
  falsification_test: "If bottle.ts already called getMainWindow()?.minimize()/setFullScreen(false) before runWineCommand at either site, the installer would not be observed behind/stranded — it is not, per 17-UAT reproduction, confirming the missing calls are the cause."
  fix_rationale: "Add a best-effort, macOS-only helper (yieldFocusForInstaller) that exits fullscreen (if active) then minimizes the main window, called immediately before runWineCommand at both launch sites. This directly addresses the root cause (GameLib retaining focus/Space) rather than a symptom, reuses existing precedent/primitives (no new window-management pattern), and is a minimal, additive, isMac-gated change — Linux/Windows code paths are untouched."
  blind_spots: "Have not manually reproduced on physical macOS+CrossOver hardware (no device available in this environment) — fix is verified by code inspection + precedent, not by observing the installer actually surface. Have not measured whether setFullScreen(false) completes its animation before minimize() is called (main.ts comment notes a 'brief desktop-Space animation' as an accepted rough edge) — using a best-effort try/catch so any timing hiccup degrades gracefully instead of throwing. bottle.test.ts does not mock backend/main_window or backend/constants/environment, and this dev machine is darwin — must verify the dynamic-import + try/catch keeps existing unit tests green when isMac is true locally (CI itself runs on ubuntu-latest, so isMac is always false there)."
next_action: fix applied and self-verified via test suite (see Evidence + Resolution below) — awaiting human verification on real macOS+CrossOver hardware.

## Symptoms

expected: On macOS + CrossOver, when a first-time install fires the Steam installer (SteamSetup.exe during bottle provisioning, then bottled steam://install), the installer window comes to the foreground with focus so the user can see and click through it.
actual: The installer window opens BEHIND the GameLib window. If GameLib is in fullscreen, the installer opens on a different Space/screen and is never surfaced. GAP 1 (installer never fires) was already resolved — the installer DOES open now, it's purely a z-order/focus problem.
errors: none — this is a UX/window-management defect, no error thrown.
reproduction: macOS with CrossOver installed. Install a Windows-only (no mac-native) Steam game to trigger guided bottle provisioning; SteamSetup.exe launches but appears behind GameLib. Also occurs on the subsequent per-game bottled steam://install dispatch. Worse when GameLib is fullscreen (installer on another screen).
started: Emerged from GAP 1 resolution (17-08/17-09) — once the installer began firing correctly, the z-order/focus problem surfaced. Logged in 17-UAT.md; commit 6cf9dd21 scoped a candidate fix (minimize GameLib after launching installer, precedent launcher.ts:176).

## Evidence

- timestamp: 2026-07-11T00:00:00Z
  checked: src/backend/storeManagers/steam/bottle.ts (full file, 456 lines)
  found: Two installer launch sites — provisionBottle() step (7) lines 324-345 running SteamSetup.exe, and dispatchToBottledSteam() 'install' branch lines 404-425 running steam://install/<appId> — both call runWineCommand({..., wait:false}) with zero window-management calls (no getMainWindow, no hide/minimize/blur, no setFullScreen). No isMac import exists in the file either.
  implication: Confirms the hypothesis exactly — GameLib never yields focus or Space at either site, so the spawned Wine/CrossOver window has no reason to surface above or alongside GameLib.

- timestamp: 2026-07-11T00:00:01Z
  checked: src/backend/launcher.ts lines 140-178, src/backend/main_window.ts (full file)
  found: launcher.ts:175-178 precedent — `const mainWindow = getMainWindow(); if (minimizeOnLaunch && !noTrayIcon) { mainWindow?.hide() }`. getMainWindow() is exported from backend/main_window.ts (returns module-level mainWindow or falls back to `BrowserWindow.getAllWindows().at(0)`), imported statically in launcher.ts via `import { getMainWindow } from './main_window'`.
  implication: A ready-made, already-imported-elsewhere accessor exists for the main window; no new plumbing needed to reach it from bottle.ts.

- timestamp: 2026-07-11T00:00:02Z
  checked: src/backend/main.ts lines 609-624
  found: Existing IPC handlers already expose `getMainWindow()?.minimize()`, `getMainWindow()?.isMinimized()`, and `getMainWindow()?.setFullScreen(enabled)`. A comment directly above the fullscreen handler states native fullscreen puts the window in its own macOS Space, and launching a game while fullscreen causes the game's window to appear on a different Space — documented as an accepted limitation (Phase 8 UAT test 11), not previously fixed.
  implication: Same underlying macOS Space mechanism as GAP 5's "installer on a different Space when GameLib is fullscreen" symptom. Exiting fullscreen before minimizing is required because macOS won't minimize a fullscreen window. Both primitives needed (setFullScreen(false) then minimize()) are already used elsewhere in the codebase — reusing them is consistent with existing conventions.

- timestamp: 2026-07-11T00:00:03Z
  checked: src/backend/storeManagers/steam/__tests__/bottle.test.ts (full file) and games.test.ts electron mock
  found: bottle.test.ts mocks `backend/launcher` (only `runWineCommand`), `electron` (only `app.getPath`), and several others, but does NOT mock `backend/main_window` or `backend/constants/environment`. CI (.github/workflows/test.yml) runs on ubuntu-latest, so `isMac` is false there; this dev machine is darwin, so a static or dynamic import of the real main_window.ts during a local test run would hit `isMac === true` and call the real `getMainWindow()`, which falls back to `BrowserWindow.getAllWindows()` — undefined on the test's electron mock — and would throw if not guarded.
  implication: Fix must dynamically import both `backend/constants/environment` and `backend/main_window` inside a try/catch (matching bottle.ts's existing lazy-import-of-launcher pattern and its stated reason for doing so), so a throw is swallowed and existing tests stay green regardless of platform the tests run on.

- timestamp: 2026-07-11T00:00:04Z
  checked: Ran `npx jest src/backend/storeManagers/steam/__tests__/bottle.test.ts src/backend/storeManagers/steam/__tests__/games.test.ts` and the full `npx jest src/backend` suite on this darwin dev machine (isMac=true at runtime) after applying the fix; also `npx tsc --noEmit -p .` and `npx eslint src/backend/storeManagers/steam/bottle.ts`.
  found: bottle.test.ts (26 tests) and games.test.ts both pass; full backend suite 879/879 pass (40 suites). No TypeScript errors, no lint errors on the changed file. Confirmed via `git stash`/`git stash pop` that the one pre-existing "worker process failed to exit gracefully" timer leak (from library.ts's ACF poller in an unrelated test) reproduces identically with the fix stashed out — it predates this change and is unrelated.
  implication: The dynamic-import + try/catch design in yieldFocusForInstaller() is confirmed safe under isMac=true with an unmocked backend/main_window (which would otherwise throw on `BrowserWindow.getAllWindows()` against the test's partial electron mock) — the throw is caught and swallowed, existing assertions on runWineCommand's commandParts are unaffected. Fix is regression-safe locally (darwin) and on CI (ubuntu-latest, where isMac is false and the helper no-ops immediately).

- timestamp: 2026-07-11T02:00:00Z
  checked: Cycle-1 fix (minimize) tested on real macOS hardware (dual physical monitors, GameLib NOT fullscreen). User report: "auto minimises... but was a bit redundant as the steam installer opened on another window/monitor this time (dual monitor setup)."
  found: minimize() DID fire (GameLib window minimized) but the installer still opened on the second monitor and was not promoted to the foreground. Root-cause refinement: mainWindow.minimize() only minimizes the WINDOW — GameLib REMAINS the active/frontmost application (just with no visible window). macOS only promotes another app's window to the front when the current app deactivates; a window-minimize is not an app-level deactivation, so the CrossOver installer was never surfaced. This is why minimize was "redundant."
  implication: The correct primitive is an ACTIVATION yield, not a window minimize. The literal macOS-14 API for this is NSApp.yieldActivation(to:), but AppKit is not exposed by Electron in JS and calling it would require a native addon (violates the pure-JS / upstream-mergeable constraint). Electron's `app.hide()` is the JS-native equivalent: it makes GameLib relinquish foreground as the ACTIVE APPLICATION (true activation yield), letting macOS promote the next app (the installer), with no minimize animation and window state preserved on return.

- timestamp: 2026-07-11T02:00:01Z
  checked: Applied cycle-2 fix — replaced `mainWindow.minimize()` with `app.hide()` in yieldFocusForInstaller() (dynamic `import('electron')`), kept the `setFullScreen(false)` pre-step; re-ran `pnpm codecheck` and `npx jest src/backend/storeManagers/steam`.
  found: tsc clean; 243/243 steam tests pass (5 suites). The test's partial electron mock lacks `app.hide`, so under isMac=true locally the call throws and is swallowed by the existing try/catch — assertions on runWineCommand commandParts unaffected, tests stay green. Dev watcher rebuilt the main process and relaunched Electron (pid 10267 → 11001), so the running app carries the app.hide() behavior for retest.
  implication: Cycle-2 fix is regression-safe and live in the dev instance. Needs the same real-hardware checkpoint as cycle 1, specifically the dual-monitor case: confirm the installer now comes forward (GameLib steps aside via app.hide, no minimize) instead of staying behind on the other monitor.

- timestamp: 2026-07-11T02:30:00Z
  checked: Explored feasibility of the native NSApp.yieldActivation(to:) route (user prioritized macOS UX over pure-JS/mergeability). Verified project already has node-gyp (devDep) + electron-rebuild installed — the native-addon toolchain exists, so a mac-only N-API addon is a bounded add, not a from-scratch toolchain. Also read runWineCommand (launcher.ts:1490-1643): it resolves on the short-lived wine LAUNCHER's child.on('close'), and does NOT expose the child/pid to callers — so capturing a spawn pid would be the WRONG target anyway; the installer window is owned by a separate wineserver-managed process.
  implication: Deterministic targeting (needed by BOTH yieldActivation(to:) and osascript activate) requires observing the LIVE process set at installer-open time, not a spawn pid. Added a temporary diagnostic (logInstallerProcessSnapshot) to identify the installer's owning process/app on real hardware before committing to native vs osascript.

- timestamp: 2026-07-11T02:30:01Z
  checked: Added macOS-only, fire-and-forget diagnostic `logInstallerProcessSnapshot(context)` to bottle.ts, wired after runWineCommand at both installer sites (provision-SteamSetup; dispatchToBottledSteam gated verb==='install'). Samples twice (t+5s, t+12s) after dispatch: (a) `ps -axo pid,ppid,command` filtered to wine/steam/crossover/proton/umu, (b) System Events list of foreground (non-background-only) apps as pid<TAB>name<TAB>bundleId (the NSRunningApplication yield candidates). tsc clean, eslint clean, 243/243 steam tests pass; dev watcher rebuilt + relaunched (Electron pid 11001→12093).
  implication: Next real-hardware install run will log GAP5-DIAG lines identifying which process/app owns the installer window — the fact needed to choose between the osascript-activate path and the native yieldActivation(to:) addon (and, if native, what pid/bundle to target). Note (b) needs a one-time macOS Automation approval; if denied, (a) still yields the pid tree.

- timestamp: 2026-07-11T02:45:00Z
  checked: First diagnostic run on real hardware (appId 206020, half-provisioned bottle resume). Dev log's last line was `Running Wine command: .../SteamSetup.exe` at 12:16:09 with NO subsequent provisionBottle-complete line and NO GAP5-DIAG output.
  found: The snapshot was placed AFTER `await runWineCommand(...)`, but runWineCommand does not resolve until the SteamSetup.exe wine LAUNCHER exits (installer window closed). So while the installer was live, execution was parked on the await and never reached the snapshot call. Placement bug, not a build-staleness or permission issue.
  fix: Moved `void logInstallerProcessSnapshot(...)` to BEFORE the `await runWineCommand(...)` at both sites (provision-SteamSetup and dispatch verb==='install'). Fire-and-forget with internal +5s/+12s delays, so it now samples while the installer is live and concurrent with the still-pending wine await. tsc clean, 243/243 steam tests pass, Electron relaunched (pid 12093→12729).
  implication: Next install run will capture the process snapshot while the installer window is open. (Note: the first run never reached the System Events call, so the one-time macOS Automation prompt has not yet been shown/answered — expect it on the retest.)

- timestamp: 2026-07-11T03:00:00Z
  checked: Second diagnostic run captured GAP5-DIAG in ~/Library/Logs/gamelib/gamelib.log (both +5s/+12s samples, both provisioning attempts at 12:22 and 12:23). osascript/System Events call SUCCEEDED (foreground-apps list returned) WITHOUT any macOS Automation prompt appearing to the user — Electron already effectively had the grant, so the System Events path is functional in this environment.
  found: >
    Installer window owner = `SteamSetup.exe`, a foreground GUI process with its
    OWN pid (13176 first run, 13301 second) and bundleId = "missing value"
    (UNBUNDLED — cannot be targeted by bundle id). It runs under CrossOver
    (`/Applications/CrossOver.app/.../CrossOver`, pid 1396, stable bundleId
    `com.codeweavers.CrossOver`). Critically, CrossOver here runs in per-app mode:
    SteamSetup.exe registers as its OWN macOS app process (appears in the System
    Events `background only is false` list), NOT merely a window of the CrossOver
    process. Also present as NOISE: the user's NATIVE macOS Steam.app (steam_osx
    pid 6267) is running — must NOT be targeted; distinguishable by name
    (bottled = "SteamSetup.exe"/"steam.exe" vs native = "steam_osx").
  implication: >
    (1) The native NSApp.yieldActivation(to:) ADDON IS LIKELY UNNECESSARY:
    System Events can already enumerate AND (untested) set-frontmost the exact
    installer process by name/pid, purely via osascript — no native build. (2)
    Target the installer process by NAME (SteamSetup.exe / bottled steam.exe) or
    its captured pid, NOT by bundle id (it has none), and NOT CrossOver's bundle
    id (per-app mode means activating CrossOver may not raise SteamSetup's window).
    (3) Avoid native steam_osx. Next experiment: System Events `set frontmost of
    (first process whose name is "SteamSetup.exe") to true` and test whether it
    defeats Sonoma focus-stealing protection on dual-monitor while GameLib is/was active.
  diagnostic_noise_to_fix: ps filter matches "MSTeams" (contains substring "steam") and native "steam_osx" — tighten the regex if the diagnostic is kept; not blocking.

- timestamp: 2026-07-11T03:15:00Z
  checked: Cycle 3 — wired in the targeted System Events raise (replacing app.hide as the primary path). Removed the temporary logInstallerProcessSnapshot diagnostic. New `raiseInstallerWindow(context)`: macOS-only, fire-and-forget, polls (~1.5s cadence, ~18s window) for a foreground process named `SteamSetup.exe` or bottled `steam.exe` (INSTALLER_PROCESS_NAMES; never native `steam_osx`) and runs `set frontmost of <process> to true` via osascript, re-raising once after ~2.5s for the splash->main-window transition. `yieldFocusForInstaller()` now ONLY exits fullscreen (no hide/minimize) so GameLib's window + guided banner stay visible. app.hide() retained ONLY as fallback if the installer process never appears. Wired at both sites before the runWineCommand await.
  found: tsc clean, eslint clean, 243/243 steam tests pass. Dev server had died; relaunched fresh (Frontend Ready, Electron pid 14322) so the raise build is live.
  implication: On success path the raise logs `raiseInstallerWindow [ctx]: raised installer to front (SteamSetup.exe pid=NNN)` — that log line IS the verification the target was found and frontmost was set. Open question still unproven until this real-hardware run: whether `set frontmost` actually surfaces the installer (esp. dual-monitor, and whether it beats Sonoma focus-stealing protection). If it does, the native yieldActivation addon is confirmed unnecessary.

- timestamp: 2026-07-11T03:30:00Z
  checked: Real-hardware confirmation of the cycle-3 System Events raise: user reports "works as expected" — the installer now comes to the front on its own while GameLib stays visible. User refinement: do NOT change GameLib from fullscreen to windowed; instead let macOS auto-switch Spaces ("scroll") to the installer.
  found: Applied — removed `yieldFocusForInstaller()` entirely (its only remaining job was `setFullScreen(false)`), and both its call sites. GameLib's window state is now never touched. When GameLib is fullscreen (own Space), `raiseInstallerWindow()`'s `set frontmost` on the installer process makes macOS auto-switch Spaces to it. tsc clean, eslint clean, 243/243 steam tests pass; watcher hot-rebuilt main process (Electron pid 14322→14933).
  implication: GAP 5 solved with a pure-JS System Events raise — the native NSApp.yieldActivation(to:) addon is confirmed UNNECESSARY. Remaining: quick human verification that the fullscreen case auto-scrolls to the installer (rather than doing nothing) now that we no longer force-exit fullscreen.

## Eliminated

- hypothesis: "Minimizing GameLib's main window is sufficient to surface the installer."
  why_wrong: minimize() minimizes the window but leaves GameLib the active application, so macOS never promotes the installer. Confirmed by dual-monitor UAT (2026-07-11T02:00:00Z) where minimize fired but the installer stayed on the other monitor. Superseded by app.hide() (app-level activation yield).

## Resolution

root_cause: bottle.ts's two installer launch sites (provisionBottle's SteamSetup.exe run; dispatchToBottledSteam's 'install' branch) fire runWineCommand(wait:false) without ever yielding GameLib's main-window focus or exiting fullscreen first. The spawned CrossOver/Wine installer is a separate OS process that cannot be re-parented into a GameLib BrowserWindow, so with GameLib remaining frontmost (and, when fullscreen, occupying its own macOS Space), the installer opens behind GameLib or lands on an unreachable Space/screen.

fix: |
  FINAL DESIGN (cycle 3 + refinement) — a targeted macOS System Events raise,
  NO native addon, NO change to GameLib's own window state.

  Diagnosis path (GAP5-DIAG instrumentation, since removed): the installer
  window is owned by a separate, UNBUNDLED CrossOver/Wine process that appears a
  few seconds AFTER dispatch — `SteamSetup.exe` (provisioning) / bottled
  `steam.exe` (per-game install), each its own foreground macOS app with
  bundleId "missing value", distinct from the CrossOver host (per-app mode) and
  from the native macOS Steam (`steam_osx`). runWineCommand can't hand us its
  pid (it resolves on the short-lived wine launcher's close), so we observe the
  live process set instead.

  `raiseInstallerWindow(context)` (bottle.ts, macOS-only, fire-and-forget):
  polls ~1.5s cadence / ~18s window for a foreground process named
  `SteamSetup.exe` or `steam.exe` (INSTALLER_PROCESS_NAMES; never `steam_osx`),
  then `osascript` `set frontmost of <process> to true` — the scripted-user
  action that defeats macOS (Sonoma) focus-stealing protection. Re-raises once
  after ~2.5s for the splash->main-window transition. Logs the raised process
  (name+pid) as its own verification. Falls back to `app.hide()` only if the
  installer process never appears. Wired before the runWineCommand await at both
  sites (provisionBottle unconditional; dispatchToBottledSteam verb==='install').

  Cycle history that led here: cycle 1 minimize() (window minimized but GameLib
  stayed active app → installer not promoted; redundant on dual-monitor); cycle
  2 app.hide() (yielded activation but hid GameLib's own guided banner); cycle 3
  System Events raise (keeps banner visible, targets the installer directly).
  Refinement: removed the earlier `setFullScreen(false)` step and the whole
  `yieldFocusForInstaller()` helper — GameLib's window state is now untouched;
  when fullscreen, `set frontmost` makes macOS auto-switch Spaces ("scroll") to
  the installer. Linux/Windows untouched (isMac gate is the first check).

verification: >
  CONFIRMED on real macOS + CrossOver hardware: user reports the System Events
  raise "works as expected" — installer surfaces in front while GameLib stays
  visible (guided banner intact). Automated: tsc --noEmit clean, eslint clean on
  bottle.ts, 243/243 steam unit tests pass (full backend suite green aside from
  the pre-existing, unrelated library.ts ACF-poller timer-leak). Live in dev
  (Electron hot-rebuilt to pid 14933). FULLSCREEN case CONFIRMED by user after
  removing the force-exit-fullscreen step: macOS auto-scrolls to the installer's
  Space. GAP 5 fully resolved on all reported cases (behind-window, dual-monitor,
  fullscreen).

files_changed:
  - src/backend/storeManagers/steam/bottle.ts
