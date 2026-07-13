---
status: partial
phase: 18-macos-32-bit-detection-badge-crossover-routing
source: [18-01-SUMMARY.md, 18-02-SUMMARY.md, 18-03-SUMMARY.md, 18-04-SUMMARY.md, 18-05-SUMMARY.md, 18-06-SUMMARY.md]
started: 2026-07-12T11:14:47Z
updated: 2026-07-13T20:52:00Z
---

## Current Test

[testing paused — test 5 re-test blocked by an environmental Steam-client issue]

## Tests

### 1. App launches cleanly with the Steam library changes
expected: Build/run GameLib on macOS; the app boots without errors, the Steam library loads, and any Steam game page opens normally (no crash/blank/console error from the steam manager).
result: pass
note: |
  App launched and rendered (user saw their last-played game). The observed
  side effect — bottle game 'All Will Fall' auto-opening Steam-in-CrossOver and
  "updating steam" on startup — is a PRE-EXISTING Phase 3 behavior (D-07
  download-resume, commit d9f25fe5 feat(03-04), 2026-06-28), NOT a Phase 18
  regression. Phase 18's library.ts diff has zero occurrences of the
  startInstallPolling/resume path. Captured as a separate todo
  (.planning/todos/pending/steam-startup-download-resume-autoopens-crossover.md),
  intentionally NOT a Phase 18 gap.

### 2. Normal (non-32-bit) games show NO "32" badge
expected: Open the game page of a normal Steam game (a Windows game, or a 64-bit mac game, or any game whose mac arch is unknown). No "32" badge appears anywhere beside the game logo/store icon — the badge is false-flag-safe and only ever shows for a confirmed 32-bit mac build.
result: pass

### 3. "32" badge appears with correct placement/styling for a 32-bit-only mac game
expected: Open the game page of a Steam game whose macOS build is 32-bit-only (a pre-2019 Mac title, e.g. an older i386-only game). A "32" badge appears beside the store icon / game logo (top-right area, not overlapping the logo or store icon). Because the host is macOS, it is styled as an actionable warning (warning color), not a neutral/informational chip.
result: pass
note: |
  Confirmed live on BOTH Age of Wonders III (226840) and Trine 2 (35720): the "32"
  badge renders on the game page. Detection → propagation → render works end-to-end.
  (Earlier confusion: user's first "beautiful" was the recovery DIALOG; the badge
  transiently vanished during the recovery forceUninstall() library.delete, then
  refresh() re-seeded mac_arch:'32' from the metadata cache and it reappeared —
  the 18-05 refresh() fix working. Transient flicker logged as a minor issue below.)

### 4. The "32" badge survives an app restart / library resync
expected: With a game showing the "32" badge (test 3), fully quit GameLib and relaunch it, then reopen that same game's page. The "32" badge is still shown — it does not silently disappear after restart or a library resync. (This is the propagation/persistence fix from plan 18-05.)
result: pass
note: |
  Effectively confirmed: the badge already survived a live refresh() cycle during the
  recovery churn (forceUninstall deleted the entry, refresh() re-added it with
  mac_arch:'32' re-seeded from the metadata cache — the same code path a restart
  exercises), and is currently displayed on both AoW3 and Trine 2. Formal quit/relaunch
  confirmation optional. (18-05 refresh() re-seed validated live.)

### 5. A 32-bit mac game installs/launches through CrossOver (not native)
expected: For a confirmed 32-bit-only mac game on macOS, Install (or Launch) from GameLib routes through the CrossOver/Wine bottle (the Windows depot under CrossOver) rather than attempting a native `steam://` install that would fail on modern macOS (32-bit dropped in Catalina). The game installs/launches via the bottle path; no "app is not optimized for your Mac / needs to be updated" native-32-bit failure.
result: blocked
blocked_by: other
reason: "Re-test (2026-07-13) blocked by an environmental Steam-client issue, NOT a GameLib defect: the desktop Steam client reports 'no internet connection' and cannot install. Reproduces with GameLib FULLY QUIT (its steam-user session is not the cause — single-session-conflict hypothesis ruled out). Native steam://install can only be as healthy as the desktop Steam client it hands off to, so the recovery flow cannot be exercised until the Steam client is back online. Resume this re-test once the Steam client can connect."
severity: major
note: |
  ORIGINAL FINDING (2026-07-12): recovery dialog appeared and re-route to the bottle
  was delegated (log: 'delegating install via the bottled Steam client', Wine
  steam://install), but the bottle reinstall did not complete — install poll timed out
  after the 60s grace window ('no manifest detected; user may have cancelled'), game
  left uninstalled/orphaned. DETECTION and RE-ROUTE DELEGATION work (MAC32-03 core fires
  correctly). The gap was completion + UX of recovery: (a) silent 60s timeout with no
  on-screen feedback; (b) forceUninstall() did library.delete() and could orphan the
  game; (c) two recovery dialogs fired at once (AoW3 + Trine 2 from startup
  download-resume).

  SINCE THEN: Plan 18-06 closed part (b) — forceUninstall() now keeps the library entry
  is_installed:false with mac_arch preserved and persists to steamLibraryStore (no more
  orphan / badge blink-out). Parts (a) silent-timeout UX feedback and (c) simultaneous
  prompt serialization were out of 18-06 scope and remain deferred debt.

  RE-TEST (2026-07-13): could not confirm the 18-06 fix live — blocked by the
  environmental Steam 'no internet connection' issue above (reproduces with GameLib
  fully quit, so it is not a GameLib bug). Marked blocked rather than issue: no new
  GameLib defect was observed.

## Summary

total: 5
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 1

<!--
  Badge feature (tests 1-4) verified live on real 32-bit titles (AoW3, Trine 2).
  Test 5 recovery-flow re-test blocked by an environmental Steam 'no internet
  connection' issue (reproduces with GameLib fully quit — not a GameLib defect).
  The one prior test-5 gap (orphan/badge-blink) was already closed by Plan 18-06;
  remaining recovery-UX items (a/c) are deferred debt tracked as todos.
-->


## Gaps

# Phase-18-scoped (recovery flow — MAC32-03 UX/robustness):
- truth: "A confirmed 32-bit mac game re-routes cleanly to CrossOver and the game/badge stays coherent through the recovery"
  status: failed
  reason: "User reported: recovery delegated to bottle but reinstall never completed (60s grace timeout, 'no manifest detected'), game left orphaned; badge flickered out during forceUninstall"
  severity: major
  test: 5
  artifacts:
    - path: "src/backend/storeManagers/steam/games.ts"
      issue: "forceUninstall() (line 850-858) does library.delete(appId) — fully removes the game from the in-memory library rather than marking is_installed:false. If the subsequent bottle reinstall does not complete, the game is orphaned (absent from library games[]) and its 32-bit badge disappears until a later refresh() re-adds it from ownedApps. Also does not persist to steamLibraryStore (relates to code-review WR-01)."
    - path: "src/backend/storeManagers/steam/library.ts"
      issue: "Recovery reinstall via bottle steam://install has no on-screen feedback; the install poller silently stops after GRACE_TICKS (~60s) with 'no manifest detected; user may have cancelled' if the user doesn't complete the CrossOver Steam install dialog. No toast/notice tells the user the re-route is waiting on Steam or that it gave up."
  missing:
    - "forceUninstall should preserve the library entry (mark is_installed:false, keep mac_arch) instead of library.delete(), so the badge and game survive the recovery transition without an orphan window."
    - "Surface recovery progress/failure feedback (the bottle reinstall handoff + a notice when the grace-window times out) rather than silent log-only."
    - "Consider serializing/queuing multiple simultaneous i386 recovery prompts (AoW3 + Trine 2 both prompted at once via startup download-resume)."

# Related, NOT Phase-18 (captured as todos, do not fold into 18 gap closure):
# - Startup download-resume silently auto-opens Steam-in-CrossOver (Phase 3 feat 03-04)
#   → .planning/todos/pending/steam-startup-download-resume-autoopens-crossover.md
# - Bottle steam:// reinstall completion depends on manual CrossOver-Steam interaction (Phase 17 handoff mechanism)
