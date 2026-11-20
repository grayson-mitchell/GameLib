---
phase: quick-261017-cwf
plan: 01
subsystem: notifications
tags: [notifications, macos, tauri-plugin-notification, live-gate, packaged-build]
status: complete
dependency-graph:
  requires: []
  provides:
    - "Source-level explanation of the dev-mode terminal icon"
    - "Packaged-build measurement: no notifications delivered on macOS 26"
  affects: []
tech-stack:
  added: []
  patterns:
    - "Measure a packaged bundle with the real handler before touching notification code; tauri dev borrows Terminal's notification authorization and cannot reproduce packaged behaviour"
key-files:
  created:
    - .planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md
    - .planning/quick/261017-cwf-fix-the-macos-game-uninstalled-notificat/evidence/
  modified:
    - .planning/todos/pending/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md (moved to completed/ via git mv, Closed note appended)
decisions:
  - "No code change. The terminal icon is tauri-plugin-notification's own dev-mode behaviour (set_application(\"com.apple.Terminal\") when tauri::is_dev()), so there is nothing in GameLib to fix for the icon."
  - "The packaged-build result (no notification at all, app never registered with Notification Center) is a different, larger defect and gets its own major todo rather than widening this minor one."
  - "Executed inline by the orchestrator rather than through planner/executor subagents: the task was a live gate on the operator's Mac plus two planning files, and the measurement had to come before any plan could say what to do."
metrics:
  duration: "~70 min, most of it driving the packaged inspector"
  completed: 2026-10-17
actuals:
  tasks: 2
  commits: 1
  plan_head_before: 4335a0c7fe206d27b85efb38040aefd53971f91c
---

# Quick task 261017-cwf: Uninstall notification shows a terminal icon — measured, explained, re-triaged

## What the todo asked

Fix the macOS "Game Uninstalled" notification carrying a terminal icon under `pnpm tauri:dev`,
but first check whether a packaged `.app` shows the same, because dev notifications on macOS are
commonly attributed to the launching terminal.

## Finding 1: the dev icon is by design, in the plugin

`tauri-plugin-notification` 2.3.3, `src/desktop.rs:209-213`:

```rust
let _ = notify_rust::set_application(if tauri::is_dev() {
    "com.apple.Terminal"
} else {
    &self.identifier
});
```

`tauri::is_dev()` (tauri 2.11.5 `src/lib.rs:308`) is `!cfg!(feature = "custom-protocol")`.
`tauri dev` never enables that feature; `tauri build` (release or `--debug`) always does. So every
dev-mode notification is deliberately attributed to Terminal, and Terminal's icon is what macOS
shows. Nothing in GameLib's `notification_show` arm (`src-tauri/src/main.rs:7843`) or the sidecar
stub chooses this. Not a GameLib defect.

## Finding 2: the packaged build shows nothing at all

Arms, all on macOS 26 (Darwin 25.6.0), each with the sidecar handler proven to run by its log lines
(`SteamGame.removeShortcuts not implemented until Phase 2 (appId: …)` and, where the console was
used, `[GATE-cwf] … removeShortcut done false`):

| arm | build | trigger | banner | Notification Centre | sidecar warn |
| --- | --- | --- | --- | --- | --- |
| 1 | `--debug` bundle, ad-hoc signed, `open -n`, fd 1/2 `/dev/null` | inspector console `window.api.removeShortcut('206040','steam')` ×3 | none, either display | nothing | invisible (stderr discarded) |
| 2 | same bundle, binary run directly, stderr to file | same, ×2 | none | nothing | **not printed** — relay returned Ok |
| 3 | release bundle 0.8.0, Developer ID `S7U223QWXJ`, `open -n` | real UI: 7 Days to Die → dots menu → Remove shortcuts | none | nothing | n/a |

System Settings → Notifications lists no `GameLib` before or after any arm (the list runs
`Google Chrome for Testing` → `Heroic`). Terminal is listed with Badges, Sounds, Desktop, which is
why the dev build's notifications do appear. Notification Centre's only GameLib-originated item is
this morning's dev-build "Avernum 5 — Installation Finished" at 7:51, with the terminal icon.

Why nothing surfaces it: the plugin discards the delivery result (`let _ = notification.show()` on
a spawned task, `desktop.rs:218`); its desktop `request_permission()`/`permission_state()` return
`Granted` unconditionally (`desktop.rs:61-67`), so macOS is never asked; `mac-notification-sys`
0.6.15 uses the deprecated `NSUserNotificationCenter` (`objc/notify.m:79`) and its
`setApplication` only checks `LSCopyApplicationURLsForBundleIdentifier` (`notify.m:22`); the
sidecar stub (`src/backend/platform/index.ts`) only `console.warn`s on a relay rejection, and the
packaged shell's stderr is `/dev/null`. Three silent layers.

Filed as `.planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md`,
`severity: major`, `platform: macos`, `ready: code`, with the fix direction (deliver through
`UNUserNotificationCenter` from Rust with a one-time authorization request, keep the current path
as the `is_dev()` fallback, and log delivery failures to the sidecar log).

## Gate notes worth keeping

- The `--debug` bundle's auto-opened Web Inspector was **stalled**: text typed into its console
  prompt appeared, but Return, Cmd+Return and a CGEvent keycode 36 never evaluated anything, and
  `1+1` produced no result. Closing it and opening a fresh one via right-click → Inspect Element on
  the page gave a console where Return worked first time, and the queued commands from the stalled
  one then ran too (three handler lines at 09:30:44–45). Memory updated.
- The debug bundle spawns the sidecar as `node …/build/main/…` from the repo tree with
  `GAMELIB_APP_ROOT=<repo>` (`evidence/debug-bundle-direct-run-stderr.log`), so it is not a
  measurement of the SEA sidecar. The release bundle is.
- The signed release build raised a Keychain prompt for `com.gamelib.launcher` on launch (different
  signature from the dev vault). Denied, not answered; the gate did not need Steam sign-in.

## Evidence

`evidence/`: `02-debug-bundle-console-call-no-banner.jpg`,
`03-notification-centre-after-debug-bundle-arms.jpg`,
`04-settings-notifications-list-no-gamelib-before-release-arm.jpg`,
`05-release-bundle-remove-shortcuts-no-banner.jpg`, `06-notification-centre-after-release-arm.jpg`,
`07-settings-notifications-list-no-gamelib-after-release-arm.jpg`,
`debug-bundle-direct-run-stderr.log`, and the helpers `type.sh`, `click.swift`, `key.swift`,
`scroll.swift`.

## Deviations from the quick workflow

Planner and executor subagents were not spawned. The todo's precondition was a live gate on this
Mac, and its outcome decided whether there was any code to plan; the orchestrator ran the gate
inline (per the standing note that a live gate is orchestrator-run) and wrote the two planning
artifacts itself. No source files changed, so no formatter check applies (`.planning/` is
prettier-ignored) and `graphify update` is not needed.
