---
status: partial
phase: 17-steam-on-macos-via-crossover-wine-windows-only-steam-games-i
source:
  - 17-03-SUMMARY.md
  - 17-04-SUMMARY.md
  - 17-05-SUMMARY.md
  - 17-06-SUMMARY.md
started: 2026-07-11T00:00:00Z
updated: 2026-07-11T00:00:00Z
---

## Current Test

[testing paused — 2 issues to diagnose; test 10 deferred by user]

## Tests

### 1. Cold Start Smoke Test
expected: Fully quit GameLib, then relaunch from scratch. App boots without errors and the library loads — Steam games appear alongside Epic/GOG/Amazon. No crash, no blank library, no stuck startup spinner.
result: pass

### 2. Guided bottle provisioning + SteamSetup click-through (MACSTEAM-02)
expected: On macOS with CrossOver installed, hit Install/Play on a Windows-only Steam game (one with no native Mac build). A consent dialog explains a Windows Steam bottle is needed. Accepting kicks off a background task that provisions the dedicated `GameLibSteam` CrossOver bottle and opens the real (non-silent) SteamSetup.exe installer window for you to click through.
result: issue
reported: "First install attempt: banner 'could not download steam' with try-again/stop options; banner was cosmetically broken (no background, just text over the window). Chose Stop, reloaded the app, clicked Install again -> no SteamSetup window at all, just a quick 'installing the game' message and the button changed to 'steam installing'; after a few minutes it reverts and pressing Install again reproduces the same result (stuck loop)."
severity: blocker

### 3. Guided flow fires from all entry points (MACSTEAM-04)
expected: The same guided setup can be triggered from every Install/Play surface — the game-details page button, the library grid tile, and the install modal. All three reach the same consent-then-provision flow (not just one).
result: issue
reported: "All entry points follow the same broken pattern — the button goes straight to 'steam installing'. There is no consent dialog and no WineSelector engine/version choice; it should at least give the option for which version of Wine before provisioning."
severity: major

### 4. One-time bottled Steam login persists (MACSTEAM-03)
expected: After SteamSetup completes, the bottled Windows Steam client opens and you log in once. The login persists — relaunching a bottled game later does NOT force you to log in to Steam again each time.
result: blocked
blocked_by: prior-phase
reason: "Cannot reach — bottle provisioning / SteamSetup never completes (tests 2 & 3). No bottled Steam client exists to log into."

### 5. Install a Windows-only game through the bottle (MACSTEAM-04)
expected: Triggering Install on a Windows-only Steam game downloads/installs it through the bottled Windows Steam client (not via native `steam://` and not by wine-running a bare exe). Install progresses and completes.
result: blocked
blocked_by: prior-phase
reason: "Cannot reach — no provisioned bottle / bottled Steam client (tests 2 & 3)."

### 6. Launch a bottled game (MACSTEAM-04)
expected: Pressing Play on the installed bottled game launches it through the bottled Windows Steam client and the game runs.
result: blocked
blocked_by: prior-phase
reason: "Cannot reach — nothing installed in a bottle (tests 2 & 3)."

### 7. Install badge shows Windows + bottle path (MACSTEAM-05)
expected: For the installed bottled game, the Install Info shows platform "Windows" (not macOS) and the install path points into the GameLibSteam bottle's steamapps root — not a host-OS Steam library.
result: blocked
blocked_by: prior-phase
reason: "Cannot reach — no bottle install exists to inspect (tests 2 & 3)."

### 8. "Runs via Windows Steam bottle" indicator (MACSTEAM-06)
expected: The game page for a confirmed-Windows-only Steam game shows a "Runs via Windows Steam bottle" indicator row. A native-Mac Steam game does NOT show this row.
result: blocked
blocked_by: prior-phase
reason: "Deferred — pending fix of the provisioning flow; can retest the indicator row alongside a working install. (Indicator is display-gated on confirmed-not-native, testable independently, but grouped here to retest after fix.)"

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
issues: 2
pending: 0
blocked: 5
skipped: 1

## Gaps

- truth: "Guided setup provisions the GameLibSteam CrossOver bottle and runs the SteamSetup.exe click-through when installing a Windows-only Steam game on macOS"
  status: failed
  reason: "User reported: first install attempt failed with a 'could not download steam' banner (also cosmetically broken — no background, plain text over the window, try-again/stop options). After Stop + app reload, retrying install shows NO SteamSetup window — just a brief 'installing the game' message, the button reads 'steam installing', then reverts after a few minutes; retrying reproduces the same stuck loop identically."
  severity: blocker
  test: 2
  artifacts: []
  missing: []
  sub_issues:
    - "SteamSetup download fails ('could not download steam') — bottle provisioning cannot complete"
    - "After first failure + reload, provisioning never re-runs SteamSetup; enters an install->revert loop with a persistent 'steam installing' button state"
    - "Cosmetic: the error banner renders with no background — plain text overlaid on the window"

- truth: "Guided setup surfaces a consent dialog and a WineSelector engine/version choice before provisioning the bottle, from every Install/Play entry point"
  status: failed
  reason: "User reported: all entry points behave identically — the button jumps straight to 'steam installing' with NO consent dialog and NO WineSelector engine choice. Expected at least a prompt for which Wine/engine version to use before provisioning. Suggests the guided-setup UI (17-06 consent + WineSelector reuse) is not firing; the button flips straight to the (broken) install state."
  severity: major
  test: 3
  artifacts: []
  missing: []
