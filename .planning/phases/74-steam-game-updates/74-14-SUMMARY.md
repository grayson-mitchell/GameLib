---
phase: 74-steam-game-updates
plan: 14
subsystem: steam-update-launch-gate
tags: [steam, bridge, update-prompt, rfd, gap-closure]
requires: []
provides:
  - three-button native message box (YesNoCancelCustom)
  - single safe launch gate for stale bridge games
  - bounded pre-launch PICS check (connect included)
affects: [src-tauri/src/dialogs.rs, updateLaunchPrompt.ts, updateDetection.ts, library.ts]
key-files:
  modified:
    - src-tauri/src/dialogs.rs
    - src-tauri/src/main.rs
    - src/backend/storeManagers/steam/updateLaunchPrompt.ts
    - src/backend/storeManagers/steam/updateDetection.ts
    - src/frontend/helpers/library.ts
    - public/locales/en/gamelib.json
  created:
    - src/frontend/helpers/__tests__/libraryLaunchSteamUpdatePrompt.test.ts
key-decisions:
  - "Play anyway is button 0 and cancelId 0; only response 1 queues an update"
  - "three_button_choice does not map Ok: a fallback must never pick a button"
requirements-completed: [STEAM-01, STEAM-02]
completed: 2026-11-13
---

# Phase 74 Plan 14: Launch gate gap closure Summary

Stale bridge game Play now shows one three-button prompt (Play anyway / Update now / Don't ask again) where dismissal and fallback mean Play anyway; Play aborts with a notice during a running or waiting update; the pre-launch PICS check is bounded around connect plus read.

## Commits
- d40a9f640 feat(74-14): three-button native message box (dialogs.rs, main.rs)
- 7fae274fc fix(74-14): safe launch gate, in-flight/queued block, bounded PICS
- fd0fd6483 fix(74-14): suppress inherited Heroic update prompt for Steam

## Details
- `three_button_choice` plus `YesNoCancelCustom` for 3-element `buttons`; 2-button path unchanged. Rust tests added (`three_button_choice_maps_clicks_and_never_guesses`); two_button test still passes; clippy ratchet PASS. No prettier parser for .rs (`inferredParser: null`), so no prettier check applied there.
- Gate: ACF bit-4 check, then in-flight (`nativeInstallsInFlight`, not aborted) -> `updating` notice/abort; then queued element + queue `running` -> `queued` notice/abort; paused/idle/stopped falls through to the prompt. Removed the `if (queued) return 'launch'` shortcut. Two new en keys `steam.update.prompt.updating` / `queued` (74-20 translates them).
- updateDetection.ts: `anonymousClient.get('update-check')` (line ~233) now sits inside the async fn passed to `withTimeout`; no new timers. Fake-timer test covers a hung connect and a late rejection.
- library.ts: inherited `gamepage:box.update` dialog skipped for Steam via `isStore(runner, 'steam')` (the plan's literal `runner === 'steam'` is rejected by the repo's no-restricted-syntax lint rule).

## Other three-button showMessageBox callers
None found that reach the native box. Only `updateLaunchPrompt.ts` (cancelId 0 now). `utils.ts` VCRuntime and `appShellFlowRegistration.ts` snap warning use the modal path (showDialogBoxModalAuto), unaffected. Note: the dialog.ts policy docstring and the 260919-sch comment in utils.ts still say native boxes cannot express 3 buttons; not changed here.

## Deviations from Plan
- [Rule 3 - lint] used `isStore` instead of `runner === 'steam'` (see above). Acceptance grep for the literal therefore does not match.
- Added `?.` in the new test to satisfy tsc.

## Verification
cargo tests, clippy ratchet PASS, jest (updateLaunchPrompt, updateDetection*, frontend helpers 248 tests), codecheck, lint (0 errors), prettier on TS files. `graphify update .` run.

## Self-Check: PASSED
