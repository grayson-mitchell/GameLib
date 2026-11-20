---
phase: quick-261017-cwf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/todos/pending/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md
  - .planning/todos/completed/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md
  - .planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md
autonomous: true
requirements: [TODO-261016-STEAM-UNINSTALL-NOTIFICATION-TERMINAL-ICON]

estimate:
  tokens: 40000
  raw_tokens: 40000
  tasks: 2
  confidence: medium

must_haves:
  truths:
    - "The terminal icon on the dev build's notifications is explained from the vendored plugin source, not inferred"
    - "A packaged .app was actually run and a notification actually triggered through the real sidecar handler before any code decision was made (the todo's own precondition)"
    - "Whatever the packaged build shows is recorded with evidence, and any defect it exposes gets its own triaged todo instead of being folded into this one"
    - "The source todo is in .planning/todos/completed/ with its frontmatter unchanged and a Closed note naming 261017-cwf"
  artifacts:
    - path: ".planning/todos/completed/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md"
      provides: "Closed source todo with the measured verdict"
      contains: "261017-cwf"
    - path: ".planning/quick/261017-cwf-fix-the-macos-game-uninstalled-notificat/evidence/"
      provides: "Screenshots of Notification Centre and System Settings, the direct-run stderr, and the console/click helpers"
  key_links:
    - from: "tauri-plugin-notification 2.3.3 src/desktop.rs set_application branch"
      to: "tauri 2.11.5 src/lib.rs is_dev()"
      via: "is_dev() is !cfg!(feature = custom-protocol); tauri dev never enables that feature, tauri build always does"
      pattern: "com.apple.Terminal"
---

<objective>
Action the pending todo "Uninstall notification shows a terminal icon instead of the GameLib icon"
(`severity: minor`, `platform: macos`, `ready: code`). The todo itself says: measure a packaged
`.app` before changing code, because dev notifications on macOS are commonly attributed to the
launching terminal. So: explain the dev-mode icon from source, run a packaged build, fire a
real notification through the real sidecar path, record what appears, and close the todo on
evidence.

Purpose: the operator saw the terminal icon during the D-UAT-10 live gate (Child of Light
uninstall under `pnpm tauri:dev`). The fix, if any, depends on whether packaged builds show it too.
</objective>

<context>
- The "Game Uninstalled" toast comes from `notify()` in `src/backend/dialog/dialog.ts`, through the
  sidecar `Notification` stub in `src/backend/platform/index.ts` (`requestRustInvoke(
  'notification_show', ...)`), to the `notification_show` arm in `src-tauri/src/main.rs:7843`,
  which builds `app.notification().builder()` with title/body and calls `show()`.
- Cheapest harmless trigger of the same path: `window.api.removeShortcut('<steam appId>','steam')`.
  `SteamGame.removeShortcuts()` is a logged no-op (`games.ts:2102`), and the IPC handler
  (`shortcuts/ipc_handler.ts`) calls `notify()` right after it. No files are touched.
- Packaged candidates on disk: `src-tauri/target/debug/bundle/macos/GameLib.app` (0.8.0, Oct 15,
  ad-hoc signed, auto-opens an undocked Web Inspector) and
  `src-tauri/target/release/bundle/macos/GameLib.app` (0.8.0, Oct 12, Developer ID signed, no
  inspector). `/Applications/GameLib.app` is 0.7.0.
- Live-gate levers from memory: launch with `open -n`, prove the stderr discard with
  `lsof -p <pid> -a -d 1,2`, drive the undocked inspector by clicking its prompt, and the first
  Return is often eaten.
</context>

<tasks>

<task id="1" type="auto">
<name>Explain the dev-mode terminal icon from the vendored sources</name>
<files>none</files>
<action>
Read `tauri-plugin-notification`'s `src/desktop.rs` macOS branch and `tauri::is_dev()` in the
vendored `tauri` crate; read `mac-notification-sys`'s `set_application` and `sendNotification`.
Record the exact lines that pick `com.apple.Terminal` in dev and the bundle identifier otherwise.
</action>
<verify>
The explanation cites file and line in the vendored crates under `~/.cargo/registry/src`. No repo
files written, so no formatter check applies.
</verify>
<done>The terminal icon is traced to a `tauri::is_dev()` branch in the plugin, not to GameLib code.</done>
</task>

<task id="2" type="auto">
<name>Run a packaged build, fire a notification through the real handler, record the outcome, close the todo</name>
<files>
.planning/todos/pending/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md
.planning/todos/completed/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md
.planning/todos/pending/2026-10-17-packaged-macos-build-delivers-no-notifications.md
</files>
<action>
1. `open -n` the `--debug` bundle; prove fd 1/2 are `/dev/null`; drive its inspector console to call
   `window.api.removeShortcut('206040','steam')` and log a `[GATE-cwf]` line via
   `window.api.logInfo`. Screenshot both displays within 3 s, then open Notification Centre.
2. If nothing appears, relaunch the same bundle's binary directly with stderr to a file so the
   sidecar stub's `console.warn` on a relay rejection becomes visible, and repeat.
3. If still nothing, run the Developer-ID-signed release bundle and trigger the same handler via the
   real UI (game page → dots menu → Remove shortcuts on an installed Steam game). Deny any Keychain
   prompt rather than entering a password.
4. Check System Settings → Notifications for a `GameLib` entry before and after.
5. Close the source todo with `git mv` to `completed/` plus a `## Closed` note. If the packaged
   build exposes a different defect, write it as a new `pending/` todo with `severity`, `platform`,
   `ready` in that order, bare lowercase values.
</action>
<verify>
`grep -c '261017-cwf' .planning/todos/completed/2026-10-16-steam-uninstall-notification-shows-terminal-icon.md`
is at least 1; the new todo's frontmatter passes `pnpm planning-gates`. All paths written are under
`.planning/`, which prettier ignores (`npx prettier --file-info` reports `"ignored": true`), so the
formatter check is omitted rather than carried as a vacuous green.
</verify>
<done>The todo is closed on packaged-build evidence, and anything the measurement exposed is triaged in its own todo.</done>
</task>

</tasks>

<verification>
- Evidence directory holds the screenshots, the direct-run stderr capture and the helpers used.
- `pnpm planning-gates` is green with the new pending todo in place.
</verification>

<success_criteria>
- The dev-mode terminal icon has a source-level explanation.
- A packaged build was measured, not reasoned about.
- The source todo is closed; any new defect is a triaged todo.
</success_criteria>
