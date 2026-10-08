---
phase: quick-261008-kvz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/__tests__/appShellFlows.test.ts
  - .planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/
  - .planning/todos/pending/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md
  - .planning/todos/completed/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md
  - .planning/todos/completed/2026-10-05-tray-quit-bypasses-the-pending-operations-confirm.md
  - .planning/todos/pending/2026-10-08-dock-quit-and-logout-bypass-the-pending-operations-confirm.md
autonomous: true
requirements:
  - QUICK-261008-kvz

estimate:
  tokens: 190000
  raw_tokens: 190000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "On macOS, Cmd+Q with a pending operation armed shows the sidecar's 'There are pending operations, are you sure?' confirm and the app keeps running until it is answered; answering No leaves the app running with its main window visible."
    - "With exitToTray off, the red X with a pending operation armed shows the same confirm, and answering No leaves the main WINDOW VISIBLE (the close was prevented before the hand-off), not a windowless running app."
    - "With nothing pending, Cmd+Q and the red X (exitToTray off) quit promptly, and the quit is attributable to the sidecar route: a `quit (<origin>): handed to the sidecar handleExit` shell line, the sidecar marker `[GAMELIB_SIDECAR_SEND_HANDLER] quit`, and an `exit requested (code=Some(0))` shell line."
    - "With exitToTray on and a tray present, the red X still hides the window to the tray (no confirm, app alive)."
    - "With noTrayIcon on, the red X still routes through the sidecar: the close handler is attached whether or not a tray exists, and only the hide-to-tray branch depends on the tray (pinned by source test + Rust unit tests; not live-gated)."
    - "When the sidecar is absent, dead or not answering within the probe bound, every routed quit still exits via exit(0) -- quit can never become a no-op (Rust unit tests on the injected policy fn)."
    - "On the PRE-fix binary, Cmd+Q with the same pending operation armed quits with NO confirm (negative control) -- the positive result is attributable to this change."
  artifacts:
    - src-tauri/src/main.rs
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - .planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/
  key_links:
    - from: "src-tauri/src/main.rs main-window CloseRequested handler"
      to: "src-tauri/src/main.rs quit_via_sidecar"
      via: "api.prevent_close() first, then close_request_action(tray_exists, should_hide_on_close(load_tray_settings())) == RouteQuit -> quit_via_sidecar(handle, \"window close\")"
    - from: "macOS app menu custom Quit item (APP_MENU_QUIT_ID, CmdOrCtrl+Q)"
      to: "src-tauri/src/main.rs quit_via_sidecar"
      via: "app-level on_menu_event matching APP_MENU_QUIT_ID"
    - from: "src-tauri/src/main.rs quit_via_sidecar"
      to: "src/backend/sidecar/appShellFlowRegistration.ts ipcMain.on('quit')"
      via: "health probe (QUIT_PROBE_TIMEOUT) then a `send` frame on SIDECAR_QUIT_CHANNEL; exit(0) fallback"
    - from: "src/backend/utils.ts handleExit (Yes / nothing pending)"
      to: "src-tauri/src/main.rs .run closure"
      via: "app.exit() -> app_exit arm -> app.exit(0) -> RunEvent::ExitRequested { code: Some(0) } (observed, never prevented) -> RunEvent::Exit -> shutdown_child()"
---

# Quick Task 261008-kvz: route Cmd+Q and the red X (exitToTray off) through the sidecar's pending-operations confirm

Closes todo `.planning/todos/pending/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md`
(`severity: medium`, `platform: macos`, `ready: live-gate`) — only if the live gate in Task 2 passes.

## Planner finding that changes the todo's suggested fix (verified against vendored source, 2026-10-08)

The todo (and the orchestrator brief) assumed macOS Cmd+Q produces `RunEvent::ExitRequested { code: None }`, so
intercepting that event would route it. **It does not, in the versions this crate pins** (`Cargo.lock`:
tauri 2.11.5, tauri-runtime-wry 2.11.4, tao 0.35.3, muda 0.19.3):

1. `main()` never calls `.menu(...)`, so macOS gets `Menu::default` (`tauri-2.11.5/src/menu/menu.rs` ~L178-194),
   whose app submenu ends with `PredefinedMenuItem::quit` — the item carrying Cmd+Q.
2. muda maps that item to the AppKit selector `terminate:` (`muda-0.19.3/src/platform_impl/macos/mod.rs` ~L994).
3. tao 0.35.3's app delegate implements NO `applicationShouldTerminate:`; it implements only
   `applicationWillTerminate:` -> `AppState::exit()` -> `Event::LoopDestroyed`
   (`tao-0.35.3/src/platform_impl/macos/app_delegate.rs` L131-135, `app_state.rs` L272-282).
4. tauri-runtime-wry maps `LoopDestroyed` straight to `RunEvent::Exit` (`tauri-runtime-wry-2.11.4/src/lib.rs` ~L4185).
   `ExitRequested { code: None }` is emitted ONLY from the `TaoWindowEvent::Destroyed` arm when the last window is
   already gone (~L4313); `ExitRequested { code: Some(c) }` only from `Message::RequestExit` (`app.exit(c)`, ~L4356).

Consequences baked into this plan:

- **Cmd+Q is fixed by replacing the default app menu's predefined Quit with a custom item** (same label,
  accelerator `CmdOrCtrl+Q`, id `app_menu_quit`) whose menu event calls `quit_via_sidecar`. macOS only (`#[cfg]`);
  Windows/Linux have no default app menu, and Alt+F4 there is a `CloseRequested`, covered by the close handler.
- **`ExitRequested` is OBSERVED (logged), never prevented.** Preventing `code: None` would strand a windowless
  app (it fires only after the last window is destroyed — the very trap the todo describes), and it would catch
  nothing on macOS anyway. The log line `exit requested (code=Some(0))` is the live gate's proof that a quit went
  through `app.exit(0)` (routed) rather than `terminate:` (bypass).
- **Residual, out of scope, filed in Task 3:** Dock-menu Quit and logout/shutdown still send `terminate:`
  and still bypass the confirm. Fixing them means adding `applicationShouldTerminate:` to tao's delegate class at
  runtime — a different, riskier change.

## Other facts the executor needs (verified at planning time)

- `handleExit()` (`src/backend/utils.ts` L274-335) confirms when `(isLocked || isRunning()) && mainWindow`. In the
  sidecar, `getMainWindow()` is `BrowserWindow.getAllWindows().at(0)` and the platform stub's `getAllWindows`
  returns `[fakeWindow]` (`src/backend/platform/index.ts` ~L767), so `mainWindow` is ALWAYS truthy there and
  `mainWindow?.hide()` is a no-op (`hide: () => {}`). The shell window therefore stays up until `app_exit`.
- `isLocked` is `existsSync(join(gamesConfigPath, 'lock'))`, `gamesConfigPath` = `<appData>/GameLib/GamesConfig`
  (`src/backend/constants/paths.ts` L24, L50). At planning time NOTHING under `src/backend` writes that file
  (only `utils.ts:275` reads it), and it does not exist on disk. Creating it reaches the identical confirm branch
  that a running download reaches (`isRunning()` is `queueState === 'running'`, `downloadqueue.ts` L76). It is a
  legitimate arm for the ROUTING under test; it is NOT evidence that a real download survives "No" — that is
  `handleExit`'s pre-existing `response === 0 -> return`. Record the arm as `isLocked`-armed, never as "download".
- The confirm is `dialog_message`'s rfd `OkCancelCustom("No", "Yes")` (`main.rs` ~L7307-7331); rfd 0.16.0 adds
  buttons in order with `addButtonWithTitle`, so **"No" is the first button = NSAlert default = Return**.
  No button is titled "Cancel", so **Esc is not expected to dismiss it** — an ignored Esc is not a failure.
  "Yes" has no key equivalent; answering Yes needs a synthetic mouse click (CGEvent) at its coordinates.
  The panel is AX-dark (memory `ax-is-blind-to-the-tauri-native-dialog`): prove it by CGWindowList + a
  window-only `screencapture -l <windowid>`, never by AX.
- `dialog_message` is on `sidecarRpc.ts`'s human-in-the-loop timeout exemption, so the confirm waits forever;
  the sidecar logs nothing more until it is answered (not a hang).
- `shell_diag(message)` (`main.rs` ~L11839) writes `[shell] <message>` to stderr AND appends
  `<epoch> pid=<pid> <message>` to `~/Library/Logs/GameLib/gamelib-shell.log` — use it for every new line so the
  evidence is timestamped and survives the dev terminal. The sidecar's `logInfo` lands in
  `~/Library/Logs/GameLib/gamelib.log`.
- `~/Library/Application Support/gamelib/config.json` has exactly one `"exitToTray": true,` (L74) and
  `"noTrayIcon": false`. `GameLib` and `gamelib` there are ONE directory (case-insensitive APFS) — never put a
  backup beside the original.
- Tray menu events: Tauri 2's `on_menu_event` handlers receive EVERY menu event app-wide (tauri `tray/mod.rs`
  ~L324-327). The tray handler's `_` arm ignores ids that do not start with `TRAY_RECENT_ID_PREFIX` (`"recent:"`),
  so the new id `app_menu_quit` is safe there; do NOT reuse the id `quit` (the tray arm would also fire).

<objective>
Make every user-initiated quit on the macOS shell — Cmd+Q, the red X with exitToTray off, the red X when no tray
exists, and the existing tray Quit — go through one routing function (`quit_via_sidecar`) that hands the decision to
the sidecar's `handleExit()`, so a pending operation gets the "pending operations" confirm instead of being killed
by `shutdown_child`. Then prove it on the running macOS app, with a negative control on the pre-fix binary.

Purpose: a running download is currently killed without a prompt by the two most common quit gestures.
Output: Rust change + Rust unit tests + RED-first jest source pins + a sidecar-side `quit` marker (Task 1);
live-gate evidence (Task 2); the todo resolved and moved, or left pending with the finding (Task 3).
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/todos/pending/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md
@.planning/todos/completed/2026-10-05-tray-quit-bypasses-the-pending-operations-confirm.md

Project skill to load before Task 2/3: `Skill("gamelib-conventions")` (UAT item shape, todo frontmatter, scoped
prettier). Run `graphify query "<question>"` before reading any source file you have not been pointed at below.

Source anchors (line numbers as of `f79d3a27c`; re-locate with grep, they drift):
- `src-tauri/src/main.rs` L1061-1135: `SIDECAR_QUIT_CHANNEL`, `SIDECAR_HEALTH_CHANNEL`, `TRAY_QUIT_PROBE_TIMEOUT`,
  `tray_quit_via_sidecar` (policy, injected probe/send), `quit_from_tray`.
- `src-tauri/src/main.rs` L805-807: `should_hide_on_close(settings) = settings.exit_to_tray && !settings.no_tray_icon`.
- `src-tauri/src/main.rs` ~L12546 `let tray_settings = tray_settings();` and ~L12560-12627: the comment block plus
  `if !tray_settings.no_tray_icon { ... on_window_event(... CloseRequested ...) }` — the bare early return at ~L12609
  is the red-X bypass; when `no_tray_icon` is true no close handler exists at all.
- `src-tauri/src/main.rs` ~L12723-12760: tray `on_menu_event`, arm `"quit" => quit_from_tray(app_handle)`.
- `src-tauri/src/main.rs` ~L13025-13052: the `.run(move |app_handle, event| ...)` closure, `if let RunEvent::Exit`
  only; its WR-03 comment claims "red X / Cmd+Q / Alt+F4 does not route through app_exit" — must be updated.
- `src-tauri/src/main.rs` ~L13472-13550: four `tray_quit_*` unit tests inside `mod tests` (L13096).
- `src/backend/__tests__/tauriShellSource.test.ts` L74 `loadMainRsCode()` (comment-stripped), L611-639 (exitToTray
  pins — `should_hide_on_close(load_tray_settings())` MUST stay literally present; `tray_settings.exit_to_tray`
  MUST stay absent), L641-665 (tray Quit sibling block), L134 and L824 (`RunEvent::Exit` present;
  `shutdown_child()` exactly one call site — both must stay green).
- `src/backend/sidecar/appShellFlowRegistration.ts` L313-315: `ipcMain.on('quit', () => { handleExit()... })`;
  `logSendHandlerReached` is already imported (L191) and used at L407 for `frontendReady`.
- `src/backend/sidecar/__tests__/appShellFlows.test.ts` L478 (quit reaches handleExit) and L929-960 (the
  `frontendReady` marker test shape to mirror).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Route Cmd+Q, the red X and tray Quit through one quit_via_sidecar; RED-first source pins; sidecar quit marker</name>
  <files>src-tauri/src/main.rs, src/backend/__tests__/tauriShellSource.test.ts, src/backend/sidecar/appShellFlowRegistration.ts, src/backend/sidecar/__tests__/appShellFlows.test.ts</files>
  <read_first>
    - src-tauri/src/main.rs (the anchors listed in context; read each region once)
    - src/backend/__tests__/tauriShellSource.test.ts L60-82 and L596-665
    - src/backend/sidecar/__tests__/appShellFlows.test.ts L470-500 and L925-965
  </read_first>
  <behavior>
    - jest (new describe block, RED on the pre-fix tree): the main-window CloseRequested registration is NOT lexically inside an `if !tray_settings.no_tray_icon {` block.
    - jest: inside the CloseRequested handler, `api.prevent_close()` appears before `quit_via_sidecar(`, the handler calls `close_request_action(`, and it contains no bare early-return statement.
    - jest: `const APP_MENU_QUIT_ID: &str = "app_menu_quit";` exists; the macOS app-menu install fn removes the predefined item (`remove_at(`), inserts a custom item with `APP_MENU_QUIT_ID` and `CmdOrCtrl+Q`, registers `on_menu_event`, and routes to `quit_via_sidecar(`; `.setup()` calls that install fn.
    - jest: the `.run(` closure matches `RunEvent::ExitRequested` and contains no exit-prevention call (asserted as `not.toContain('prevent_exit')` on the closure slice only).
    - jest (sibling tray block, updated): the tray `"quit" =>` arm calls `quit_via_sidecar(app_handle, ` and contains no `.exit(`; `fn quit_via_sidecar(` body contains `SIDECAR_QUIT_CHANNEL`, `route_quit_via_sidecar(` and `.exit(0)`.
    - Rust: `close_request_action(true, true) == Hide`; `(false, true)`, `(true, false)`, `(false, false)` all `RouteQuit`; `close_request_action(true, should_hide_on_close(TraySettingsSnapshot::default())) == RouteQuit` (a failed settings read routes, never hides); `no_tray_icon: true, exit_to_tray: true` on disk -> `RouteQuit`.
    - Rust: the four existing `tray_quit_*` tests pass unchanged in substance against the renamed `route_quit_via_sidecar`.
    - jest (appShellFlows): a `quit` send logs `[GAMELIB_SIDECAR_SEND_HANDLER] quit` via `logInfo`, and still reaches handleExit as the existing L478 test asserts.
  </behavior>
  <action>
    Record `BASE=$(git rev-parse HEAD)` before any edit and keep it for Task 2's negative control and the SUMMARY.

    RED first. Add the new jest describe block in `tauriShellSource.test.ts`, placed directly after the existing
    tray-Quit sibling block (L641-665), titled `main.rs Cmd+Q and the red X route through the sidecar handleExit
    (todo 2026-10-05 cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm)`, with one test per jest bullet in
    `<behavior>`. All slicing is over `loadMainRsCode()` output. For the "not inside the tray gate" test, first blank
    every double-quoted string literal (regex over `"(?:[^"\\]|\\.)*"`) so format-string braces cannot skew depth,
    then for every occurrence of `if !tray_settings.no_tray_icon {` before the `WindowEvent::CloseRequested` index,
    brace-scan from its `{` and assert the block closes before that index. Slice the CloseRequested handler from
    `WindowEvent::CloseRequested` to the first `});` after it; slice the run closure from `.run(move |app_handle, event|`
    to the end of the code string (it is the last thing in `main()`; stop at the next `\nfn ` or `\nmod ` if present).
    The bare-early-return check is a regex on the handler slice (word boundary, `return` followed by optional
    whitespace and a semicolon). Update the existing tray sibling block's assertions to the new names (the tray arm
    calls `quit_via_sidecar(app_handle, `; the fn is `fn quit_via_sidecar(` and calls `route_quit_via_sidecar(`).
    Add the appShellFlows test mirroring L929's shape (spy on `loggerModule.logInfo`, `writeSend(input, ..., 'quit', [])`,
    `flush()`, find the marker line). Run jest (separate command from any write) and record the failing test names
    and count as the RED evidence.

    Then the Rust change in `src-tauri/src/main.rs`:
    (1) Rename `quit_from_tray` to `quit_via_sidecar(app_handle: &AppHandle, origin: &'static str)`,
    `tray_quit_via_sidecar` to `route_quit_via_sidecar`, `TRAY_QUIT_PROBE_TIMEOUT` to `QUIT_PROBE_TIMEOUT`; update
    their doc comments to say the route serves tray Quit, Cmd+Q (macOS app menu) and the main-window close. Keep the
    policy body exactly as it is. Replace its two `eprintln!` lines with `shell_diag` and add a success line after
    the hand-off: `quit (<origin>): handed to the sidecar handleExit`; the fallback line reads
    `WARN: quit (<origin>): <reason> -- exiting directly`; the no-state line names the origin too. Tray arm becomes
    `"quit" => quit_via_sidecar(app_handle, "tray Quit")`. Update the four `tray_quit_*` tests' call sites (keep
    their names so `cargo test quit_` still selects them).
    (2) Add `#[derive(Clone, Copy, Debug, PartialEq, Eq)] enum CloseRequestAction { Hide, RouteQuit }` and a pure
    `fn close_request_action(tray_exists: bool, hide_on_close: bool) -> CloseRequestAction` (Hide only when both are
    true). Doc comment: hiding without a tray that existed at startup would trap the user, and a failed settings read
    (all-false default) routes the quit, so the user can still always close (the fail-safe the existing comment
    block describes is preserved: the sidecar exits when nothing is pending, and `exit(0)` is the fallback).
    (3) Restructure the close-handler attachment: compute `let tray_exists = !tray_settings.no_tray_icon;` and attach
    the main-window `on_window_event` handler UNCONDITIONALLY (no surrounding tray gate). Inside, on
    `CloseRequested { api, .. }`: call `api.prevent_close()` first, then match
    `close_request_action(tray_exists, should_hide_on_close(load_tray_settings()))` — keep that inner call expression
    byte-for-byte, the L621 pin depends on it — `Hide` keeps today's `close_window.hide()` + WARN on error;
    `RouteQuit` calls `quit_via_sidecar(&handle, "window close")` with an `AppHandle` clone captured into the
    closure. The prevent must come before the hand-off: the confirm is an unparented rfd panel and a "No" answer
    must find the window still there. Rewrite the existing comment block above it (it currently explains why the
    handler is gated on tray existence) to explain the new shape, citing this todo; note that the macOS default
    menu's Close Window (Cmd+W) is a `performClose:` and so takes this same path. Change the attach log to a
    `shell_diag` line `close handler attached (tray=<bool>): hide-to-tray re-read on every close; otherwise the quit
    is routed to the sidecar`. Before editing, confirm with grep that no `.close()`/`.destroy()` call in main.rs
    targets `MAIN_WINDOW_LABEL` (the hits at ~L3536, 6341, 6802, 8517, 8536, 9215-9284 are login/auxiliary windows);
    if one does, stop and report it, because that call would now raise the confirm.
    (4) macOS Cmd+Q: add `const APP_MENU_QUIT_ID: &str = "app_menu_quit";` and a
    `#[cfg(target_os = "macos")] fn route_app_menu_quit_through_sidecar(app: &AppHandle)` called from `.setup()`
    (cfg-gated call). It takes `app.menu()` (the default menu is already installed before setup runs —
    tauri `app.rs` ~L2384), takes the FIRST item as a submenu (the app submenu), finds the index of the
    `MenuItemKind::Predefined` item whose `text()` starts with `Quit`, reads that label, `remove_at(index)`, then
    `insert`s `MenuItem::with_id(app, APP_MENU_QUIT_ID, <same label>, true, Some("CmdOrCtrl+Q"))` at the same index,
    and registers `app.on_menu_event` that calls `quit_via_sidecar(app_handle, "Cmd+Q")` when the event id equals
    `APP_MENU_QUIT_ID` and ignores every other id. Every failure (no menu, first item not a submenu, no Quit item
    found, remove/insert error) logs a `shell_diag` WARN and leaves the default menu untouched — never panic; the
    fallback is the old unrouted Cmd+Q, not a broken menu. On success `shell_diag` logs
    `app menu: Quit (Cmd+Q) routed through the sidecar (id=app_menu_quit)` — this line is Task 2's build-identity
    check. Put the `MenuItem`/`MenuItemKind` imports inside the cfg'd fn (or a cfg'd `use`) so Windows/Linux builds
    get no unused-import warning. The doc comment carries the planner finding above (muda `terminate:`, tao 0.35.3
    has no `applicationShouldTerminate:`, so Cmd+Q never emits `ExitRequested`) and names the residual: Dock Quit
    and logout still send `terminate:`.
    (5) In the `.run` closure, convert the `if let` into a `match event` that keeps the `RunEvent::Exit` arm
    byte-identical in behaviour and adds `RunEvent::ExitRequested { code, .. }` which ONLY calls
    `shell_diag(&format!("exit requested (code={code:?})"))`. Never stop the exit there; the comment explains why
    (code `None` arrives only after the last window is destroyed, so stopping it strands a windowless app; Cmd+Q on
    macOS never arrives here; the shell's own exits carry `Some(0)`). Rewrite the WR-03 comment above `.run(` so it
    no longer claims the red X / Cmd+Q skip `app_exit`: the red X and Alt+F4 are routed by the close handler, Cmd+Q
    by the macOS app menu, and the `RunEvent::Exit` reap remains the backstop for Dock Quit, logout and fallbacks.
    (6) Add Rust tests in `mod tests` named with the `quit_routing_` prefix for each Rust bullet in `<behavior>`.

    Sidecar marker: in `appShellFlowRegistration.ts`, make `logSendHandlerReached('quit')` the first statement of
    the `ipcMain.on('quit', ...)` listener (before `handleExit()`), with a one-line comment naming this todo — it is
    the live gate's sidecar-side proof that the frame landed. No args are logged (the helper takes none).

    Then run GREEN (all verify commands below, each as its own command), stage the four files by explicit path, and
    commit once:
    `fix(tauri-shell): route Cmd+Q and the red X through the sidecar's pending-operations confirm`. Record the
    resulting commit sha as `FIX`. Run `graphify update .` after the commit (graphify-out is gitignored). Commit
    BEFORE Task 2 launches anything: a running `tauri dev` rebuilds and relaunches on every source change.
  </action>
  <verify>
    <automated>npx jest --testPathPattern 'src/backend/__tests__/tauriShellSource.test.ts' 2>&1 | tail -8</automated>
    <automated>npx jest --testPathPattern 'src/backend/sidecar/__tests__/appShellFlows.test.ts' 2>&1 | tail -8</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml quit_ 2>&1 | tail -15</automated>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml -- --list 2>/dev/null | grep -E '(tray_quit_|quit_routing_)' | wc -l</automated>
    <automated>cargo fmt --manifest-path src-tauri/Cargo.toml --check</automated>
    <automated>cargo clippy --manifest-path src-tauri/Cargo.toml 2>&1 | grep -cE '^(warning|error)'</automated>
    <automated>pnpm codecheck</automated>
    <automated>npx prettier --check src/backend/__tests__/tauriShellSource.test.ts src/backend/sidecar/appShellFlowRegistration.ts src/backend/sidecar/__tests__/appShellFlows.test.ts</automated>
  </verify>
  <done>
    - RED recorded: the new tauriShellSource block and the updated tray assertions fail on the pre-fix tree (names + count in the SUMMARY), and the appShellFlows marker test fails before the one-line change.
    - GREEN: both jest suites pass, each read from the trailing "Ran all test suites matching" line naming that one file; `cargo test ... quit_` passes with the `--list` count = 4 `tray_quit_` + the new `quit_routing_` tests (at least 7); `cargo fmt --check` exits 0; clippy's warning count is not above the pre-change count (capture the baseline with the same command before editing; the tray fix recorded 22 pre-existing); `pnpm codecheck` exits 0.
    - prettier is scoped to the three TS paths only: `src-tauri/src/main.rs` reports `"ignored":false` but `"inferredParser":null` under `npx prettier --file-info` (prettier cannot parse Rust), so `cargo fmt --check` is its formatter check.
    - One commit `FIX` on the current branch containing exactly the four files; `BASE` and `FIX` recorded.
  </done>
</task>

<task type="auto">
  <name>Task 2: macOS live gate on the running dev app — Cmd+Q, red X, no-pending, exitToTray-on, and the pre-fix negative control</name>
  <files>.planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/</files>
  <precondition>Task 1's commit FIX exists and `git status --short -- src-tauri src` is empty; no `target/debug/gamelib-shell`, no `/Applications/GameLib.app` and no `tauri dev` process is running; the display is unlocked (a fresh `screencapture` shows the desktop, not the login window).</precondition>
  <read_first>
    - ~/.claude/projects/-Users-graysonmitchell-Projects-GameLib/memory/quit-path-live-gates-have-three-traps.md
    - ~/.claude/projects/-Users-graysonmitchell-Projects-GameLib/memory/ax-is-blind-to-the-tauri-native-dialog.md
    - ~/.claude/projects/-Users-graysonmitchell-Projects-GameLib/memory/a-launch-can-be-absorbed-by-a-cross-session-orphan-instance.md
    - ~/.claude/projects/-Users-graysonmitchell-Projects-GameLib/memory/pgrep-f-matches-the-monitor-that-runs-it.md
  </read_first>
  <action>
    Nothing is committed in this task. Write all text evidence into the task's `evidence/` directory as you go
    (one `arm-<n>.md` or `.log` per arm: wall-clock timestamps, the exact commands, `ps` before/after, the matching
    `gamelib-shell.log` and `gamelib.log` lines, CGWindowList dumps). Images: capture ONLY the confirm panel with
    `screencapture -l <windowid>` into `evidence/`; full-screen captures (needed to check the screen is unlocked or
    to read button positions) go to the session scratchpad and are never committed — this is a public repo and the
    library window shows the operator's games and account.

    Setup.
    (a) Snapshot `~/Library/Application Support/gamelib/config.json` into the scratchpad (NOT next to the original —
    `GameLib`/`gamelib` are one directory) and record the original `exitToTray` and `noTrayIcon` values (expected
    true / false). Re-verify with grep that nothing under `src/backend` writes `GamesConfig/lock` and that
    `~/Library/Application Support/gamelib/GamesConfig/lock` does not exist.
    (b) Write two small Swift scripts into the scratchpad: `windows.swift <pid>` prints every CGWindowList entry
    (`CGWindowListCopyWindowInfo(.optionAll, kCGNullWindowID)`) owned by that pid — window number, layer, onscreen
    flag, bounds, name; and `click.swift <x> <y>` posts a left mouse down/up `CGEvent` at a global point (top-left
    origin, points not pixels). Run them with `swift <file> ...`.
    (c) Launch with `pnpm tauri:dev` as a background command, stdout+stderr redirected to `evidence/dev-<launch>.log`.
    Wait (poll, do not sleep blindly) until `ps -axo pid,ppid,pgid,command | grep '[t]arget/debug/gamelib-shell'`
    shows exactly one shell, the sidecar is its child, a main window is onscreen per `windows.swift`, and
    `gamelib-shell.log` has the post-fix `app menu: Quit (Cmd+Q) routed through the sidecar` line for this pid
    (build identity; the pre-fix binary never prints it). Anchor process matching on the binary path, never
    `pgrep -f gamelib-shell` (it matches the monitor). `tauri dev` exits when the app exits, so every arm that quits
    the app needs a fresh launch.
    (d) Before EVERY keystroke or click: activate with `osascript -e 'tell application "System Events" to set
    frontmost of process "gamelib-shell" to true'`, then assert the frontmost process's unix id equals the shell pid
    you launched (a stray keystroke lands in whatever app is in front). Arm the pending operation with
    `touch ~/Library/Application\ Support/gamelib/GamesConfig/lock`; disarm with `rm` of the same path.
    Gestures: Cmd+Q = `osascript -e 'tell application "System Events" to tell process "gamelib-shell" to keystroke
    "q" using command down'`; red X = `osascript -e 'tell application "System Events" to tell process
    "gamelib-shell" to click (first button of window 1 whose subrole is "AXCloseButton")'` (window chrome is native
    AppKit, so AX should reach it; if it cannot, click its CGWindowList-derived position with `click.swift`).
    Proving the confirm: within 5 s of the gesture, `windows.swift` shows a NEW onscreen window owned by the shell
    pid (the alert panel) and the shell + sidecar are still alive; capture it with `screencapture -l` and READ the
    image — confirm the text is the pending-operations message and the default (highlighted) button reads "No"
    BEFORE pressing anything. Answer No with `keystroke return` (only after that check). Answer Yes by computing the
    "Yes" button centre from the panel's bounds and the image, then `click.swift`. If the panel is present but
    neither path changes it within 3 s, that sub-step is BLOCKED (keep the image), never PASS. Never send SIGTERM,
    SIGKILL or `kill` to the shell or sidecar as a substitute for a gesture — it bypasses `RunEvent::Exit` and
    manufactures a false result; report BLOCKED instead.

    Arms, in this order (fix binary unless stated). Each records PASS / FAIL / BLOCKED with its evidence.
    1. Launch L1, lock ARMED, exitToTray as found (true). Arm 5 first: red X -> expect the main window goes
       offscreen (hidden), no alert window, shell + sidecar alive, no `quit (window close)` line. Restore the window
       with `printf '%s\n' __GAMELIB_FOCUS__ | nc -U "$HOME/Library/Application Support/gamelib/gamelib-single-instance.sock"`.
    2. Still L1, lock armed. Arm 1-No: Cmd+Q -> alert appears; `quit (Cmd+Q): handed to the sidecar handleExit` and
       `[GAMELIB_SIDECAR_SEND_HANDLER] quit` lines logged; Return -> alert gone, shell + sidecar alive, main window
       still onscreen.
    3. Still L1. Set exitToTray false with a single targeted substitution of `"exitToTray": true` ->
       `"exitToTray": false` in config.json, verify exactly one occurrence now reads false, and re-check it again
       immediately before each red-X gesture below (the sidecar may rewrite config.json). Arm 2-No: red X -> alert
       appears with a `quit (window close)` line; Return -> alert gone, shell alive, and the MAIN WINDOW IS STILL
       ONSCREEN per `windows.swift` (the property this fix exists for).
    4. Optional but recommended, still L1: tray Quit (the menu-bar status item, recipe in the quit-path memory
       note) -> alert appears with a `quit (tray Quit)` line; Return -> alive. This is the first live observation of
       the 2026-10-05 tray fix.
    5. Still L1. Arm 1-Yes: Cmd+Q -> alert -> click "Yes" -> shell and sidecar gone within 10 s (`ps`), an
       `exit requested (code=Some(0))` line, and the existing `sidecar terminated on exit` reap line.
    6. Launch L2, lock armed, exitToTray false. Arm 2-Yes: red X -> alert -> Yes -> exits as in step 5.
    7. Disarm the lock. Launch L3. Arm 3a: Cmd+Q -> NO alert window ever appears, shell gone promptly; record the
       seconds from gesture to shell pid gone, plus the routing, sidecar-marker and `code=Some(0)` lines.
    8. Launch L4, lock disarmed, exitToTray false. Arm 3b: red X -> same expectations as step 7.
    9. Optional residual measurement, launch L5, lock armed: Dock Quit (System Events on process "Dock": the
       `gamelib-shell` tile's `AXShowMenu`, then its "Quit" item). Expected from the planner finding: NO alert, the
       app exits, no `exit requested` line. Record what happens; it feeds Task 3's follow-up todo.
    10. Restore exitToTray to its original value with the reverse targeted substitution; verify by grep and record
        the diff against the scratchpad snapshot limited to that key. Do this before the negative control so a
        failure later cannot strand the setting.
    11. Negative control (arm 4). With no app running: copy the committed `src-tauri/src/main.rs` to the
        scratchpad, then `git show $BASE:src-tauri/src/main.rs > src-tauri/src/main.rs` (never `git checkout --`).
        Lock armed. Launch L6 (it rebuilds). Confirm build identity: the `app menu: Quit ... routed` line is ABSENT for
        this pid. Cmd+Q -> expected: NO alert window, shell exits, no `quit (Cmd+Q)` line and no `exit requested` line.
        Then restore with `cp` from the scratchpad snapshot and require `git diff --quiet -- src-tauri/src/main.rs`
        (byte-identical to FIX).
    Teardown: remove the lock file and verify it is absent; verify exitToTray matches the original; verify no
    `target/debug/gamelib-shell`, sidecar or `tauri dev` process remains (if one does, quit it with its own gesture,
    and only if that fails report the orphan by pid — do not kill it); `git status --short` shows only the
    evidence directory. Write `evidence/RESULTS.md`: one line per arm — arm id, PASS/FAIL/BLOCKED, the
    decisive observation, the evidence file.
  </action>
  <verify>
    <automated>ls .planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/RESULTS.md && test ! -e "$HOME/Library/Application Support/gamelib/GamesConfig/lock" && grep -c '"exitToTray": true' "$HOME/Library/Application Support/gamelib/config.json"</automated>
    <automated>git diff --quiet -- src-tauri/src/main.rs src && echo source-clean</automated>
    <automated>ps -axo pid,command | grep -E '[t]arget/debug/gamelib-shell|[t]auri dev' | wc -l</automated>
  </verify>
  <done>
    - `evidence/RESULTS.md` lists arms 1-Yes/No, 2-Yes/No, 3a, 3b, 5 and the negative control (4) with PASS/FAIL/BLOCKED each, plus optional tray Quit and Dock Quit observations if run.
    - Every PASS for a confirm arm cites a window-only capture of the panel AND the CGWindowList line for it; every exit arm cites `ps` before/after and the `exit requested (code=Some(0))` line; the negative control cites the absent build-identity line and the absent alert.
    - Lock file absent, exitToTray restored to its original value (grep count 1 for `"exitToTray": true` when the original was true), `src-tauri/src/main.rs` byte-identical to FIX, no app/sidecar/dev process left. The prettier check is omitted for this task: every path written is under `.planning/`, which `npx prettier --file-info` reports as `"ignored":true` — a `--check` there would be a green that proves nothing.
  </done>
</task>

<task type="auto">
  <name>Task 3: Record the result in the todo and close it, or leave it pending with the finding; file the Dock/logout residual</name>
  <files>.planning/todos/pending/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md, .planning/todos/completed/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md, .planning/todos/completed/2026-10-05-tray-quit-bypasses-the-pending-operations-confirm.md, .planning/todos/pending/2026-10-08-dock-quit-and-logout-bypass-the-pending-operations-confirm.md, .planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/</files>
  <read_first>
    - .planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/evidence/RESULTS.md
    - the gamelib-conventions skill sections on todo frontmatter and UAT item shape
  </read_first>
  <action>
    Decide from `evidence/RESULTS.md`. The REQUIRED arms are 1-No, 1-Yes, 2-No, 2-Yes, 3a, 3b, 5 and the negative
    control. Tray Quit and Dock Quit are optional observations and cannot block closure.

    If every required arm is PASS: append `## Resolution (2026-10-08)` to the todo, in the same voice as the tray
    todo's Resolution — the planner finding (Cmd+Q is `terminate:`, never `ExitRequested`; the menu-item replacement;
    `ExitRequested` observed, never prevented), the change, RED -> GREEN numbers from Task 1, then a `### Live gate`
    subsection with one numbered item per arm in the UAT item shape the gamelib-conventions skill requires (`### N.`
    at column 0, `expected:` inline, `result:` opening with a bare status word such as `pass`, prose after the word),
    citing the evidence files and stating plainly that the pending operation was armed via the `GamesConfig/lock`
    file (the `isLocked` disjunct), not a running download, and why that is sufficient for the routing under test.
    Then `git mv` it to `.planning/todos/completed/` (the triage keys stay; `completed/` is exempt from the gate).

    If any required arm is FAIL or BLOCKED: do NOT move the todo. Append `## Findings (2026-10-08)` with the same
    per-arm structure and the failing evidence, and set `ready:` to the vocabulary value that now fits (`human` if
    the only gap is that a person must click "Yes", `code` if the code is wrong, `live-gate` if the run simply
    could not happen) — keep `severity:`, `platform:`, `ready:` bare, lowercase, in that order.

    If the optional tray Quit observation ran, append a short `## Live verification (2026-10-08)` note to the
    completed tray todo with its result and evidence path (it records "Not verified" today).

    File `.planning/todos/pending/2026-10-08-dock-quit-and-logout-bypass-the-pending-operations-confirm.md` with
    frontmatter `created`, `title`, `area: tauri-shell`, then `severity: medium`, `platform: macos`,
    `ready: live-gate` in that order, `found_by` naming this quick task, and `files: [src-tauri/src/main.rs]`.
    Body: Problem (Dock Quit and logout/shutdown send `terminate:`; tao 0.35.3 implements no
    `applicationShouldTerminate:`, so they reach `RunEvent::Exit` with no confirm), the vendored-source citations
    from this plan, whether Task 2's optional Dock arm measured it or it is source-derived only, and a suggested fix
    to evaluate (runtime-added `applicationShouldTerminate:` on tao's delegate returning cancel and routing through
    `quit_via_sidecar`, with logout/shutdown behaviour as an explicit decision).

    Stage by explicit path only (never `git add -A` / `git add .`: `.planning/milestone.lock` is a pre-existing
    untracked file that belongs to no task). Commit the evidence directory and the todo changes together:
    `docs(quick-261008-kvz): live-gate Cmd+Q and red-X quit routing; <close|keep open> the todo; file the Dock/logout residual`.
  </action>
  <verify>
    <automated>pnpm planning-gates 2>&1 | tail -5</automated>
    <automated>ls .planning/todos/completed/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md .planning/todos/pending/2026-10-05-cmd-q-and-red-x-quit-bypass-the-pending-operations-confirm.md 2>&1 | grep -v 'No such file'</automated>
    <automated>grep -nE '^(severity|platform|ready):' .planning/todos/pending/2026-10-08-dock-quit-and-logout-bypass-the-pending-operations-confirm.md</automated>
    <automated>test -z "$(git status --porcelain -- .planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off .planning/todos src src-tauri)" && echo clean</automated>
  </verify>
  <done>
    - Exactly one copy of the Cmd+Q/red-X todo exists: in `completed/` with a Resolution when every required arm passed, otherwise in `pending/` with Findings and an accurate `ready:` value.
    - The Dock/logout residual todo exists in `pending/` with the three triage keys bare, lowercase, in order; `pnpm planning-gates` is green.
    - Every live-gate item written uses the `### N.` / inline `expected:` / `result:`-opens-with-status-word shape.
    - One commit holds the evidence and todo changes; `git status --porcelain` over this task's paths is empty (the pre-existing untracked `.planning/milestone.lock` is not this task's). The prettier check is omitted: every path written is under `.planning/`, which prettier ignores (`"ignored":true`), so a `--check` would prove nothing.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| shell -> sidecar (stdin RPC) | The shell hands the quit decision to a child process that may be dead, hung or slow |
| AppKit menu / window chrome -> shell | User gestures (Cmd+Q, red X, Cmd+W) enter Rust event handlers on the main thread |
| live gate -> operator profile | The gate edits the operator's real `config.json` and creates a file in the real profile |
| evidence -> public repo | Screenshots and logs are committed to a public fork |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-kvz-01 | Denial of service | `quit_via_sidecar` / `route_quit_via_sidecar` | high | mitigate | Quit can never become a no-op: no sidecar state, probe error, probe timeout (`QUIT_PROBE_TIMEOUT`, 3 s, waited on a separate thread) and frame-write failure all fall back to `exit(0)`; the four existing `tray_quit_*` Rust tests cover each fallback; live arms 3a/3b prove the no-pending path exits promptly |
| T-kvz-02 | Denial of service | main-window CloseRequested handler | high | mitigate | `api.prevent_close()` runs before the hand-off so a "No" answer leaves the window up (live arm 2-No asserts the window is onscreen); `ExitRequested` is logged but never stopped, so a last-window-destroyed exit can never strand a windowless app (jest pin on the run closure) |
| T-kvz-03 | Denial of service | `close_request_action` | medium | mitigate | Hide only when a tray existed at startup AND the fresh read says hide; a failed settings read routes the quit (Rust tests), so no configuration traps the user in an unclosable window |
| T-kvz-04 | Tampering | macOS app-menu Quit replacement | medium | mitigate | Every lookup/remove/insert failure logs a WARN and leaves the default menu intact (old unrouted Cmd+Q) — never a panic in `.setup()`, never a menu without Quit; distinct id `app_menu_quit` so the app-wide tray menu handler cannot double-handle it |
| T-kvz-05 | Information disclosure | `evidence/` in a public repo | medium | mitigate | Only window-only captures of the confirm panel (`screencapture -l`) are committed; full-screen images stay in the scratchpad; window visibility is proven with CGWindowList text, not library screenshots; the sidecar marker logs a channel name and no args |
| T-kvz-06 | Tampering | operator `config.json` and `GamesConfig/lock` | medium | mitigate | Snapshot outside the app-support directory (one-dir APFS trap); single targeted substitutions; restore exitToTray before the negative control; teardown verifies lock absent and the original value back (Task 2 verify) |
| T-kvz-07 | Tampering | negative-control source swap | medium | mitigate | `git show $BASE:... >` with a scratchpad snapshot of the committed file; restore by `cp`; `git diff --quiet -- src-tauri/src/main.rs` gate; no commits while a dev app runs |
| T-kvz-08 | Spoofing | synthetic keystrokes/clicks | low | mitigate | Activate and assert the frontmost pid equals the launched shell before every keystroke/click, so Return cannot answer another app's dialog |
| T-kvz-09 | Repudiation | Dock Quit / logout still bypass the confirm | medium | accept | Out of scope (needs a runtime `applicationShouldTerminate:` on tao's delegate); recorded as a pending todo with source citations; `RunEvent::Exit` reap remains the backstop against orphans |
| T-kvz-SC | Tampering | npm/pip/cargo installs | high | accept | No package is installed or added; `Cargo.lock` and `package.json` must not change (any change is a stop-and-report) |
</threat_model>

<verification>
- Task 1: RED recorded on the pre-fix tree, GREEN on both jest suites, `cargo test quit_` with the listed count, `cargo fmt --check`, clippy not above baseline, `pnpm codecheck`, scoped prettier on the three TS files.
- Task 2: `evidence/RESULTS.md` with every required arm scored, the negative control showing the pre-fix bypass, and the operator's profile and source tree restored.
- Task 3: todo moved to `completed/` only on all-PASS; residual todo filed with the three triage keys; `pnpm planning-gates` green.
</verification>

<success_criteria>
- Cmd+Q and the red X (exitToTray off) with a pending operation armed show the confirm on the running macOS app; "No" keeps the app and its window; "Yes" exits and the sidecar is reaped.
- With nothing pending, both gestures quit promptly through the sidecar route (shell line + sidecar marker + `code=Some(0)`).
- exitToTray on still hides to the tray.
- The pre-fix binary quits on Cmd+Q with no confirm under the identical arm.
- No new clippy warnings; all touched suites green; the operator's settings and the lock file are back to their original state.
</success_criteria>

<output>
Create `.planning/quick/261008-kvz-route-cmd-q-and-the-red-x-exittotray-off/261008-kvz-SUMMARY.md` when done, recording
BASE and FIX shas, the RED/GREEN numbers, the per-arm live results, and the planner finding about `terminate:`.
</output>
