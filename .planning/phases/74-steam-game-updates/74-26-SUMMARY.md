---
phase: 74-steam-game-updates
plan: 26
subsystem: tauri-dialogs
tags: [rust, macos, nsalert, gap-closure, uat-16]
requires: [74-14]
provides:
  - "macOS three-button dialog_message as in-process NSAlert with scoped Esc monitor"
  - "alert_response_choice / is_bare_escape pure helpers"
affects: [src-tauri/src/dialogs.rs, src-tauri/src/main.rs]
key-files:
  modified:
    - src-tauri/src/dialogs.rs
    - src-tauri/src/main.rs
    - .planning/todos/completed/2026-11-13-launch-prompt-esc-does-not-dismiss.md
key-decisions:
  - "Esc resolves as null (dismissal); host maps to cancelId 0 = Play anyway; never Update now"
  - "Two-button and non-macOS three-button paths keep the rfd code unchanged"
requirements-completed: [STEAM-01]
completed: 2026-11-13
---

# Phase 74 Plan 26: Esc dismisses the macOS launch prompt Summary

On macOS the three-button launch prompt is now an in-process NSAlert with a local key-down monitor that turns a bare Esc into a dismissal. The old rfd path was an out-of-process CFUserNotification with no Esc handling for custom labels.

## Commits
- 97c3ba4db fix(74-26): in-process NSAlert + Esc monitor, helpers, unit tests
- 845d09d4d docs(74-26): todo moved to completed with resolution note

## Verification
- cargo tests: alert_response_choice, is_bare_escape, three_button_choice, two_button all pass; shell builds
- clippy ratchet (1.99.1): PASS, no rise (removed an unused unsafe and an unnecessary cast I had introduced)
- pnpm planning-gates: 12/12 pass

## Deviations from Plan
None in behavior. Only the new code is not rustfmt-shaped to the long-line style already present in dialogs.rs (the file was not rustfmt-clean beforehand, and no crate-wide fmt was run).

## Deferred
- Live check (press Esc on the real prompt, confirm it closes and launches the current build) is deferred to the 74-29 live UAT. It cannot be automated in cargo test.

## Threat model
T-74-88: handler reads only keyCode()/modifierFlags(); monitor removed via removeMonitor right after runModal returns. T-74-89: Esc and unknown codes map to null.

## Self-Check: PASSED
