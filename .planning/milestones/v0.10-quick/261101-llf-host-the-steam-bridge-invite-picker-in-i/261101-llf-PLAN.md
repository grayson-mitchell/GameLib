---
phase: quick-261101-llf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/main.rs
  - src-tauri/capabilities/bridge-invite-picker.json
  - src/backend/__tests__/capabilitiesDefault.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/common/types/sidecarTransport.ts
  - src/backend/platform/index.ts
  - src/backend/platform/__mocks__/index.ts
  - src/backend/storeManagers/steam/bridge/helperProcess.ts
  - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts
  - src/common/types/ipc.ts
  - src/preload/api/steam.ts
  - src/common/bridgeInvitePicker.ts
  - src/common/__tests__/bridgeInvitePicker.test.ts
  - src/frontend/bridgeInvitePicker/BridgeInvitePickerRoot.tsx
  - src/frontend/bridgeInvitePicker/__tests__/BridgeInvitePickerRoot.test.tsx
  - src/frontend/index.tsx
  - src/preload/tauriAttach.ts
  - src/preload/__tests__/tauriAttach.test.ts
  - src/frontend/App.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/state/SteamBridgeInvite.ts
  - src/frontend/state/__tests__/SteamBridgeInvite.test.ts
  - .planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md
autonomous: true
requirements: [M-01]

must_haves:
  truths:
    - "When the game's invite control fires, the backend opens a dedicated Tauri window labelled `bridge-invite` through a new Rust arm `bridge_invite_picker_open`. It no longer calls `app.raiseMainWindow()` and no longer pushes `steamBridgeInviteRequest` to the main window"
    - "The picker window loads the app's own bundle (`WebviewUrl::App`) with `?window=bridge-invite&appId=<digits>&ackId=<uuid>`. The renderer entry sees that and mounts only the friend picker. It does not mount GlobalState or App, does not apply frameless decorations, and does not install drag regions, shortcuts or gamepads. So the picker looks the same whether frameless is OFF or ON"
    - "The picker window is always-on-top, focused, centred, 520x640 and not resizable. It is the only GameLib window brought forward. The main window is not unminimized, shown or focused by this path"
    - "On macOS the arm records the frontmost app (the game) before it focuses the picker. When the picker closes (its Close button, Esc, or the red X), GameLib re-activates that app, so focus goes back to the game"
    - "The 58-36 ack still fires. The picker window echoes `dialogDisplayed(ackId)` through the existing `ackWhenVisible`, and the backend logs `bridge invite [<appId>]: display=confirmed|unconfirmed`"
    - "Pressing Invite still sends through the unchanged `steamBridgeInviteFriend` invoke channel"
    - "Decision, recorded: the bridge-notice dialogs keep `main_window_raise` and render in the main window. Only the invite picker moves"
  artifacts:
    - path: src-tauri/src/main.rs
      provides: "bridge_invite_picker_open arm, URL/nav pure helpers with #[cfg(test)] tests, macOS focus restore"
      contains: "bridge_invite_picker_open"
    - path: src-tauri/capabilities/bridge-invite-picker.json
      provides: "local-only capability scoped to exactly [\"bridge-invite\"]"
      contains: "\"bridge-invite\""
    - path: src/common/bridgeInvitePicker.ts
      provides: "window-kind constant + validated query parser shared by preload and frontend"
      exports: ["BRIDGE_INVITE_WINDOW_KIND", "parseBridgeInvitePickerParams"]
    - path: src/frontend/bridgeInvitePicker/BridgeInvitePickerRoot.tsx
      provides: "picker-only root: opens the store from params, closes the window when the store closes"
  key_links:
    - from: "helperProcess.ts handleInviteDialogLine"
      to: "app.openBridgeInvitePicker -> rustInvoke bridge_invite_picker_open"
      via: "backend/platform app export"
      pattern: "app\\.openBridgeInvitePicker\\("
    - from: "src/frontend/index.tsx"
      to: "BridgeInvitePickerRoot"
      via: "parseBridgeInvitePickerParams(window.location.search) branch before root.render"
      pattern: "parseBridgeInvitePickerParams"
    - from: "BridgeInvitePickerRoot"
      to: "getCurrentWindow().close() -> Rust CloseRequested -> re-activate previous app"
      via: "store isOpen true->false"
      pattern: "getCurrentWindow\\(\\)\\.close\\(\\)"
---

<objective>
Host the Steam bridge invite picker in its own small, focused Tauri window, so that opening it over a Mac-hosted game no longer drags the GameLib main window forward with it.

Purpose: this closes todo `2026-11-01-invite-picker-raises-whole-main-window.md`. In 58-36, the picker reached the screen through `main_window_raise` (unminimize, show, set_focus on `main`), so surfacing the picker meant surfacing the whole app over the game.

Output: a Rust window arm and its capability, the backend switched to the new arm, a picker-only renderer root, and tests. The live gate is still operator-run (see the end of this plan).

**Bridge-notice decision (record it in the SUMMARY and in the todo note):** the bridge-notice dialogs (route notice, setup, Go Offline) keep `main_window_raise` and stay in the main window. They are shown before or around launch rather than mid-game, they are tied to main-window state and flows, and nobody has reported them as a problem. Only the invite picker, which opens mid-game, moves.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md
@.planning/phases/58-steam-bridge-multiplayer/58-36-PLAN.md
@.claude/skills/gamelib-conventions/SKILL.md

<interfaces>
Facts the planner verified against source. The executor should use them directly.

Tauri ACL (tauri-2.11.5 src/webview/mod.rs ~1820): the ACL checks app commands (`sidecar_invoke`, `sidecar_send`, `sidecar_store_snapshot`, `open_external`) only for remote origins, or when an app manifest exists (build.rs is a bare `tauri_build::build()`). So a local-origin `bridge-invite` window can reach the sidecar without any grant. Plugin commands DO need a capability. Two of them matter here:
- tauri-plugin-notification injects an init script into every webview, and that script invokes `plugin:notification|is_permission_granted` at load (default.json's description says so).
- `tauriTransport.listen` calls `plugin:event|listen` and does not catch a rejection.
Both rejections are unhandled, and `src/frontend/bootErrorSurface.ts` turns a pre-mount `unhandledrejection` into a full-window error. Hence the new capability file.

`src-tauri/capabilities/` has no explicit list in tauri.conf.json, so every file there is loaded. `capabilitiesDefault.test.ts:167` pins "contains exactly one .json file" (`['default.json']`), and the tests at :123 and :162 pin default.json's `windows` to `['main']`. Those two must stay unchanged.

`WebviewUrl::App(path)`: when `path != "index.html"`, the shell does `app_url.join(path)` (tauri-2.11.5 src/manager/webview.rs:444-458), so `"index.html?window=bridge-invite&appId=..&ackId=.."` keeps its query in both dev (devUrl http://localhost:5173) and prod (tauri://localhost).

Builder APIs in tauri-2.11.5 webview_window.rs: `on_navigation(Fn(&Url)->bool)` :266, `always_on_top` :564, and `WebviewWindow::navigate(Url)` :2384.

`src/backend/__tests__/tauriShellSource.test.ts` ~1393 asserts that every `tauri::WebviewWindowBuilder::new(` chain passes `.title(` only `login_window_title(...)` (WR-07, anti-phishing for REMOTE login windows). The declared-arm list (~355-470) must name every `dispatch_rust_channel` arm. `'main_window_raise'` sits at ~401, and its comment mentions the invite picker.

main.rs:
- `MAIN_WINDOW_LABEL` :2401
- the `"main_window_raise"` arm ~8166, whose comment says "Also used by the bridge invite picker (58-36)"
- the `"dialog_message"` arm ~7930, which is the `run_on_main_thread` + `mpsc_channel` return-a-value idiom
- `msg_send![class!(NSWorkspace), sharedWorkspace]` precedent ~1460, which uses raw objc2 and therefore needs no new objc2-app-kit features
- per-window `on_window_event` precedents ~3925 and ~13300. The main window's CloseRequested quit routing is registered ONLY on `main`, so closing another window cannot quit the app.
`app.emit(FRONTEND_MESSAGE_EVENT, ..)` ~12366 broadcasts to every webview.

src/backend/platform/index.ts ~384-394: `app.raiseMainWindow()` is `requestRustInvoke(RUST_MAIN_WINDOW_RAISE, []).catch(console.warn)`. Its mock is in src/backend/platform/__mocks__/index.ts:72. sidecarTransport.ts:262-272 has `RUST_MAIN_WINDOW_RAISE` and its doc.

helperProcess.ts `handleInviteDialogLine` ~436-465 runs these checks: appid, own child, debounce. Then it does the following, in order:
1. `app.raiseMainWindow()`
2. logInfo `bridge invite [${appId}]: raise requested`
3. `newDialogAckId()` + `trackDialogDisplay(...)`, which logs display=confirmed/unconfirmed
4. `sendFrontendMessage('steamBridgeInviteRequest', { appId, ackId })`
newDialogAckId is `crypto.randomUUID()`. helperProcess.test.ts ~880-990 is the 'INVITE dialog line' describe, which asserts the push at ~900/910.

Frontend:
- `SteamBridgeInviteDialog` (src/frontend/components/UI/SteamBridgeInviteDialog/index.tsx) reads `useSteamBridgeInvite()` and acks via `ackWhenVisible(ackId, window.api.dialogDisplayed, document)`. Leave it unchanged. Its `Dialog` uses `ContextProvider` and `StoreEmbedSuppressionContext`, and both have default values, so it renders without GlobalState.
- The store's `open({ appId, ackId })` / `close()` live in src/frontend/state/SteamBridgeInvite.ts. `handleSteamBridgeInviteRequestSignal` (:88) is subscribed in GlobalState.tsx (~1663, `window.api.handleSteamBridgeInviteRequest(...)`, import :72).
- App.tsx mounts `<SteamBridgeInviteDialog />` at :136 (import :39).
- The preload slot is `handleSteamBridgeInviteRequest = frontendListenerSlot('steamBridgeInviteRequest')` (src/preload/api/steam.ts:48). The type is at ipc.ts:829.
- src/frontend/index.tsx order: `import '../preload/tauriAttach'`, hydrateStoreSnapshot (8 s race), `applyFramelessDecorations()`, `initGamepad()`, `initShortcuts()`, the i18next init, `root.render(<GlobalState><I18nextProvider>...<App/>...)`, and finally `window.setTheme(...)`.
- tauriAttach.ts sets `window.api` and then calls `applyFramelessDecorations()`, `installDragRegionHandlers()` and (macOS) `installNativeGamepads()`.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Rust picker window arm, focus restore, scoped capability, and shell gates</name>
  <files>src-tauri/src/main.rs, src-tauri/capabilities/bridge-invite-picker.json, src/backend/__tests__/capabilitiesDefault.test.ts, src/backend/__tests__/tauriShellSource.test.ts</files>
  <read_first>
    - src-tauri/src/main.rs lines 1440-1475 (NSWorkspace msg_send precedent), 2395-2405, 7900-7980 (dialog_message main-thread return idiom), 8150-8185 (main_window_raise arm), 13280-13310 (per-window on_window_event)
    - src-tauri/capabilities/default.json (read the description's REQ-34.1-08 child-window paragraph)
    - src/backend/__tests__/capabilitiesDefault.test.ts lines 1-60 and 150-200
    - src/backend/__tests__/tauriShellSource.test.ts lines 340-470 and 1370-1420
  </read_first>
  <behavior>
    Rust `#[cfg(test)]` tests in main.rs's existing tests mod:
    - `bridge_invite_picker_path("3205720", "<a valid uuid>")` returns `Ok("index.html?window=bridge-invite&appId=3205720&ackId=<uuid>")`.
    - An empty appId, a non-digit appId, or one longer than 10 digits returns Err. So does an ackId that is empty, longer than 64 characters, or contains anything outside `[0-9A-Za-z-]`. `&`, `#`, `%`, `/` and spaces are all rejected.
    - `bridge_invite_nav_allowed`:
      - accepts `tauri://localhost/index.html?...`, `http://tauri.localhost/index.html?...`, and a dev-server URL whose origin equals the passed dev URL's origin
      - rejects `https://example.com/`, `http://localhost:9999/` when the dev URL is :5173, `file:///etc/passwd`, and `about:blank`
    TS gates:
    - capabilitiesDefault.test.ts: the directory holds exactly `['bridge-invite-picker.json', 'default.json']`, sorted. The new file's `windows` deep-equals `['bridge-invite']`. It has no `remote` key and no `webviews` key. Its permissions deep-equal exactly `['core:event:allow-listen', 'core:event:allow-unlisten', 'core:window:allow-close', 'notification:allow-is-permission-granted']`. default.json's existing `['main']` tests stay unchanged.
    - tauriShellSource.test.ts: the declared-arm list contains `'bridge_invite_picker_open'`. The WR-07 title gate skips only chains containing `tauri::WebviewUrl::App(`, and it positively asserts that exactly one such chain exists and that it contains `BRIDGE_INVITE_WINDOW_LABEL`.
  </behavior>
  <action>
    In main.rs:

    1. Add `const BRIDGE_INVITE_WINDOW_LABEL: &str = "bridge-invite";` next to MAIN_WINDOW_LABEL. It never takes the `external-` prefix and it is never `main` or `about`.

    2. Add two pure fns with doc comments:
       - `fn bridge_invite_picker_path(app_id: &str, ack_id: &str) -> Result<String, String>`, with the validation in the behaviour block. Its Err strings are `bridge_invite_picker_open:bad-app-id` and `bridge_invite_picker_open:bad-ack-id`.
       - `fn bridge_invite_nav_allowed(url: &tauri::Url, dev_url: Option<&tauri::Url>) -> bool`. It allows scheme `tauri` with host `localhost`, `http`/`https` with host `tauri.localhost`, or an exact origin match to `dev_url`. Nothing else.

    3. Add a `static BRIDGE_INVITE_RESTORE: Mutex<Option<PickerRestore>>`, where `PickerRestore { prev_pid: i32, app_was_hidden: bool, main_hidden_by_picker: bool }`.

    4. Add a `"bridge_invite_picker_open"` arm to `dispatch_rust_channel`. It reads `appId` and `ackId` strings from `args[0]` (Err `bridge_invite_picker_open:bad-args` when either is missing) and calls `bridge_invite_picker_path`. Then:
       a. macOS only: use `run_on_main_thread` + an mpsc channel (the dialog_message idiom) to read `NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier` and `NSApplication.isHidden` via `msg_send!`, as in the ~1460 precedent. Store a PickerRestore only when the pid differs from `std::process::id()` and no record already exists, so a re-open keeps the game's pid, not GameLib's.
       b. If `app.get_webview_window(BRIDGE_INVITE_WINDOW_LABEL)` exists, compute `window.url()?.join(&path)` and call `window.navigate(url)`. The page reloads with the new ackId.
          Otherwise build `tauri::WebviewWindowBuilder::new(app, BRIDGE_INVITE_WINDOW_LABEL, tauri::WebviewUrl::App(path.into()))` with:
          - `.title("Invite a friend")`
          - `.inner_size(520.0, 640.0)`, `.resizable(false)`, `.maximizable(false)`, `.minimizable(false)`
          - `.always_on_top(true)`. Put a comment that this is deliberate, unlike the login windows: the picker must float over a frontmost game even when macOS declines activation.
          - `.center()`, `.focused(true)`
          - `.on_navigation`, which calls `bridge_invite_nav_allowed` with `app.config().build.dev_url` cloned in
          - `.build()`. Map a build error to `bridge_invite_picker_open:build-failed:{e}`.
          Attach `on_window_event` to the new window:
          - CloseRequested (do NOT prevent_close; macOS only): on the main thread, take a copy of the record and re-activate the app with `NSRunningApplication runningApplicationWithProcessIdentifier:prev_pid` → `activateWithOptions:` (pass `NSApplicationActivateIgnoringOtherApps`, value 2, with a comment noting it is deprecated on 14+ but still honoured). Do this BEFORE the window is gone, so AppKit does not promote the main window to key.
          - Destroyed: take and clear the record. If `main_hidden_by_picker`, then on the main thread call `main.show()` and then `app.hide()` back to back, which restores the pre-invite Cmd+H state.
       c. Call `set_focus()` on the picker window.
       d. If the record says `app_was_hidden` (GameLib was Cmd+H-hidden, and activating it unhides every window), call `hide()` on the `main` window if it exists and set `main_hidden_by_picker = true`.
       e. Return `Ok(Value::Null)`.
       Never touch the main window except in steps b/d for the Cmd+H case. Off macOS, steps a and the close/destroy restore are compiled out. The window still opens always-on-top and focused.

    5. Edit the `main_window_raise` arm comment: remove "Also used by the bridge invite picker (58-36)" and replace it with "The invite picker no longer uses this (quick 261101-llf); bridge-notice dialogs still do." Leave the code unchanged.

    Create src-tauri/capabilities/bridge-invite-picker.json with:
    - `$schema` `../gen/schemas/desktop-schema.json` and `identifier` `bridge-invite-picker`
    - a `description` explaining that it is scoped to the local-only invite picker window (quick 261101-llf). It grants exactly the plugin commands the app bundle calls at boot (the notification init-script probe, and event listen/unlisten for tauriTransport) plus `core:window:allow-close` for the picker's own Close. There is deliberately no `remote` key and no `webviews` key, and `on_navigation` pins the window to the app origin. It is NOT a capability for the `about` or `external-<n>` child windows: default.json's REQ-34.1-08 rule that those labels get zero command access still stands.
    - `windows: ["bridge-invite"]` and the four permissions from the behaviour block. Nothing more.

    Amend capabilitiesDefault.test.ts. Replace the "exactly one .json file" test with the two-file pin and the new-file assertions from the behaviour block. Keep the test name's REQ-34.1-08 tag, and add a comment naming this quick task and why the second file is not a child-window grant.

    Amend tauriShellSource.test.ts:
    - Add `'bridge_invite_picker_open'` to the arm list. Its PROOF STATUS comment: the pure path/nav helpers are unit-tested in main.rs; the window, focus and AppKit restore are proven live only (operator gate).
    - Change the `'main_window_raise'` comment so it no longer mentions the invite picker.
    - In the WR-07 test, skip chains containing `tauri::WebviewUrl::App(` and add the positive single-chain assertion. Add a comment: WR-07 protects remote login windows from a forged app title; the picker loads GameLib's own bundle, so a fixed title is not the prohibited shape. Do not weaken the check for any other chain.
  </action>
  <verify>
    <automated>(cd /Users/graysonmitchell/Projects/GameLib/src-tauri && cargo test --bin gamelib-shell bridge_invite && cargo check --bin gamelib-shell) && cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest src/backend/__tests__/capabilitiesDefault.test.ts src/backend/__tests__/tauriShellSource.test.ts && npx prettier --check src-tauri/capabilities/bridge-invite-picker.json src/backend/__tests__/capabilitiesDefault.test.ts src/backend/__tests__/tauriShellSource.test.ts</automated>
    main.rs is Rust: prettier has no parser for it, and cargo test/check are its gates. Run `npx prettier --file-info src-tauri/capabilities/bridge-invite-picker.json` first. If it reports ignored, drop that path from the check and say so in the SUMMARY. If `cargo` fails only because a Tauri `externalBin` is missing in this checkout, stage the stub the way `.github/workflows/rust-test.yml` does, re-run, and record it.
  </verify>
  <done>The `bridge_invite_picker_open` arm builds or reuses a focused, always-on-top `bridge-invite` window on the app origin, and on macOS gives focus back to the recorded game on close. The capability is pinned to that one label with four permissions. All shell and capability gates are green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Backend opens the picker window instead of raising main</name>
  <files>src/common/types/sidecarTransport.ts, src/backend/platform/index.ts, src/backend/platform/__mocks__/index.ts, src/backend/storeManagers/steam/bridge/helperProcess.ts, src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts, src/common/types/ipc.ts, src/preload/api/steam.ts</files>
  <read_first>
    - src/common/types/sidecarTransport.ts lines 240-280
    - src/backend/platform/index.ts lines 80-95 and 375-395; src/backend/platform/__mocks__/index.ts lines 60-80
    - src/backend/storeManagers/steam/bridge/helperProcess.ts lines 55-120 and 430-470
    - src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts lines 50-90 and 870-1000
    - src/common/types/ipc.ts lines 820-835; src/preload/api/steam.ts lines 40-50
  </read_first>
  <behavior>
    Update the 'INVITE dialog line' describe:
    - A matching own-child `INVITE dialog appid=3205720` line calls `app.openBridgeInvitePicker` exactly once, with `{ appId: '3205720', ackId: <non-empty string> }`.
    - `app.raiseMainWindow` is NOT called.
    - No `sendFrontendMessage('steamBridgeInviteRequest', ...)` call happens.
    - logInfo gets `bridge invite [3205720]: picker window requested`.
    - The foreign-appid, stale-child and within-debounce cases call neither.
    - Display tracking is unchanged:
      - with no ack, `bridge invite [3205720]: display=unconfirmed timeout=15000`
      - `acknowledgeDialogDisplay(<that ackId>)` gives `display=confirmed elapsedMs=`
    - When the mocked `openBridgeInvitePicker` resolves `false`, logWarning gets `bridge invite [3205720]: picker window failed`.
    - No friend name or ordinal appears in any new line.
  </behavior>
  <action>
    In sidecarTransport.ts, add `export const RUST_BRIDGE_INVITE_PICKER_OPEN = 'bridge_invite_picker_open' as const`. Its doc says it opens or reuses the `bridge-invite` Tauri window for the bridge invite picker (quick 261101-llf), takes `[{ appId, ackId }]` (validated again in Rust), resolves null, and never touches the main window except for the Cmd+H-hidden restore. In the RUST_MAIN_WINDOW_RAISE doc, change the callers line to name only the bridge notice, and note that the invite picker moved to RUST_BRIDGE_INVITE_PICKER_OPEN.

    In platform/index.ts, add `openBridgeInvitePicker: (payload: { appId: string; ackId: string }): Promise<boolean>` next to `raiseMainWindow`:
    - it calls `requestRustInvoke(RUST_BRIDGE_INVITE_PICKER_OPEN, [payload])` and resolves true
    - on rejection it console.warns in the same shape as raiseMainWindow and resolves false
    - it never throws
    Import the constant alongside RUST_MAIN_WINDOW_RAISE. Add `openBridgeInvitePicker: jest.fn().mockResolvedValue(true)` to the platform mock.

    In helperProcess.ts `handleInviteDialogLine`, after the debounce stamp:
    1. Replace `app.raiseMainWindow()` and its "raise requested" log with logInfo `bridge invite [${appId}]: picker window requested`.
    2. Keep `newDialogAckId()` + `trackDialogDisplay(...)` exactly as is.
    3. Call `void app.openBridgeInvitePicker({ appId, ackId }).then((ok) => { if (!ok) logWarning(\`bridge invite [${appId}]: picker window failed\`, LogPrefix.Steam) })`.
    4. Delete the `sendFrontendMessage('steamBridgeInviteRequest', ...)` call. The main window must not open its own copy, because a main-window render would false-confirm the ack.
    Replace the 58-36 comment with one naming this quick task: the picker gets its own window so the main window no longer comes forward over the game. Drop `sendFrontendMessage` or `logWarning` imports only if no other use remains.

    In ipc.ts, delete the `steamBridgeInviteRequest` frontend-message entry. In preload/api/steam.ts, delete the `handleSteamBridgeInviteRequest` slot. Its only consumer, GlobalState, is removed in Task 3. Task 3 runs codecheck over both. If a census or pin test (grep `steamBridgeInviteRequest` under src and meta) names the channel, update it in this task with a comment naming 261101-llf.

    Update helperProcess.test.ts to match the behaviour block. Add `openBridgeInvitePicker` to its inline 'backend/platform' mock `app` object.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/backend/dialog src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/preload && npx prettier --check src/common/types/sidecarTransport.ts src/backend/platform/index.ts src/backend/platform/__mocks__/index.ts src/backend/storeManagers/steam/bridge/helperProcess.ts src/backend/storeManagers/steam/bridge/__tests__/helperProcess.test.ts src/common/types/ipc.ts src/preload/api/steam.ts</automated>
    `pnpm codecheck` is expected to fail at this point only on GlobalState.tsx's removed `handleSteamBridgeInviteRequest`. Task 3 fixes that and runs codecheck. Do not commit a red codecheck: commit Tasks 2 and 3 together, or run Task 3 before committing.
  </verify>
  <done>The INVITE line opens the picker window through the shell. The main window is no longer raised or pushed to. The display ack and its log lines are unchanged. A failed window open is logged.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Picker-only renderer root; main window stops hosting the picker; todo note</name>
  <files>src/common/bridgeInvitePicker.ts, src/common/__tests__/bridgeInvitePicker.test.ts, src/frontend/bridgeInvitePicker/BridgeInvitePickerRoot.tsx, src/frontend/bridgeInvitePicker/__tests__/BridgeInvitePickerRoot.test.tsx, src/frontend/index.tsx, src/preload/tauriAttach.ts, src/preload/__tests__/tauriAttach.test.ts, src/frontend/App.tsx, src/frontend/state/GlobalState.tsx, src/frontend/state/SteamBridgeInvite.ts, src/frontend/state/__tests__/SteamBridgeInvite.test.ts, .planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md</files>
  <read_first>
    - src/frontend/index.tsx (whole file) and src/preload/tauriAttach.ts lines 75-120
    - src/preload/__tests__/tauriAttach.test.ts (how attach side effects are asserted)
    - src/frontend/state/SteamBridgeInvite.ts and its test
    - src/frontend/components/UI/SteamBridgeInviteDialog/__tests__/SteamBridgeInviteDialog.test.tsx (render and window.api mocking pattern)
    - src/frontend/App.tsx lines 35-40 and 125-140; src/frontend/state/GlobalState.tsx lines 70-75 and 1655-1670
  </read_first>
  <behavior>
    - `parseBridgeInvitePickerParams('?window=bridge-invite&appId=3205720&ackId=<uuid>')` returns `{ appId: '3205720', ackId: '<uuid>' }`.
    - It returns null in all of these cases:
      - the `window` param is missing or different
      - appId is missing or not 1-10 digits
      - ackId is missing or fails `^[0-9A-Za-z-]{1,64}$`
      - the search string is empty
    - `BridgeInvitePickerRoot` with params `{ appId: '3205720', ackId: 'a1' }`:
      - on mount it calls the store's `open({ appId: '3205720', ackId: 'a1' })` once, so `steamBridgeListFriends('3205720')` is called once
      - it renders the picker dialog, and with visibilityState 'visible', `window.api.dialogDisplayed('a1')` is called once
      - when the store closes (Close button), the mocked `getCurrentWindow().close` (from `@tauri-apps/api/window`) is called once
      - it is not called on the initial render
    - tauriAttach.test.ts: with `window.location.search` set to valid picker params, `applyFramelessDecorations`, `installDragRegionHandlers` and `installNativeGamepads` are not called, but `window.api` is still attached. Without picker params, the existing assertions still pass.
    - The SteamBridgeInvite store tests still pass after `handleSteamBridgeInviteRequestSignal` is deleted. Its test cases move to calling `open(...)` directly.
  </behavior>
  <action>
    Create src/common/bridgeInvitePicker.ts. It has no Electron, Node or React imports, so preload can import it. It exports:
    - `BRIDGE_INVITE_WINDOW_KIND = 'bridge-invite'`
    - `parseBridgeInvitePickerParams(search: string): { appId: string; ackId: string } | null`, using URLSearchParams and the same validation the Rust side uses. Add a comment that both sides validate.
    - `isBridgeInvitePickerWindow(search: string): boolean`
    Write its test.

    In tauriAttach.ts, wrap the frameless, drag-region and native-gamepad installs in `if (!isBridgeInvitePickerWindow(window.location.search))`. Add a comment: the picker is a standard decorated window that is the same whether frameless is OFF or ON, and its capability grants no window-chrome commands. Extend tauriAttach.test.ts to cover the picker case.

    In src/frontend/index.tsx, compute `const pickerParams = parseBridgeInvitePickerParams(window.location.search)` once, near the top. Then:
    - Skip the second `applyFramelessDecorations()`, `initGamepad()` and `initShortcuts()` when pickerParams is set.
    - Keep `initOnlineMonitor()` and the hydrate step. The picker needs the store snapshot for the theme and language, and hydrate uses only the app command.
    - Keep the i18n init and `window.setTheme`.
    - At render, when pickerParams is set, call `root.render(<I18nextProvider i18n={i18next}><Suspense fallback={null}><BridgeInvitePickerRoot params={pickerParams} /></Suspense></I18nextProvider>)`, with BridgeInvitePickerRoot lazy-imported like App. Otherwise use the existing GlobalState/App tree, unchanged.

    Create src/frontend/bridgeInvitePicker/BridgeInvitePickerRoot.tsx:
    - A `useEffect` on mount calls `useSteamBridgeInvite.getState().open(params)`.
    - A second effect subscribes to the store. When `isOpen` goes from true to false, it calls `void getCurrentWindow().close()`. Closing goes through the Rust CloseRequested hook, which restores focus to the game.
    - It renders the existing `SteamBridgeInviteDialog`, which is unchanged and still owns the ack.
    - Header comment: names this quick task and states that the main window no longer mounts the picker.
    Write its test, mocking `@tauri-apps/api/window` and `window.api` the way the existing dialog test does.

    Remove `<SteamBridgeInviteDialog />` and its import from App.tsx. Remove the `handleSteamBridgeInviteRequest` subscription and the `handleSteamBridgeInviteRequestSignal` import from GlobalState.tsx. Delete `handleSteamBridgeInviteRequestSignal` and its `IpcRendererEvent` import from SteamBridgeInvite.ts. Update the store header comment: the store is now opened by `BridgeInvitePickerRoot` in the `bridge-invite` window. Move that function's test cases to `open(...)`.

    Do not move the todo out of pending, because it is `ready: live-gate`. Live PASS is what closes it. Append a `## Code landed (quick 261101-llf)` section to it with:
    - the commit hashes
    - the bridge-notice decision
    - the operator live-gate checklist below, verbatim
    Leave its frontmatter untouched.

    Finally, run `graphify update .`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm exec jest src/common/__tests__/bridgeInvitePicker.test.ts src/frontend/bridgeInvitePicker src/frontend/state/__tests__/SteamBridgeInvite.test.ts src/frontend/components/UI/SteamBridgeInviteDialog src/preload/__tests__/tauriAttach.test.ts src/preload/__tests__/framelessRuntime.test.ts && pnpm codecheck && pnpm planning-gates && npx prettier --check src/common/bridgeInvitePicker.ts src/common/__tests__/bridgeInvitePicker.test.ts src/frontend/bridgeInvitePicker/BridgeInvitePickerRoot.tsx src/frontend/bridgeInvitePicker/__tests__/BridgeInvitePickerRoot.test.tsx src/frontend/index.tsx src/preload/tauriAttach.ts src/preload/__tests__/tauriAttach.test.ts src/frontend/App.tsx src/frontend/state/GlobalState.tsx src/frontend/state/SteamBridgeInvite.ts src/frontend/state/__tests__/SteamBridgeInvite.test.ts .planning/todos/pending/2026-11-01-invite-picker-raises-whole-main-window.md</automated>
    If `--file-info` shows the .planning todo path as prettier-ignored, drop it from the check and say so in the SUMMARY.
  </verify>
  <done>A `?window=bridge-invite` load mounts only the picker, without window chrome, and closes its own window when the picker closes. The main window no longer mounts the picker or subscribes to invite pushes. codecheck and planning-gates are green. The todo carries the code-landed note and the live checklist and stays pending.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| helper stderr -> backend | the INVITE line now opens a window instead of raising main |
| sidecar -> shell rustInvoke | `bridge_invite_picker_open` takes `{appId, ackId}`, which ends up in a URL |
| bridge-invite webview -> Tauri ACL | a new capability grants four plugin commands to one label |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-llf-01 | Tampering / injection | `bridge_invite_picker_path` | mitigate | Rust re-validates: appId must be 1-10 digits and ackId must match `[0-9A-Za-z-]{1,64}`, before the query is built. Unit tests reject `& # % /` and spaces. The frontend parser validates again |
| T-llf-02 | Elevation of privilege | bridge-invite-picker.json | mitigate | Scoped to exactly `["bridge-invite"]`, with four named permissions, no `remote` key and no `webviews` key, all pinned by capabilitiesDefault.test.ts. `on_navigation` allows only the app origin and dev origin, so remote content cannot load there, and even if it did the origin leg would deny it. default.json's `['main']` scope and the zero-access rule for `about`/`external-<n>` are unchanged |
| T-llf-03 | Spoofing / focus stealing | picker open on INVITE line | mitigate | It is gated by the same 58-31 own-appid, own-child and 2 s debounce rules (T-58-116). It fires only after the user pressed the game's invite control |
| T-llf-04 | Information disclosure | new log lines | mitigate | They carry only the appId and fixed words. Friend names stay render-only |
| T-llf-05 | Denial of service | sidecar exit contract | accept | No new timer, socket or watcher. It reuses displayAck's unref'd, bounded 15 s timer |
</threat_model>

<verification>
All of the following must be green: cargo test `bridge_invite` and cargo check; the capabilities, tauriShellSource, helperProcess, displayAck, census, preload, common, picker-root, store and dialog suites; `pnpm codecheck`; `pnpm planning-gates`; prettier on every written TS/TSX/JSON/MD path.
</verification>

<success_criteria>
Code: the invite line opens only the `bridge-invite` window, and the main window is untouched by that path. The picker acks display and sends invites as before.

**Live gate (operator-run, NOT claimed by this plan).** Run on this Mac with a bridged game hosting, opening the invite from inside the game, after a dev restart (the sidecar is not rebuilt by `tauri dev`):
1. With the main window open behind the game: only the picker comes forward, the game stays visible around it, and the main window does not appear.
2. With the main window minimized: the same, and the main window stays minimized.
3. With GameLib Cmd+H-hidden: the picker shows; after close, GameLib is hidden again and the main window is not left on screen.
4. Invite a friend: the row shows "Invite sent", and the log has `bridge invite [<appId>]: display=confirmed`.
5. Close via the Close button, via Esc, and via the red X: focus returns to the game each time, and the main window does not come forward.
6. Repeat 1 and 5 with frameless OFF and with frameless ON.
7. If the picker shows a bootstrap error naming an ACL-denied command, add exactly that one permission to bridge-invite-picker.json and its pin.
Not covered: a game in a native macOS fullscreen Space. Record what happens there as an observation, not a pass or fail.
</success_criteria>

<output>
Create `.planning/quick/261101-llf-host-the-steam-bridge-invite-picker-in-i/261101-llf-SUMMARY.md` when done. Record the bridge-notice decision and every live-gate item still open.
</output>
