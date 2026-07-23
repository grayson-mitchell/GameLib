---
status: partial
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
source: [30-01-SUMMARY.md, 30-02-SUMMARY.md, 30-03-SUMMARY.md, 30-04-SUMMARY.md, 30-REVIEW-FIX.md]
started: 2026-07-22T21:57:57Z
updated: 2026-07-22T22:15:00Z
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
result: blocked
blocked_by: prior-phase
reason: "Cannot access — blocked by Test 4 (install folder picker never opens)"

### 6. Uninstall Reverts Button State
expected: Clicking Uninstall on an installed Steam title removes it and the library button transitions back to Install.
result: blocked
blocked_by: prior-phase
reason: "Cannot access — no game can be installed while Test 4 blocks the install flow"

### 7. Update Check Reports Real Results
expected: The update check runs across runners without one failing runner killing the whole check (WR-05), and triggering an update on a game reports the actual outcome — a failed update surfaces as a failure, not a false "success" (WR-04).
result: skipped
reason: No installed game available to exercise the update path (install flow blocked by Test 4)

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
passed: 3
issues: 3
pending: 0
blocked: 2
skipped: 1
skipped: 0
blocked: 0

## Gaps

- truth: "Clicking Install on a Steam title opens the native folder picker (dialog_open) so an install target can be chosen"
  status: failed
  reason: "User reported: nothing happens when click on install other than the spinner appearing"
  severity: major
  test: 4
  root_cause: ""     # Filled by diagnosis
  artifacts: []      # Filled by diagnosis
  missing: []        # Filled by diagnosis
  debug_session: ""  # Filled by diagnosis

- truth: "The Settings screen is reachable under Tauri, and its file/path pickers open a native picker honoring the requested mode (file vs folder)"
  status: failed
  reason: "User reported: settings cant be reached"
  severity: major
  test: 8
  root_cause: ""     # Filled by diagnosis
  artifacts: []      # Filled by diagnosis
  missing: []        # Filled by diagnosis
  debug_session: ""  # Filled by diagnosis

- truth: "Under the Electron build (npm start), Steam library sync still succeeds exactly as before Phase 30 (additive/reversible invariant — no regression)"
  status: failed
  reason: "User reported: still boots, but trying to sync steam, and failing. gog games are still listed."
  severity: major
  test: 9
  root_cause: ""     # Filled by diagnosis
  artifacts: []      # Filled by diagnosis
  missing: []        # Filled by diagnosis
  debug_session: ""  # Filled by diagnosis
