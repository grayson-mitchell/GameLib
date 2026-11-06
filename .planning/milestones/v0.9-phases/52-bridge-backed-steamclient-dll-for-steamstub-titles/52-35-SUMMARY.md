---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 35
subsystem: steam-bridge
tags: [uat, live-gate, steamstub, notification]
requires: [52-33, 52-34]
provides:
  - "52-UAT items 30-31 scored; item 2 settled skipped"
affects: [phase-52-verification]
key-files:
  modified:
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/52-UAT.md
    - .planning/phases/52-bridge-backed-steamclient-dll-for-steamstub-titles/deferred-items.md
    - .planning/todos/pending/2026-10-23-forwarding-steamclient-dll-for-steamstub-titles.md
    - .planning/STATE.md
    - .planning/ROADMAP.md
requirements-completed: []
metrics:
  completed: 2026-10-24
---

# Phase 52 Plan 35: Amended done-when live gate Summary

The live gate ran, and the amended done-when is NOT passed. Item 31 passes. Item 30 is an issue, because the operator never saw the SteamStub notice. The phase is not closed.

## Outcome

- **Item 30: issue.**
  - Every log conjunct held in `gamelib-amended-1.log`:
    - `drmWrapper=steamstub` (line 65)
    - forwarder placed (line 77)
    - HELLO for 219990 (line 83)
    - FWD SteamClient017 and SteamClient014 `native=present` (lines 84-85)
    - `[bridge-notice] ... steamstub-forwarded:launch-check-unsatisfiable` (line 79)
    - no `steamstub-unforwarded`
    - no notify() skipped or not-delivered line
  - The game stopped after 30 s (line 87).
  - Operator, verbatim: "no notice that i saw, error dialog, think was application load error, no did not reach menu". No dialog caption is recorded, because the operator was unsure of it.
  - The honest-notice conjunct needs the notice to be seen. The log line proves only that the trigger fired.
- **Item 31: pass.**
  - Harness MODE=trace on a fresh clone: `steam://run` 0.
  - steamclient64.dll Loaded line present (cxlog 23478), helper HELLO 1.
  - Clone shim, forwarder and SteamClientDll64 all equal the product's.
  - Recorded, not pass conditions: IsSteamRunning 1, MSGBOX lookup at 23623, alive at 90 s.
- **Item 2:** settled `skipped — superseded`, not a pass.
- **UAT Summary:** total 31, passed 15, issues 9, pending 0, skipped 7, blocked 0.
- `bridge-verified: not claimed`. In-Game was not used as evidence.

## Desk diagnosis of the missing notice (read only, no code changes)

- notify() in `src/backend/dialog/dialog.ts` calls the Electron-shim `Notification.show()`.
- In the Rust shell, `select_notification_backend` (`src-tauri/src/notification_backend.rs`) chooses UserNotifications only in a bundled `.app` with a bundle id and not in dev. Any other launch gets the Plugin backend (notify-rust, deprecated NSUserNotificationCenter).
- The header of `macos_notifications.rs` documents that this plugin path silently drops notifications on macOS 26, with no failure event. That matches the empty "not delivered" and "skipped" counts.
- The plan launched the raw `target/debug/gamelib-shell` binary, so the Plugin backend was selected. `gamelib-shell.log` has no `notification authorization:` line for pid 38247. Earlier .app runs log `granted=true`.
- The stubbed notice at gamelib.log line 71 goes through the same notify() (`maybeNotifyBridgeLimited`, `games.ts` ~2692-2723). It is also gated on `verdict.limitedNoticeShown`, so its non-appearance is explained the same way.
- Probable cause: the gate's launch mode, not the 52-34 trigger. This is unproven until the trigger is run from `GameLib.app`.

## Deviations from Plan

- **Close-out deliberately not performed.** The coordinator's rule: if item 30 does not pass, do not close the phase.
  - Forwarding todo stays pending, with a Round 5 evidence section.
  - No static-RE todo created.
  - UAT stays `status: testing`, with a new Gaps entry.
  - STATE `stopped_at` says `next /gsd-plan-phase 52 --gaps`.
  - deferred-items entry 7 records "NOT closed".
- ROADMAP: the 52-35 line is ticked and the Plans line reads 35/35 plans executed, because the plans did execute. The phase is not marked complete. The "plans complete" wording that the plan asked for was avoided.
- **[Rule 3 - Blocking]** An orphaned sidecar (pid 36509) left by the operator's quit `tauri dev` session was SIGTERMed before the launch.

## Needed: new gap closure

Run `/gsd-plan-phase 52 --gaps` for:

- **(a)** Re-run item 30 from the bundled `src-tauri/target/debug/bundle/macos/GameLib.app` with notifications authorized, to confirm the notice is seen.
- **(b)** If it is still not seen, make delivery observable (an in-app dialog, or a logged delivery result) instead of fire-and-forget notify().

## Session

`/tmp/gamelib-gate-52w-20261024T093736Z` (symlink `/tmp/gamelib-gate-52w-current`). It holds `gamelib-amended-1.log`, `round-amended.cxlog`, `round-amended.helper.log`, `terminal.log` and `gamelib-shell.out`.

## Commits

- db6d31200: items 30-31 appended to 52-UAT.
- The close-out docs commit follows this summary.
